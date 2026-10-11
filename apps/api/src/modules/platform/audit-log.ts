import type { Prisma } from "@rebania/db";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppContext } from "../../lib/context.ts";
import { requireStaff } from "../../lib/staff.ts";

const Query = z.object({
  orgId: z.uuid().optional(),
  actorId: z.uuid().optional(),
  action: z.string().trim().max(60).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  staffOnly: z.enum(["true", "false"]).optional(),
  before: z.iso.datetime().optional(),
});

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Registro de auditoria (append-only) com filtros e exportação CSV (separador ";"). */
export function auditLogRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  async function search(q: z.infer<typeof Query>, take: number) {
    const staffIds =
      q.staffOnly === "true"
        ? (await db.platformAdmin.findMany({ select: { userId: true } })).map((s) => s.userId)
        : null;
    const where: Prisma.AuditEntryWhereInput = {
      ...(q.orgId ? { organizationId: q.orgId } : {}),
      ...(q.actorId
        ? { actorUserId: q.actorId }
        : staffIds
          ? { actorUserId: { in: staffIds } }
          : {}),
      ...(q.action ? { action: { startsWith: q.action } } : {}),
      ...(q.from || q.to || q.before
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
              ...(q.before ? { lt: new Date(q.before) } : {}),
            },
          }
        : {}),
    };
    const rows = await db.auditEntry.findMany({ where, orderBy: { createdAt: "desc" }, take });
    const ids = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))];
    const orgIds = [...new Set(rows.map((r) => r.organizationId).filter((x): x is string => !!x))];
    const [users, orgs] = await Promise.all([
      db.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, email: true, platformAdmin: { select: { userId: true } } },
      }),
      db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }),
    ]);
    const u = new Map(users.map((x) => [x.id, x]));
    const o = new Map(orgs.map((x) => [x.id, x.name]));
    return rows.map((r) => {
      const a = r.actorUserId ? u.get(r.actorUserId) : undefined;
      return {
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        organizationId: r.organizationId,
        organizationName: r.organizationId ? (o.get(r.organizationId) ?? null) : null,
        farmId: r.farmId,
        actor: a
          ? { id: a.id, name: a.name, email: a.email, staff: Boolean(a.platformAdmin) }
          : null,
        data: r.data,
        ip: r.ip,
      };
    });
  }

  app.get("/v1/platform/audit", async (req) => {
    await requireStaff(ctx, req, "audit.read");
    return { items: await search(Query.parse(req.query), 200) };
  });

  app.get("/v1/platform/audit.csv", async (req, reply) => {
    await requireStaff(ctx, req, "audit.read");
    const rows = await search(Query.parse(req.query), 10_000);
    const header = [
      "data_hora",
      "acao",
      "entidade",
      "id_entidade",
      "cliente",
      "autor",
      "autor_email",
      "equipe",
      "ip",
      "dados",
    ];
    const lines = rows.map((r) =>
      [
        r.createdAt,
        r.action,
        r.entityType,
        r.entityId,
        r.organizationName,
        r.actor?.name,
        r.actor?.email,
        r.actor ? (r.actor.staff ? "sim" : "não") : "",
        r.ip,
        r.data,
      ]
        .map(csvCell)
        .join(";"),
    );
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="auditoria-rebania.csv"')
      .send(`﻿${[header.join(";"), ...lines].join("\n")}`);
  });
}
