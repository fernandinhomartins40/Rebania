import {
  AcceptInvitationRequest,
  LoginRequest,
  RefreshRequest,
  type LoginResponse,
  type MeResponse,
} from "@rebania/contracts";
import { ROLE_PERMISSIONS } from "@rebania/domain";
import type { FastifyInstance } from "fastify";
import { audit } from "../lib/audit.ts";
import type { AppContext } from "../lib/context.ts";
import {
  DUMMY_PASSWORD_HASH,
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from "../lib/crypto.ts";
import { HttpError, isUniqueViolation, unauthorized } from "../lib/errors.ts";
import { accessibleFarms } from "../lib/tenant.ts";
import { clearSessionCookie, requireAuth, setSessionCookie } from "../plugins/auth.ts";

const LOGIN_RATE = { max: 10, timeWindow: "1 minute" };

export function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;

  async function openSession(
    userId: string,
    channel: "web" | "mobile",
    meta: { deviceLabel?: string; userAgent?: string },
  ) {
    const now = ctx.now();
    const access = randomToken();
    const refresh = channel === "mobile" ? randomToken(48) : null;
    const accessExpiresAt = new Date(
      now.getTime() + (channel === "web" ? config.webSessionTtlMs : config.mobileAccessTtlMs),
    );
    const refreshExpiresAt = refresh ? new Date(now.getTime() + config.mobileRefreshTtlMs) : null;
    const session = await db.authSession.create({
      data: {
        userId,
        channel,
        accessHash: sha256(access),
        accessExpiresAt,
        refreshHash: refresh ? sha256(refresh) : null,
        refreshExpiresAt,
        deviceLabel: meta.deviceLabel ?? null,
        userAgent: meta.userAgent?.slice(0, 300) ?? null,
        lastUsedAt: now,
      },
    });
    return { session, access, refresh, accessExpiresAt, refreshExpiresAt };
  }

  app.post("/v1/auth/login", { config: { rateLimit: LOGIN_RATE } }, async (req, reply) => {
    const body = LoginRequest.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const user = await db.user.findUnique({ where: { email } });
    const ok = await verifyPassword(body.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !ok || user.disabledAt) {
      throw new HttpError(401, "invalid_credentials", "E-mail ou senha incorretos.");
    }
    const s = await openSession(user.id, body.channel, {
      deviceLabel: body.deviceLabel,
      userAgent: req.headers["user-agent"],
    });
    await audit(db, {
      actorUserId: user.id,
      action: "auth.login",
      entityType: "session",
      entityId: s.session.id,
      data: { channel: body.channel },
      ip: req.ip,
    });
    const response: LoginResponse = { user: { id: user.id, name: user.name, email: user.email } };
    if (body.channel === "web") {
      setSessionCookie(reply, ctx, s.access);
    } else {
      response.tokens = {
        accessToken: s.access,
        accessExpiresAt: s.accessExpiresAt.toISOString(),
        refreshToken: s.refresh!,
        refreshExpiresAt: s.refreshExpiresAt!.toISOString(),
      };
    }
    return response;
  });

  /** Mobile: rotação de refresh token. O token antigo deixa de valer imediatamente. */
  app.post("/v1/auth/refresh", { config: { rateLimit: LOGIN_RATE } }, async (req) => {
    const { refreshToken } = RefreshRequest.parse(req.body);
    const now = ctx.now();
    const session = await db.authSession.findUnique({
      where: { refreshHash: sha256(refreshToken) },
      include: { user: true },
    });
    if (
      !session ||
      session.revokedAt ||
      !session.refreshExpiresAt ||
      session.refreshExpiresAt <= now ||
      session.user.disabledAt
    ) {
      throw unauthorized();
    }
    const access = randomToken();
    const refresh = randomToken(48);
    const accessExpiresAt = new Date(now.getTime() + config.mobileAccessTtlMs);
    const refreshExpiresAt = new Date(now.getTime() + config.mobileRefreshTtlMs);
    // Atualização condicional evita duas rotações concorrentes com o mesmo refresh.
    const updated = await db.authSession.updateMany({
      where: { id: session.id, refreshHash: sha256(refreshToken), revokedAt: null },
      data: {
        accessHash: sha256(access),
        accessExpiresAt,
        refreshHash: sha256(refresh),
        refreshExpiresAt,
        lastUsedAt: now,
      },
    });
    if (updated.count !== 1) throw unauthorized();
    return {
      user: { id: session.user.id, name: session.user.name, email: session.user.email },
      tokens: {
        accessToken: access,
        accessExpiresAt: accessExpiresAt.toISOString(),
        refreshToken: refresh,
        refreshExpiresAt: refreshExpiresAt.toISOString(),
      },
    } satisfies LoginResponse;
  });

  app.post("/v1/auth/logout", async (req, reply) => {
    if (req.auth) {
      await db.authSession.update({
        where: { id: req.auth.sessionId },
        data: { revokedAt: ctx.now(), revokedReason: "logout" },
      });
    }
    clearSessionCookie(reply, ctx);
    return reply.status(204).send();
  });

  app.get("/v1/auth/me", async (req) => {
    const { userId } = requireAuth(req);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const access = await accessibleFarms(db, userId);
    const me: MeResponse = {
      user: { id: user.id, name: user.name, email: user.email },
      memberships: access.map(({ membership: m, farms }) => ({
        organizationId: m.organizationId,
        organizationName: m.organization.name,
        role: m.role,
        permissions: [...ROLE_PERMISSIONS[m.role]],
        allFarms: m.allFarms,
        farms: farms.map((f) => ({
          id: f.id,
          organizationId: f.organizationId,
          name: f.name,
          timezone: f.timezone,
        })),
      })),
    };
    return me;
  });

  /** Sessões ativas do próprio usuário (para revogar aparelhos). */
  app.get("/v1/auth/sessions", async (req) => {
    const { userId, sessionId } = requireAuth(req);
    const sessions = await db.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        OR: [{ accessExpiresAt: { gt: ctx.now() } }, { refreshExpiresAt: { gt: ctx.now() } }],
      },
      orderBy: { lastUsedAt: "desc" },
    });
    return sessions.map((s) => ({
      id: s.id,
      channel: s.channel,
      deviceLabel: s.deviceLabel,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      current: s.id === sessionId,
    }));
  });

  app.post<{ Params: { id: string } }>("/v1/auth/sessions/:id/revoke", async (req, reply) => {
    const { userId } = requireAuth(req);
    const r = await db.authSession.updateMany({
      where: { id: req.params.id, userId, revokedAt: null },
      data: { revokedAt: ctx.now(), revokedReason: "user_revoked" },
    });
    if (r.count === 0) throw new HttpError(404, "not_found", "Sessão não encontrada.");
    return reply.status(204).send();
  });

  // ---- Convites -------------------------------------------------------------

  async function findValidInvitation(token: string) {
    const inv = await db.invitation.findUnique({
      where: { tokenHash: sha256(token) },
      include: { organization: true },
    });
    if (!inv || inv.revokedAt || inv.acceptedAt || inv.expiresAt <= ctx.now()) {
      throw new HttpError(410, "invitation_invalid", "Convite inválido, expirado ou já utilizado.");
    }
    return inv;
  }

  app.get<{ Params: { token: string } }>(
    "/v1/auth/invitations/:token",
    { config: { rateLimit: LOGIN_RATE } },
    async (req) => {
      const inv = await findValidInvitation(req.params.token);
      const existing = await db.user.findUnique({
        where: { email: inv.email },
        select: { id: true },
      });
      return {
        organizationName: inv.organization.name,
        email: inv.email,
        role: inv.role,
        expiresAt: inv.expiresAt.toISOString(),
        existingUser: Boolean(existing),
      };
    },
  );

  app.post("/v1/auth/invitations/accept", { config: { rateLimit: LOGIN_RATE } }, async (req) => {
    const body = AcceptInvitationRequest.parse(req.body);
    const inv = await findValidInvitation(body.token);
    const existing = await db.user.findUnique({ where: { email: inv.email } });
    if (existing) {
      if (!(await verifyPassword(body.password, existing.passwordHash))) {
        throw new HttpError(401, "invalid_credentials", "Senha incorreta para este e-mail.");
      }
    } else if (!body.name) {
      throw new HttpError(400, "name_required", "Informe seu nome.");
    }
    const passwordHash = existing ? null : await hashPassword(body.password);
    try {
      const userId = await db.$transaction(async (tx) => {
        // Consome o convite de forma condicional: aceita uma única vez.
        const consumed = await tx.invitation.updateMany({
          where: { id: inv.id, acceptedAt: null, revokedAt: null },
          data: { acceptedAt: ctx.now() },
        });
        if (consumed.count !== 1) {
          throw new HttpError(410, "invitation_invalid", "Convite já utilizado.");
        }
        const user =
          existing ??
          (await tx.user.create({
            data: { email: inv.email, name: body.name!, passwordHash: passwordHash! },
          }));
        const prior = await tx.membership.findUnique({
          where: { organizationId_userId: { organizationId: inv.organizationId, userId: user.id } },
        });
        if (prior && !prior.revokedAt) {
          throw new HttpError(409, "already_member", "Você já faz parte desta organização.");
        }
        const membership = prior
          ? await tx.membership.update({
              where: { id: prior.id },
              data: { role: inv.role, allFarms: inv.allFarms, revokedAt: null },
            })
          : await tx.membership.create({
              data: {
                organizationId: inv.organizationId,
                userId: user.id,
                role: inv.role,
                allFarms: inv.allFarms,
              },
            });
        await tx.membershipFarm.deleteMany({ where: { membershipId: membership.id } });
        if (!inv.allFarms && inv.farmIds.length) {
          await tx.membershipFarm.createMany({
            data: inv.farmIds.map((farmId) => ({
              membershipId: membership.id,
              farmId,
              organizationId: inv.organizationId,
            })),
          });
        }
        await audit(tx, {
          organizationId: inv.organizationId,
          actorUserId: user.id,
          action: "invitation.accepted",
          entityType: "membership",
          entityId: membership.id,
          data: { role: inv.role },
          ip: req.ip,
        });
        return user.id;
      });
      return { ok: true, userId };
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new HttpError(409, "already_member", "Este e-mail já foi cadastrado. Tente entrar.");
      }
      throw err;
    }
  });
}
