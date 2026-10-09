import { randomUUID } from "node:crypto";
import {
  BirthInput,
  BreedingInput,
  CancelTaskInput,
  CompleteTaskInput,
  CreateTaskInput,
  ExecutionInput,
  PregnancyCheckInput,
  ProtocolInput,
  SeasonInput,
  UpdateFarmSettingsInput,
  VoidInput,
  WeaningInput,
  type ExpectedCalvingDto,
  type SyncReceipt,
  type TaskDto,
} from "@rebania/contracts";
import {
  addDays,
  daysBetween,
  parseReproSettings,
  pregnancyRate,
  projectRepro,
  todayInTimezone,
  type PregnancyResultValue,
} from "@rebania/domain";
import type { Prisma } from "@rebania/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { audit } from "../../lib/audit.ts";
import type { AppContext } from "../../lib/context.ts";
import { stableHash } from "../../lib/crypto.ts";
import { civilToDate, dateToCivil } from "../../lib/dates.ts";
import { HttpError, notFound } from "../../lib/errors.ts";
import { runIdempotent } from "../../lib/idempotency.ts";
import { createTask } from "../../lib/tasks.ts";
import { requireFarm, type FarmContext } from "../../lib/tenant.ts";
import { requireAuth } from "../../plugins/auth.ts";
import {
  loadSettings,
  recordBirth,
  recordBreeding,
  recordPregnancyChecks,
  recordWeaning,
  voidRecord,
} from "./service.ts";

type FarmParams = { Params: { farmId: string } };
type IdParams = { Params: { farmId: string; id: string } };

function idempotencyKey(req: FastifyRequest): string {
  const h = req.headers["idempotency-key"];
  if (h === undefined) return randomUUID();
  const p = z.uuid().safeParse(h);
  if (!p.success)
    throw new HttpError(400, "invalid_idempotency_key", "Idempotency-Key deve ser um UUID.");
  return p.data;
}

function replyReceipt(reply: FastifyReply, receipt: SyncReceipt) {
  if (receipt.status === "accepted")
    return reply.status(201).send(receipt.detail ?? { id: receipt.entityId });
  if (receipt.status === "conflict") {
    return reply.status(409).send({ error: { code: receipt.code, message: receipt.message } });
  }
  return reply
    .status(receipt.code === "not_found" ? 404 : 422)
    .send({ error: { code: receipt.code, message: receipt.message } });
}

