import { randomUUID } from "node:crypto";
import {
  AddIdentifierInput,
  AnimalListQuery,
  CreateAnimalInput,
  MoveAnimalInput,
  RecordWeightInput,
  UpdateAnimalInput,
  type AnimalHistory,
  type SyncReceipt,
} from "@rebania/contracts";
import { adgFromSeries, candidateIdentifiers, formatIdentifier, roleHas } from "@rebania/domain";
import type { Prisma } from "@rebania/db";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../lib/context.ts";
import { stableHash } from "../../lib/crypto.ts";
import { dateToCivil } from "../../lib/dates.ts";
import { forbidden, HttpError } from "../../lib/errors.ts";
import { runIdempotent } from "../../lib/idempotency.ts";
import { requireFarm, type FarmContext } from "../../lib/tenant.ts";
import { requireAuth } from "../../plugins/auth.ts";
import {
  addIdentifier,
  ANIMAL_INCLUDE,
  createAnimal,
  getAnimalDto,
  getTimeline,
  moveAnimal,
  recordWeight,
  toAnimalDto,
  updateAnimal,
} from "./service.ts";

type FarmParams = { Params: { farmId: string } };
type AnimalParams = { Params: { farmId: string; animalId: string } };

const IdemKey = z.uuid();

/** Idempotency-Key opcional no REST; sem ela, cada chamada é uma nova operação. */
function idempotencyKey(req: FastifyRequest): string {
  const header = req.headers["idempotency-key"];
  if (header === undefined) return randomUUID();
  const parsed = IdemKey.safeParse(header);
  if (!parsed.success) {
    throw new HttpError(400, "invalid_idempotency_key", "Idempotency-Key deve ser um UUID.");
  }
  return parsed.data;
}

/** Converte recibo idempotente em resposta HTTP. */
async function replyReceipt(
  reply: FastifyReply,
  receipt: SyncReceipt,
  onAccepted: (entityId: string) => Promise<unknown>,
  status = 201,
) {
  if (receipt.status === "accepted") {
    return reply.status(status).send(await onAccepted(receipt.entityId));
  }
  if (receipt.status === "conflict") {
    return reply.status(409).send({
      error: {
        code: receipt.code,
        message: receipt.message,
        details: { entityId: receipt.entityId, serverVersion: receipt.serverVersion },
      },
    });
  }
  const status4xx = receipt.code === "not_found" ? 404 : receipt.code === "forbidden" ? 403 : 422;
  return reply.status(status4xx).send({ error: { code: receipt.code, message: receipt.message } });
}

