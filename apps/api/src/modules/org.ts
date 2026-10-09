import { CreateFarmRequest, CreateInvitationRequest } from "@rebania/contracts";
import { canAssignRole } from "@rebania/domain";
import type { FastifyInstance } from "fastify";
import { audit } from "../lib/audit.ts";
import type { AppContext } from "../lib/context.ts";
import { randomToken, sha256 } from "../lib/crypto.ts";
import { forbidden, HttpError } from "../lib/errors.ts";
import { requireOrg } from "../lib/tenant.ts";
import { requireAuth } from "../plugins/auth.ts";

type OrgParams = { Params: { orgId: string } };

export function orgRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;

  app.get<OrgParams>("/v1/orgs/:orgId/members", async (req) => {
    const { userId } = requireAuth(req);
    await requireOrg(db, userId, req.params.orgId, "members.read");
    const members = await db.membership.findMany({
      where: { organizationId: req.params.orgId, revokedAt: null },
      include: { user: true, farms: true },
      orderBy: { createdAt: "asc" },
    });
    return members.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      allFarms: m.allFarms,
      farmIds: m.farms.map((f) => f.farmId),
      createdAt: m.createdAt.toISOString(),
    }));
  });

  app.post<{ Params: { orgId: string; membershipId: string } }>(
    "/v1/orgs/:orgId/members/:membershipId/revoke",
    async (req, reply) => {
      const { userId } = requireAuth(req);
      const org = await requireOrg(db, userId, req.params.orgId, "org.manage");
      if (org.membershipId === req.params.membershipId) {
        throw new HttpError(422, "cannot_revoke_self", "Você não pode remover o próprio acesso.");
      }
      await db.$transaction(async (tx) => {
        const r = await tx.membership.updateMany({
          where: {
            id: req.params.membershipId,
            organizationId: org.organizationId,
            revokedAt: null,
          },
          data: { revokedAt: ctx.now() },
        });
        if (r.count !== 1) throw new HttpError(404, "not_found", "Membro não encontrado.");
        await audit(tx, {
          organizationId: org.organizationId,
          actorUserId: userId,
          action: "membership.revoked",
          entityType: "membership",
          entityId: req.params.membershipId,
          ip: req.ip,
        });
      });
      return reply.status(204).send();
    },
  );

  app.get<OrgParams>("/v1/orgs/:orgId/invitations", async (req) => {
    const { userId } = requireAuth(req);
    await requireOrg(db, userId, req.params.orgId, "members.invite");
    const list = await db.invitation.findMany({
      where: {
        organizationId: req.params.orgId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: ctx.now() },
      },
      orderBy: { createdAt: "desc" },
    });
    return list.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role,
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    }));
  });

  app.post<OrgParams>("/v1/orgs/:orgId/invitations", async (req, reply) => {
    const { userId } = requireAuth(req);
    const org = await requireOrg(db, userId, req.params.orgId, "members.invite");
    const body = CreateInvitationRequest.parse(req.body);
    if (!canAssignRole(org.role, body.role)) throw forbidden();
    if (body.allFarms && org.role !== "owner") throw forbidden();
    if (!body.allFarms) {
      const count = await db.farm.count({
        where: { id: { in: body.farmIds }, organizationId: org.organizationId, archivedAt: null },
      });
      if (count !== new Set(body.farmIds).size) {
        throw new HttpError(422, "invalid_farms", "Fazenda inválida para esta organização.");
      }
    }
    const token = randomToken();
    const email = body.email.trim().toLowerCase();
    const inv = await db.$transaction(async (tx) => {
      // Um convite pendente por e-mail: o anterior é revogado.
      await tx.invitation.updateMany({
        where: { organizationId: org.organizationId, email, acceptedAt: null, revokedAt: null },
        data: { revokedAt: ctx.now() },
      });
      const created = await tx.invitation.create({
        data: {
          organizationId: org.organizationId,
          email,
          role: body.role,
          allFarms: body.allFarms,
          farmIds: body.allFarms ? [] : [...new Set(body.farmIds)],
          tokenHash: sha256(token),
          expiresAt: new Date(ctx.now().getTime() + config.invitationTtlMs),
          invitedById: userId,
        },
      });
      await audit(tx, {
        organizationId: org.organizationId,
        actorUserId: userId,
        action: "invitation.created",
        entityType: "invitation",
        entityId: created.id,
        data: { email, role: body.role },
        ip: req.ip,
      });
      return created;
    });
    return reply.status(201).send({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt.toISOString(),
      // Token no fragmento (#): não vai para logs de servidor/proxy.
      acceptUrl: `${config.webBaseUrl}/convite#token=${token}`,
    });
  });

  app.post<{ Params: { orgId: string; invitationId: string } }>(
    "/v1/orgs/:orgId/invitations/:invitationId/revoke",
    async (req, reply) => {
      const { userId } = requireAuth(req);
      const org = await requireOrg(db, userId, req.params.orgId, "members.invite");
      const r = await db.invitation.updateMany({
        where: {
          id: req.params.invitationId,
          organizationId: org.organizationId,
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: ctx.now() },
      });
      if (r.count !== 1) throw new HttpError(404, "not_found", "Convite não encontrado.");
      return reply.status(204).send();
    },
  );

  app.post<OrgParams>("/v1/orgs/:orgId/farms", async (req, reply) => {
    const { userId } = requireAuth(req);
    const org = await requireOrg(db, userId, req.params.orgId, "farms.manage");
    const body = CreateFarmRequest.parse(req.body);
    const farm = await db.$transaction(async (tx) => {
      const f = await tx.farm.create({
        data: { organizationId: org.organizationId, name: body.name, timezone: body.timezone },
      });
      await audit(tx, {
        organizationId: org.organizationId,
        farmId: f.id,
        actorUserId: userId,
        action: "farm.created",
        entityType: "farm",
        entityId: f.id,
        ip: req.ip,
      });
      return f;
    });
    return reply.status(201).send({
      id: farm.id,
      organizationId: farm.organizationId,
      name: farm.name,
      timezone: farm.timezone,
    });
  });
}
