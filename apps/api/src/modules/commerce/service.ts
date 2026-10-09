import { randomUUID } from "node:crypto";
import {
  AnimalExitInput,
  FeedingInput,
  FinancialEntryInput,
  PurchaseInput,
  SaleInput,
  type CommercialDto,
  type FinancialEntryDto,
} from "@rebania/contracts";
import {
  allocateCents,
  assertCategoryMatches,
  assertEventDate,
  computePrice,
  DomainError,
  fromMilli,
  roleHas,
  saleIssues,
  STATUS_LABEL,
  toCents,
  toMilli,
  todayInTimezone,
  type EntryCategory,
} from "@rebania/domain";
import type { Db, Prisma, Tx } from "@rebania/db";
import { audit } from "../../lib/audit.ts";
import { recordChange } from "../../lib/changes.ts";
import { VersionConflictError } from "../../lib/conflict.ts";
import { civilToDate, dateToCivil } from "../../lib/dates.ts";
import { notFound } from "../../lib/errors.ts";
import type { FarmContext } from "../../lib/tenant.ts";
import { addEvent, createAnimal, primaryTag, type MutationMeta } from "../animals/service.ts";
import { consumeStock } from "../health/service.ts";

const fmt = (d: string) => d.split("-").reverse().join("/");

// ---- Financeiro --------------------------------------------------------------------------------

async function createEntry(
  tx: Tx,
  fctx: FarmContext,
  e: {
    kind: "income" | "expense";
    category: EntryCategory;
    description: string;
    amountCents: number;
    dueOn: string;
    paidOn?: string | null;
    counterparty?: string | null;
    document?: string | null;
    allocationType?: "farm" | "group" | "animals";
    allocationIds?: string[];
    sourceType?: string;
    sourceId?: string;
  },
) {
  assertCategoryMatches(e.kind, e.category);
  return tx.financialEntry.create({
    data: {
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      kind: e.kind,
      category: e.category,
      description: e.description,
      amountCents: BigInt(e.amountCents),
      dueOn: civilToDate(e.dueOn),
      paidOn: e.paidOn ? civilToDate(e.paidOn) : null,
      status: e.paidOn ? "paid" : "open",
      counterparty: e.counterparty ?? null,
      document: e.document ?? null,
      allocationType: e.allocationType ?? "farm",
      allocationIds: e.allocationIds ?? [],
      sourceType: e.sourceType ?? null,
      sourceId: e.sourceId ?? null,
      createdById: fctx.userId,
    },
  });
}

export async function recordEntry(
  tx: Tx,
  fctx: FarmContext,
  raw: FinancialEntryInput,
  meta: MutationMeta,
) {
  const input = FinancialEntryInput.parse(raw);
  const today = todayInTimezone(fctx.timezone, meta.now);
  if (input.paidOn) assertEventDate(input.paidOn, { today });
  if (input.allocationType === "group" && input.allocationIds.length) {
    const n = await tx.group.count({
      where: { id: { in: input.allocationIds }, farmId: fctx.farmId },
    });
    if (n !== input.allocationIds.length)
      throw new DomainError("group_not_found", "Lote não encontrado.");
  }
  if (input.allocationType === "animals" && input.allocationIds.length) {
    const n = await tx.animal.count({
      where: { id: { in: input.allocationIds }, farmId: fctx.farmId },
    });
    if (n !== input.allocationIds.length)
      throw new DomainError("animal_not_found", "Animal não encontrado.");
  }
  if (input.allocationType !== "farm" && !input.allocationIds.length)
    throw new DomainError("allocation_required", "Escolha os lotes ou animais do rateio.");
  const e = await createEntry(tx, fctx, {
    ...input,
    amountCents: toCents(input.amount),
    sourceType: "manual",
  });
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: "finance.entry.create",
    entityType: "financial_entry",
    entityId: e.id,
    data: { kind: input.kind, amountCents: toCents(input.amount), category: input.category },
  });
  return { entityId: e.id, version: e.version };
}

