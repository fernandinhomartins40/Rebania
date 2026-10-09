import { randomUUID } from "node:crypto";
import {
  ExamInput,
  HandlingCloseInput,
  HandlingConfig,
  HandlingExceptionInput,
  HandlingMarkInput,
  HandlingOpenInput,
  HealthApplyInput,
  ProductInput,
  StockMovementInput,
  TreatmentInput,
  UpdateProductInput,
  UpdateTreatmentInput,
  type GroupOperationResult,
  type HandlingSessionDto,
  type ProductDto,
} from "@rebania/contracts";
import {
  assertAnimalAcceptsHandling,
  assertEventDate,
  assertWithdrawalConfig,
  DomainError,
  EXAM_KIND_LABEL,
  fromMilli,
  HEALTH_KIND_LABEL,
  maxDate,
  signedQuantity,
  summarizeSession,
  toMilli,
  todayInTimezone,
  TREATMENT_STATUS_LABEL,
  withdrawalUntil,
  type ExamKind,
} from "@rebania/domain";
import type { Prisma, Tx } from "@rebania/db";
import { audit } from "../../lib/audit.ts";
import { recordChange } from "../../lib/changes.ts";
import { civilToDate, dateToCivil } from "../../lib/dates.ts";
import { notFound } from "../../lib/errors.ts";
import { createTask } from "../../lib/tasks.ts";
import type { FarmContext } from "../../lib/tenant.ts";
import { addEvent, recordWeight, type MutationMeta } from "../animals/service.ts";

const fmt = (d: string) => d.split("-").reverse().join("/");
const num = (d: Prisma.Decimal | null | undefined) => (d == null ? null : Number(d));

// ---- Estoque ------------------------------------------------------------------------------

export async function balanceOf(tx: Tx, productId: string, batchId?: string | null) {
  const r = await tx.stockMovement.aggregate({
    where: { productId, voidedAt: null, ...(batchId ? { batchId } : {}) },
    _sum: { quantity: true },
  });
  return toMilli(Number(r._sum.quantity ?? 0));
}

async function loadProduct(tx: Tx, fctx: FarmContext, id: string) {
  const p = await tx.product.findFirst({ where: { id, farmId: fctx.farmId } });
  if (!p) throw new DomainError("product_not_found", "Produto não encontrado nesta fazenda.");
  return p;
}

async function loadBatch(tx: Tx, fctx: FarmContext, productId: string, batchId: string) {
  const b = await tx.productBatch.findFirst({
    where: { id: batchId, farmId: fctx.farmId, productId },
  });
  if (!b) throw new DomainError("batch_not_found", "Lote/partida não pertence a este produto.");
  return b;
}

/**
 * Baixa de estoque por fato de campo (aplicação, IA, trato). Nunca bloqueia o
 * registro: se o saldo ficar negativo, o movimento fica marcado para conferência.
 */
export async function consumeStock(
  tx: Tx,
  fctx: FarmContext,
  m: {
    productId: string;
    batchId?: string | null;
    quantityMilli: number;
    occurredOn: string;
    sourceType: string;
    sourceId: string;
    note?: string;
  },
) {
  const before = await balanceOf(tx, m.productId);
  return tx.stockMovement.create({
    data: {
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      productId: m.productId,
      batchId: m.batchId ?? null,
      kind: "consumption",
      quantity: fromMilli(-m.quantityMilli).toFixed(3),
      occurredOn: civilToDate(m.occurredOn),
      sourceType: m.sourceType,
      sourceId: m.sourceId,
      note: m.note ?? null,
      needsReview: before - m.quantityMilli < 0,
      createdById: fctx.userId,
    },
  });
}

export async function createProduct(tx: Tx, fctx: FarmContext, raw: ProductInput) {
  const input = ProductInput.parse(raw);
  const w = {
    meatDays: input.withdrawalMeatDays ?? null,
    milkDays: input.withdrawalMilkDays ?? null,
    source: input.withdrawalSource ?? null,
  };
  assertWithdrawalConfig(w);
  if (input.sireId) {
    const sire = await tx.animal.findFirst({
      where: { id: input.sireId, organizationId: fctx.organizationId, sex: "male" },
    });
    if (!sire) throw new DomainError("sire_not_found", "Touro não encontrado.");
  }
  const p = await tx.product.create({
    data: {
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      name: input.name,
      kind: input.kind,
      unit: input.unit,
      minStock: input.minStock != null ? input.minStock.toFixed(3) : null,
      withdrawalMeatDays: w.meatDays,
      withdrawalMilkDays: w.milkDays,
      withdrawalSource: w.source,
      sireId: input.sireId ?? null,
      sireName: input.sireName ?? null,
      notes: input.notes ?? null,
      createdById: fctx.userId,
    },
  });
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: "product.create",
    entityType: "product",
    entityId: p.id,
    data: { name: p.name, withdrawal: { ...w } },
  });
  return p;
}

