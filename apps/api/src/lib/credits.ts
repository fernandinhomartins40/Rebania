import { DomainError } from "@rebania/domain";
import type { Db, Tx } from "@rebania/db";
import { audit } from "./audit.ts";

/**
 * Créditos de IA (ADR-007): cotação → reserva atômica → consumo único →
 * liberação em falha → estorno auditado. O saldo fica em `credit_accounts`
 * (CHECK >= 0) e cada mudança gera linha imutável em `credit_ledger`.
 */

export async function currentRateCard(db: Db | Tx) {
  return db.rateCard.findFirst({ orderBy: { version: "desc" } });
}

export async function quote(db: Db | Tx, action: string) {
  const card = await currentRateCard(db);
  if (!card)
    throw new DomainError(
      "rate_card_missing",
      "Tabela de créditos ainda não definida pela plataforma.",
    );
  const credits = (card.actions as Record<string, number>)[action];
  if (!Number.isInteger(credits) || credits! <= 0)
    throw new DomainError("action_not_priced", "Ação sem custo definido na tabela de créditos.");
  return { action, credits: credits!, rateCardVersion: card.version };
}

export async function balanceOf(db: Db | Tx, organizationId: string) {
  const a = await db.creditAccount.findUnique({ where: { organizationId } });
  return a?.balance ?? 0;
}

async function post(
  tx: Tx,
  e: {
    organizationId: string;
    kind: "purchase" | "grant" | "reserve" | "consume" | "release" | "refund" | "adjustment";
    delta: number;
    reservationId?: string | null;
    refType?: string | null;
    refId?: string | null;
    actorUserId?: string | null;
    note?: string | null;
  },
) {
  let balance: number;
  if (e.delta < 0) {
    // Débito condicional: só passa se houver saldo — nunca negativo sob concorrência.
    const r = await tx.creditAccount.updateMany({
      where: { organizationId: e.organizationId, balance: { gte: -e.delta } },
      data: { balance: { increment: e.delta } },
    });
    if (r.count !== 1)
      throw new DomainError("insufficient_credits", "Créditos insuficientes para esta ação.");
    balance = (
      await tx.creditAccount.findUniqueOrThrow({ where: { organizationId: e.organizationId } })
    ).balance;
  } else {
    const a = await tx.creditAccount.upsert({
      where: { organizationId: e.organizationId },
      create: { organizationId: e.organizationId, balance: e.delta },
      update: { balance: { increment: e.delta } },
    });
    balance = a.balance;
  }
  await tx.creditLedger.create({
    data: {
      organizationId: e.organizationId,
      kind: e.kind,
      amount: e.delta,
      balanceAfter: balance,
      reservationId: e.reservationId ?? null,
      refType: e.refType ?? null,
      refId: e.refId ?? null,
      actorUserId: e.actorUserId ?? null,
      note: e.note ?? null,
    },
  });
  return balance;
}

/** Reserva idempotente por requestId: repetir devolve a mesma reserva. */
export async function reserve(
  db: Db,
  r: {
    organizationId: string;
    farmId: string | null;
    userId: string;
    requestId: string;
    action: string;
    now: Date;
  },
) {
  const existing = await db.creditReservation.findUnique({ where: { requestId: r.requestId } });
  if (existing) {
    if (existing.organizationId !== r.organizationId || existing.userId !== r.userId)
      throw new DomainError("request_id_conflict", "Identificador de requisição já usado.");
    return { reservation: existing, replay: true };
  }
  const q = await quote(db, r.action);
  try {
    return await db.$transaction(async (tx) => {
      const res = await tx.creditReservation.create({
        data: {
          organizationId: r.organizationId,
          farmId: r.farmId,
          userId: r.userId,
          requestId: r.requestId,
          action: r.action,
          amount: q.credits,
          rateCardVersion: q.rateCardVersion,
          expiresAt: new Date(r.now.getTime() + 15 * 60_000),
        },
      });
      await post(tx, {
        organizationId: r.organizationId,
        kind: "reserve",
        delta: -q.credits,
        reservationId: res.id,
        actorUserId: r.userId,
      });
      return { reservation: res, replay: false };
    });
  } catch (err) {
    // Corrida no mesmo requestId: devolve a reserva vencedora.
    const raced = await db.creditReservation.findUnique({ where: { requestId: r.requestId } });
    if (raced && !(err instanceof DomainError)) return { reservation: raced, replay: true };
    throw err;
  }
}