export function entryDto(e: Prisma.FinancialEntryGetPayload<object>): FinancialEntryDto {
  return {
    id: e.id,
    kind: e.kind,
    category: e.category as EntryCategory,
    description: e.description,
    amountCents: Number(e.amountCents),
    dueOn: dateToCivil(e.dueOn),
    paidOn: dateToCivil(e.paidOn),
    status: e.status,
    counterparty: e.counterparty,
    document: e.document,
    allocationType: e.allocationType as FinancialEntryDto["allocationType"],
    allocationIds: e.allocationIds,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    cancelReason: e.cancelReason,
  };
}

export async function payEntry(
  tx: Tx,
  fctx: FarmContext,
  id: string,
  paidOn: string,
  meta: MutationMeta,
) {
  const e = await tx.financialEntry.findFirst({ where: { id, farmId: fctx.farmId } });
  if (!e) throw notFound("Lançamento");
  if (e.status === "cancelled") throw new DomainError("entry_cancelled", "Lançamento cancelado.");
  assertEventDate(paidOn, { today: todayInTimezone(fctx.timezone, meta.now) });
  await tx.financialEntry.update({
    where: { id },
    data: { status: "paid", paidOn: civilToDate(paidOn), version: { increment: 1 } },
  });
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: "finance.entry.pay",
    entityType: "financial_entry",
    entityId: id,
    data: { paidOn },
  });
}

/** Cancelar não apaga: mantém o lançamento com motivo (trilha de auditoria). */
export async function cancelEntry(tx: Tx, fctx: FarmContext, id: string, reason: string) {
  const e = await tx.financialEntry.findFirst({ where: { id, farmId: fctx.farmId } });
  if (!e) throw notFound("Lançamento");
  if (e.sourceType === "sale" || e.sourceType === "purchase")
    throw new DomainError(
      "entry_from_transaction",
      "Lançamento gerado por compra/venda: anule a transação para corrigir.",
    );
  await tx.financialEntry.update({
    where: { id },
    data: { status: "cancelled", paidOn: null, cancelReason: reason, version: { increment: 1 } },
  });
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: "finance.entry.cancel",
    entityType: "financial_entry",
    entityId: id,
    data: { reason },
  });
}

// ---- Venda -------------------------------------------------------------------------------------

async function tagsOf(tx: Tx | Db, ids: string[]) {
  const rows = await tx.animalIdentifier.findMany({ where: { animalId: { in: ids } } });
  const by = new Map<string, typeof rows>();
  for (const r of rows) by.set(r.animalId, [...(by.get(r.animalId) ?? []), r]);
  return new Map(ids.map((id) => [id, primaryTag(by.get(id) ?? [])]));
}

export async function checkSale(tx: Tx | Db, fctx: FarmContext, animalIds: string[], date: string) {
  const animals = await tx.animal.findMany({
    where: { id: { in: animalIds }, farmId: fctx.farmId },
  });
  const tags = await tagsOf(tx, animalIds);
  const issues: {
    animalId: string;
    tag: string | null;
    code: string;
    message: string;
    blocking: boolean;
  }[] = [];
  for (const id of animalIds) {
    const a = animals.find((x) => x.id === id);
    if (!a) {
      issues.push({
        animalId: id,
        tag: null,
        code: "not_found",
        message: "Animal não encontrado.",
        blocking: true,
      });
      continue;
    }
    for (const i of saleIssues(
      {
        status: a.status,
        tag: tags.get(id) ?? null,
        withdrawalMeatUntil: dateToCivil(a.withdrawalMeatUntil),
      },
      date,
    )) {
      issues.push({ animalId: id, tag: tags.get(id) ?? null, ...i });
    }
  }
  return {
    ok: issues.length === 0,
    issues,
    canOverrideWithdrawal: roleHas(fctx.role, "withdrawal.override"),
  };
}

/**
 * Venda atômica: todos os animais saem juntos ou nada é gravado. Animal já vendido
 * ou baixado em outro aparelho vira CONFLITO (nunca reabre nem vende duas vezes).
 * Carência ativa bloqueia; exceção só por quem tem permissão, com motivo auditado.
 */