export async function updateProduct(
  tx: Tx,
  fctx: FarmContext,
  id: string,
  raw: UpdateProductInput,
  now: Date,
) {
  const input = UpdateProductInput.parse(raw);
  const current = await loadProduct(tx, fctx, id);
  const w = {
    meatDays:
      input.withdrawalMeatDays !== undefined
        ? input.withdrawalMeatDays
        : current.withdrawalMeatDays,
    milkDays:
      input.withdrawalMilkDays !== undefined
        ? input.withdrawalMilkDays
        : current.withdrawalMilkDays,
    source:
      input.withdrawalSource !== undefined ? input.withdrawalSource : current.withdrawalSource,
  };
  assertWithdrawalConfig(w);
  const p = await tx.product.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.unit !== undefined ? { unit: input.unit } : {}),
      ...(input.minStock !== undefined
        ? { minStock: input.minStock === null ? null : input.minStock.toFixed(3) }
        : {}),
      ...(input.sireName !== undefined ? { sireName: input.sireName } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      withdrawalMeatDays: w.meatDays,
      withdrawalMilkDays: w.milkDays,
      withdrawalSource: w.source,
      ...(input.archived !== undefined ? { archivedAt: input.archived ? now : null } : {}),
      version: { increment: 1 },
    },
  });
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: "product.update",
    entityType: "product",
    entityId: id,
    data: {
      before: {
        withdrawalMeatDays: current.withdrawalMeatDays,
        withdrawalMilkDays: current.withdrawalMilkDays,
        withdrawalSource: current.withdrawalSource,
      },
      after: { ...input },
    } as Prisma.InputJsonValue,
  });
  return p;
}

export async function listProducts(
  tx: Tx,
  fctx: FarmContext,
  opts: { includeArchived?: boolean; ids?: string[] } = {},
): Promise<ProductDto[]> {
  const products = await tx.product.findMany({
    where: {
      farmId: fctx.farmId,
      ...(opts.includeArchived ? {} : { archivedAt: null }),
      ...(opts.ids ? { id: { in: opts.ids } } : {}),
    },
    include: { batches: { orderBy: { createdAt: "asc" } } },
    orderBy: { name: "asc" },
  });
  const ids = products.map((p) => p.id);
  const [byProduct, byBatch, reviews] = await Promise.all([
    tx.stockMovement.groupBy({
      by: ["productId"],
      where: { productId: { in: ids }, voidedAt: null },
      _sum: { quantity: true },
    }),
    tx.stockMovement.groupBy({
      by: ["batchId"],
      where: { productId: { in: ids }, voidedAt: null, batchId: { not: null } },
      _sum: { quantity: true },
    }),
    tx.stockMovement.groupBy({
      by: ["productId"],
      where: { productId: { in: ids }, voidedAt: null, needsReview: true, reviewedAt: null },
      _count: { _all: true },
    }),
  ]);
  const bal = new Map(byProduct.map((r) => [r.productId, Number(r._sum.quantity ?? 0)]));
  const bbal = new Map(byBatch.map((r) => [r.batchId!, Number(r._sum.quantity ?? 0)]));
  const rev = new Map(reviews.map((r) => [r.productId, r._count._all]));
  return products.map((p) => {
    const balance = fromMilli(toMilli(bal.get(p.id) ?? 0));
    const minStock = num(p.minStock);
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      unit: p.unit as ProductDto["unit"],
      minStock,
      withdrawalMeatDays: p.withdrawalMeatDays,
      withdrawalMilkDays: p.withdrawalMilkDays,
      withdrawalSource: p.withdrawalSource,
      sireId: p.sireId,
      sireName: p.sireName,
      notes: p.notes,
      archived: p.archivedAt !== null,
      balance,
      belowMin: minStock !== null && balance < minStock,
      pendingReview: rev.get(p.id) ?? 0,
      batches: p.batches.map((b) => ({
        id: b.id,
        code: b.code,
        expiresOn: dateToCivil(b.expiresOn),
        balance: fromMilli(toMilli(bbal.get(b.id) ?? 0)),
      })),
    };
  });
}

