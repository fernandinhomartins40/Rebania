import {
  ExamInput,
  ExamResultInput,
  HandlingCloseInput,
  HandlingExceptionInput,
  HandlingMarkInput,
  HandlingOpenInput,
  HealthApplyInput,
  LocationInput,
  PlanItemInput,
  ProductInput,
  StockMovementInput,
  TreatmentInput,
  UpdateProductInput,
  type CalendarEntryDto,
  type ExamDto,
  type HealthApplicationDto,
  type PlanItemDto,
  type StockMovementDto,
  type TreatmentDto,
  type WithdrawalDto,
} from "@rebania/contracts";
import {
  addDays,
  computeDue,
  roleHas,
  todayInTimezone,
  withdrawalStatus,
  type Category,
  type ExamKind,
  type Permission,
} from "@rebania/domain";
import type { Db, Prisma, Tx } from "@rebania/db";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../lib/context.ts";
import { stableHash } from "../../lib/crypto.ts";
import { civilToDate, dateToCivil } from "../../lib/dates.ts";
import { forbidden, notFound } from "../../lib/errors.ts";
import { runIdempotent } from "../../lib/idempotency.ts";
import { idempotencyKey, replyReceipt } from "../../lib/ops.ts";
import { requireFarm, type FarmContext } from "../../lib/tenant.ts";
import { requireAuth } from "../../plugins/auth.ts";
import { primaryTag } from "../animals/service.ts";
import {
  addSessionException,
  applyHealth,
  closeSession,
  createProduct,
  getSessionDto,
  listProducts,
  markItem,
  openSession,
  recordExamResult,
  recordExams,
  recordMovement,
  startTreatment,
  updateProduct,
  updateTreatment,
  voidApplication,
} from "./service.ts";

type FarmParams = { Params: { farmId: string } };
type IdParams = { Params: { farmId: string; id: string } };

/** Brinco principal de cada animal (para listas). */
async function tagsOf(db: Db | Tx, ids: string[]) {
  const rows = await db.animalIdentifier.findMany({
    where: { animalId: { in: ids }, status: "active" },
  });
  const by = new Map<string, typeof rows>();
  for (const r of rows) by.set(r.animalId, [...(by.get(r.animalId) ?? []), r]);
  const map = new Map<string, string>();
  for (const [id, list] of by) {
    const t = primaryTag(list);
    if (t) map.set(id, t);
  }
  return map;
}

type AppRow = Prisma.HealthApplicationGetPayload<{ include: { batch: true } }>;
function appDto(a: AppRow): HealthApplicationDto {
  return {
    id: a.id,
    animalId: a.animalId,
    kind: a.kind,
    productId: a.productId,
    productName: a.productName,
    batchCode: a.batch?.code ?? null,
    dose: a.dose == null ? null : Number(a.dose),
    unit: a.unit,
    route: a.route,
    appliedOn: dateToCivil(a.appliedOn),
    applicator: a.applicator,
    reason: a.reason,
    withdrawalMeatUntil: dateToCivil(a.withdrawalMeatUntil),
    withdrawalMilkUntil: dateToCivil(a.withdrawalMilkUntil),
    sessionId: a.sessionId,
    treatmentId: a.treatmentId,
    voided: a.voidedAt !== null,
  };
}