export function reproRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const farm = (req: FastifyRequest<FarmParams>, perm: Parameters<typeof requireFarm>[3]) =>
    requireFarm(db, requireAuth(req).userId, req.params.farmId, perm);

  const op = <I>(
    path: string,
    type: string,
    schema: { parse: (v: unknown) => I },
    exec: (
      tx: Prisma.TransactionClient,
      fctx: FarmContext,
      input: I,
      mutationId: string,
    ) => Promise<{ entityId: string; version: number | null; detail?: unknown }>,
  ) =>
    app.post<FarmParams>(path, async (req, reply) => {
      const fctx = await farm(req, "events.write");
      const input = schema.parse(req.body);
      const mutationId = idempotencyKey(req);
      const receipt = await runIdempotent({
        db,
        fctx,
        mutationId,
        type,
        requestHash: stableHash({ type, body: input }),
        execute: (tx) => exec(tx, fctx, input, mutationId),
      });
      return replyReceipt(reply, receipt);
    });

  op("/v1/farms/:farmId/events/breeding", "breeding.record", BreedingInput, (tx, f, i, m) =>
    recordBreeding(
      tx,
      f,
      { ...i, operationId: i.operationId ?? m },
      { now: ctx.now(), mutationId: m },
    ),
  );
  op("/v1/farms/:farmId/events/pregnancy", "pregnancy.record", PregnancyCheckInput, (tx, f, i, m) =>
    recordPregnancyChecks(
      tx,
      f,
      { ...i, operationId: i.operationId ?? m },
      { now: ctx.now(), mutationId: m },
    ),
  );
  op("/v1/farms/:farmId/events/birth", "birth.record", BirthInput, (tx, f, i, m) =>
    recordBirth(tx, f, { ...i, id: i.id ?? m }, { now: ctx.now(), mutationId: m }),
  );
  op("/v1/farms/:farmId/events/weaning", "weaning.record", WeaningInput, (tx, f, i, m) =>
    recordWeaning(
      tx,
      f,
      { ...i, operationId: i.operationId ?? m },
      { now: ctx.now(), mutationId: m },
    ),
  );

  /** Correção rastreável: anula o registro, cria evento de correção e recalcula projeções. */
  app.post<FarmParams>("/v1/farms/:farmId/corrections", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const body = VoidInput.extend({
      kind: z.enum(["breeding", "pregnancy_check", "weight"]),
      id: z.uuid(),
    }).parse(req.body);
    await db.$transaction((tx) =>
      voidRecord(tx, fctx, body.kind, body.id, body.reason, { now: ctx.now(), ip: req.ip }),
    );
    return reply.status(204).send();
  });

  // ---- Histórico reprodutivo do animal ----
  app.get<IdParams>("/v1/farms/:farmId/animals/:id/repro", async (req) => {
    const fctx = await farm(req as unknown as FastifyRequest<FarmParams>, "animals.read");
    const animal = await db.animal.findFirst({ where: { id: req.params.id, farmId: fctx.farmId } });
    if (!animal) throw notFound("Animal");
    const s = await loadSettings(db, fctx.farmId);
    const [breedings, checks, births] = await Promise.all([
      db.breedingEvent.findMany({ where: { femaleId: animal.id }, orderBy: { date: "desc" } }),
      db.pregnancyCheck.findMany({ where: { femaleId: animal.id }, orderBy: { date: "desc" } }),
      db.birth.findMany({
        where: { damId: animal.id },
        orderBy: { date: "desc" },
        include: { calves: true },
      }),
    ]);
    const projection = projectRepro(
      {
        breedings: breedings
          .filter((b) => !b.voidedAt)
          .map((b) => ({ date: dateToCivil(b.date), endDate: dateToCivil(b.endDate) })),
        checks: checks
          .filter((c) => !c.voidedAt)
          .map((c) => ({
            date: dateToCivil(c.date),
            result: c.result,
            estimatedGestationDays: c.estimatedGestationDays,
          })),
        births: births.map((b) => ({ date: dateToCivil(b.date) })),
      },
      s,
    );
    return {
      projection,
      breedings: breedings.map((b) => ({
        id: b.id,
        kind: b.kind,
        date: dateToCivil(b.date),
        endDate: dateToCivil(b.endDate),
        sireId: b.sireId,
        semen: b.semen,
        technician: b.technician,
        voidedAt: b.voidedAt?.toISOString() ?? null,
        voidReason: b.voidReason,
      })),
      checks: checks.map((c) => ({
        id: c.id,
        date: dateToCivil(c.date),
        result: c.result,
        method: c.method,
        examiner: c.examiner,
        estimatedGestationDays: c.estimatedGestationDays,
        voidedAt: c.voidedAt?.toISOString() ?? null,
        voidReason: c.voidReason,
      })),
      births: births.map((b) => ({
        id: b.id,
        date: dateToCivil(b.date),
        assistance: b.assistance,
        sireId: b.sireId,
        calves: b.calves.map((c) => ({
          animalId: c.animalId,
          sex: c.sex,
          stillborn: c.stillborn,
          weightKg: c.birthWeightKg ? Number(c.birthWeightKg) : null,
        })),
      })),
    };
  });

  // ---- Configurações (T44) ----
  app.get<FarmParams>("/v1/farms/:farmId/settings", async (req) => {
    const fctx = await farm(req, "animals.read");
    const f = await db.farm.findUniqueOrThrow({ where: { id: fctx.farmId } });
    return {
      name: f.name,
      timezone: f.timezone,
      repro: parseReproSettings((f.settings as { repro?: unknown }).repro),
    };
  });

  app.patch<FarmParams>("/v1/farms/:farmId/settings", async (req) => {
    const fctx = await farm(req, "settings.manage");
    const body = UpdateFarmSettingsInput.parse(req.body);
    const f = await db.farm.findUniqueOrThrow({ where: { id: fctx.farmId } });
    const current = (f.settings ?? {}) as Record<string, unknown>;
    const repro = parseReproSettings({ ...parseReproSettings(current.repro), ...body.repro });
    const updated = await db.$transaction(async (tx) => {
      const u = await tx.farm.update({
        where: { id: fctx.farmId },
        data: {
          ...(body.name ? { name: body.name } : {}),
          settings: { ...current, repro } as unknown as Prisma.InputJsonValue,
        },
      });
      await audit(tx, {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        actorUserId: fctx.userId,
        action: "farm.settings_updated",
        entityType: "farm",
        entityId: fctx.farmId,
        data: { before: current, after: { repro } } as unknown as Prisma.InputJsonValue,
        ip: req.ip,
      });
      return u;
    });
    return { name: updated.name, timezone: updated.timezone, repro };
  });

  // ---- Estações de monta (T16) ----
  app.get<FarmParams>("/v1/farms/:farmId/breeding-seasons", async (req) => {
    const fctx = await farm(req, "animals.read");
    const rows = await db.breedingSeason.findMany({
      where: { farmId: fctx.farmId, archivedAt: null },
      orderBy: { startDate: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      startDate: dateToCivil(r.startDate),
      endDate: dateToCivil(r.endDate),
      notes: r.notes,
    }));
  });

  app.post<FarmParams>("/v1/farms/:farmId/breeding-seasons", async (req, reply) => {
    const fctx = await farm(req, "groups.manage");
    const body = SeasonInput.parse(req.body);
    const r = await db.breedingSeason.create({
      data: {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        name: body.name,
        startDate: civilToDate(body.startDate),
        endDate: civilToDate(body.endDate),
        notes: body.notes ?? null,
      },
    });
    return reply.status(201).send({
      id: r.id,
      name: r.name,
      startDate: body.startDate,
      endDate: body.endDate,
      notes: r.notes,
    });
  });

  /** Resultado por coorte: denominador explícito; sem diagnóstico ≠ vazia. */
  app.get<IdParams>("/v1/farms/:farmId/breeding-seasons/:id/report", async (req) => {
    const fctx = await farm(req as unknown as FastifyRequest<FarmParams>, "reports.read");
    const season = await db.breedingSeason.findFirst({
      where: { id: req.params.id, farmId: fctx.farmId },
    });
    if (!season) throw notFound("Estação");
    const breedings = await db.breedingEvent.findMany({
      where: {
        farmId: fctx.farmId,
        voidedAt: null,
        OR: [
          { seasonId: season.id },
          { seasonId: null, date: { gte: season.startDate, lte: season.endDate } },
        ],
      },
      select: { femaleId: true, kind: true },
    });
    const females = [...new Set(breedings.map((b) => b.femaleId))];
    const checks = await db.pregnancyCheck.findMany({
      where: { femaleId: { in: females }, voidedAt: null, date: { gte: season.startDate } },
      orderBy: { date: "asc" },
      select: { femaleId: true, result: true },
    });
    const last = new Map<string, PregnancyResultValue>();
    for (const c of checks) last.set(c.femaleId, c.result);
    const rate = pregnancyRate(
      females.map((id) => ({ animalId: id, lastResult: last.get(id) ?? null })),
    );
    const byKind = Object.fromEntries(
      ["artificial_insemination", "natural_service", "cleanup_bull"].map((k) => [
        k,
        breedings.filter((b) => b.kind === k).length,
      ]),
    );
    return {
      season: {
        id: season.id,
        name: season.name,
        startDate: dateToCivil(season.startDate),
        endDate: dateToCivil(season.endDate),
      },
      ...rate,
      breedingsByKind: byKind,
      formula:
        "Taxa de prenhez = prenhes ÷ (prenhes + vazias) entre fêmeas cobertas/inseminadas na estação. Inconclusivas e sem diagnóstico ficam fora do denominador e aparecem como cobertura.",
    };
  });

  // ---- Protocolos IATF (T17) ----
  const protocolDto = (p: {
    id: string;
    lineageId: string;
    version: number;
    name: string;
    steps: unknown;
    responsible: string | null;
    notes: string | null;
    createdAt: Date;
  }) => ({
    id: p.id,
    lineageId: p.lineageId,
    version: p.version,
    name: p.name,
    steps: p.steps,
    responsible: p.responsible,
    notes: p.notes,
    createdAt: p.createdAt.toISOString(),
  });

  app.get<FarmParams>("/v1/farms/:farmId/protocols", async (req) => {
    const fctx = await farm(req, "animals.read");
    const rows = await db.reproProtocol.findMany({
      where: { farmId: fctx.farmId, supersededAt: null },
      orderBy: { name: "asc" },
    });
    return rows.map(protocolDto);
  });

  app.post<FarmParams>("/v1/farms/:farmId/protocols", async (req, reply) => {
    const fctx = await farm(req, "settings.manage");
    const body = ProtocolInput.parse(req.body);
    const p = await db.reproProtocol.create({
      data: {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        lineageId: randomUUID(),
        version: 1,
        name: body.name,
        steps: body.steps as Prisma.InputJsonValue,
        responsible: body.responsible ?? null,
        notes: body.notes ?? null,
        createdById: fctx.userId,
      },
    });
    return reply.status(201).send(protocolDto(p));
  });

  /** Editar cria nova versão; execuções antigas continuam apontando para a versão usada. */
  app.post<IdParams>("/v1/farms/:farmId/protocols/:id/versions", async (req, reply) => {
    const fctx = await farm(req as unknown as FastifyRequest<FarmParams>, "settings.manage");
    const body = ProtocolInput.parse(req.body);
    const current = await db.reproProtocol.findFirst({
      where: { id: req.params.id, farmId: fctx.farmId, supersededAt: null },
    });
    if (!current) throw notFound("Protocolo");
    const p = await db.$transaction(async (tx) => {
      await tx.reproProtocol.update({
        where: { id: current.id },
        data: { supersededAt: ctx.now() },
      });
      return tx.reproProtocol.create({
        data: {
          organizationId: fctx.organizationId,
          farmId: fctx.farmId,
          lineageId: current.lineageId,
          version: current.version + 1,
          name: body.name,
          steps: body.steps as Prisma.InputJsonValue,
          responsible: body.responsible ?? null,
          notes: body.notes ?? null,
          createdById: fctx.userId,
        },
      });
    });
    return reply.status(201).send(protocolDto(p));
  });

  app.post<FarmParams>("/v1/farms/:farmId/protocol-executions", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const body = ExecutionInput.parse(req.body);
    const protocol = await db.reproProtocol.findFirst({
      where: { id: body.protocolId, farmId: fctx.farmId },
    });
    if (!protocol) throw notFound("Protocolo");
    const animals = await db.animal.findMany({
      where: {
        id: { in: body.animalIds },
        farmId: fctx.farmId,
        status: "active",
        sex: "female",
        category: { in: ["heifer", "cow"] },
      },
      select: { id: true },
    });
    if (animals.length !== new Set(body.animalIds).size) {
      throw new HttpError(
        422,
        "invalid_animals",
        "Todos os animais precisam ser novilhas ou vacas ativas desta fazenda.",
      );
    }
    const steps = protocol.steps as {
      day: number;
      title: string;
      description?: string;
      inseminate?: boolean;
    }[];
    const ex = await db.$transaction(async (tx) => {
      const e = await tx.protocolExecution.create({
        data: {
          organizationId: fctx.organizationId,
          farmId: fctx.farmId,
          protocolId: protocol.id,
          startDate: civilToDate(body.startDate),
          animalIds: body.animalIds,
          seasonId: body.seasonId ?? null,
          createdById: fctx.userId,
        },
      });
      for (const [i, st] of steps.entries()) {
        await createTask(tx, fctx, {
          type: st.inseminate ? "protocol_insemination" : "protocol_step",
          title: `${protocol.name} · D${st.day}: ${st.title}`,
          ...(st.description ? { description: st.description } : {}),
          dueOn: addDays(body.startDate, st.day),
          animalIds: body.animalIds,
          sourceType: "protocol_execution",
          sourceId: e.id,
          dedupeKey: `exec:${e.id}:${i}`,
        });
      }
      return e;
    });
    return reply.status(201).send({
      id: ex.id,
      protocolId: protocol.id,
      startDate: body.startDate,
      animals: body.animalIds.length,
      steps: steps.length,
    });
  });

  // ---- Agenda (T41) ----
  const taskDto = async (
    rows: Awaited<ReturnType<typeof db.task.findMany>>,
  ): Promise<TaskDto[]> => {
    const ids = [...new Set(rows.map((r) => r.assigneeId).filter((x): x is string => Boolean(x)))];
    const users = await db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
    const name = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((t) => ({
      id: t.id,
      type: t.type,
      title: t.title,
      description: t.description,
      dueOn: dateToCivil(t.dueOn),
      status: t.status,
      animalIds: t.animalIds,
      sourceType: t.sourceType,
      sourceId: t.sourceId,
      assigneeName: t.assigneeId ? (name.get(t.assigneeId) ?? null) : null,
      completedAt: t.completedAt?.toISOString() ?? null,
      resolution: t.resolution,
    }));
  };

  app.get<FarmParams>("/v1/farms/:farmId/tasks", async (req) => {
    const fctx = await farm(req, "animals.read");
    const q = z
      .object({
        status: z.enum(["open", "done", "cancelled"]).default("open"),
        until: z.string().optional(),
      })
      .parse(req.query);
    const rows = await db.task.findMany({
      where: {
        farmId: fctx.farmId,
        status: q.status,
        ...(q.until ? { dueOn: { lte: civilToDate(q.until) } } : {}),
      },
      orderBy:
        q.status === "open" ? [{ dueOn: "asc" }, { createdAt: "asc" }] : [{ completedAt: "desc" }],
      take: 500,
    });
    return taskDto(rows);
  });

  app.post<FarmParams>("/v1/farms/:farmId/tasks", async (req, reply) => {
    const fctx = await farm(req, "tasks.manage");
    const body = CreateTaskInput.parse(req.body);
    const t = await db.$transaction((tx) =>
      createTask(tx, fctx, {
        type: "manual",
        title: body.title,
        ...(body.description ? { description: body.description } : {}),
        dueOn: body.dueOn,
        animalIds: body.animalIds,
      }),
    );
    return reply.status(201).send((await taskDto([t]))[0]);
  });

  for (const action of ["complete", "cancel"] as const) {
    app.post<IdParams>(`/v1/farms/:farmId/tasks/:id/${action}`, async (req) => {
      const fctx = await farm(req as unknown as FastifyRequest<FarmParams>, "events.write");
      const body = (action === "complete" ? CompleteTaskInput : CancelTaskInput).parse(
        req.body ?? {},
      );
      const r = await db.task.updateMany({
        where: { id: req.params.id, farmId: fctx.farmId, status: "open" },
        data: {
          status: action === "complete" ? "done" : "cancelled",
          completedAt: ctx.now(),
          completedById: fctx.userId,
          resolution: body.resolution ?? null,
        },
      });
      if (r.count !== 1)
        throw new HttpError(409, "task_not_open", "Tarefa já concluída ou cancelada.");
      return (await taskDto(await db.task.findMany({ where: { id: req.params.id } })))[0];
    });
  }

  // ---- Partos previstos (T20) ----
  app.get<FarmParams>("/v1/farms/:farmId/reproduction/expected-calvings", async (req) => {
    const fctx = await farm(req, "animals.read");
    const { days } = z
      .object({ days: z.coerce.number().int().min(1).max(365).default(60) })
      .parse(req.query);
    const today = todayInTimezone(fctx.timezone, ctx.now());
    const s = await loadSettings(db, fctx.farmId);
    const animals = await db.animal.findMany({
      where: {
        farmId: fctx.farmId,
        status: "active",
        reproStatus: "pregnant",
        expectedCalvingOn: { not: null, lte: civilToDate(addDays(today, days)) },
      },
      include: {
        identifiers: { where: { status: "active", type: "visual_tag" } },
        group: { select: { name: true } },
      },
      orderBy: { expectedCalvingOn: "asc" },
      take: 500,
    });
    const out: ExpectedCalvingDto[] = [];
    for (const a of animals) {
      const [breedings, checks] = await Promise.all([
        db.breedingEvent.findMany({
          where: { femaleId: a.id, voidedAt: null },
          select: { date: true, endDate: true },
        }),
        db.pregnancyCheck.findMany({
          where: { femaleId: a.id, voidedAt: null },
          select: { date: true, result: true, estimatedGestationDays: true },
        }),
      ]);
      const births = await db.birth.findMany({ where: { damId: a.id }, select: { date: true } });
      const p = projectRepro(
        {
          breedings: breedings.map((b) => ({
            date: dateToCivil(b.date),
            endDate: dateToCivil(b.endDate),
          })),
          checks: checks.map((c) => ({
            date: dateToCivil(c.date),
            result: c.result,
            estimatedGestationDays: c.estimatedGestationDays,
          })),
          births: births.map((b) => ({ date: dateToCivil(b.date) })),
        },
        s,
      );
      if (!p.expectedCalving) continue;
      out.push({
        animalId: a.id,
        tag: a.identifiers[0]?.normalizedValue ?? null,
        groupName: a.group?.name ?? null,
        date: p.expectedCalving.date,
        windowStart: p.expectedCalving.windowStart,
        windowEnd: p.expectedCalving.windowEnd,
        source: p.expectedCalving.source,
        overdue: daysBetween(p.expectedCalving.windowEnd, today) > 0,
      });
    }
    return out;
  });
}