/** Movimento manual (entrada, perda, ajuste ou consumo administrativo). Transação atômica. */
export async function recordMovement(
  tx: Tx,
  fctx: FarmContext,
  raw: StockMovementInput,
  meta: MutationMeta,
) {
  const input = StockMovementInput.parse(raw);
  const today = todayInTimezone(fctx.timezone, meta.now);
  assertEventDate(input.occurredOn, { today });
  const product = await loadProduct(tx, fctx, input.productId);
  if (product.archivedAt) throw new DomainError("product_archived", "Produto arquivado.");
  let batchId = input.batchId ?? null;
  if (batchId) await loadBatch(tx, fctx, product.id, batchId);
  else if (input.batchCode) {
    if (input.kind !== "entry")
      throw new DomainError("batch_required", "Escolha um lote/partida existente.");
    const code = input.batchCode.trim().toUpperCase();
    const existing = await tx.productBatch.findFirst({ where: { productId: product.id, code } });
    const b =
      existing ??
      (await tx.productBatch.create({
        data: {
          organizationId: fctx.organizationId,
          farmId: fctx.farmId,
          productId: product.id,
          code,
          expiresOn: input.expiresOn ? civilToDate(input.expiresOn) : null,
        },
      }));
    batchId = b.id;
  }
  if (input.locationId) {
    const loc = await tx.stockLocation.findFirst({
      where: { id: input.locationId, farmId: fctx.farmId },
    });
    if (!loc) throw new DomainError("location_not_found", "Local de estoque não encontrado.");
  }
  const qty = signedQuantity(input.kind, input.quantity);
  if (qty < 0) {
    // Lança movimento administrativo somente com saldo: diferença real vira ajuste justificado.
    const bal = await balanceOf(tx, product.id, batchId);
    if (bal + toMilli(qty) < 0) {
      throw new DomainError(
        "insufficient_stock",
        `Saldo insuficiente (${fromMilli(bal).toLocaleString("pt-BR")} ${product.unit}). Registre a entrada ou um ajuste de inventário justificado.`,
        { balance: fromMilli(bal) },
      );
    }
  }
  const m = await tx.stockMovement.create({
    data: {
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      productId: product.id,
      batchId,
      locationId: input.locationId ?? null,
      kind: input.kind,
      quantity: qty.toFixed(3),
      unitCost: input.unitCost != null ? input.unitCost.toFixed(4) : null,
      occurredOn: civilToDate(input.occurredOn),
      sourceType: "manual",
      note: input.note ?? null,
      createdById: fctx.userId,
    },
  });
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: `stock.${input.kind}`,
    entityType: "stock_movement",
    entityId: m.id,
    data: { productId: product.id, quantity: qty, note: input.note ?? null },
  });
  return { entityId: m.id, version: null };
}

// ---- Carência -----------------------------------------------------------------------------

export async function recomputeWithdrawal(tx: Tx, fctx: FarmContext, animalId: string) {
  const apps = await tx.healthApplication.findMany({
    where: { animalId, voidedAt: null },
    select: { withdrawalMeatUntil: true, withdrawalMilkUntil: true },
  });
  const meat = maxDate(apps.map((a) => dateToCivil(a.withdrawalMeatUntil)));
  const milk = maxDate(apps.map((a) => dateToCivil(a.withdrawalMilkUntil)));
  await tx.animal.update({
    where: { id: animalId },
    data: {
      withdrawalMeatUntil: meat ? civilToDate(meat) : null,
      withdrawalMilkUntil: milk ? civilToDate(milk) : null,
    },
  });
  await recordChange(tx, fctx, "animal", animalId);
}

// ---- Aplicações ---------------------------------------------------------------------------

interface ResolvedProduct {
  product: Awaited<ReturnType<typeof loadProduct>>;
  batchId: string | null;
  batchCode: string | null;
  doseMilli: number;
  route: string | null;
}

async function resolveProducts(
  tx: Tx,
  fctx: FarmContext,
  products: { productId: string; batchId?: string | null; dose: number; route?: string | null }[],
  date: string,
): Promise<ResolvedProduct[]> {
  const out: ResolvedProduct[] = [];
  for (const p of products) {
    const product = await loadProduct(tx, fctx, p.productId);
    if (product.archivedAt) throw new DomainError("product_archived", `${product.name} arquivado.`);
    let batchCode: string | null = null;
    if (p.batchId) {
      const b = await loadBatch(tx, fctx, product.id, p.batchId);
      if (b.expiresOn && dateToCivil(b.expiresOn) < date) {
        throw new DomainError(
          "batch_expired",
          `Lote ${b.code} de ${product.name} venceu em ${fmt(dateToCivil(b.expiresOn))}.`,
        );
      }
      batchCode = b.code;
    }
    out.push({
      product,
      batchId: p.batchId ?? null,
      batchCode,
      doseMilli: toMilli(p.dose),
      route: p.route ?? null,
    });
  }
  return out;
}