export async function recordSale(tx: Tx, fctx: FarmContext, raw: SaleInput, meta: MutationMeta) {
  const input = SaleInput.parse(raw);
  const id = input.id ?? meta.mutationId ?? randomUUID();
  const today = todayInTimezone(fctx.timezone, meta.now);
  assertEventDate(input.date, { today });
  const ids = input.items.map((i) => i.animalId);
  const check = await checkSale(tx, fctx, ids, input.date);
  const notActive = check.issues.find((i) => i.code === "not_active");
  if (notActive) {
    throw new VersionConflictError(
      notActive.animalId,
      0,
      "animal_not_active",
      `${notActive.message} Outro registro já baixou este animal; revise antes de vender.`,
    );
  }
  const missing = check.issues.find((i) => i.code === "not_found");
  if (missing) throw new DomainError("not_found", "Animal não encontrado nesta fazenda.");
  const withdrawal = check.issues.filter((i) => i.code === "in_withdrawal");
  if (withdrawal.length) {
    if (!input.withdrawalOverride) {
      throw new DomainError(
        "withdrawal_pending",
        `Venda bloqueada por carência: ${withdrawal.map((w) => w.message).join(" ")}`,
        { animals: withdrawal.map((w) => w.animalId) },
      );
    }
    if (!roleHas(fctx.role, "withdrawal.override")) {
      throw new DomainError(
        "withdrawal_override_forbidden",
        "Somente o proprietário pode registrar exceção de carência.",
      );
    }
  }

  const individual = input.items.every((i) => i.liveWeightKg);
  const totalLiveKg = individual
    ? Math.round(input.items.reduce((s, i) => s + (i.liveWeightKg ?? 0), 0) * 100) / 100
    : (input.totalLiveKg ?? null);
  const price = computePrice({
    mode: input.priceMode,
    unitCents: toCents(input.unitPrice),
    heads: ids.length,
    totalLiveKg,
    carcassYieldPercent: input.carcassYieldPercent ?? null,
  });
  const alloc = allocateCents(
    price.totalCents,
    input.items.map((i) => (individual ? (i.liveWeightKg ?? 0) : 1)),
  );

  const entry = await createEntry(tx, fctx, {
    kind: "income",
    category: "animal_sale",
    description: `Venda de ${ids.length} animal(is) para ${input.counterparty}`,
    amountCents: price.totalCents,
    dueOn: input.dueOn ?? input.date,
    paidOn: input.paid ? input.date : null,
    counterparty: input.counterparty,
    document: input.document ?? null,
    allocationType: "animals",
    allocationIds: ids,
    sourceType: "sale",
    sourceId: id,
  });
  await tx.commercialTransaction.create({
    data: {
      id,
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      kind: "sale",
      date: civilToDate(input.date),
      counterparty: input.counterparty,
      document: input.document ?? null,
      priceMode: input.priceMode,
      unitCents: BigInt(toCents(input.unitPrice)),
      totalCents: BigInt(price.totalCents),
      heads: ids.length,
      totalLiveKg: totalLiveKg?.toFixed(2) ?? null,
      carcassYieldPercent: input.carcassYieldPercent?.toFixed(2) ?? null,
      estimatedArrobas: price.estimatedArrobas?.toFixed(2) ?? null,
      formula: price.formula,
      notes: input.notes ?? null,
      withdrawalOverride:
        withdrawal.length && input.withdrawalOverride
          ? {
              reason: input.withdrawalOverride.reason,
              byUserId: fctx.userId,
              animals: withdrawal.map((w) => w.animalId),
            }
          : undefined,
      financialEntryId: entry.id,
      createdById: fctx.userId,
      items: {
        create: input.items.map((it, i) => ({
          animalId: it.animalId,
          liveWeightKg: it.liveWeightKg?.toFixed(2) ?? null,
          allocatedCents: BigInt(alloc[i]!),
        })),
      },
    },
  });
  for (const [i, it] of input.items.entries()) {
    // Transição condicional: só sai quem ainda está ativo (corrida entre aparelhos).
    const r = await tx.animal.updateMany({
      where: { id: it.animalId, farmId: fctx.farmId, status: "active" },
      data: {
        status: "sold",
        exitDate: civilToDate(input.date),
        exitReason: `Venda para ${input.counterparty}`,
        groupId: null,
        pastureId: null,
        version: { increment: 1 },
      },
    });
    if (r.count !== 1)
      throw new VersionConflictError(
        it.animalId,
        0,
        "animal_not_active",
        "Animal já baixado em outro registro.",
      );
    await addEvent(
      tx,
      fctx,
      it.animalId,
      "sold",
      input.date,
      {
        transactionId: id,
        counterparty: input.counterparty,
        liveWeightKg: it.liveWeightKg ?? null,
        allocatedCents: alloc[i]!,
        withdrawalOverride: withdrawal.some((w) => w.animalId === it.animalId),
      },
      meta,
    );
    await recordChange(tx, fctx, "animal", it.animalId);
  }
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: withdrawal.length ? "sale.create.withdrawal_override" : "sale.create",
    entityType: "commercial_transaction",
    entityId: id,
    data: {
      heads: ids.length,
      totalCents: price.totalCents,
      ...(withdrawal.length ? { overrideReason: input.withdrawalOverride!.reason } : {}),
    },
  });
  return {
    entityId: id,
    version: null,
    detail: { id, totalCents: price.totalCents, formula: price.formula },
  };
}

