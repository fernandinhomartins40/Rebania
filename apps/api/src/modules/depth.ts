import {
  AssetInput,
  BunkReadingInput,
  MaintenanceInput,
  OccurrenceInput,
  PastureUpdateInput,
  PenInput,
  RainInput,
  ResolveOccurrenceInput,
  SlaughterReturnInput,
  type OccurrenceDto,
} from "@rebania/contracts";
import {
  assertEventDate,
  assertFeature,
  daysBetween,
  parseFeatures,
  realCarcass,
  todayInTimezone,
  type Feature,
  type Permission,
} from "@rebania/domain";
import type { Db } from "@rebania/db";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { audit } from "../lib/audit.ts";
import type { AppContext } from "../lib/context.ts";
import { stableHash } from "../lib/crypto.ts";
import { civilToDate, dateToCivil } from "../lib/dates.ts";
import { HttpError, notFound } from "../lib/errors.ts";
import { runIdempotent } from "../lib/idempotency.ts";
import { idempotencyKey, replyReceipt } from "../lib/ops.ts";
import { createTask } from "../lib/tasks.ts";
import { requireFarm, type FarmContext } from "../lib/tenant.ts";
import { requireAuth } from "../plugins/auth.ts";

type FarmParams = { Params: { farmId: string } };
type IdParams = { Params: { farmId: string; id: string } };

export async function farmFeatures(db: Db, farmId: string) {
  const f = await db.farm.findUniqueOrThrow({ where: { id: farmId }, select: { settings: true } });
  return parseFeatures((f.settings as { features?: unknown } | null)?.features);
}