/** Aplica os produtos em UM animal (já validado). Idempotente por operação+animal+produto. */
async function applyToAnimal(
  tx: Tx,
  fctx: FarmContext,
  animalId: string,
  products: ResolvedProduct[],
  ctx: {
    operationId: string;
    kind: HealthApplyInput["kind"];
    date: string;
    applicator?: string;
    reason?: string;
    planItemId?: string | null;
    sessionId?: string | null;
    treatmentId?: string | null;
  },
  meta: MutationMeta,
) {
  const ids: string[] = [];
  for (const r of products) {
    const meatUntil = withdrawalUntil(ctx.date, r.product.withdrawalMeatDays);
    const milkUntil = withdrawalUntil(ctx.date, r.product.withdrawalMilkDays);
    const id = randomUUID();
    const mv = await consumeStock(tx, fctx, {
      productId: r.product.id,
      batchId: r.batchId,
      quantityMilli: r.doseMilli,
      occurredOn: ctx.date,
      sourceType: "health_application",
      sourceId: id,
    });
    await tx.healthApplication.create({
      data: {
        id,
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        animalId,
        operationId: ctx.operationId,
        kind: ctx.kind,
        productId: r.product.id,
        productName: r.product.name,
        batchId: r.batchId,
        dose: fromMilli(r.doseMilli).toFixed(3),
        unit: r.product.unit,
        route: (r.route as Prisma.HealthApplicationCreateInput["route"]) ?? null,
        appliedOn: civilToDate(ctx.date),
        applicator: ctx.applicator ?? null,
        reason: ctx.reason ?? null,
        planItemId: ctx.planItemId ?? null,
        sessionId: ctx.sessionId ?? null,
        treatmentId: ctx.treatmentId ?? null,
        withdrawalMeatUntil: meatUntil ? civilToDate(meatUntil) : null,
        withdrawalMilkUntil: milkUntil ? civilToDate(milkUntil) : null,
        stockMovementId: mv.id,
        createdById: fctx.userId,
      },
    });
    await addEvent(
      tx,
      fctx,
      animalId,
      "health_applied",
      ctx.date,
      {
        applicationId: id,
        kind: ctx.kind,
        kindLabel: HEALTH_KIND_LABEL[ctx.kind],
        productName: r.product.name,
        dose: fromMilli(r.doseMilli),
        unit: r.product.unit,
        batchCode: r.batchCode,
        applicator: ctx.applicator ?? null,
        withdrawalMeatUntil: meatUntil,
        withdrawalMilkUntil: milkUntil,
        withdrawalConfigured:
          r.product.withdrawalMeatDays !== null || r.product.withdrawalMilkDays !== null,
        sessionId: ctx.sessionId ?? null,
      },
      meta,
    );
    ids.push(id);
  }
  await recomputeWithdrawal(tx, fctx, animalId);
  return ids;
}

async function checkAnimal(tx: Tx, fctx: FarmContext, id: string, date: string, today: string) {
  const a = await tx.animal.findFirst({ where: { id, farmId: fctx.farmId } });
  if (!a) return { error: { code: "not_found", message: "Animal não encontrado nesta fazenda." } };
  try {
    assertAnimalAcceptsHandling(a.status);
    assertEventDate(date, { today, birthDate: dateToCivil(a.birthDate) });
  } catch (e) {
    return { error: { code: (e as DomainError).code, message: (e as DomainError).message } };
  }
  return { animal: a };
}

