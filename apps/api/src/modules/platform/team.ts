import {
  assertKeepsAnAdmin,
  assertPlatformAccountSeparation,
  PLATFORM_ROLE_LABEL,
  PLATFORM_ROLE_PERMISSIONS,
  PLATFORM_ROLES,
} from "@rebania/domain";
import { queueEmail } from "@rebania/saas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../lib/audit.ts";
import type { AppContext } from "../../lib/context.ts";
import { hashPassword, randomToken } from "../../lib/crypto.ts";
import { HttpError, notFound } from "../../lib/errors.ts";
import { issuePasswordLink } from "../../lib/password-reset.ts";
import { requireStaff } from "../../lib/staff.ts";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../../lib/totp.ts";
import { requireAuth } from "../../plugins/auth.ts";

const MFA_RATE = { max: 10, timeWindow: "1 minute" };
export function teamRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  /** Quem está no console: papel, permissões e situação da verificação em duas etapas. */
  app.get("/v1/platform/me", async (req) => {
    const { userId, sessionId } = requireAuth(req);
    const admin = await db.platformAdmin.findUnique({ where: { userId } });
    if (!admin) return { isPlatformAdmin: false };
    const session = await db.authSession.findUnique({
      where: { id: sessionId },
      select: { mfaVerifiedAt: true },
    });
    return {
      isPlatformAdmin: true,
      role: admin.role,
      permissions: [...PLATFORM_ROLE_PERMISSIONS[admin.role]],
      mfa: {
        available: Boolean(ctx.secrets?.available),
        enrolled: Boolean(admin.mfaEnabledAt),
        verified: Boolean(session?.mfaVerifiedAt),
      },
    };
  });

  // ---- Verificação em duas etapas (TOTP) ----
  app.post("/v1/platform/mfa/setup", { config: { rateLimit: MFA_RATE } }, async (req) => {
    const staff = await requireStaff(ctx, req, null, { skipMfa: true });
    if (!ctx.secrets?.available)
      throw new HttpError(503, "secrets_unavailable", "PLATFORM_SECRETS_KEY não configurada.");
    const admin = await db.platformAdmin.findUniqueOrThrow({
      where: { userId: staff.userId },
      include: { user: { select: { email: true } } },
    });
    if (admin.mfaEnabledAt)
      throw new HttpError(409, "mfa_already_enabled", "Verificação em duas etapas já ativa.");
    const secret = generateTotpSecret();
    await db.platformAdmin.update({
      where: { userId: staff.userId },
      data: { mfaSecretEnc: ctx.secrets.seal(secret) },
    });
    return { secret, otpauthUri: otpauthUri(secret, admin.user.email) };
  });

  const CodeBody = z.object({ code: z.string().trim().min(6).max(8) });

  app.post("/v1/platform/mfa/enable", { config: { rateLimit: MFA_RATE } }, async (req) => {
    const staff = await requireStaff(ctx, req, null, { skipMfa: true });
    const { code } = CodeBody.parse(req.body);
    const admin = await db.platformAdmin.findUniqueOrThrow({ where: { userId: staff.userId } });
    if (admin.mfaEnabledAt || !admin.mfaSecretEnc || !ctx.secrets?.available)
      throw new HttpError(409, "mfa_setup_required", "Inicie a configuração novamente.");
    if (!verifyTotp(ctx.secrets.open(admin.mfaSecretEnc), code, ctx.now()))
      throw new HttpError(422, "invalid_code", "Código incorreto. Confira o relógio do celular.");
    const now = ctx.now();
    await db.$transaction(async (tx) => {
      await tx.platformAdmin.update({
        where: { userId: staff.userId },
        data: { mfaEnabledAt: now },
      });
      await tx.authSession.update({ where: { id: staff.sessionId }, data: { mfaVerifiedAt: now } });
      await audit(tx, {
        actorUserId: staff.userId,
        action: "platform.mfa_enabled",
        entityType: "user",
        entityId: staff.userId,
      });
    });
    return { ok: true };
  });

  app.post("/v1/platform/mfa/verify", { config: { rateLimit: MFA_RATE } }, async (req) => {
    const staff = await requireStaff(ctx, req, null, { skipMfa: true });
    const { code } = CodeBody.parse(req.body);
    const admin = await db.platformAdmin.findUniqueOrThrow({ where: { userId: staff.userId } });
    if (!admin.mfaEnabledAt || !admin.mfaSecretEnc || !ctx.secrets?.available)
      throw new HttpError(409, "mfa_not_enrolled", "Verificação em duas etapas não configurada.");
    if (!verifyTotp(ctx.secrets.open(admin.mfaSecretEnc), code, ctx.now())) {
      await audit(db, {
        actorUserId: staff.userId,
        action: "platform.mfa_failed",
        entityType: "user",
        entityId: staff.userId,
        ip: req.ip,
      });
      throw new HttpError(422, "invalid_code", "Código incorreto.");
    }
    await db.authSession.update({
      where: { id: staff.sessionId },
      data: { mfaVerifiedAt: ctx.now() },
    });
    return { ok: true };
  });

  /** Diretório enxuto (nome e papel) para escolher responsáveis; não exige gerir a equipe. */
  app.get("/v1/platform/staff", async (req) => {
    await requireStaff(ctx, req, "customers.read");
    const rows = await db.platformAdmin.findMany({
      where: { user: { disabledAt: null } },
      include: { user: { select: { name: true } } },
      orderBy: { grantedAt: "asc" },
    });
    return { items: rows.map((r) => ({ userId: r.userId, name: r.user.name, role: r.role })) };
  });

  // ---- Equipe da plataforma ----
  app.get("/v1/platform/team", async (req) => {
    await requireStaff(ctx, req, "team.manage");
    const rows = await db.platformAdmin.findMany({
      include: { user: { select: { id: true, name: true, email: true, disabledAt: true } } },
      orderBy: { grantedAt: "asc" },
    });
    const lastSeen = await db.authSession.groupBy({
      by: ["userId"],
      where: { userId: { in: rows.map((r) => r.userId) } },
      _max: { lastUsedAt: true },
    });
    return {
      roles: PLATFORM_ROLES.map((r) => ({ id: r, label: PLATFORM_ROLE_LABEL[r] })),
      items: rows.map((r) => ({
        userId: r.userId,
        name: r.user.name,
        email: r.user.email,
        role: r.role,
        mfaEnabled: Boolean(r.mfaEnabledAt),
        disabled: Boolean(r.user.disabledAt),
        grantedAt: r.grantedAt.toISOString(),
        lastSeenAt:
          lastSeen.find((l) => l.userId === r.userId)?._max.lastUsedAt?.toISOString() ?? null,
      })),
    };
  });

  /** Nova pessoa na equipe: conta própria, sem organização (D-12). */
  app.post("/v1/platform/team", async (req, reply) => {
    const staff = await requireStaff(ctx, req, "team.manage");
    const body = z
      .object({
        email: z.email().max(254),
        name: z.string().trim().min(2).max(120),
        role: z.enum(PLATFORM_ROLES),
      })
      .parse(req.body);
    const email = body.email.trim().toLowerCase();
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      const [isStaff, memberships] = await Promise.all([
        db.platformAdmin.findUnique({ where: { userId: existing.id } }),
        db.membership.count({ where: { userId: existing.id, revokedAt: null } }),
      ]);
      if (isStaff) throw new HttpError(409, "already_staff", "Essa pessoa já está na equipe.");
      assertPlatformAccountSeparation({ platformAdmin: true, activeMemberships: memberships });
    }
    const provisional = `Prov-${randomToken(9)}`;
    const result = await db.$transaction(async (tx) => {
      const user =
        existing ??
        (await tx.user.create({
          data: {
            email,
            name: body.name,
            passwordHash: await hashPassword(provisional),
            mustChangePassword: true,
          },
        }));
      await tx.platformAdmin.create({
        data: { userId: user.id, role: body.role, note: "console" },
      });
      await audit(tx, {
        actorUserId: staff.userId,
        action: "platform_admin.grant",
        entityType: "user",
        entityId: user.id,
        data: { role: body.role, via: "console" },
      });
      return user;
    });
    // Com e-mail ligado, a pessoa recebe um link para definir a senha; sem ele, a senha
    // provisória aparece uma única vez para quem convidou.
    const url = await issuePasswordLink(ctx, result.id, staff.userId);
    const emailId = await queueEmail(db, {
      to: email,
      template: "staff_welcome",
      baseUrl: ctx.config.webBaseUrl,
      data: { name: result.name, roleLabel: PLATFORM_ROLE_LABEL[body.role], url },
    });
    const sent = emailId ? await db.emailMessage.findUnique({ where: { id: emailId } }) : null;
    const emailQueued = sent?.status === "queued";
    return reply.status(201).send({
      userId: result.id,
      emailQueued,
      provisionalPassword: existing || emailQueued ? null : provisional,
    });
  });

  app.patch<{ Params: { userId: string } }>("/v1/platform/team/:userId", async (req) => {
    const staff = await requireStaff(ctx, req, "team.manage");
    const { role } = z.object({ role: z.enum(PLATFORM_ROLES) }).parse(req.body);
    const target = await db.platformAdmin.findUnique({ where: { userId: req.params.userId } });
    if (!target) throw notFound("Pessoa da equipe");
    if (target.role === "admin" && role !== "admin")
      assertKeepsAnAdmin((await db.platformAdmin.count({ where: { role: "admin" } })) - 1);
    await db.$transaction(async (tx) => {
      await tx.platformAdmin.update({ where: { userId: target.userId }, data: { role } });
      await audit(tx, {
        actorUserId: staff.userId,
        action: "platform_admin.role",
        entityType: "user",
        entityId: target.userId,
        data: { from: target.role, to: role },
      });
    });
    return { ok: true };
  });

  /** Retira o acesso ao console e encerra as sessões da pessoa. */
  app.post<{ Params: { userId: string } }>("/v1/platform/team/:userId/revoke", async (req) => {
    const staff = await requireStaff(ctx, req, "team.manage");
    const target = await db.platformAdmin.findUnique({ where: { userId: req.params.userId } });
    if (!target) throw notFound("Pessoa da equipe");
    if (target.role === "admin")
      assertKeepsAnAdmin((await db.platformAdmin.count({ where: { role: "admin" } })) - 1);
    await db.$transaction(async (tx) => {
      await tx.platformAdmin.delete({ where: { userId: target.userId } });
      await tx.authSession.updateMany({
        where: { userId: target.userId, revokedAt: null },
        data: { revokedAt: ctx.now(), revokedReason: "platform_revoked" },
      });
      await audit(tx, {
        actorUserId: staff.userId,
        action: "platform_admin.revoke",
        entityType: "user",
        entityId: target.userId,
        data: { role: target.role, via: "console" },
      });
    });
    return { ok: true };
  });

  /** Celular perdido: zera a verificação em duas etapas; a pessoa configura de novo. */
  app.post<{ Params: { userId: string } }>("/v1/platform/team/:userId/reset-mfa", async (req) => {
    const staff = await requireStaff(ctx, req, "team.manage");
    const target = await db.platformAdmin.findUnique({ where: { userId: req.params.userId } });
    if (!target) throw notFound("Pessoa da equipe");
    await db.$transaction(async (tx) => {
      await tx.platformAdmin.update({
        where: { userId: target.userId },
        data: { mfaEnabledAt: null, mfaSecretEnc: null },
      });
      await tx.authSession.updateMany({
        where: { userId: target.userId, revokedAt: null },
        data: { revokedAt: ctx.now(), revokedReason: "mfa_reset" },
      });
      await audit(tx, {
        actorUserId: staff.userId,
        action: "platform.mfa_reset",
        entityType: "user",
        entityId: target.userId,
      });
    });
    return { ok: true };
  });
}
