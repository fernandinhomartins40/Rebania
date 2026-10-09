import {
  SyncMutation,
  SyncPullQuery,
  SyncPushRequest,
  type SyncChange,
  type SyncReceipt,
} from "@rebania/contracts";
import { roleHas, type Permission } from "@rebania/domain";
import type { FastifyInstance } from "fastify";
import type { AppContext } from "../lib/context.ts";
import { stableHash } from "../lib/crypto.ts";
import { dateToCivil } from "../lib/dates.ts";
import { runIdempotent } from "../lib/idempotency.ts";
import { requireFarm, type FarmContext } from "../lib/tenant.ts";
import { requireAuth } from "../plugins/auth.ts";
import {
  createAnimal,
  getAnimalDtos,
  moveAnimal,
  recordWeight,
  updateAnimal,
} from "./animals/service.ts";
import {
  recordBirth,
  recordBreeding,
  recordPregnancyChecks,
  recordWeaning,
} from "./repro/service.ts";
import {
  addSessionException,
  applyHealth,
  closeSession,
  markItem,
  openSession,
} from "./health/service.ts";
import { recordExit, recordFeeding, recordSale } from "./commerce/service.ts";

const PERMISSION: Record<SyncMutation["type"], Permission> = {
  "animal.create": "animals.write",
  "animal.update": "animals.write",
  "animal.move": "events.write",
  "weight.record": "events.write",
  "breeding.record": "events.write",
  "pregnancy.record": "events.write",
  "birth.record": "events.write",
  "weaning.record": "events.write",
  "health.apply": "events.write",
  "handling.open": "events.write",
  "handling.mark": "events.write",
  "handling.exception": "events.write",
  "handling.close": "events.write",
  "feeding.record": "events.write",
  "animal.exit": "events.write",
  "sale.record": "sales.manage",
};