export async function applyHealth(
  tx: Tx,
  fctx: FarmContext,
  raw: HealthApplyInput,
  meta: MutationMeta,
) {
  const input = HealthApplyInput.parse(raw);
  const operationId = input.operationId ?? meta.mutationId ?? randomUUID();
  const today = todayInTimezone(fctx.timezone, meta.now);
  assertEventDate(input.date, { today });
  const products = await resolveProducts(tx, fctx, input.products, input.date);
  if (input.planItemId) {
    const item = await tx.healthPlanItem.findFirst({
      where: { id: input.planItemId, farmId: fctx.farmId },
    });
    if (!item) throw new DomainError("plan_item_not_found", "Item do calendário não encontrado.");
  }
  if (input.treatmentId) {
    const t = await tx.treatment.findFirst({
      where: { id: input.treatmentId, farmId: fctx.farmId },
    });
    if (!t) throw new DomainError("treatment_not_found", "Tratamento não encontrado.");
    if (input.animalIds.length !== 1 || input.animalIds[0] !== t.animalId) {
      throw new DomainError("treatment_animal_mismatch", "Tratamento é de outro animal.");
    }
  }
  const result: GroupOperationResult = { operationId, done: [], exceptions: [] };
  for (const id of input.animalIds) {
    const c = await checkAnimal(tx, fctx, id, input.date, today);
    if (c.error) {
      result.exceptions.push({ animalId: id, ...c.error });
      continue;
    }
    await applyToAnimal(
      tx,
      fctx,
      id,
      products,
      {
        operationId,
        kind: input.kind,
        date: input.date,
        ...(input.applicator ? { applicator: input.applicator } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
        planItemId: input.planItemId ?? null,
        treatmentId: input.treatmentId ?? null,
      },
      meta,
    );
    result.done.push(id);
  }
  if (result.done.length === 0) {
    throw new DomainError("nothing_recorded", result.exceptions.map((e) => e.message).join(" "), {
      exceptions: result.exceptions,
    });
  }
  return { entityId: operationId, version: null, detail: result };
}

/** Anula aplicação (correção rastreável): estorna estoque e recalcula carência. */
export async function voidApplication(
  tx: Tx,
  fctx: FarmContext,
  id: string,
  reason: string,
  meta: MutationMeta,
) {
  const a = await tx.healthApplication.findFirst({ where: { id, farmId: fctx.farmId } });
  if (!a) throw notFound("Aplicação");
  if (a.voidedAt) return a;
  await tx.healthApplication.update({
    where: { id },
    data: { voidedAt: meta.now, voidReason: reason },
  });
  if (a.stockMovementId) {
    await tx.stockMovement.update({
      where: { id: a.stockMovementId },
      data: { voidedAt: meta.now, voidReason: reason },
    });
  }
  await addEvent(
    tx,
    fctx,
    a.animalId,
    "correction",
    todayInTimezone(fctx.timezone, meta.now),
    {
      kind: "health_application",
      recordId: id,
      label: `Aplicação de ${a.productName} em ${fmt(dateToCivil(a.appliedOn))}`,
      reason,
    },
    meta,
  );
  await recomputeWithdrawal(tx, fctx, a.animalId);
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: "health_application.void",
    entityType: "health_application",
    entityId: id,
    data: { reason },
  });
  return a;
}

// ---- Tratamentos e exames --------------------------------------------------------------------

export async function startTreatment(
  tx: Tx,
  fctx: FarmContext,
  raw: TreatmentInput,
  meta: MutationMeta,
) {
  const input = TreatmentInput.parse(raw);
  const today = todayInTimezone(fctx.timezone, meta.now);
  const c = await checkAnimal(tx, fctx, input.animalId, input.startedOn, today);
  if (c.error) throw new DomainError(c.error.code, c.error.message);
  const t = await tx.treatment.create({
    data: {
      id: input.id ?? meta.mutationId ?? randomUUID(),
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      animalId: input.animalId,
      startedOn: civilToDate(input.startedOn),
      condition: input.condition,
      plan: input.plan ?? null,
      responsible: input.responsible ?? null,
      createdById: fctx.userId,
    },
  });
  await addEvent(
    tx,
    fctx,
    input.animalId,
    "treatment_started",
    input.startedOn,
    { treatmentId: t.id, condition: input.condition, responsible: input.responsible ?? null },
    meta,
  );
  await recordChange(tx, fctx, "animal", input.animalId);
  return { entityId: t.id, version: null };
}

export async function updateTreatment(
  tx: Tx,
  fctx: FarmContext,
  id: string,
  raw: unknown,
  meta: MutationMeta,
) {
  const input = UpdateTreatmentInput.parse(raw);
  const t = await tx.treatment.findFirst({ where: { id, farmId: fctx.farmId } });
  if (!t) throw notFound("Tratamento");
  const today = todayInTimezone(fctx.timezone, meta.now);
  const endedOn = input.status === "open" ? null : (input.endedOn ?? today);
  if (endedOn) {
    assertEventDate(endedOn, { today });
    if (endedOn < dateToCivil(t.startedOn))
      throw new DomainError("invalid_date", "Encerramento antes do início do tratamento.");
  }
  await tx.treatment.update({
    where: { id },
    data: {
      status: input.status,
      outcome: input.outcome ?? t.outcome,
      endedOn: endedOn ? civilToDate(endedOn) : null,
    },
  });
  if (input.status !== "open") {
    await addEvent(
      tx,
      fctx,
      t.animalId,
      "treatment_closed",
      endedOn!,
      {
        treatmentId: id,
        status: input.status,
        statusLabel: TREATMENT_STATUS_LABEL[input.status],
        outcome: input.outcome ?? null,
      },
      meta,
    );
    await recordChange(tx, fctx, "animal", t.animalId);
  }
  return { entityId: id, version: null };
}

