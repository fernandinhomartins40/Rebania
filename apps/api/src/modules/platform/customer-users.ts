import type { Prisma } from "@rebania/db";
import { queueEmail } from "@rebania/saas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../lib/audit.ts";
import type { AppContext } from "../../lib/context.ts";
import { HttpError, notFound } from "../../lib/errors.ts";
import { requireStaff } from "../../lib/staff.ts";
import { issuePasswordLink } from "../../lib/password-reset.ts";

const Reason = z.object({ reason: z.string().trim().min(3).max(300) });

/** Usuários dos clientes vistos pelo suporte: sessões, redefinição de senha e desativação. */
export function customerUserRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;

  /** Só contas de cliente; contas da equipe são geridas em Equipe. */
  async function customerUser(userId: string) {
    const u = await db.user.findUnique({
      where: { id: userId },
      include: {
        platformAdmin: true,
        memberships: { where: { revokedAt: null }, select: { organizationId: true } },
      },
    });
    if (!u || u.platformAdmin) throw notFound("Usuário");
    return u;
  }

  async function auditForOrgs(
    orgIds: string[],
    entry: { actorUserId: string; action: string; userId: string; data?: Record<string, unknown> },
  ) {
    for (const organizationId of orgIds.length ? orgIds : [null])
      await audit(db, {
        organizationId,
        actorUserId: entry.actorUserId,
        action: entry.action,
        entityType: "user",
        entityId: entry.userId,
        data: (entry.data ?? {}) as Prisma.InputJsonValue,
      });
  }

  app.get<{ Params: { id: string } }>("/v1/platform/customers/:id/users", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const org = await db.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw notFound("Cliente");
    const members = await db.membership.findMany({
      where: { organizationId: org.id, revokedAt: null },
      include: {
        user: {
          select: { id: true, name: true, email: true, disabledAt: true, mustChangePassword: true },
        },
        farms: { select: { farmId: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const userIds = members.map((m) => m.userId);
    const now = ctx.now();
    const [lastSeen, active] = await Promise.all([
      db.authSession.groupBy({
        by: ["userId"],
        where: { userId: { in: userIds } },
        _max: { lastUsedAt: true },
      }),
      db.authSession.groupBy({
        by: ["userId"],
        where: {
          userId: { in: userIds },
          revokedAt: null,
          OR: [{ accessExpiresAt: { gt: now } }, { refreshExpiresAt: { gt: now } }],
        },
        _count: { _all: true },
      }),
    ]);
    return {
      items: members.map((m) => ({
        userId: m.userId,
        membershipId: m.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        allFarms: m.allFarms,
        farms: m.farms.length,
        disabled: Boolean(m.user.disabledAt),
        mustChangePassword: m.user.mustChangePassword,
        memberSince: m.createdAt.toISOString(),
        lastSeenAt:
          lastSeen.find((l) => l.userId === m.userId)?._max.lastUsedAt?.toISOString() ?? null,
        activeSessions: active.find((a) => a.userId === m.userId)?._count._all ?? 0,
      })),
    };
  });

  app.post<{ Params: { userId: string } }>(
    "/v1/platform/users/:userId/revoke-sessions",
    async (req) => {
      const staff = await requireStaff(ctx, req, "customer_users.manage");
      const { reason } = Reason.parse(req.body);
      const u = await customerUser(req.params.userId);
      const r = await db.authSession.updateMany({
        where: { userId: u.id, revokedAt: null },
        data: { revokedAt: ctx.now(), revokedReason: "support_revoked" },
      });
      await auditForOrgs(
        u.memberships.map((m) => m.organizationId),
        {
          actorUserId: staff.userId,
          action: "support.sessions_revoked",
          userId: u.id,
          data: { reason, count: r.count },
        },
      );
      return { ok: true, revoked: r.count };
    },
  );

  /**
   * Link de redefinição de senha por e-mail. Sem e-mail configurado, o link volta para a
   * equipe entregar por outro canal (uso único, 1 hora).
   */
  app.post<{ Params: { userId: string } }>(
    "/v1/platform/users/:userId/password-link",
    async (req) => {
      const staff = await requireStaff(ctx, req, "customer_users.manage");
      const { reason } = Reason.parse(req.body);
      const u = await customerUser(req.params.userId);
      if (u.disabledAt) throw new HttpError(409, "user_disabled", "Usuário desativado.");
      const url = await issuePasswordLink(ctx, u.id, staff.userId);
      const emailId = await queueEmail(db, {
        to: u.email,
        template: "password_reset",
        baseUrl: config.webBaseUrl,
        organizationId: u.memberships[0]?.organizationId ?? null,
        data: { name: u.name, url, requestedByStaff: true },
      });
      const m = emailId ? await db.emailMessage.findUnique({ where: { id: emailId } }) : null;
      const emailQueued = m?.status === "queued";
      await auditForOrgs(
        u.memberships.map((x) => x.organizationId),
        {
          actorUserId: staff.userId,
          action: "support.password_link",
          userId: u.id,
          data: { reason, emailQueued },
        },
      );
      return { ok: true, emailQueued, url: emailQueued ? null : url };
    },
  );

  app.post<{ Params: { userId: string } }>("/v1/platform/users/:userId/disable", async (req) => {
    const staff = await requireStaff(ctx, req, "customer_users.manage");
    const { reason } = Reason.parse(req.body);
    const u = await customerUser(req.params.userId);
    if (u.disabledAt) return { ok: true };
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { disabledAt: ctx.now() } });
      await tx.authSession.updateMany({
        where: { userId: u.id, revokedAt: null },
        data: { revokedAt: ctx.now(), revokedReason: "user_disabled" },
      });
    });
    await auditForOrgs(
      u.memberships.map((m) => m.organizationId),
      {
        actorUserId: staff.userId,
        action: "support.user_disabled",
        userId: u.id,
        data: { reason },
      },
    );
    return { ok: true, organizations: u.memberships.length };
  });

  app.post<{ Params: { userId: string } }>("/v1/platform/users/:userId/enable", async (req) => {
    const staff = await requireStaff(ctx, req, "customer_users.manage");
    const { reason } = Reason.parse(req.body);
    const u = await customerUser(req.params.userId);
    await db.user.update({ where: { id: u.id }, data: { disabledAt: null } });
    await auditForOrgs(
      u.memberships.map((m) => m.organizationId),
      { actorUserId: staff.userId, action: "support.user_enabled", userId: u.id, data: { reason } },
    );
    return { ok: true };
  });
}