// ---- Compra ------------------------------------------------------------------------------------

export async function recordPurchase(
  tx: Tx,
  fctx: FarmContext,
  raw: PurchaseInput,
  meta: MutationMeta,
) {
  const input = PurchaseInput.parse(raw);
  const id = input.id ?? meta.mutationId ?? randomUUID();
  const today = todayInTimezone(fctx.timezone, meta.now);
  assertEventDate(input.date, { today });
  const individual = input.animals.every((a) => a.liveWeightKg);
  const totalLiveKg = individual
    ? Math.round(input.animals.reduce((s, a) => s + (a.liveWeightKg ?? 0), 0) * 100) / 100
    : (input.totalLiveKg ?? null);
  const price = computePrice({
    mode: input.priceMode,
    unitCents: toCents(input.unitPrice),
    heads: input.animals.length,
    totalLiveKg,
    carcassYieldPercent: input.carcassYieldPercent ?? null,
  });
  const alloc = allocateCents(
    price.totalCents,
    input.animals.map((a) => (individual ? (a.liveWeightKg ?? 0) : 1)),
  );
  const animalIds: string[] = [];
  for (const a of input.animals) {
    const r = await createAnimal(
      tx,
      fctx,
      {
        sex: a.sex,
        category: a.category,
        ...(a.breed ? { breed: a.breed } : {}),
        ...(a.birthDate ? { birthDate: a.birthDate } : {}),
        birthDateEstimated: a.birthDateEstimated ?? false,
        origin: "purchased",
        entryDate: input.date,
        groupId: input.groupId ?? null,
        pastureId: input.pastureId ?? null,
        identifiers: a.identifiers,
      },
      meta,
    );
    animalIds.push(r.entityId);
  }
  const entry = await createEntry(tx, fctx, {
    kind: "expense",
    category: "animal_purchase",
    description: `Compra de ${animalIds.length} animal(is) de ${input.counterparty}`,
    amountCents: price.totalCents,
    dueOn: input.dueOn ?? input.date,
    paidOn: input.paid ? input.date : null,
    counterparty: input.counterparty,
    document: input.document ?? null,
    allocationType: "animals",
    allocationIds: animalIds,
    sourceType: "purchase",
    sourceId: id,
  });
  await tx.commercialTransaction.create({
    data: {
      id,
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      kind: "purchase",
      date: civilToDate(input.date),
      counterparty: input.counterparty,
      document: input.document ?? null,
      priceMode: input.priceMode,
      unitCents: BigInt(toCents(input.unitPrice)),
      totalCents: BigInt(price.totalCents),
      heads: animalIds.length,
      totalLiveKg: totalLiveKg?.toFixed(2) ?? null,
      carcassYieldPercent: input.carcassYieldPercent?.toFixed(2) ?? null,
      estimatedArrobas: price.estimatedArrobas?.toFixed(2) ?? null,
      formula: price.formula,
      notes: input.notes ?? null,
      financialEntryId: entry.id,
      createdById: fctx.userId,
      items: {
        create: animalIds.map((animalId, i) => ({
          animalId,
          liveWeightKg: input.animals[i]!.liveWeightKg?.toFixed(2) ?? null,
          allocatedCents: BigInt(alloc[i]!),
        })),
      },
    },
  });
  // Peso de compra entra como pesagem (base do GMD).
  for (const [i, animalId] of animalIds.entries()) {
    const w = input.animals[i]!.liveWeightKg;
    if (w) {
      const wid = randomUUID();
      await tx.weightMeasurement.create({
        data: {
          id: wid,
          organizationId: fctx.organizationId,
          farmId: fctx.farmId,
          animalId,
          weightKg: w.toFixed(2),
          measuredOn: civilToDate(input.date),
          source: "manual",
          notes: `Peso de compra (${input.counterparty})`,
          createdById: fctx.userId,
        },
      });
      await recordChange(tx, fctx, "weight", wid);
    }
    await addEvent(
      tx,
      fctx,
      animalId,
      "purchased",
      input.date,
      { transactionId: id, counterparty: input.counterparty, allocatedCents: alloc[i]! },
      meta,
    );
  }
  return {
    entityId: id,
    version: null,
    detail: { id, animalIds, totalCents: price.totalCents, formula: price.formula },
  };
}