export async function recordExams(tx: Tx, fctx: FarmContext, raw: ExamInput, meta: MutationMeta) {
  const input = ExamInput.parse(raw);
  const operationId = input.operationId ?? meta.mutationId ?? randomUUID();
  const today = todayInTimezone(fctx.timezone, meta.now);
  assertEventDate(input.collectedOn, { today });
  const result: GroupOperationResult = { operationId, done: [], exceptions: [] };
  for (const id of new Set(input.animalIds)) {
    const c = await checkAnimal(tx, fctx, id, input.collectedOn, today);
    if (c.error) {
      result.exceptions.push({ animalId: id, ...c.error });
      continue;
    }
    const e = await tx.exam.create({
      data: {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        animalId: id,
        operationId,
        kind: input.kind,
        collectedOn: civilToDate(input.collectedOn),
        responsible: input.responsible ?? null,
        notes: input.notes ?? null,
        createdById: fctx.userId,
      },
    });
    await addEvent(
      tx,
      fctx,
      id,
      "exam_collected",
      input.collectedOn,
      { examId: e.id, kind: input.kind, kindLabel: EXAM_KIND_LABEL[input.kind] },
      meta,
    );
    await recordChange(tx, fctx, "animal", id);
    result.done.push(id);
  }
  if (!result.done.length)
    throw new DomainError("nothing_recorded", result.exceptions.map((e) => e.message).join(" "));
  return { entityId: operationId, version: null, detail: result };
}

export async function recordExamResult(
  tx: Tx,
  fctx: FarmContext,
  id: string,
  input: { result: string; resultOn: string },
  meta: MutationMeta,
) {
  const e = await tx.exam.findFirst({ where: { id, farmId: fctx.farmId, voidedAt: null } });
  if (!e) throw notFound("Exame");
  const today = todayInTimezone(fctx.timezone, meta.now);
  assertEventDate(input.resultOn, { today });
  if (input.resultOn < dateToCivil(e.collectedOn))
    throw new DomainError("invalid_date", "Resultado antes da coleta.");
  await tx.exam.update({
    where: { id },
    data: { status: "done", result: input.result, resultOn: civilToDate(input.resultOn) },
  });
  await addEvent(
    tx,
    fctx,
    e.animalId,
    "exam_result",
    input.resultOn,
    {
      examId: id,
      kind: e.kind,
      kindLabel: EXAM_KIND_LABEL[e.kind as ExamKind] ?? e.kind,
      result: input.result,
    },
    meta,
  );
  await recordChange(tx, fctx, "animal", e.animalId);
  return { entityId: id, version: null };
}

// ---- Sessão de manejo (Modo Curral) ------------------------------------------------------------

type StoredConfig = ReturnType<typeof HandlingConfig.parse> & {
  products: (ReturnType<typeof HandlingConfig.parse>["products"][number] & {
    productName?: string;
    unit?: string;
  })[];
};

async function loadSession(tx: Tx, fctx: FarmContext, id: string) {
  const s = await tx.handlingSession.findFirst({ where: { id, farmId: fctx.farmId } });
  if (!s) throw new DomainError("session_not_found", "Sessão de manejo não encontrada.");
  return s;
}

export async function openSession(
  tx: Tx,
  fctx: FarmContext,
  id: string,
  raw: HandlingOpenInput,
  meta: MutationMeta,
) {
  const input = HandlingOpenInput.parse(raw);
  const today = todayInTimezone(fctx.timezone, meta.now);
  assertEventDate(input.date, { today });
  const config = HandlingConfig.parse(input.config);
  const resolved = await resolveProducts(tx, fctx, config.products, input.date);
  const animals = await tx.animal.findMany({
    where: { id: { in: input.animalIds }, farmId: fctx.farmId },
    select: { id: true, status: true },
  });
  const found = new Map(animals.map((a) => [a.id, a]));
  const missing = input.animalIds.filter((a) => !found.has(a));
  if (missing.length) {
    throw new DomainError(
      "animals_not_found",
      `${missing.length} animal(is) da seleção não pertencem a esta fazenda.`,
    );
  }
  const stored: StoredConfig = {
    ...config,
    products: config.products.map((p, i) => ({
      ...p,
      productName: resolved[i]!.product.name,
      unit: resolved[i]!.product.unit,
    })),
  };
  await tx.handlingSession.create({
    data: {
      id,
      organizationId: fctx.organizationId,
      farmId: fctx.farmId,
      name: input.name,
      date: civilToDate(input.date),
      config: stored as unknown as Prisma.InputJsonValue,
      createdById: fctx.userId,
    },
  });
  await tx.handlingSessionItem.createMany({
    data: input.animalIds.map((animalId, position) => ({
      sessionId: id,
      animalId,
      farmId: fctx.farmId,
      position,
    })),
  });
  return { entityId: id, version: 1, detail: await getSessionDto(tx, fctx, id) };
}