export function animalRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  const farm = (req: FastifyRequest<FarmParams>, perm: Parameters<typeof requireFarm>[3]) =>
    requireFarm(db, requireAuth(req).userId, req.params.farmId, perm);

  function idempotent(
    req: FastifyRequest,
    fctx: FarmContext,
    type: string,
    body: unknown,
    exec: (
      tx: Prisma.TransactionClient,
      mutationId: string,
    ) => Promise<{ entityId: string; version: number | null }>,
  ) {
    const mutationId = idempotencyKey(req);
    return runIdempotent({
      db,
      fctx,
      mutationId,
      type,
      requestHash: stableHash({ type, path: req.url, body }),
      execute: (tx) => exec(tx, mutationId),
    });
  }

  app.get<FarmParams>("/v1/farms/:farmId/animals", async (req) => {
    const fctx = await farm(req, "animals.read");
    const q = AnimalListQuery.parse(req.query);
    const where: Prisma.AnimalWhereInput = {
      farmId: fctx.farmId,
      status: q.status ?? "active",
      ...(q.category ? { category: q.category } : {}),
      ...(q.sex ? { sex: q.sex } : {}),
      ...(q.groupId ? { groupId: q.groupId } : {}),
    };
    if (q.q) {
      const values = [...new Set(candidateIdentifiers(q.q).map((c) => c.value))];
      where.identifiers = {
        some: { status: "active", OR: values.map((v) => ({ normalizedValue: { startsWith: v } })) },
      };
    }
    const rows = await db.animal.findMany({
      where,
      include: ANIMAL_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > q.limit;
    const items = rows.slice(0, q.limit).map(toAnimalDto);
    const total = await db.animal.count({ where });
    return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null, total };
  });

  app.post<FarmParams>("/v1/farms/:farmId/animals", async (req, reply) => {
    const fctx = await farm(req, "animals.write");
    const body = CreateAnimalInput.parse(req.body);
    const receipt = await idempotent(req, fctx, "animal.create", body, (tx, mutationId) =>
      createAnimal(tx, fctx, body, { now: ctx.now(), mutationId }),
    );
    return replyReceipt(reply, receipt, (id) => getAnimalDto(db, fctx.farmId, id));
  });

  app.get<AnimalParams>("/v1/farms/:farmId/animals/:animalId", async (req) => {
    const fctx = await farm(req, "animals.read");
    return getAnimalDto(db, fctx.farmId, req.params.animalId);
  });

  app.patch<AnimalParams>("/v1/farms/:farmId/animals/:animalId", async (req, reply) => {
    const fctx = await farm(req, "animals.write");
    const body = UpdateAnimalInput.parse(req.body);
    const receipt = await idempotent(req, fctx, "animal.update", body, (tx, mutationId) =>
      updateAnimal(tx, fctx, req.params.animalId, body, { now: ctx.now(), mutationId }),
    );
    return replyReceipt(reply, receipt, (id) => getAnimalDto(db, fctx.farmId, id), 200);
  });

  app.post<AnimalParams>("/v1/farms/:farmId/animals/:animalId/move", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const body = MoveAnimalInput.parse(req.body);
    const receipt = await idempotent(req, fctx, "animal.move", body, (tx, mutationId) =>
      moveAnimal(tx, fctx, req.params.animalId, body, { now: ctx.now(), mutationId }),
    );
    return replyReceipt(reply, receipt, (id) => getAnimalDto(db, fctx.farmId, id), 200);
  });

  app.post<AnimalParams>("/v1/farms/:farmId/animals/:animalId/weights", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const body = RecordWeightInput.parse(req.body);
    let warning: string | null = null;
    const receipt = await idempotent(req, fctx, "weight.record", body, async (tx, mutationId) => {
      const r = await recordWeight(tx, fctx, req.params.animalId, body, {
        now: ctx.now(),
        mutationId,
      });
      warning = r.warning;
      return r;
    });
    return replyReceipt(reply, receipt, async () => ({
      animal: await getAnimalDto(db, fctx.farmId, req.params.animalId),
      warning,
    }));
  });

  app.post<AnimalParams>("/v1/farms/:farmId/animals/:animalId/identifiers", async (req, reply) => {
    const body = AddIdentifierInput.parse(req.body);
    const fctx = await farm(req, "animals.write");
    if (body.replaceActiveOfSameType && !roleHas(fctx.role, "animals.retag")) throw forbidden();
    const receipt = await idempotent(req, fctx, "animal.identifier", body, (tx, mutationId) =>
      addIdentifier(tx, fctx, req.params.animalId, body, {
        now: ctx.now(),
        mutationId,
        ip: req.ip,
      }),
    );
    return replyReceipt(reply, receipt, () => getAnimalDto(db, fctx.farmId, req.params.animalId));
  });

  app.get<AnimalParams>("/v1/farms/:farmId/animals/:animalId/history", async (req) => {
    const fctx = await farm(req, "animals.read");
    const animal = await db.animal.findFirst({
      where: { id: req.params.animalId, farmId: fctx.farmId },
    });
    if (!animal) throw new HttpError(404, "not_found", "Animal não encontrado.");
    const [timeline, weights] = await Promise.all([
      getTimeline(db, fctx, animal.id),
      db.weightMeasurement.findMany({
        where: { animalId: animal.id, organizationId: fctx.organizationId, voidedAt: null },
        orderBy: [{ measuredOn: "asc" }, { createdAt: "asc" }],
      }),
    ]);
    const points = weights.map((w) => ({
      measuredOn: dateToCivil(w.measuredOn),
      weightKg: Number(w.weightKg),
    }));
    const overall = adgFromSeries(points);
    const history: AnimalHistory = {
      animalId: animal.id,
      timeline,
      weights: weights.map((w) => ({
        id: w.id,
        weightKg: Number(w.weightKg),
        measuredOn: dateToCivil(w.measuredOn),
        source: w.source,
        notes: w.notes,
      })),
      adg: overall.ok
        ? {
            adgKgPerDay: overall.adgKgPerDay,
            days: overall.days,
            from: overall.from.measuredOn,
            to: overall.to.measuredOn,
          }
        : null,
    };
    return history;
  });

  app.get<FarmParams>("/v1/farms/:farmId/identifiers/resolve", async (req) => {
    const fctx = await farm(req, "animals.read");
    const { value } = z.object({ value: z.string().trim().min(1).max(200) }).parse(req.query);
    const candidates = candidateIdentifiers(value);
    if (!candidates.length) return { query: value, matches: [] };
    const found = await db.animalIdentifier.findMany({
      where: {
        farmId: fctx.farmId,
        OR: candidates.map((c) => ({ type: c.type, normalizedValue: c.value })),
      },
      include: { animal: { select: { status: true, category: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 20,
    });
    return {
      query: value,
      matches: found.map((f) => ({
        animalId: f.animalId,
        identifierType: f.type,
        identifierStatus: f.status,
        display: formatIdentifier(f.type, f.normalizedValue),
        animalStatus: f.animal.status,
        category: f.animal.category,
      })),
    };
  });
}