/** Anula compra/venda: cancela o financeiro e devolve/baixa os animais, com trilha. */
export async function voidTransaction(
  tx: Tx,
  fctx: FarmContext,
  id: string,
  reason: string,
  meta: MutationMeta,
) {
  const t = await tx.commercialTransaction.findFirst({
    where: { id, farmId: fctx.farmId },
    include: { items: true },
  });
  if (!t) throw notFound("Transação");
  if (t.voidedAt) return;
  const today = todayInTimezone(fctx.timezone, meta.now);
  if (t.kind === "sale") {
    for (const it of t.items) {
      const r = await tx.animal.updateMany({
        where: { id: it.animalId, farmId: fctx.farmId, status: "sold" },
        data: { status: "active", exitDate: null, exitReason: null, version: { increment: 1 } },
      });
      if (r.count !== 1)
        throw new DomainError(
          "animal_changed",
          "Um animal da venda mudou de situação; revise antes de anular.",
        );
    }
  } else {
    for (const it of t.items) {
      const events = await tx.animalEvent.count({
        where: { animalId: it.animalId, type: { notIn: ["registered", "purchased", "weighed"] } },
      });
      if (events > 0)
        throw new DomainError(
          "animal_has_history",
          "Animal comprado já tem manejos registrados; registre a saída em vez de anular a compra.",
        );
      await tx.animal.update({
        where: { id: it.animalId },
        data: {
          status: "transferred_out",
          exitDate: t.date,
          exitReason: `Compra anulada: ${reason}`,
          version: { increment: 1 },
        },
      });
    }
  }
  for (const it of t.items) {
    await addEvent(
      tx,
      fctx,
      it.animalId,
      "correction",
      today,
      {
        kind: t.kind,
        recordId: id,
        label: `${t.kind === "sale" ? "Venda" : "Compra"} de ${fmt(dateToCivil(t.date))}`,
        reason,
      },
      meta,
    );
    await recordChange(tx, fctx, "animal", it.animalId);
  }
  await tx.commercialTransaction.update({
    where: { id },
    data: { voidedAt: meta.now, voidReason: reason },
  });
  if (t.financialEntryId) {
    await tx.financialEntry.update({
      where: { id: t.financialEntryId },
      data: {
        status: "cancelled",
        paidOn: null,
        cancelReason: `Transação anulada: ${reason}`,
        version: { increment: 1 },
      },
    });
  }
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: `${t.kind}.void`,
    entityType: "commercial_transaction",
    entityId: id,
    data: { reason },
  });
}

