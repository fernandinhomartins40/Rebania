import type { Db } from "@rebania/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../lib/audit.ts";
import type { AppContext } from "../../lib/context.ts";
import { civilToDate, dateToCivil } from "../../lib/dates.ts";
import { HttpError, notFound } from "../../lib/errors.ts";
import { requireStaff } from "../../lib/staff.ts";
import { civil, staffNames, today } from "./shared.ts";

const StepsSchema = z
  .array(
    z.object({
      title: z.string().trim().min(2).max(160),
      description: z.string().trim().max(1000).optional(),
    }),
  )
  .min(1)
  .max(60);

/** Sinais medidos no próprio app: o checklist mostra o que já aconteceu de fato. */
export async function onboardingSignals(db: Db, organizationId: string) {
  const [owner, members, animals, imports, weights, events] = await Promise.all([
    db.membership.count({ where: { organizationId, role: "owner", revokedAt: null } }),
    db.membership.count({ where: { organizationId, revokedAt: null } }),
    db.animal.count({ where: { organizationId } }),
    db.importBatch.count({ where: { organizationId } }),
    db.weightMeasurement.count({ where: { organizationId } }),
    db.animalEvent.count({ where: { organizationId } }),
  ]);
  return [
    { key: "owner_accepted", label: "Proprietário aceitou o convite", done: owner > 0 },
    { key: "team_invited", label: "Equipe da fazenda cadastrada", done: members > 1 },
    { key: "animals", label: "Primeiros animais no sistema", done: animals > 0 },
    { key: "import", label: "Importação de planilha", done: imports > 0 },
    { key: "first_records", label: "Primeiros registros de manejo", done: weights + events > 0 },
  ];
}

