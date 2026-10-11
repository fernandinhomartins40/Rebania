import { parseCapacityLimits } from "@rebania/domain";
import type { Prisma } from "@rebania/db";
import { ensureImplementationInvoice, refreshOrgAccess } from "@rebania/saas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../lib/audit.ts";
import type { AppContext } from "../../lib/context.ts";
import { civilToDate, dateToCivil } from "../../lib/dates.ts";
import { HttpError, notFound } from "../../lib/errors.ts";
import { slugify } from "../../lib/provision.ts";
import { requireStaff } from "../../lib/staff.ts";
import { cents, civil, limitsSchema, money, num } from "./shared.ts";

const PlanBody = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1000).nullable().optional(),
  implementation: money.nullable().optional(),
  monthly: money.nullable().optional(),
  limits: limitsSchema.default({}),
});

const json = (v: unknown) => v as Prisma.InputJsonValue;

export function contractRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;

  // ---- Catálogo de planos (P-01: só valores aprovados; nasce vazio) ----
  app.get("/v1/platform/plans", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const rows = await db.plan.findMany({ orderBy: [{ code: "asc" }, { version: "desc" }] });
    const counts = await db.contract.groupBy({
      by: ["planId"],
      where: { status: { in: ["active", "suspended"] }, planId: { not: null } },
      _count: { _all: true },
    });
    const latest = new Map<string, (typeof rows)[number]>();
    for (const r of rows) if (!latest.has(r.code)) latest.set(r.code, r);
    return {
      items: [...latest.values()].map((p) => ({
        id: p.id,
        code: p.code,
        version: p.version,
        name: p.name,
        description: p.description,
        implementationCents: num(p.implementationCents),
        monthlyCents: num(p.monthlyCents),
        limits: parseCapacityLimits(p.limits),
        archived: p.archivedAt !== null,
        versions: rows.filter((r) => r.code === p.code).length,
        activeContracts: rows
          .filter((r) => r.code === p.code)
          .reduce((a, r) => a + (counts.find((c) => c.planId === r.id)?._count._all ?? 0), 0),
      })),
    };
  });

  app.post("/v1/platform/plans", async (req, reply) => {
    const staff = await requireStaff(ctx, req, "contracts.manage");
    const body = PlanBody.parse(req.body);
    const code = slugify(body.name) || "plano";
    if (await db.plan.findFirst({ where: { code } }))
      throw new HttpError(
        409,
        "plan_exists",
        "Já existe um plano com esse nome. Crie uma nova versão.",
      );
    const p = await db.plan.create({
      data: {
        code,
        version: 1,
        name: body.name,
        description: body.description ?? null,
        implementationCents: body.implementation ? cents(body.implementation) : null,
        monthlyCents: body.monthly ? cents(body.monthly) : null,
        limits: json(body.limits),
        createdById: staff.userId,
      },
    });
    await audit(db, {
      actorUserId: staff.userId,
      action: "plan.create",
      entityType: "plan",
      entityId: p.id,
      data: { code, version: 1 },
    });
    return reply.status(201).send({ id: p.id, code });
  });

  /** Nova versão: contratos antigos continuam apontando para a versão em que nasceram. */
  app.post<{ Params: { code: string } }>(
    "/v1/platform/plans/:code/versions",
    async (req, reply) => {
      const staff = await requireStaff(ctx, req, "contracts.manage");
      const body = PlanBody.parse(req.body);
      const last = await db.plan.findFirst({
        where: { code: req.params.code },
        orderBy: { version: "desc" },
      });
      if (!last) throw notFound("Plano");
      const p = await db.$transaction(async (tx) => {
        await tx.plan.updateMany({
          where: { code: last.code, archivedAt: null },
          data: { archivedAt: ctx.now() },
        });
        return tx.plan.create({
          data: {
            code: last.code,
            version: last.version + 1,
            name: body.name,
            description: body.description ?? null,
            implementationCents: body.implementation ? cents(body.implementation) : null,
            monthlyCents: body.monthly ? cents(body.monthly) : null,
            limits: json(body.limits),
            createdById: staff.userId,
          },
        });
      });
      await audit(db, {
        actorUserId: staff.userId,
        action: "plan.version",
        entityType: "plan",
        entityId: p.id,
        data: { code: p.code, version: p.version },
      });
      return reply.status(201).send({ id: p.id, version: p.version });
    },
  );

  app.post<{ Params: { code: string } }>("/v1/platform/plans/:code/archive", async (req) => {
    const staff = await requireStaff(ctx, req, "contracts.manage");
    const r = await db.plan.updateMany({
      where: { code: req.params.code, archivedAt: null },
      data: { archivedAt: ctx.now() },
    });
    if (!r.count) throw notFound("Plano");
    await audit(db, {
      actorUserId: staff.userId,
      action: "plan.archive",
      entityType: "plan",
      entityId: req.params.code,
    });
    return { ok: true };
  });

  // ---- Contratos ----
  app.post<{ Params: { id: string } }>(
    "/v1/platform/customers/:id/contracts",
    async (req, reply) => {
      const staff = await requireStaff(ctx, req, "contracts.manage");
      const body = z
        .object({
          planId: z.uuid().optional(),
          plan: z.string().trim().min(2).max(120).optional(),
          implementation: money.nullable().optional(),
          monthly: money.nullable().optional(),
          limits: limitsSchema.optional(),
          billingDay: z.number().int().min(1).max(28).nullable().optional(),
          startsOn: civil,
          endsOn: civil.nullable().optional(),
          status: z.enum(["draft", "active"]).default("draft"),
          notes: z.string().trim().max(1000).optional(),
        })
        .parse(req.body);
      const org = await db.organization.findUnique({ where: { id: req.params.id } });
      if (!org) throw notFound("Cliente");
      const catalog = body.planId
        ? await db.plan.findFirst({ where: { id: body.planId, archivedAt: null } })
        : null;
      if (body.planId && !catalog) throw notFound("Plano");
      const planName = body.plan ?? catalog?.name;
      if (!planName)
        throw new HttpError(422, "plan_required", "Escolha um plano do catálogo ou dê um nome.");
      if (body.endsOn && body.endsOn < body.startsOn)
        throw new HttpError(422, "invalid_period", "O fim do contrato é anterior ao início.");
      const implementationCents =
        body.implementation !== undefined
          ? body.implementation
            ? cents(body.implementation)
            : null
          : (catalog?.implementationCents ?? null);
      const monthlyCents =
        body.monthly !== undefined
          ? body.monthly
            ? cents(body.monthly)
            : null
          : (catalog?.monthlyCents ?? null);
      const limits = body.limits ?? (catalog ? parseCapacityLimits(catalog.limits) : {});
      const c = await db.$transaction(async (tx) => {
        if (body.status === "active")
          await tx.contract.updateMany({
            where: { organizationId: org.id, status: { in: ["active", "suspended"] } },
            data: { status: "ended" },
          });
        const c = await tx.contract.create({
          data: {
            organizationId: org.id,
            planId: catalog?.id ?? null,
            plan: planName,
            status: body.status,
            implementationCents,
            monthlyCents,
            limits: json(limits),
            billingDay: body.billingDay ?? Math.min(28, Number(body.startsOn.slice(8, 10))),
            startsOn: civilToDate(body.startsOn),
            endsOn: body.endsOn ? civilToDate(body.endsOn) : null,
            notes: body.notes ?? null,
            createdById: staff.userId,
          },
        });
        await audit(tx, {
          organizationId: org.id,
          actorUserId: staff.userId,
          action: "contract.create",
          entityType: "contract",
          entityId: c.id,
          data: { plan: planName, status: body.status, planId: catalog?.id ?? null },
        });
        if (body.status === "active") {
          await ensureImplementationInvoice(tx, c.id, ctx.now(), config.webBaseUrl);
          await refreshOrgAccess(tx, org.id, ctx.now(), config.webBaseUrl, staff.userId);
        }
        return c;
      });
      return reply.status(201).send({ id: c.id });
    },
  );

  app.patch<{ Params: { id: string } }>("/v1/platform/contracts/:id", async (req) => {
    const staff = await requireStaff(ctx, req, "contracts.manage");
    const body = z
      .object({
        billingDay: z.number().int().min(1).max(28).nullable().optional(),
        endsOn: civil.nullable().optional(),
        notes: z.string().trim().max(1000).nullable().optional(),
      })
      .parse(req.body);
    const c = await db.contract.findUnique({ where: { id: req.params.id } });
    if (!c) throw notFound("Contrato");
    if (body.endsOn && body.endsOn < dateToCivil(c.startsOn))
      throw new HttpError(422, "invalid_period", "O fim do contrato é anterior ao início.");
    await db.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: c.id },
        data: {
          ...(body.billingDay !== undefined ? { billingDay: body.billingDay } : {}),
          ...(body.endsOn !== undefined
            ? { endsOn: body.endsOn ? civilToDate(body.endsOn) : null }
            : {}),
          ...(body.notes !== undefined ? { notes: body.notes } : {}),
        },
      });
      await audit(tx, {
        organizationId: c.organizationId,
        actorUserId: staff.userId,
        action: "contract.update",
        entityType: "contract",
        entityId: c.id,
        data: body,
      });
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/v1/platform/contracts/:id/status", async (req) => {
    const staff = await requireStaff(ctx, req, "contracts.manage");
    const { status, reason } = z
      .object({
        status: z.enum(["active", "suspended", "ended"]),
        reason: z.string().trim().max(300).optional(),
      })
      .parse(req.body);
    const c = await db.contract.findUnique({ where: { id: req.params.id } });
    if (!c) throw notFound("Contrato");
    if (c.status === "ended")
      throw new HttpError(409, "contract_ended", "Contrato encerrado não volta; crie outro.");
    const mode = await db.$transaction(async (tx) => {
      if (status === "active")
        await tx.contract.updateMany({
          where: {
            organizationId: c.organizationId,
            status: { in: ["active", "suspended"] },
            id: { not: c.id },
          },
          data: { status: "ended" },
        });
      await tx.contract.update({ where: { id: c.id }, data: { status } });
      await audit(tx, {
        organizationId: c.organizationId,
        actorUserId: staff.userId,
        action: "contract.status",
        entityType: "contract",
        entityId: c.id,
        data: { from: c.status, to: status, reason: reason ?? null },
      });
      if (status === "active")
        await ensureImplementationInvoice(tx, c.id, ctx.now(), config.webBaseUrl);
      return refreshOrgAccess(tx, c.organizationId, ctx.now(), config.webBaseUrl, staff.userId);
    });
    return { ok: true, accessMode: mode };
  });

  /** Aditivo: nova mensalidade e/ou capacidade a partir de uma data. O contrato original fica. */
  app.post<{ Params: { id: string } }>(
    "/v1/platform/contracts/:id/amendments",
    async (req, reply) => {
      const staff = await requireStaff(ctx, req, "contracts.manage");
      const body = z
        .object({
          description: z.string().trim().min(3).max(300),
          monthly: money.nullable().optional(),
          limits: limitsSchema.nullable().optional(),
          effectiveOn: civil,
        })
        .refine((b) => b.monthly != null || b.limits != null, {
          message: "Informe a nova mensalidade e/ou a nova capacidade.",
        })
        .parse(req.body);
      const c = await db.contract.findUnique({ where: { id: req.params.id } });
      if (!c) throw notFound("Contrato");
      if (c.status === "ended") throw new HttpError(409, "contract_ended", "Contrato encerrado.");
      const a = await db.$transaction(async (tx) => {
        const a = await tx.contractAmendment.create({
          data: {
            organizationId: c.organizationId,
            contractId: c.id,
            description: body.description,
            monthlyCents: body.monthly ? cents(body.monthly) : null,
            limits: body.limits ? json(body.limits) : undefined,
            effectiveOn: civilToDate(body.effectiveOn),
            createdById: staff.userId,
          },
        });
        await audit(tx, {
          organizationId: c.organizationId,
          actorUserId: staff.userId,
          action: "contract.amendment",
          entityType: "contract",
          entityId: c.id,
          data: { amendmentId: a.id, effectiveOn: body.effectiveOn, monthly: body.monthly ?? null },
        });
        return a;
      });
      return reply.status(201).send({ id: a.id });
    },
  );
}