export async function commercialDtos(
  db: Db | Tx,
  fctx: FarmContext,
  ids: string[],
): Promise<CommercialDto[]> {
  const rows = await db.commercialTransaction.findMany({
    where: { id: { in: ids }, farmId: fctx.farmId },
    include: { items: true },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const tags = await tagsOf(
    db,
    rows.flatMap((r) => r.items.map((i) => i.animalId)),
  );
  const userIds = rows
    .map((r) => (r.withdrawalOverride as { byUserId?: string } | null)?.byUserId)
    .filter((x): x is string => !!x);
  const users = userIds.length
    ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  return rows.map((r) => {
    const o = r.withdrawalOverride as { reason: string; byUserId: string } | null;
    return {
      id: r.id,
      kind: r.kind,
      date: dateToCivil(r.date),
      counterparty: r.counterparty,
      document: r.document,
      priceMode: r.priceMode,
      unitCents: Number(r.unitCents),
      totalCents: Number(r.totalCents),
      heads: r.heads,
      totalLiveKg: r.totalLiveKg == null ? null : Number(r.totalLiveKg),
      carcassYieldPercent: r.carcassYieldPercent == null ? null : Number(r.carcassYieldPercent),
      estimatedArrobas: r.estimatedArrobas == null ? null : Number(r.estimatedArrobas),
      formula: r.formula,
      notes: r.notes,
      withdrawalOverride: o
        ? {
            reason: o.reason,
            byUserId: o.byUserId,
            byName: users.find((u) => u.id === o.byUserId)?.name ?? null,
          }
        : null,
      financialEntryId: r.financialEntryId,
      voided: r.voidedAt !== null,
      items: r.items.map((i) => ({
        animalId: i.animalId,
        tag: tags.get(i.animalId) ?? null,
        liveWeightKg: i.liveWeightKg == null ? null : Number(i.liveWeightKg),
        allocatedCents: Number(i.allocatedCents),
      })),
    };
  });
}

// ---- Saída: morte, descarte, transferência --------------------------------------------------------

export async function recordExit(
  tx: Tx,
  fctx: FarmContext,
  animalId: string,
  raw: AnimalExitInput,
  meta: MutationMeta,
) {
  const input = AnimalExitInput.parse(raw);
  const a = await tx.animal.findFirst({ where: { id: animalId, farmId: fctx.farmId } });
  if (!a) throw notFound("Animal");
  if (a.status !== "active") {
    throw new VersionConflictError(
      animalId,
      a.version,
      "animal_not_active",
      `O animal já está como "${STATUS_LABEL[a.status]}". Nada foi alterado.`,
    );
  }
  assertEventDate(input.date, {
    today: todayInTimezone(fctx.timezone, meta.now),
    birthDate: dateToCivil(a.birthDate),
  });
  await tx.animal.update({
    where: { id: animalId },
    data: {
      status: input.kind,
      exitDate: civilToDate(input.date),
      exitReason: input.reason,
      groupId: null,
      pastureId: null,
      version: { increment: 1 },
    },
  });
  await addEvent(
    tx,
    fctx,
    animalId,
    input.kind === "dead" ? "died" : "exited",
    input.date,
    {
      kind: input.kind,
      reason: input.reason,
      notes: input.notes ?? null,
      previousGroupId: a.groupId,
    },
    meta,
  );
  // Tarefas abertas do animal deixam de valer para ele (registro preservado).
  const tasks = await tx.task.findMany({
    where: { farmId: fctx.farmId, status: "open", animalIds: { has: animalId } },
  });
  for (const t of tasks) {
    const rest = t.animalIds.filter((x) => x !== animalId);
    await tx.task.update({
      where: { id: t.id },
      data: rest.length
        ? { animalIds: rest }
        : {
            status: "cancelled",
            completedAt: meta.now,
            resolution: `Animal saiu do rebanho (${STATUS_LABEL[input.kind]}).`,
          },
    });
  }
  await recordChange(tx, fctx, "animal", animalId);
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: "animal.exit",
    entityType: "animal",
    entityId: animalId,
    data: { kind: input.kind, reason: input.reason, date: input.date },
  });
  return { entityId: animalId, version: a.version + 1 };
}