/** Módulos de profundidade (G8) e ocorrências (T42). */
export function depthRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const farm = async (req: FastifyRequest, perm: Permission, feature?: Feature) => {
    const fctx = await requireFarm(
      db,
      requireAuth(req).userId,
      (req.params as { farmId: string }).farmId,
      perm,
    );
    if (feature) {
      try {
        assertFeature(await farmFeatures(db, fctx.farmId), feature);
      } catch (e) {
        throw new HttpError(409, "feature_disabled", (e as Error).message);
      }
    }
    return fctx;
  };
  const today = (fctx: FarmContext) => todayInTimezone(fctx.timezone, ctx.now());

  // ---- Ocorrências (T42) ----
  app.get<FarmParams>("/v1/farms/:farmId/occurrences", async (req) => {
    const fctx = await farm(req, "animals.read");
    const rows = await db.occurrence.findMany({
      where: { farmId: fctx.farmId },
      orderBy: [{ status: "asc" }, { occurredOn: "desc" }],
      take: 300,
    });
    const users = await db.user.findMany({
      where: {
        id: { in: [...new Set(rows.map((r) => r.createdById).filter(Boolean))] as string[] },
      },
      select: { id: true, name: true },
    });
    const items: OccurrenceDto[] = rows.map((o) => ({
      id: o.id,
      targetType: o.targetType as OccurrenceDto["targetType"],
      targetId: o.targetId,
      targetLabel: o.targetLabel,
      title: o.title,
      description: o.description,
      severity: o.severity as OccurrenceDto["severity"],
      status: o.status,
      occurredOn: dateToCivil(o.occurredOn),
      resolvedOn: dateToCivil(o.resolvedOn),
      resolution: o.resolution,
      authorName: users.find((u) => u.id === o.createdById)?.name ?? null,
    }));
    return { items };
  });

  app.post<FarmParams>("/v1/farms/:farmId/occurrences", async (req, reply) => {
    const fctx = await farm(req, "events.write");
    const input = OccurrenceInput.parse(req.body);
    const mutationId = idempotencyKey(req);
    const receipt = await runIdempotent({
      db,
      fctx,
      mutationId,
      type: "occurrence.create",
      requestHash: stableHash(input),
      execute: async (tx) => {
        assertEventDate(input.occurredOn, { today: today(fctx) });
        let label = input.targetLabel ?? null;
        if (input.targetId) {
          const found =
            input.targetType === "animal"
              ? await tx.animal.findFirst({ where: { id: input.targetId, farmId: fctx.farmId } })
              : input.targetType === "group"
                ? await tx.group.findFirst({ where: { id: input.targetId, farmId: fctx.farmId } })
                : input.targetType === "pasture"
                  ? await tx.pasture.findFirst({
                      where: { id: input.targetId, farmId: fctx.farmId },
                    })
                  : await tx.asset.findFirst({
                      where: { id: input.targetId, farmId: fctx.farmId },
                    });
          if (!found)
            throw new HttpError(422, "target_not_found", "Alvo não encontrado nesta fazenda.");
          if ("name" in found && !label) label = found.name as string;
        }
        const o = await tx.occurrence.create({
          data: {
            id: input.id ?? mutationId,
            organizationId: fctx.organizationId,
            farmId: fctx.farmId,
            targetType: input.targetType,
            targetId: input.targetId ?? null,
            targetLabel: label,
            title: input.title,
            description: input.description ?? null,
            severity: input.severity,
            occurredOn: civilToDate(input.occurredOn),
            createdById: fctx.userId,
          },
        });
        if (input.targetType === "animal" && input.targetId) {
          await tx.animalEvent.create({
            data: {
              organizationId: fctx.organizationId,
              farmId: fctx.farmId,
              animalId: input.targetId,
              type: "occurrence",
              occurredOn: civilToDate(input.occurredOn),
              data: { occurrenceId: o.id, title: input.title, severity: input.severity },
              sourceMutationId: mutationId,
              actorUserId: fctx.userId,
            },
          });
        }
        return { entityId: o.id, version: null };
      },
    });
    return replyReceipt(reply, receipt);
  });

  app.post<IdParams>("/v1/farms/:farmId/occurrences/:id/resolve", async (req) => {
    const fctx = await farm(req, "events.write");
    const input = ResolveOccurrenceInput.parse(req.body);
    assertEventDate(input.resolvedOn, { today: today(fctx) });
    const r = await db.occurrence.updateMany({
      where: { id: req.params.id, farmId: fctx.farmId, status: "open" },
      data: {
        status: "resolved",
        resolution: input.resolution,
        resolvedOn: civilToDate(input.resolvedOn),
      },
    });
    if (!r.count) throw notFound("Ocorrência");
    return { ok: true };
  });

  // ---- Confinamento (T34) ----
  app.patch<IdParams>("/v1/farms/:farmId/groups/:id/pen", async (req) => {
    const fctx = await farm(req, "groups.manage", "confinement");
    const input = PenInput.parse(req.body);
    const r = await db.group.updateMany({
      where: { id: req.params.id, farmId: fctx.farmId },
      data: {
        isPen: input.isPen,
        penCapacity: input.isPen ? (input.penCapacity ?? null) : null,
        penStartedOn: input.isPen && input.penStartedOn ? civilToDate(input.penStartedOn) : null,
      },
    });
    if (!r.count) throw notFound("Lote");
    return { ok: true };
  });

  app.get<FarmParams>("/v1/farms/:farmId/confinement", async (req) => {
    const fctx = await farm(req, "animals.read", "confinement");
    const pens = await db.group.findMany({
      where: { farmId: fctx.farmId, isPen: true, archivedAt: null },
      orderBy: { name: "asc" },
    });
    const ids = pens.map((p) => p.id);
    const [heads, readings, feeds] = await Promise.all([
      db.animal.groupBy({
        by: ["groupId"],
        where: { groupId: { in: ids }, status: "active" },
        _count: { _all: true },
      }),
      db.bunkReading.findMany({
        where: { groupId: { in: ids } },
        orderBy: { date: "desc" },
        take: 500,
      }),
      db.feedingEvent.findMany({
        where: {
          groupId: { in: ids },
          voidedAt: null,
          date: { gte: new Date(civilToDate(today(fctx)).getTime() - 6 * 86_400_000) },
        },
      }),
    ]);
    return {
      today: today(fctx),
      pens: pens.map((p) => {
        const h = heads.find((x) => x.groupId === p.id)?._count._all ?? 0;
        const rs = readings.filter((r) => r.groupId === p.id);
        const fs = feeds.filter((f) => f.groupId === p.id);
        return {
          id: p.id,
          name: p.name,
          heads: h,
          capacity: p.penCapacity,
          startedOn: dateToCivil(p.penStartedOn),
          daysOnFeed: p.penStartedOn
            ? daysBetween(dateToCivil(p.penStartedOn)!, today(fctx))
            : null,
          lastReadings: rs
            .slice(0, 7)
            .map((r) => ({ date: dateToCivil(r.date), score: r.score, notes: r.notes })),
          feed7d: fs.reduce((s, f) => s + Number(f.quantity), 0),
          feedUnit: fs[0]?.unit ?? null,
          feedCost7dCents:
            fs.every((f) => f.costCents !== null) && fs.length
              ? fs.reduce((s, f) => s + Number(f.costCents), 0)
              : null,
        };
      }),
    };
  });

  app.post<FarmParams>("/v1/farms/:farmId/bunk-readings", async (req, reply) => {
    const fctx = await farm(req, "events.write", "confinement");
    const input = BunkReadingInput.parse(req.body);
    assertEventDate(input.date, { today: today(fctx) });
    const g = await db.group.findFirst({
      where: { id: input.groupId, farmId: fctx.farmId, isPen: true },
    });
    if (!g) throw new HttpError(422, "pen_not_found", "Baia não encontrada.");
    // Uma leitura por baia/dia: reenviar corrige a do dia (com trilha).
    const existing = await db.bunkReading.findUnique({
      where: { groupId_date: { groupId: g.id, date: civilToDate(input.date) } },
    });
    const r = await db.bunkReading.upsert({
      where: { groupId_date: { groupId: g.id, date: civilToDate(input.date) } },
      create: {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        groupId: g.id,
        date: civilToDate(input.date),
        score: input.score,
        notes: input.notes ?? null,
        createdById: fctx.userId,
      },
      update: { score: input.score, notes: input.notes ?? null },
    });
    if (existing && existing.score !== input.score) {
      await db.auditEntry.create({
        data: {
          organizationId: fctx.organizationId,
          farmId: fctx.farmId,
          actorUserId: fctx.userId,
          action: "bunk_reading.correct",
          entityType: "bunk_reading",
          entityId: r.id,
          data: { from: existing.score, to: input.score },
        },
      });
    }
    return reply.status(201).send({ id: r.id });
  });

  // ---- Abate e retorno do frigorífico (T36) ----
  app.post<IdParams>("/v1/farms/:farmId/commercial/:id/slaughter-return", async (req, reply) => {
    const fctx = await farm(req, "sales.manage", "slaughter");
    const input = SlaughterReturnInput.parse(req.body);
    assertEventDate(input.receivedOn, { today: today(fctx) });
    const t = await db.commercialTransaction.findFirst({
      where: { id: req.params.id, farmId: fctx.farmId, kind: "sale", voidedAt: null },
      include: { items: true },
    });
    if (!t) throw notFound("Venda");
    const byAnimal = new Map(t.items.map((i) => [i.animalId, i]));
    const items = input.items.map((i) => {
      const sold = byAnimal.get(i.animalId);
      if (!sold)
        throw new HttpError(422, "animal_not_in_sale", "Animal não pertence a esta venda.");
      const live = sold.liveWeightKg === null ? null : Number(sold.liveWeightKg);
      return {
        animalId: i.animalId,
        carcassKg: i.carcassKg,
        grade: i.grade ?? null,
        liveKg: live,
        ...realCarcass(live, i.carcassKg),
      };
    });
    const r = await db.slaughterReturn.upsert({
      where: { transactionId: t.id },
      create: {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        transactionId: t.id,
        receivedOn: civilToDate(input.receivedOn),
        plant: input.plant,
        pricePerArrobaCents: input.pricePerArroba
          ? BigInt(Math.round(input.pricePerArroba * 100))
          : null,
        finalTotalCents: input.finalTotal ? BigInt(Math.round(input.finalTotal * 100)) : null,
        notes: input.notes ?? null,
        items,
        createdById: fctx.userId,
      },
      update: {
        receivedOn: civilToDate(input.receivedOn),
        plant: input.plant,
        pricePerArrobaCents: input.pricePerArroba
          ? BigInt(Math.round(input.pricePerArroba * 100))
          : null,
        finalTotalCents: input.finalTotal ? BigInt(Math.round(input.finalTotal * 100)) : null,
        notes: input.notes ?? null,
        items,
      },
    });
    await db.auditEntry.create({
      data: {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        actorUserId: fctx.userId,
        action: "slaughter_return.save",
        entityType: "commercial_transaction",
        entityId: t.id,
        data: { items: items.length, finalTotal: input.finalTotal ?? null },
      },
    });
    return reply.status(201).send({ id: r.id, items });
  });

  app.get<IdParams>("/v1/farms/:farmId/commercial/:id/slaughter-return", async (req) => {
    const fctx = await farm(req, "finance.read", "slaughter");
    const r = await db.slaughterReturn.findFirst({
      where: { transactionId: req.params.id, farmId: fctx.farmId },
    });
    if (!r) return { return: null };
    return {
      return: {
        receivedOn: dateToCivil(r.receivedOn),
        plant: r.plant,
        pricePerArrobaCents: r.pricePerArrobaCents === null ? null : Number(r.pricePerArrobaCents),
        finalTotalCents: r.finalTotalCents === null ? null : Number(r.finalTotalCents),
        notes: r.notes,
        items: r.items,
      },
    };
  });

  // ---- Pastagem e chuva ----
  app.patch<IdParams>("/v1/farms/:farmId/pastures/:id/details", async (req) => {
    const fctx = await farm(req, "groups.manage", "pasture");
    const input = PastureUpdateInput.parse(req.body);
    const r = await db.pasture.updateMany({
      where: { id: req.params.id, farmId: fctx.farmId },
      data: {
        ...(input.areaHa !== undefined
          ? { areaHa: input.areaHa === null ? null : input.areaHa.toFixed(2) }
          : {}),
        ...(input.restTargetDays !== undefined ? { restTargetDays: input.restTargetDays } : {}),
      },
    });
    if (!r.count) throw notFound("Pasto");
    return { ok: true };
  });

  /**
   * Ocupação e descanso calculados das movimentações registradas (localização
   * declarada no manejo, não GPS do animal).
   */
  app.get<FarmParams>("/v1/farms/:farmId/pastures/status", async (req) => {
    const fctx = await farm(req, "animals.read", "pasture");
    const t = today(fctx);
    const [pastures, heads, moves, rain] = await Promise.all([
      db.pasture.findMany({
        where: { farmId: fctx.farmId, archivedAt: null },
        orderBy: { name: "asc" },
      }),
      db.animal.groupBy({
        by: ["pastureId"],
        where: { farmId: fctx.farmId, status: "active", pastureId: { not: null } },
        _count: { _all: true },
      }),
      db.animalEvent.findMany({
        where: { farmId: fctx.farmId, type: "moved" },
        orderBy: { occurredOn: "desc" },
        take: 5000,
        select: { occurredOn: true, data: true },
      }),
      db.rainRecord.findMany({
        where: {
          farmId: fctx.farmId,
          date: { gte: new Date(civilToDate(t).getTime() - 29 * 86_400_000) },
        },
      }),
    ]);
    return {
      today: t,
      rain30dMm:
        Math.round(rain.filter((r) => !r.pastureId).reduce((s, r) => s + Number(r.mm), 0) * 10) /
        10,
      pastures: pastures.map((p) => {
        const h = heads.find((x) => x.pastureId === p.id)?._count._all ?? 0;
        const touching = moves.filter((m) => {
          const d = m.data as {
            to?: { pastureId?: string | null };
            from?: { pastureId?: string | null };
          };
          return d.to?.pastureId === p.id || d.from?.pastureId === p.id;
        });
        const lastIn = touching.find(
          (m) => (m.data as { to?: { pastureId?: string } }).to?.pastureId === p.id,
        );
        const lastOut = touching.find(
          (m) => (m.data as { from?: { pastureId?: string } }).from?.pastureId === p.id,
        );
        const occupiedSince = h && lastIn ? dateToCivil(lastIn.occurredOn) : null;
        const restingSince = !h && lastOut ? dateToCivil(lastOut.occurredOn) : null;
        return {
          id: p.id,
          name: p.name,
          areaHa: p.areaHa === null ? null : Number(p.areaHa),
          restTargetDays: p.restTargetDays,
          heads: h,
          headsPerHa: p.areaHa && h ? Math.round((h / Number(p.areaHa)) * 100) / 100 : null,
          occupiedSince,
          occupiedDays: occupiedSince ? daysBetween(occupiedSince, t) : null,
          restingSince,
          restDays: restingSince ? daysBetween(restingSince, t) : null,
          rain30dMm:
            Math.round(
              rain.filter((r) => r.pastureId === p.id).reduce((s, r) => s + Number(r.mm), 0) * 10,
            ) / 10,
        };
      }),
    };
  });

  app.get<FarmParams>("/v1/farms/:farmId/rain", async (req) => {
    const fctx = await farm(req, "animals.read", "pasture");
    const rows = await db.rainRecord.findMany({
      where: { farmId: fctx.farmId },
      include: { pasture: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 120,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        date: dateToCivil(r.date),
        mm: Number(r.mm),
        pastureName: r.pasture?.name ?? null,
        notes: r.notes,
      })),
    };
  });

  app.post<FarmParams>("/v1/farms/:farmId/rain", async (req, reply) => {
    const fctx = await farm(req, "events.write", "pasture");
    const input = RainInput.parse(req.body);
    assertEventDate(input.date, { today: today(fctx) });
    if (input.pastureId) {
      const p = await db.pasture.findFirst({ where: { id: input.pastureId, farmId: fctx.farmId } });
      if (!p) throw notFound("Pasto");
    }
    const r = await db.rainRecord.create({
      data: {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        date: civilToDate(input.date),
        mm: input.mm.toFixed(1),
        pastureId: input.pastureId ?? null,
        notes: input.notes ?? null,
        createdById: fctx.userId,
      },
    });
    return reply.status(201).send({ id: r.id });
  });

  // ---- Patrimônio (T43) ----
  app.get<FarmParams>("/v1/farms/:farmId/assets", async (req) => {
    const fctx = await farm(req, "animals.read", "assets");
    const rows = await db.asset.findMany({
      where: { farmId: fctx.farmId, archivedAt: null },
      include: { maintenances: { orderBy: { date: "desc" }, take: 10 } },
      orderBy: { name: "asc" },
    });
    return {
      items: rows.map((a) => ({
        id: a.id,
        name: a.name,
        kind: a.kind,
        identifier: a.identifier,
        acquiredOn: dateToCivil(a.acquiredOn),
        notes: a.notes,
        maintenances: a.maintenances.map((m) => ({
          id: m.id,
          date: dateToCivil(m.date),
          description: m.description,
          costCents: m.costCents === null ? null : Number(m.costCents),
          nextDueOn: dateToCivil(m.nextDueOn),
        })),
      })),
    };
  });

  app.post<FarmParams>("/v1/farms/:farmId/assets", async (req, reply) => {
    const fctx = await farm(req, "groups.manage", "assets");
    const input = AssetInput.parse(req.body);
    const a = await db.asset.create({
      data: {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        name: input.name,
        kind: input.kind,
        identifier: input.identifier ?? null,
        acquiredOn: input.acquiredOn ? civilToDate(input.acquiredOn) : null,
        notes: input.notes ?? null,
      },
    });
    return reply.status(201).send({ id: a.id });
  });

  app.post<IdParams>("/v1/farms/:farmId/assets/:id/maintenance", async (req, reply) => {
    const fctx = await farm(req, "events.write", "assets");
    const input = MaintenanceInput.parse(req.body);
    assertEventDate(input.date, { today: today(fctx) });
    const a = await db.asset.findFirst({ where: { id: req.params.id, farmId: fctx.farmId } });
    if (!a) throw notFound("Bem");
    const m = await db.$transaction(async (tx) => {
      const m = await tx.assetMaintenance.create({
        data: {
          organizationId: fctx.organizationId,
          farmId: fctx.farmId,
          assetId: a.id,
          date: civilToDate(input.date),
          description: input.description,
          costCents: input.cost ? BigInt(Math.round(input.cost * 100)) : null,
          nextDueOn: input.nextDueOn ? civilToDate(input.nextDueOn) : null,
          createdById: fctx.userId,
        },
      });
      if (input.nextDueOn) {
        await createTask(tx, fctx, {
          type: "maintenance",
          title: `Manutenção: ${a.name}`,
          description: `Próxima manutenção após: ${input.description}`,
          dueOn: input.nextDueOn,
          animalIds: [],
          sourceType: "asset_maintenance",
          sourceId: m.id,
          dedupeKey: `maint:${m.id}`,
        });
      }
      await audit(tx, {
        organizationId: fctx.organizationId,
        farmId: fctx.farmId,
        actorUserId: fctx.userId,
        action: "asset.maintenance",
        entityType: "asset",
        entityId: a.id,
        data: { date: input.date },
      });
      return m;
    });
    return reply.status(201).send({ id: m.id });
  });
}