/** Consumo único: só transiciona reserved → consumed uma vez. */
export async function consume(db: Db, reservationId: string, now: Date) {
  return db.$transaction(async (tx) => {
    const r = await tx.creditReservation.updateMany({
      where: { id: reservationId, status: "reserved" },
      data: { status: "consumed", settledAt: now },
    });
    if (r.count !== 1) return false;
    const res = await tx.creditReservation.findUniqueOrThrow({ where: { id: reservationId } });
    // Consumo não altera saldo (já debitado na reserva); registra a efetivação.
    await tx.creditLedger.create({
      data: {
        organizationId: res.organizationId,
        kind: "consume",
        amount: 0,
        balanceAfter: (
          await tx.creditAccount.findUniqueOrThrow({
            where: { organizationId: res.organizationId },
          })
        ).balance,
        reservationId,
        note: `${res.action}: ${res.amount} crédito(s)`,
      },
    });
    return true;
  });
}

/** Libera reserva em falha elegível (provedor fora, erro antes de entregar). */
export async function release(db: Db, reservationId: string, now: Date, note: string) {
  return db.$transaction(async (tx) => {
    const r = await tx.creditReservation.updateMany({
      where: { id: reservationId, status: "reserved" },
      data: { status: "released", settledAt: now },
    });
    if (r.count !== 1) return false;
    const res = await tx.creditReservation.findUniqueOrThrow({ where: { id: reservationId } });
    await post(tx, {
      organizationId: res.organizationId,
      kind: "release",
      delta: res.amount,
      reservationId,
      note,
    });
    return true;
  });
}

/** Estorno de consumo, só pela plataforma, com motivo e auditoria. */
export async function refund(db: Db, reservationId: string, actorUserId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const res = await tx.creditReservation.findUnique({ where: { id: reservationId } });
    if (!res || res.status !== "consumed")
      throw new DomainError("not_refundable", "Somente consumo efetivado pode ser estornado.");
    const already = await tx.creditLedger.findFirst({ where: { reservationId, kind: "refund" } });
    if (already) throw new DomainError("already_refunded", "Consumo já estornado.");
    const balance = await post(tx, {
      organizationId: res.organizationId,
      kind: "refund",
      delta: res.amount,
      reservationId,
      actorUserId,
      note: reason,
    });
    await audit(tx, {
      organizationId: res.organizationId,
      actorUserId,
      action: "credits.refund",
      entityType: "credit_reservation",
      entityId: reservationId,
      data: { reason, amount: res.amount },
    });
    return balance;
  });
}

export async function grant(
  db: Db,
  g: {
    organizationId: string;
    amount: number;
    actorUserId: string;
    reason: string;
    kind: "grant" | "adjustment";
  },
) {
  return db.$transaction(async (tx) => {
    const balance = await post(tx, {
      organizationId: g.organizationId,
      kind: g.kind,
      delta: g.amount,
      actorUserId: g.actorUserId,
      note: g.reason,
    });
    await audit(tx, {
      organizationId: g.organizationId,
      actorUserId: g.actorUserId,
      action: `credits.${g.kind}`,
      entityType: "credit_account",
      entityId: g.organizationId,
      data: { amount: g.amount, reason: g.reason },
    });
    return balance;
  });
}

/** Pagamento confirmado: credita o pedido UMA vez (transição pending → paid). */
export async function settleOrder(tx: Tx, orderId: string, paid: boolean, now: Date) {
  const r = await tx.creditOrder.updateMany({
    where: { id: orderId, status: "pending" },
    data: { status: paid ? "paid" : "failed", settledAt: now },
  });
  if (r.count !== 1) return "ignored";
  if (!paid) return "failed";
  const o = await tx.creditOrder.findUniqueOrThrow({ where: { id: orderId } });
  await post(tx, {
    organizationId: o.organizationId,
    kind: "purchase",
    delta: o.credits,
    refType: "credit_order",
    refId: o.id,
    note: `Pedido ${o.id.slice(0, 8)}`,
  });
  return "credited";
}