// ---- Trato -------------------------------------------------------------------------------------

/** Custo médio ponderado das entradas com custo informado (centavos por unidade × 1000). */
async function averageUnitCost(tx: Tx, productId: string): Promise<number | null> {
  const entries = await tx.stockMovement.findMany({
    where: { productId, kind: "entry", voidedAt: null, unitCost: { not: null } },
    select: { quantity: true, unitCost: true },
  });
  let q = 0;
  let v = 0;
  for (const e of entries) {
    q += Number(e.quantity);
    v += Number(e.quantity) * Number(e.unitCost);
  }
  return q > 0 ? v / q : null;
}

export async function recordFeeding(
  tx: Tx,
  fctx: FarmContext,
  raw: FeedingInput,
  meta: MutationMeta,
) {
  const input = FeedingInput.parse(raw);
  const id = input.id ?? meta.mutationId ?? randomUUID();
  const today = todayInTimezone(fctx.timezone, meta.now);
  assertEventDate(input.date, { today });
  let heads = 0;
  if (input.groupId) {
    const g = await tx.group.findFirst({ where: { id: input.groupId, farmId: fctx.farmId } });
    if (!g) throw new DomainError("group_not_found", "Lote não encontrado.");
    heads = await tx.animal.count({
      where: { farmId: fctx.farmId, groupId: g.id, status: "active" },
    });
  }
  let unit = input.unit ?? "kg";
  let costCents: number | null = null;
  let movementId: string | null = null;
  if (input.productId) {
    const p = await tx.product.findFirst({ where: { id: input.productId, farmId: fctx.farmId } });
    if (!p) throw new DomainError("product_not_found", "Produto não encontrado nesta fazenda.");
    if (p.kind !== "feed" && p.kind !== "supplement")
      throw new DomainError("product_not_feed", "Escolha um produto de alimentação ou suplemento.");
    unit = p.unit;
    const mv = await consumeStock(tx, fctx, {
      productId: p.id,
      quantityMilli: toMilli(input.quantity),
      occurredOn: input.date,
      sourceType: "feeding",
      sourceId: id,
    });
    movementId = mv.id;
    const avg = await averageUnitCost(tx, p.id);
    costCents = avg === null ? null : Math.round(avg * fromMilli(toMilli(input.quantity)) * 100);
  }
  await tx.feedingEvent.create({
    data: {
      id,
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      groupId: input.groupId ?? null,
      date: civilToDate(input.date),
      diet: input.diet,
      productId: input.productId ?? null,
      quantity: input.quantity.toFixed(3),
      unit,
      heads,
      costCents: costCents === null ? null : BigInt(costCents),
      stockMovementId: movementId,
      notes: input.notes ?? null,
      createdById: fctx.userId,
    },
  });
  return { entityId: id, version: null, detail: { id, heads, costCents } };
}

export async function voidFeeding(
  tx: Tx,
  fctx: FarmContext,
  id: string,
  reason: string,
  meta: MutationMeta,
) {
  const f = await tx.feedingEvent.findFirst({ where: { id, farmId: fctx.farmId } });
  if (!f) throw notFound("Trato");
  if (f.voidedAt) return;
  await tx.feedingEvent.update({ where: { id }, data: { voidedAt: meta.now, voidReason: reason } });
  if (f.stockMovementId)
    await tx.stockMovement.update({
      where: { id: f.stockMovementId },
      data: { voidedAt: meta.now, voidReason: reason },
    });
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: "feeding.void",
    entityType: "feeding_event",
    entityId: id,
    data: { reason },
  });
}