export function healthRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const farm = (req: FastifyRequest, perm: Permission) =>
    requireFarm(db, requireAuth(req).userId, (req.params as { farmId: string }).farmId, perm);
  /** Exige qualquer uma das permissões (ex.: cadastro de produto por gerente OU veterinário). */
  const farmAny = async (req: FastifyRequest, perms: Permission[]) => {
    const fctx = await farm(req, "animals.read");
    if (!perms.some((p) => roleHas(fctx.role, p))) throw forbidden();
    return fctx;
  };
  const meta = (mutationId?: string) => ({ now: ctx.now(), ...(mutationId ? { mutationId } : {}) });

  /** POST idempotente por Idempotency-Key, mesmo motor do sync offline. */
  const idem = async (
    req: FastifyRequest,
    fctx: FarmContext,
    type: string,
    body: unknown,
    exec: (
      tx: Tx,
      mutationId: string,
    ) => Promise<{ entityId: string; version: number | null; detail?: unknown }>,
  ) => {
    const mutationId = idempotencyKey(req);
    return runIdempotent({
      db,
      fctx,
      mutationId,
      type,
      requestHash: stableHash({ type, body }),
      execute: (tx) => exec(tx, mutationId),
    });
  };

  // ---- Produtos e estoque (T37) ----------------------------------------------------------

  app.get<FarmParams>("/v1/farms/:farmId/products", async (req) => {
    const fctx = await farm(req, "animals.read");
    const q = z.object({ archived: z.enum(["0", "1"]).optional() }).parse(req.query);
    return { items: await listProducts(db, fctx, { includeArchived: q.archived === "1" }) };
  });

  app.post<FarmParams>("/v1/farms/:farmId/products", async (req, reply) => {
    const fctx = await farmAny(req, ["stock.manage", "health.manage"]);
    const input = ProductInput.parse(req.body);
    const p = await db.$transaction((tx) => createProduct(tx, fctx, input));
    const [dto] = await listProducts(db, fctx, { ids: [p.id], includeArchived: true });
    return reply.status(201).send(dto);
  });

  app.patch<IdParams>("/v1/farms/:farmId/products/:id", async (req) => {
    const fctx = await farmAny(req, ["stock.manage", "health.manage"]);
    const input = UpdateProductInput.parse(req.body);
    await db.$transaction((tx) => updateProduct(tx, fctx, req.params.id, input, ctx.now()));
    const [dto] = await listProducts(db, fctx, { ids: [req.params.id], includeArchived: true });
    return dto;
  });

  app.get<FarmParams>("/v1/farms/:farmId/stock/locations", async (req) => {
    const fctx = await farm(req, "animals.read");
    const items = await db.stockLocation.findMany({
      where: { farmId: fctx.farmId, archivedAt: null },
      orderBy: { name: "asc" },
    });
    return { items: items.map((l) => ({ id: l.id, name: l.name })) };
  });

  app.post<FarmParams>("/v1/farms/:farmId/stock/locations", async (req, reply) => {
    const fctx = await farm(req, "stock.manage");
    const input = LocationInput.parse(req.body);
    const l = await db.stockLocation.create({
      data: { organizationId: fctx.organizationId, farmId: fctx.farmId, name: input.name },
    });
    return reply.status(201).send({ id: l.id, name: l.name });
  });

  app.get<FarmParams>("/v1/farms/:farmId/stock/movements", async (req) => {
    const fctx = await farm(req, "animals.read");
    const q = z
      .object({
        productId: z.uuid().optional(),
        review: z.enum(["1"]).optional(),
        limit: z.coerce.number().int().min(1).max(500).default(100),
      })
      .parse(req.query);
    const rows = await db.stockMovement.findMany({
      where: {
        farmId: fctx.farmId,
        ...(q.productId ? { productId: q.productId } : {}),
        ...(q.review ? { needsReview: true, reviewedAt: null, voidedAt: null } : {}),
      },
      include: { product: true, batch: true, location: true },
      orderBy: [{ occurredOn: "desc" }, { createdAt: "desc" }],
      take: q.limit,
    });
    const actors = await db.user.findMany({
      where: {
        id: { in: [...new Set(rows.map((r) => r.createdById).filter(Boolean))] as string[] },
      },
      select: { id: true, name: true },
    });
    const names = new Map(actors.map((a) => [a.id, a.name]));
    const items: StockMovementDto[] = rows.map((m) => ({
      id: m.id,
      productId: m.productId,
      productName: m.product.name,
      unit: m.product.unit,
      kind: m.kind,
      quantity: Number(m.quantity),
      batchCode: m.batch?.code ?? null,
      locationName: m.location?.name ?? null,
      unitCost: m.unitCost == null ? null : Number(m.unitCost),
      occurredOn: dateToCivil(m.occurredOn),
      sourceType: m.sourceType,
      note: m.note,
      needsReview: m.needsReview && !m.reviewedAt,
      voided: m.voidedAt !== null,
      actorName: m.createdById ? (names.get(m.createdById) ?? null) : null,
      createdAt: m.createdAt.toISOString(),
    }));
    return { items };
  });

  app.post<FarmParams>("/v1/farms/:farmId/stock/movements", async (req, reply) => {
    const fctx = await farm(req, "stock.manage");
    const input = StockMovementInput.parse(req.body);
    const receipt = await idem(req, fctx, "stock.movement", input, (tx, m) =>
      recordMovement(tx, fctx, input, meta(m)),
    );
    return replyReceipt(reply, receipt);
  });

  /** Conferência administrativa de consumo que deixou saldo negativo. */
  app.post<IdParams>("/v1/farms/:farmId/stock/movements/:id/review", async (req) => {
    const fctx = await farm(req, "stock.manage");
    const body = z.object({ note: z.string().trim().max(300).optional() }).parse(req.body ?? {});
    const m = await db.stockMovement.findFirst({
      where: { id: req.params.id, farmId: fctx.farmId },
    });
    if (!m) throw notFound("Movimento");
    await db.stockMovement.update({
      where: { id: m.id },
      data: {
        reviewedAt: ctx.now(),
        reviewedById: fctx.userId,
        note: body.note ? [m.note, `Conferido: ${body.note}`].filter(Boolean).join(" · ") : m.note,
      },
    });
    return { ok: true };
  });

  // ---- Aplicações (T24) ----------------------------------------------------------------------

  app.post<FarmParams>("/v1/farms/:farmId/events/health", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const input = HealthApplyInput.parse(req.body);
    const receipt = await idem(req, fctx, "health.apply", input, (tx, m) =>
      applyHealth(tx, fctx, { ...input, operationId: input.operationId ?? m }, meta(m)),
    );
    return replyReceipt(reply, receipt);
  });

  app.get<FarmParams>("/v1/farms/:farmId/health/applications", async (req) => {
    const fctx = await farm(req, "animals.read");
    const q = z
      .object({
        animalId: z.uuid().optional(),
        operationId: z.uuid().optional(),
        from: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(200),
      })
      .parse(req.query);
    const rows = await db.healthApplication.findMany({
      where: {
        farmId: fctx.farmId,
        ...(q.animalId ? { animalId: q.animalId } : {}),
        ...(q.operationId ? { operationId: q.operationId } : {}),
        ...(q.from ? { appliedOn: { gte: civilToDate(q.from) } } : {}),
      },
      include: { batch: true },
      orderBy: [{ appliedOn: "desc" }, { createdAt: "desc" }],
      take: q.limit,
    });
    return { items: rows.map(appDto) };
  });

  app.post<IdParams>("/v1/farms/:farmId/health/applications/:id/void", async (req) => {
    const fctx = await farm(req, "events.write");
    const body = z.object({ reason: z.string().trim().min(3).max(300) }).parse(req.body);
    await db.$transaction((tx) => voidApplication(tx, fctx, req.params.id, body.reason, meta()));
    return { ok: true };
  });

  // ---- Carência (T28) ---------------------------------------------------------------------------

  app.get<FarmParams>("/v1/farms/:farmId/withdrawals", async (req) => {
    const fctx = await farm(req, "animals.read");
    const today = todayInTimezone(fctx.timezone, ctx.now());
    const animals = await db.animal.findMany({
      where: {
        farmId: fctx.farmId,
        status: "active",
        OR: [
          { withdrawalMeatUntil: { gte: civilToDate(today) } },
          { withdrawalMilkUntil: { gte: civilToDate(today) } },
        ],
      },
      orderBy: { withdrawalMeatUntil: "desc" },
    });
    return {
      items: await withdrawalDtos(
        db,
        animals.map((a) => a.id),
        today,
      ),
    };
  });

  async function withdrawalDtos(d: Db, ids: string[], today: string): Promise<WithdrawalDto[]> {
    if (!ids.length) return [];
    const [apps, tags, animals] = await Promise.all([
      d.healthApplication.findMany({
        where: {
          animalId: { in: ids },
          voidedAt: null,
          OR: [
            { withdrawalMeatUntil: { gte: civilToDate(today) } },
            { withdrawalMilkUntil: { gte: civilToDate(today) } },
          ],
        },
        include: { product: { select: { withdrawalSource: true } } },
        orderBy: { appliedOn: "desc" },
      }),
      tagsOf(d, ids),
      d.animal.findMany({ where: { id: { in: ids } } }),
    ]);
    return animals.map((a) => ({
      animalId: a.id,
      animalTag: tags.get(a.id) ?? null,
      meatUntil: dateToCivil(a.withdrawalMeatUntil),
      milkUntil: dateToCivil(a.withdrawalMilkUntil),
      sources: apps
        .filter((x) => x.animalId === a.id)
        .map((x) => ({
          applicationId: x.id,
          productName: x.productName,
          appliedOn: dateToCivil(x.appliedOn),
          meatUntil: dateToCivil(x.withdrawalMeatUntil),
          milkUntil: dateToCivil(x.withdrawalMilkUntil),
          source: x.product?.withdrawalSource ?? null,
        })),
    }));
  }

  /** Painel sanitário do animal: aplicações, tratamentos, exames e carência. */
  app.get<IdParams>("/v1/farms/:farmId/animals/:id/health", async (req) => {
    const fctx = await farm(req, "animals.read");
    const a = await db.animal.findFirst({ where: { id: req.params.id, farmId: fctx.farmId } });
    if (!a) throw notFound("Animal");
    const today = todayInTimezone(fctx.timezone, ctx.now());
    const [applications, treatments, exams] = await Promise.all([
      db.healthApplication.findMany({
        where: { animalId: a.id },
        include: { batch: true },
        orderBy: [{ appliedOn: "desc" }, { createdAt: "desc" }],
      }),
      db.treatment.findMany({ where: { animalId: a.id }, orderBy: { startedOn: "desc" } }),
      db.exam.findMany({
        where: { animalId: a.id, voidedAt: null },
        orderBy: { collectedOn: "desc" },
      }),
    ]);
    const meat = withdrawalStatus(dateToCivil(a.withdrawalMeatUntil), today);
    const milk = withdrawalStatus(dateToCivil(a.withdrawalMilkUntil), today);
    return {
      withdrawal: { meat, milk },
      applications: applications.map(appDto),
      treatments: treatments.map((t) => ({
        id: t.id,
        condition: t.condition,
        startedOn: dateToCivil(t.startedOn),
        status: t.status,
        outcome: t.outcome,
        endedOn: dateToCivil(t.endedOn),
      })),
      exams: exams.map((e) => ({
        id: e.id,
        kind: e.kind,
        collectedOn: dateToCivil(e.collectedOn),
        status: e.status,
        result: e.result,
        resultOn: dateToCivil(e.resultOn),
      })),
    };
  });

  // ---- Tratamentos (T25) ---------------------------------------------------------------------

  app.get<FarmParams>("/v1/farms/:farmId/treatments", async (req) => {
    const fctx = await farm(req, "animals.read");
    const q = z
      .object({ status: z.enum(["open", "resolved", "failed"]).optional() })
      .parse(req.query);
    const rows = await db.treatment.findMany({
      where: { farmId: fctx.farmId, ...(q.status ? { status: q.status } : {}) },
      include: { applications: { include: { batch: true }, orderBy: { appliedOn: "asc" } } },
      orderBy: { startedOn: "desc" },
      take: 300,
    });
    const tags = await tagsOf(
      db,
      rows.map((r) => r.animalId),
    );
    const items: TreatmentDto[] = rows.map((t) => ({
      id: t.id,
      animalId: t.animalId,
      animalTag: tags.get(t.animalId) ?? null,
      startedOn: dateToCivil(t.startedOn),
      condition: t.condition,
      plan: t.plan,
      responsible: t.responsible,
      status: t.status,
      outcome: t.outcome,
      endedOn: dateToCivil(t.endedOn),
      applications: t.applications.map(appDto),
    }));
    return { items };
  });

  app.post<FarmParams>("/v1/farms/:farmId/treatments", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const input = TreatmentInput.parse(req.body);
    const receipt = await idem(req, fctx, "treatment.start", input, (tx, m) =>
      startTreatment(tx, fctx, { ...input, id: input.id ?? m }, meta(m)),
    );
    return replyReceipt(reply, receipt);
  });

  app.patch<IdParams>("/v1/farms/:farmId/treatments/:id", async (req) => {
    const fctx = await farm(req, "events.write");
    await db.$transaction((tx) => updateTreatment(tx, fctx, req.params.id, req.body, meta()));
    return { ok: true };
  });

  // ---- Exames (T26) ----------------------------------------------------------------------------

  app.get<FarmParams>("/v1/farms/:farmId/exams", async (req) => {
    const fctx = await farm(req, "animals.read");
    const q = z.object({ status: z.enum(["pending", "done"]).optional() }).parse(req.query);
    const rows = await db.exam.findMany({
      where: { farmId: fctx.farmId, voidedAt: null, ...(q.status ? { status: q.status } : {}) },
      orderBy: { collectedOn: "desc" },
      take: 500,
    });
    const tags = await tagsOf(
      db,
      rows.map((r) => r.animalId),
    );
    const items: ExamDto[] = rows.map((e) => ({
      id: e.id,
      animalId: e.animalId,
      animalTag: tags.get(e.animalId) ?? null,
      kind: e.kind as ExamKind,
      collectedOn: dateToCivil(e.collectedOn),
      responsible: e.responsible,
      status: e.status,
      result: e.result,
      resultOn: dateToCivil(e.resultOn),
      notes: e.notes,
    }));
    return { items };
  });

  app.post<FarmParams>("/v1/farms/:farmId/exams", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const input = ExamInput.parse(req.body);
    const receipt = await idem(req, fctx, "exam.record", input, (tx, m) =>
      recordExams(tx, fctx, { ...input, operationId: input.operationId ?? m }, meta(m)),
    );
    return replyReceipt(reply, receipt);
  });

  app.post<IdParams>("/v1/farms/:farmId/exams/:id/result", async (req) => {
    const fctx = await farm(req, "events.write");
    const input = ExamResultInput.parse(req.body);
    await db.$transaction((tx) => recordExamResult(tx, fctx, req.params.id, input, meta()));
    return { ok: true };
  });

  // ---- Calendário sanitário (T23) ------------------------------------------------------------------

  app.get<FarmParams>("/v1/farms/:farmId/health/plan", async (req) => {
    const fctx = await farm(req, "animals.read");
    const rows = await db.healthPlanItem.findMany({
      where: { farmId: fctx.farmId, archivedAt: null },
      include: { product: { select: { name: true } } },
      orderBy: { name: "asc" },
    });
    const items: PlanItemDto[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      productId: r.productId,
      productName: r.product?.name ?? null,
      categories: r.categories,
      everyDays: r.everyDays,
      firstAtAgeDays: r.firstAtAgeDays,
      source: r.source,
    }));
    return { items };
  });

  app.post<FarmParams>("/v1/farms/:farmId/health/plan", async (req, reply) => {
    const fctx = await farm(req, "health.manage");
    const input = PlanItemInput.parse(req.body);
    if (input.productId) {
      const p = await db.product.findFirst({
        where: { id: input.productId, farmId: fctx.farmId },
      });
      if (!p) throw notFound("Produto");
    }
    const r = await db.healthPlanItem.create({
      data: {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        name: input.name,
        kind: input.kind,
        productId: input.productId ?? null,
        categories: input.categories,
        everyDays: input.everyDays ?? null,
        firstAtAgeDays: input.firstAtAgeDays ?? null,
        source: input.source,
        createdById: fctx.userId,
      },
    });
    return reply.status(201).send({ id: r.id });
  });

  app.delete<IdParams>("/v1/farms/:farmId/health/plan/:id", async (req, reply) => {
    const fctx = await farm(req, "health.manage");
    const r = await db.healthPlanItem.updateMany({
      where: { id: req.params.id, farmId: fctx.farmId, archivedAt: null },
      data: { archivedAt: ctx.now() },
    });
    if (!r.count) throw notFound("Item do calendário");
    return reply.status(204).send();
  });

  /**
   * Calendário: para cada item do plano, agrupa os animais por situação e data.
   * Considera aplicações do item OU do produto vinculado (aplicações avulsas contam).
   */
  app.get<FarmParams>("/v1/farms/:farmId/health/calendar", async (req) => {
    const fctx = await farm(req, "animals.read");
    const q = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(60) })
      .parse(req.query);
    const today = todayInTimezone(fctx.timezone, ctx.now());
    const horizon = addDays(today, q.days);
    const plan = await db.healthPlanItem.findMany({
      where: { farmId: fctx.farmId, archivedAt: null },
    });
    const animals = await db.animal.findMany({
      where: { farmId: fctx.farmId, status: "active" },
      select: { id: true, category: true, birthDate: true },
    });
    const entries: CalendarEntryDto[] = [];
    for (const item of plan) {
      const targets = animals.filter((a) => item.categories.includes(a.category));
      if (!targets.length) continue;
      const last = await db.healthApplication.groupBy({
        by: ["animalId"],
        where: {
          farmId: fctx.farmId,
          voidedAt: null,
          animalId: { in: targets.map((t) => t.id) },
          OR: [{ planItemId: item.id }, ...(item.productId ? [{ productId: item.productId }] : [])],
        },
        _max: { appliedOn: true },
      });
      const lastBy = new Map(last.map((l) => [l.animalId, dateToCivil(l._max.appliedOn)]));
      const groups = new Map<string, CalendarEntryDto>();
      for (const a of targets) {
        const due = computeDue(
          {
            categories: item.categories as Category[],
            everyDays: item.everyDays,
            firstAtAgeDays: item.firstAtAgeDays,
          },
          { category: a.category, birthDate: dateToCivil(a.birthDate) },
          lastBy.get(a.id) ?? null,
          today,
        );
        if (due.status === "done" || due.status === "not_applicable" || !due.dueOn) continue;
        if (due.dueOn > horizon) continue;
        // Atrasados ficam agrupados em uma única linha por item.
        const key = due.status === "overdue" ? "overdue" : due.dueOn;
        const g = groups.get(key) ?? {
          planItemId: item.id,
          planItemName: item.name,
          kind: item.kind,
          status: due.status,
          dueOn: due.dueOn,
          animalIds: [],
          reason: due.status === "overdue" ? "Vencido ou sem registro de aplicação." : due.reason,
        };
        if (due.dueOn < g.dueOn) g.dueOn = due.dueOn;
        g.animalIds.push(a.id);
        groups.set(key, g);
      }
      entries.push(...groups.values());
    }
    entries.sort((a, b) =>
      a.status === "overdue" && b.status !== "overdue"
        ? -1
        : b.status === "overdue" && a.status !== "overdue"
          ? 1
          : a.dueOn.localeCompare(b.dueOn),
    );
    return { items: entries, today, horizon };
  });

  // ---- Modo Curral (T27/T28) ----------------------------------------------------------------------

  app.get<FarmParams>("/v1/farms/:farmId/handling-sessions", async (req) => {
    const fctx = await farm(req, "animals.read");
    const q = z.object({ status: z.enum(["open", "closed"]).optional() }).parse(req.query);
    const rows = await db.handlingSession.findMany({
      where: { farmId: fctx.farmId, ...(q.status ? { status: q.status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true },
    });
    return { items: await Promise.all(rows.map((r) => getSessionDto(db, fctx, r.id))) };
  });

  app.get<IdParams>("/v1/farms/:farmId/handling-sessions/:id", async (req) => {
    const fctx = await farm(req, "animals.read");
    return getSessionDto(db, fctx, req.params.id);
  });

  app.post<FarmParams>("/v1/farms/:farmId/handling-sessions", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const body = HandlingOpenInput.and(z.object({ id: z.uuid().optional() })).parse(req.body);
    const receipt = await idem(req, fctx, "handling.open", body, (tx, m) =>
      openSession(tx, fctx, body.id ?? m, body, meta(m)),
    );
    return replyReceipt(reply, receipt);
  });

  app.post<IdParams>("/v1/farms/:farmId/handling-sessions/:id/marks", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const input = HandlingMarkInput.parse(req.body);
    const receipt = await idem(req, fctx, "handling.mark", { id: req.params.id, input }, (tx, m) =>
      markItem(tx, fctx, req.params.id, input, meta(m)),
    );
    return replyReceipt(reply, receipt);
  });

  app.post<IdParams>("/v1/farms/:farmId/handling-sessions/:id/exceptions", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const input = HandlingExceptionInput.parse(req.body);
    const receipt = await idem(
      req,
      fctx,
      "handling.exception",
      { id: req.params.id, input },
      (tx) => addSessionException(tx, fctx, req.params.id, input),
    );
    return replyReceipt(reply, receipt);
  });

  app.post<IdParams>("/v1/farms/:farmId/handling-sessions/:id/close", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const input = HandlingCloseInput.parse(req.body ?? {});
    const receipt = await idem(req, fctx, "handling.close", { id: req.params.id, input }, (tx, m) =>
      closeSession(tx, fctx, req.params.id, input, meta(m)),
    );
    return replyReceipt(reply, receipt);
  });
}