export function onboardingRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  /** Quadro das implantações em andamento: progresso, atrasos e próximo passo. */
  app.get("/v1/platform/onboarding", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const orgs = await db.organization.findMany({
      where: {
        isDemo: false,
        OR: [
          { stage: "onboarding" },
          { onboardingSteps: { some: { status: { in: ["todo", "doing"] } } } },
        ],
      },
      include: { onboardingSteps: { orderBy: { position: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    const t = today(ctx);
    const names = await staffNames(db, [
      ...orgs.map((o) => o.accountManagerId),
      ...orgs.flatMap((o) => o.onboardingSteps.map((s) => s.assigneeUserId)),
    ]);
    const items = [];
    for (const o of orgs) {
      const steps = o.onboardingSteps;
      const pending = steps.filter((s) => s.status === "todo" || s.status === "doing");
      const next = pending[0];
      items.push({
        id: o.id,
        name: o.name,
        stage: o.stage,
        createdAt: o.createdAt.toISOString(),
        accountManager: o.accountManagerId ? (names.get(o.accountManagerId) ?? "") : null,
        total: steps.length,
        done: steps.length - pending.length,
        overdue: pending.filter((s) => s.dueOn && dateToCivil(s.dueOn) < t).length,
        next: next
          ? {
              id: next.id,
              title: next.title,
              dueOn: dateToCivil(next.dueOn),
              assignee: next.assigneeUserId ? (names.get(next.assigneeUserId) ?? "") : null,
            }
          : null,
        signals: await onboardingSignals(db, o.id),
      });
    }
    return { items };
  });

  app.get<{ Params: { id: string } }>("/v1/platform/customers/:id/onboarding", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const o = await db.organization.findUnique({ where: { id: req.params.id } });
    if (!o) throw notFound("Cliente");
    return { signals: await onboardingSignals(db, o.id) };
  });

  app.post<{ Params: { id: string } }>(
    "/v1/platform/customers/:id/onboarding/steps",
    async (req, reply) => {
      const staff = await requireStaff(ctx, req, "onboarding.manage");
      const body = z
        .object({
          title: z.string().trim().min(2).max(160),
          description: z.string().trim().max(1000).optional(),
          assigneeUserId: z.uuid().nullable().optional(),
          dueOn: civil.nullable().optional(),
        })
        .parse(req.body);
      const o = await db.organization.findUnique({ where: { id: req.params.id } });
      if (!o) throw notFound("Cliente");
      if (
        body.assigneeUserId &&
        !(await db.platformAdmin.findUnique({ where: { userId: body.assigneeUserId } }))
      )
        throw new HttpError(422, "invalid_staff", "Responsável precisa ser da equipe Rebania.");
      const last = await db.onboardingStep.findFirst({
        where: { organizationId: o.id },
        orderBy: { position: "desc" },
      });
      const s = await db.onboardingStep.create({
        data: {
          organizationId: o.id,
          title: body.title,
          description: body.description ?? null,
          position: (last?.position ?? -1) + 1,
          assigneeUserId: body.assigneeUserId ?? null,
          dueOn: body.dueOn ? civilToDate(body.dueOn) : null,
        },
      });
      await audit(db, {
        organizationId: o.id,
        actorUserId: staff.userId,
        action: "onboarding.step_add",
        entityType: "onboarding_step",
        entityId: s.id,
      });
      return reply.status(201).send({ id: s.id });
    },
  );

  /** Acrescenta ao checklist do cliente as etapas de um modelo. */
  app.post<{ Params: { id: string } }>(
    "/v1/platform/customers/:id/onboarding/apply-template",
    async (req) => {
      const staff = await requireStaff(ctx, req, "onboarding.manage");
      const { templateId } = z.object({ templateId: z.uuid() }).parse(req.body);
      const [o, tpl] = await Promise.all([
        db.organization.findUnique({ where: { id: req.params.id } }),
        db.onboardingTemplate.findFirst({ where: { id: templateId, archivedAt: null } }),
      ]);
      if (!o) throw notFound("Cliente");
      if (!tpl) throw notFound("Modelo");
      const steps = StepsSchema.parse(tpl.steps);
      const last = await db.onboardingStep.findFirst({
        where: { organizationId: o.id },
        orderBy: { position: "desc" },
      });
      const start = (last?.position ?? -1) + 1;
      await db.$transaction(async (tx) => {
        await tx.onboardingStep.createMany({
          data: steps.map((s, i) => ({
            organizationId: o.id,
            title: s.title,
            description: s.description ?? null,
            position: start + i,
            assigneeUserId: o.accountManagerId,
          })),
        });
        await audit(tx, {
          organizationId: o.id,
          actorUserId: staff.userId,
          action: "onboarding.template_applied",
          entityType: "onboarding_template",
          entityId: tpl.id,
        });
      });
      return { ok: true, added: steps.length };
    },
  );

  app.patch<{ Params: { stepId: string } }>(
    "/v1/platform/onboarding/steps/:stepId",
    async (req) => {
      const staff = await requireStaff(ctx, req, "onboarding.manage");
      const body = z
        .object({
          title: z.string().trim().min(2).max(160).optional(),
          description: z.string().trim().max(1000).nullable().optional(),
          status: z.enum(["todo", "doing", "done", "skipped"]).optional(),
          assigneeUserId: z.uuid().nullable().optional(),
          dueOn: civil.nullable().optional(),
        })
        .parse(req.body);
      const s = await db.onboardingStep.findUnique({ where: { id: req.params.stepId } });
      if (!s) throw notFound("Etapa");
      if (
        body.assigneeUserId &&
        !(await db.platformAdmin.findUnique({ where: { userId: body.assigneeUserId } }))
      )
        throw new HttpError(422, "invalid_staff", "Responsável precisa ser da equipe Rebania.");
      const closing = body.status === "done" || body.status === "skipped";
      await db.$transaction(async (tx) => {
        await tx.onboardingStep.update({
          where: { id: s.id },
          data: {
            ...(body.title !== undefined ? { title: body.title } : {}),
            ...(body.description !== undefined ? { description: body.description } : {}),
            ...(body.assigneeUserId !== undefined ? { assigneeUserId: body.assigneeUserId } : {}),
            ...(body.dueOn !== undefined
              ? { dueOn: body.dueOn ? civilToDate(body.dueOn) : null }
              : {}),
            ...(body.status !== undefined
              ? { status: body.status, doneAt: closing ? ctx.now() : null }
              : {}),
          },
        });
        await audit(tx, {
          organizationId: s.organizationId,
          actorUserId: staff.userId,
          action: "onboarding.step_update",
          entityType: "onboarding_step",
          entityId: s.id,
          data: { from: s.status, ...body },
        });
      });
      return { ok: true };
    },
  );

  // ---- Modelos de checklist ----
  app.get("/v1/platform/onboarding-templates", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const rows = await db.onboardingTemplate.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        steps: r.steps,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  });

  app.post("/v1/platform/onboarding-templates", async (req, reply) => {
    const staff = await requireStaff(ctx, req, "onboarding.manage");
    const body = z
      .object({ name: z.string().trim().min(2).max(120), steps: StepsSchema })
      .parse(req.body);
    const t = await db.onboardingTemplate.create({ data: { name: body.name, steps: body.steps } });
    await audit(db, {
      actorUserId: staff.userId,
      action: "onboarding.template_create",
      entityType: "onboarding_template",
      entityId: t.id,
    });
    return reply.status(201).send({ id: t.id });
  });

  app.patch<{ Params: { id: string } }>("/v1/platform/onboarding-templates/:id", async (req) => {
    const staff = await requireStaff(ctx, req, "onboarding.manage");
    const body = z
      .object({ name: z.string().trim().min(2).max(120).optional(), steps: StepsSchema.optional() })
      .parse(req.body);
    const r = await db.onboardingTemplate.updateMany({
      where: { id: req.params.id, archivedAt: null },
      data: body,
    });
    if (!r.count) throw notFound("Modelo");
    await audit(db, {
      actorUserId: staff.userId,
      action: "onboarding.template_update",
      entityType: "onboarding_template",
      entityId: req.params.id,
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>(
    "/v1/platform/onboarding-templates/:id/archive",
    async (req) => {
      const staff = await requireStaff(ctx, req, "onboarding.manage");
      const r = await db.onboardingTemplate.updateMany({
        where: { id: req.params.id, archivedAt: null },
        data: { archivedAt: ctx.now() },
      });
      if (!r.count) throw notFound("Modelo");
      await audit(db, {
        actorUserId: staff.userId,
        action: "onboarding.template_archive",
        entityType: "onboarding_template",
        entityId: req.params.id,
      });
      return { ok: true };
    },
  );
}