export function syncRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  /**
   * Recebe um lote de mutações offline. Cada uma é processada isoladamente
   * (atômica por mutação) e gera um recibo estável: o lote nunca é "tudo ou nada"
   * para não perder as aceitas quando uma falha.
   */
  app.post("/v1/sync/push", { bodyLimit: 2 * 1024 * 1024 }, async (req) => {
    const { userId } = requireAuth(req);
    const body = SyncPushRequest.parse(req.body);
    const fctx = await requireFarm(db, userId, body.farmId, "animals.read");
    const receipts: SyncReceipt[] = [];
    for (const raw of body.mutations) {
      receipts.push(await processMutation(fctx, body.deviceId, raw));
    }
    const last = await db.changeLog.findFirst({
      where: { farmId: fctx.farmId },
      orderBy: { seq: "desc" },
      select: { seq: true },
    });
    return { receipts, cursor: (last?.seq ?? 0n).toString() };
  });

  async function processMutation(
    fctx: FarmContext,
    deviceId: string,
    raw: unknown,
  ): Promise<SyncReceipt> {
    const parsed = SyncMutation.safeParse(raw);
    if (!parsed.success) {
      const id = (raw as { mutationId?: unknown })?.mutationId;
      return {
        mutationId: typeof id === "string" ? id : "unknown",
        status: "rejected",
        code: "invalid_mutation",
        message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }
    const m = parsed.data;
    if (!roleHas(fctx.role, PERMISSION[m.type])) {
      return {
        mutationId: m.mutationId,
        status: "rejected",
        code: "forbidden",
        message: "Seu perfil não tem permissão para esta ação.",
      };
    }
    const meta = { now: ctx.now(), mutationId: m.mutationId };
    return runIdempotent({
      db,
      fctx,
      deviceId,
      mutationId: m.mutationId,
      type: m.type,
      // occurredAt/createdAt fazem parte do envelope, não do conteúdo da operação
      requestHash: stableHash({ type: m.type, entityId: m.entityId, payload: m.payload }),
      execute: (tx) => {
        switch (m.type) {
          case "animal.create":
            return createAnimal(tx, fctx, { ...m.payload, id: m.entityId }, meta);
          case "animal.update":
            return updateAnimal(tx, fctx, m.entityId, m.payload, meta);
          case "animal.move":
            return moveAnimal(tx, fctx, m.entityId, m.payload, meta);
          case "weight.record":
            return recordWeight(tx, fctx, m.entityId, m.payload, meta);
          case "breeding.record":
            return recordBreeding(tx, fctx, { ...m.payload, operationId: m.entityId }, meta);
          case "pregnancy.record":
            return recordPregnancyChecks(tx, fctx, { ...m.payload, operationId: m.entityId }, meta);
          case "birth.record":
            return recordBirth(tx, fctx, { ...m.payload, id: m.entityId }, meta);
          case "weaning.record":
            return recordWeaning(tx, fctx, { ...m.payload, operationId: m.entityId }, meta);
          case "health.apply":
            return applyHealth(tx, fctx, { ...m.payload, operationId: m.entityId }, meta);
          case "handling.open":
            return openSession(tx, fctx, m.entityId, m.payload, meta);
          case "handling.mark":
            return markItem(tx, fctx, m.entityId, m.payload, meta);
          case "handling.exception":
            return addSessionException(tx, fctx, m.entityId, m.payload);
          case "handling.close":
            return closeSession(tx, fctx, m.entityId, m.payload, meta);
          case "feeding.record":
            return recordFeeding(tx, fctx, { ...m.payload, id: m.entityId }, meta);
          case "animal.exit":
            return recordExit(tx, fctx, m.entityId, m.payload, meta);
          case "sale.record":
            return recordSale(tx, fctx, { ...m.payload, id: m.entityId }, meta);
        }
      },
    });
  }

  /** Feed incremental por cursor. Entidades fora da fazenda aparecem como `delete`. */
  app.get("/v1/sync/pull", async (req) => {
    const { userId } = requireAuth(req);
    const q = SyncPullQuery.parse(req.query);
    const fctx = await requireFarm(db, userId, q.farmId, "animals.read");
    const rows = await db.changeLog.findMany({
      where: { farmId: fctx.farmId, seq: { gt: BigInt(q.cursor) } },
      orderBy: { seq: "asc" },
      take: q.limit + 1,
    });
    const hasMore = rows.length > q.limit;
    const page = rows.slice(0, q.limit);
    // Mantém apenas a última mudança de cada entidade na página.
    const latest = new Map<string, (typeof page)[number]>();
    for (const r of page) latest.set(`${r.entity}:${r.entityId}`, r);
    const pick = (e: string) =>
      [...latest.values()]
        .filter((r) => r.entity === e && r.op === "upsert")
        .map((r) => r.entityId);

    const [animals, groups, pastures, weights] = await Promise.all([
      getAnimalDtos(db, fctx.farmId, pick("animal")),
      db.group.findMany({ where: { id: { in: pick("group") }, farmId: fctx.farmId } }),
      db.pasture.findMany({ where: { id: { in: pick("pasture") }, farmId: fctx.farmId } }),
      db.weightMeasurement.findMany({ where: { id: { in: pick("weight") }, farmId: fctx.farmId } }),
    ]);
    const data = new Map<string, unknown>();
    for (const a of animals) data.set(`animal:${a.id}`, a);
    for (const g of [
      ...groups.map((g) => ["group", g] as const),
      ...pastures.map((p) => ["pasture", p] as const),
    ]) {
      const [entity, row] = g;
      data.set(
        `${entity}:${row.id}`,
        row.archivedAt ? null : { id: row.id, name: row.name, notes: row.notes },
      );
    }
    for (const w of weights) {
      data.set(
        `weight:${w.id}`,
        w.voidedAt
          ? null
          : {
              id: w.id,
              animalId: w.animalId,
              weightKg: Number(w.weightKg),
              measuredOn: dateToCivil(w.measuredOn),
              source: w.source,
            },
      );
    }
    const changes: SyncChange[] = [...latest.values()]
      .sort((a, b) => (a.seq < b.seq ? -1 : 1))
      .map((r) => {
        const key = `${r.entity}:${r.entityId}`;
        const d = r.op === "upsert" ? (data.get(key) ?? null) : null;
        return {
          seq: r.seq.toString(),
          entity: r.entity as SyncChange["entity"],
          entityId: r.entityId,
          op: d ? "upsert" : "delete",
          data: d,
        };
      });
    const cursor = page.length ? page[page.length - 1]!.seq.toString() : q.cursor;
    return { changes, cursor, hasMore };
  });
}