async function undoItem(
  tx: Tx,
  fctx: FarmContext,
  sessionId: string,
  item: { animalId: string; weightId: string | null },
  reason: string,
  meta: MutationMeta,
) {
  const apps = await tx.healthApplication.findMany({
    where: { sessionId, animalId: item.animalId, voidedAt: null },
    select: { id: true },
  });
  for (const a of apps) await voidApplication(tx, fctx, a.id, reason, meta);
  if (item.weightId) {
    await tx.weightMeasurement.updateMany({
      where: { id: item.weightId, voidedAt: null },
      data: { voidedAt: meta.now },
    });
    await recordChange(tx, fctx, "weight", item.weightId, "delete");
    await recordChange(tx, fctx, "animal", item.animalId);
  }
}

/**
 * Marca o resultado de UM animal na sessão. Idempotente: marcar como realizado
 * um animal já realizado não reaplica produtos nem duplica pesagem.
 */
export async function markItem(
  tx: Tx,
  fctx: FarmContext,
  sessionId: string,
  raw: HandlingMarkInput,
  meta: MutationMeta,
) {
  const input = HandlingMarkInput.parse(raw);
  const s = await loadSession(tx, fctx, sessionId);
  if (s.status !== "open")
    throw new DomainError("session_closed", "Sessão encerrada; use correção no histórico.");
  const date = dateToCivil(s.date);
  const today = todayInTimezone(fctx.timezone, meta.now);
  const config = s.config as unknown as StoredConfig;

  let item = await tx.handlingSessionItem.findUnique({
    where: { sessionId_animalId: { sessionId, animalId: input.animalId } },
  });
  if (!item) {
    const c = await checkAnimal(tx, fctx, input.animalId, date, today);
    if (c.error) throw new DomainError(c.error.code, c.error.message);
    const last = await tx.handlingSessionItem.aggregate({
      where: { sessionId },
      _max: { position: true },
    });
    item = await tx.handlingSessionItem.create({
      data: {
        sessionId,
        animalId: input.animalId,
        farmId: fctx.farmId,
        position: (last._max.position ?? -1) + 1,
        added: true,
      },
    });
  }

  if (input.status === "done") {
    if (item.status === "done") {
      return {
        entityId: sessionId,
        version: s.version,
        detail: { animalId: input.animalId, status: "done", alreadyDone: true },
      };
    }
    const c = await checkAnimal(tx, fctx, input.animalId, date, today);
    if (c.error) throw new DomainError(c.error.code, c.error.message);
    if (config.products.length) {
      const resolved = await resolveProducts(tx, fctx, config.products, date);
      await applyToAnimal(
        tx,
        fctx,
        input.animalId,
        resolved,
        {
          operationId: sessionId,
          kind: config.healthKind,
          date,
          ...(config.applicator ? { applicator: config.applicator } : {}),
          ...(config.reason ? { reason: config.reason } : {}),
          planItemId: config.planItemId ?? null,
          sessionId,
        },
        meta,
      );
    }
    let weightId: string | null = null;
    if (input.weightKg) {
      weightId = input.weightId ?? randomUUID();
      await recordWeight(
        tx,
        fctx,
        input.animalId,
        {
          id: weightId,
          weightKg: input.weightKg,
          measuredOn: date,
          source: input.weightSource ?? "manual",
          notes: `Sessão: ${s.name}`,
        },
        meta,
      );
    }
    await tx.handlingSessionItem.update({
      where: { sessionId_animalId: { sessionId, animalId: input.animalId } },
      data: {
        status: "done",
        weightId,
        note: input.note ?? null,
        doneAt: meta.now,
        doneById: fctx.userId,
      },
    });
  } else {
    if (item.status === "done") {
      await undoItem(tx, fctx, sessionId, item, "Desfeito na sessão de manejo", meta);
    }
    await tx.handlingSessionItem.update({
      where: { sessionId_animalId: { sessionId, animalId: input.animalId } },
      data: {
        status: input.status,
        weightId: null,
        note: input.note ?? null,
        doneAt: null,
        doneById: null,
      },
    });
  }
  await tx.handlingSession.update({
    where: { id: sessionId },
    data: { version: { increment: 1 } },
  });
  return {
    entityId: sessionId,
    version: s.version + 1,
    detail: { animalId: input.animalId, status: input.status, alreadyDone: false },
  };
}

export async function addSessionException(
  tx: Tx,
  fctx: FarmContext,
  sessionId: string,
  raw: HandlingExceptionInput,
) {
  const input = HandlingExceptionInput.parse(raw);
  await loadSession(tx, fctx, sessionId);
  const existing = await tx.handlingSessionException.findUnique({ where: { id: input.id } });
  if (existing) {
    if (existing.sessionId !== sessionId) throw notFound("Exceção");
    if (input.resolvedAnimalId !== undefined) {
      await tx.handlingSessionException.update({
        where: { id: input.id },
        data: {
          resolvedAnimalId: input.resolvedAnimalId,
          resolvedAt: input.resolvedAnimalId ? new Date() : null,
        },
      });
    }
    return { entityId: sessionId, version: null };
  }
  if (input.resolvedAnimalId) {
    const a = await tx.animal.findFirst({
      where: { id: input.resolvedAnimalId, farmId: fctx.farmId },
    });
    if (!a) throw notFound("Animal");
  }
  await tx.handlingSessionException.create({
    data: {
      id: input.id,
      sessionId,
      farmId: fctx.farmId,
      kind: input.kind,
      value: input.value ?? null,
      note: input.note ?? null,
      resolvedAnimalId: input.resolvedAnimalId ?? null,
      resolvedAt: input.resolvedAnimalId ? new Date() : null,
      createdById: fctx.userId,
    },
  });
  return { entityId: sessionId, version: null };
}

