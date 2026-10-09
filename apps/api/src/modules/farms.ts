import { CreateNamedRequest, type FarmTodaySummary, type Group } from "@rebania/contracts";
import { addDays, todayInTimezone } from "@rebania/domain";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { audit } from "../lib/audit.ts";
import { recordChange } from "../lib/changes.ts";
import type { AppContext } from "../lib/context.ts";
import { civilToDate } from "../lib/dates.ts";
import { HttpError } from "../lib/errors.ts";
import { accessibleFarms, requireFarm } from "../lib/tenant.ts";
import { requireAuth } from "../plugins/auth.ts";

type FarmParams = { Params: { farmId: string } };
type ItemParams = { Params: { farmId: string; id: string } };
type Kind = "group" | "pasture";

export function farmRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const farm = (req: FastifyRequest<FarmParams>, perm: Parameters<typeof requireFarm>[3]) =>
    requireFarm(db, requireAuth(req).userId, req.params.farmId, perm);

  app.get("/v1/farms", async (req) => {
    const { userId } = requireAuth(req);
    const access = await accessibleFarms(db, userId);
    return access.flatMap(({ membership, farms }) =>
      farms.map((f) => ({
        id: f.id,
        organizationId: f.organizationId,
        organizationName: membership.organization.name,
        name: f.name,
        timezone: f.timezone,
        role: membership.role,
      })),
    );
  });

  app.get<FarmParams>("/v1/farms/:farmId/summary", async (req) => {
    const fctx = await farm(req, "animals.read");
    const today = todayInTimezone(fctx.timezone, ctx.now());
    const active = { farmId: fctx.farmId, status: "active" as const };
    const [byCategory, bySex, groups, weighed, withoutId, lastChange] = await Promise.all([
      db.animal.groupBy({ by: ["category"], where: active, _count: { _all: true } }),
      db.animal.groupBy({ by: ["sex"], where: active, _count: { _all: true } }),
      db.group.count({ where: { farmId: fctx.farmId, archivedAt: null } }),
      db.weightMeasurement.findMany({
        where: {
          farmId: fctx.farmId,
          voidedAt: null,
          measuredOn: { gte: civilToDate(addDays(today, -30)) },
          animal: { status: "active" },
        },
        distinct: ["animalId"],
        select: { animalId: true },
      }),
      db.animal.count({ where: { ...active, identifiers: { none: { status: "active" } } } }),
      db.changeLog.findFirst({ where: { farmId: fctx.farmId }, orderBy: { seq: "desc" }, select: { createdAt: true } }),
    ]);
    const summary: FarmTodaySummary = {
      farmId: fctx.farmId,
      today,
      activeAnimals: byCategory.reduce((n, c) => n + c._count._all, 0),
      byCategory: Object.fromEntries(byCategory.map((c) => [c.category, c._count._all])),
      females: bySex.find((s) => s.sex === "female")?._count._all ?? 0,
      males: bySex.find((s) => s.sex === "male")?._count._all ?? 0,
      groups,
      weighedLast30Days: weighed.length,
      withoutIdentifier: withoutId,
      lastChangeAt: lastChange?.createdAt.toISOString() ?? null,
    };
    return summary;
  });

  for (const kind of ["group", "pasture"] as const) {
    const path = kind === "group" ? "groups" : "pastures";
    const label = kind === "group" ? "Lote" : "Pasto";

    const list = async (farmId: string): Promise<Group[]> => {
      const rows =
        kind === "group"
          ? await db.group.findMany({
              where: { farmId, archivedAt: null },
              include: { _count: { select: { animals: { where: { status: "active" } } } } },
              orderBy: { name: "asc" },
            })
          : await db.pasture.findMany({
              where: { farmId, archivedAt: null },
              include: { _count: { select: { animals: { where: { status: "active" } } } } },
              orderBy: { name: "asc" },
            });
      return rows.map((r) => ({
        id: r.id,
        farmId: r.farmId,
        name: r.name,
        notes: r.notes,
        activeAnimals: r._count.animals,
        archivedAt: r.archivedAt?.toISOString() ?? null,
      }));
    };

    app.get<FarmParams>(`/v1/farms/:farmId/${path}`, async (req) => {
      const fctx = await farm(req, "animals.read");
      return list(fctx.farmId);
    });

    app.post<FarmParams>(`/v1/farms/:farmId/${path}`, async (req, reply) => {
      const fctx = await farm(req, "groups.manage");
      const body = CreateNamedRequest.parse(req.body);
      const delegate = kind === "group" ? db.group : db.pasture;
      const dup = await (delegate as typeof db.group).findFirst({
        where: { farmId: fctx.farmId, archivedAt: null, name: { equals: body.name, mode: "insensitive" } },
      });
      if (dup) throw new HttpError(409, "duplicate_name", `${label} "${body.name}" já existe.`);
      const created = await db.$transaction(async (tx) => {
        const data = {
          organizationId: fctx.organizationId,
          farmId: fctx.farmId,
          name: body.name,
          notes: body.notes ?? null,
        };
        const row = kind === "group" ? await tx.group.create({ data }) : await tx.pasture.create({ data });
        await recordChange(tx, fctx, kind, row.id);
        await audit(tx, {
          organizationId: fctx.organizationId,
          farmId: fctx.farmId,
          actorUserId: fctx.userId,
          action: `${kind}.created`,
          entityType: kind,
          entityId: row.id,
        });
        return row;
      });
      return reply.status(201).send({
        id: created.id,
        farmId: created.farmId,
        name: created.name,
        notes: created.notes,
        activeAnimals: 0,
        archivedAt: null,
      } satisfies Group);
    });

    app.post<ItemParams>(`/v1/farms/:farmId/${path}/:id/archive`, async (req, reply) => {
      const fctx = await farm(req as unknown as FastifyRequest<FarmParams>, "groups.manage");
      const id = req.params.id;
      const inUse = await db.animal.count({
        where: { farmId: fctx.farmId, status: "active", ...(kind === "group" ? { groupId: id } : { pastureId: id }) },
      });
      if (inUse > 0) {
        throw new HttpError(422, `${kind}_not_empty`, `${label} ainda tem ${inUse} animal(is) ativo(s). Mova-os antes.`);
      }
      await db.$transaction(async (tx) => {
        const where = { id, farmId: fctx.farmId, archivedAt: null };
        const data = { archivedAt: ctx.now() };
        const r = kind === "group" ? await tx.group.updateMany({ where, data }) : await tx.pasture.updateMany({ where, data });
        if (r.count !== 1) throw new HttpError(404, "not_found", `${label} não encontrado.`);
        await recordChange(tx, fctx, kind as Kind, id, "delete");
      });
      return reply.status(204).send();
    });
  }
}