export async function closeSession(
  tx: Tx,
  fctx: FarmContext,
  sessionId: string,
  raw: unknown,
  meta: MutationMeta,
) {
  const input = HandlingCloseInput.parse(raw ?? {});
  const s = await loadSession(tx, fctx, sessionId);
  if (s.status === "closed") {
    return {
      entityId: sessionId,
      version: s.version,
      detail: await getSessionDto(tx, fctx, sessionId),
    };
  }
  const items = await tx.handlingSessionItem.findMany({ where: { sessionId } });
  const exceptions = await tx.handlingSessionException.count({ where: { sessionId } });
  const summary = summarizeSession(items, exceptions);
  const notDone = items.filter((i) => i.status !== "done").map((i) => i.animalId);
  if (notDone.length) {
    await createTask(tx, fctx, {
      type: "handling_pending",
      title: `${notDone.length} animal(is) não manejado(s) em “${s.name}”`,
      description: `Sessão de ${fmt(dateToCivil(s.date))}: ${summary.done} realizado(s), ${summary.skipped} não realizado(s), ${summary.pending} pendente(s).${input.note ? ` ${input.note}` : ""}`,
      dueOn: todayInTimezone(fctx.timezone, meta.now),
      animalIds: notDone,
      sourceType: "handling_session",
      sourceId: sessionId,
      dedupeKey: `handling:${sessionId}`,
    });
  }
  await tx.handlingSession.update({
    where: { id: sessionId },
    data: {
      status: "closed",
      closedAt: meta.now,
      closedById: fctx.userId,
      summary: summary as unknown as Prisma.InputJsonValue,
      version: { increment: 1 },
    },
  });
  await audit(tx, {
    organizationId: fctx.organizationId,
    farmId: fctx.farmId,
    actorUserId: fctx.userId,
    action: "handling_session.close",
    entityType: "handling_session",
    entityId: sessionId,
    data: summary as unknown as Prisma.InputJsonValue,
  });
  return {
    entityId: sessionId,
    version: s.version + 1,
    detail: await getSessionDto(tx, fctx, sessionId),
  };
}

export async function getSessionDto(
  tx: Tx,
  fctx: FarmContext,
  id: string,
): Promise<HandlingSessionDto> {
  const s = await tx.handlingSession.findFirst({
    where: { id, farmId: fctx.farmId },
    include: {
      items: { orderBy: { position: "asc" } },
      exceptions: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!s) throw notFound("Sessão");
  const weightIds = s.items.map((i) => i.weightId).filter((w): w is string => !!w);
  const weights = weightIds.length
    ? await tx.weightMeasurement.findMany({
        where: { id: { in: weightIds } },
        select: { id: true, weightKg: true },
      })
    : [];
  const wmap = new Map(weights.map((w) => [w.id, Number(w.weightKg)]));
  const config = s.config as unknown as StoredConfig;
  return {
    id: s.id,
    name: s.name,
    date: dateToCivil(s.date),
    status: s.status,
    config: {
      weigh: config.weigh,
      healthKind: config.healthKind,
      products: config.products,
      ...(config.applicator ? { applicator: config.applicator } : {}),
      ...(config.reason ? { reason: config.reason } : {}),
      planItemId: config.planItemId ?? null,
    },
    items: s.items.map((i) => ({
      animalId: i.animalId,
      position: i.position,
      status: i.status,
      added: i.added,
      weightKg: i.weightId ? (wmap.get(i.weightId) ?? null) : null,
      note: i.note,
      doneAt: i.doneAt?.toISOString() ?? null,
    })),
    exceptions: s.exceptions.map((e) => ({
      id: e.id,
      kind: e.kind,
      value: e.value,
      note: e.note,
      resolvedAnimalId: e.resolvedAnimalId,
      createdAt: e.createdAt.toISOString(),
    })),
    summary: summarizeSession(s.items, s.exceptions.length),
    createdAt: s.createdAt.toISOString(),
    closedAt: s.closedAt?.toISOString() ?? null,
    version: s.version,
  };
}
