import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../lib/audit.ts";
import type { AppContext } from "../lib/context.ts";
import { HttpError, notFound } from "../lib/errors.ts";
import { openSession, sessionUser } from "../lib/session.ts";
import { requireAuth, setSessionCookie } from "../plugins/auth.ts";

/**
 * Passkeys (WebAuthn): entrar com digital, senha do celular ou Face ID. O aparelho guarda a
 * chave privada e pede a biometria; o servidor só confere a assinatura com a chave pública.
 * Contas da plataforma (console) ficam de fora: entram com senha + verificação em duas etapas.
 */
const RATE = { max: 10, timeWindow: "1 minute" };
const CHALLENGE_TTL_MS = 5 * 60_000;

const Credential = z.object({ id: z.string().min(1).max(1024) }).passthrough();

/**
 * Cadastro recusado responde 422 (a sessão continua válida; um 401 faria o app deslogar).
 * Entrada recusada responde 401.
 */
const invalid = (purpose: "register" | "login") =>
  new HttpError(
    purpose === "register" ? 422 : 401,
    "passkey_invalid",
    "Não foi possível confirmar a digital ou o Face ID.",
  );

export function passkeyRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;
  const { rpId, origins } = config.webauthn;

  async function newChallenge(challenge: string, purpose: "register" | "login", userId?: string) {
    const now = ctx.now();
    // Desafios vencidos não servem para nada (não são histórico): limpeza oportunista.
    await db.webauthnChallenge.deleteMany({
      where: { expiresAt: { lt: new Date(now.getTime() - 3600_000) } },
    });
    return db.webauthnChallenge.create({
      data: {
        challenge,
        purpose,
        userId: userId ?? null,
        expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
      },
    });
  }

  /** Consome o desafio uma única vez (atualização condicional). */
  async function useChallenge(id: string, purpose: "register" | "login", userId?: string) {
    const now = ctx.now();
    const c = await db.webauthnChallenge.findUnique({ where: { id } });
    if (!c || c.purpose !== purpose || c.expiresAt <= now || (userId && c.userId !== userId))
      throw invalid(purpose);
    const r = await db.webauthnChallenge.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: now },
    });
    if (r.count !== 1) throw invalid(purpose);
    return c.challenge;
  }

  async function assertCustomerAccount(userId: string) {
    if (await db.platformAdmin.findUnique({ where: { userId } }))
      throw new HttpError(
        422,
        "platform_account",
        "Contas da equipe Rebania entram com senha e código de verificação.",
      );
  }

  // ---- Cadastro (com a sessão aberta) ----
  app.post("/v1/auth/passkeys/register/options", { config: { rateLimit: RATE } }, async (req) => {
    const { userId } = requireAuth(req);
    await assertCustomerAccount(userId);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    const existing = await db.passkey.findMany({ where: { userId, revokedAt: null } });
    const options = await generateRegistrationOptions({
      rpName: "Rebania",
      rpID: rpId,
      userName: user.email,
      userDisplayName: user.name,
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      excludeCredentials: existing.map((p) => ({
        id: p.credentialId,
        transports: p.transports as AuthenticatorTransportFuture[],
      })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    const c = await newChallenge(options.challenge, "register", userId);
    return { challengeId: c.id, options };
  });

  app.post(
    "/v1/auth/passkeys/register/verify",
    { config: { rateLimit: RATE } },
    async (req, reply) => {
      const { userId } = requireAuth(req);
      await assertCustomerAccount(userId);
      const body = z
        .object({
          challengeId: z.uuid(),
          response: Credential,
          label: z.string().trim().min(1).max(60).optional(),
        })
        .parse(req.body);
      const expectedChallenge = await useChallenge(body.challengeId, "register", userId);
      let result;
      try {
        result = await verifyRegistrationResponse({
          response: body.response as unknown as RegistrationResponseJSON,
          expectedChallenge,
          expectedOrigin: origins,
          expectedRPID: rpId,
          requireUserVerification: true,
        });
      } catch (err) {
        req.log.warn({ reason: (err as Error).message }, "passkey: cadastro recusado");
        throw invalid("register");
      }
      if (!result.verified || !result.registrationInfo) throw invalid("register");
      const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
      if (await db.passkey.findUnique({ where: { credentialId: credential.id } }))
        throw new HttpError(409, "passkey_exists", "Este aparelho já está cadastrado.");
      const p = await db.$transaction(async (tx) => {
        const created = await tx.passkey.create({
          data: {
            userId,
            credentialId: credential.id,
            publicKey: Buffer.from(credential.publicKey),
            counter: BigInt(credential.counter),
            transports: credential.transports ?? [],
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            label: body.label ?? "Este aparelho",
          },
        });
        await audit(tx, {
          actorUserId: userId,
          action: "auth.passkey_added",
          entityType: "passkey",
          entityId: created.id,
          data: { deviceType: credentialDeviceType, backedUp: credentialBackedUp },
          ip: req.ip,
        });
        return created;
      });
      return reply.status(201).send({ id: p.id, label: p.label });
    },
  );

  app.get("/v1/auth/passkeys", async (req) => {
    const { userId } = requireAuth(req);
    const rows = await db.passkey.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return {
      items: rows.map((p) => ({
        id: p.id,
        label: p.label,
        synced: p.deviceType === "multiDevice",
        createdAt: p.createdAt.toISOString(),
        lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
      })),
    };
  });

  /** Remover = revogar: a passkey para de valer e o registro fica para auditoria. */
  app.post<{ Params: { id: string } }>("/v1/auth/passkeys/:id/revoke", async (req, reply) => {
    const { userId } = requireAuth(req);
    const r = await db.passkey.updateMany({
      where: { id: req.params.id, userId, revokedAt: null },
      data: { revokedAt: ctx.now() },
    });
    if (r.count !== 1) throw notFound("Passkey");
    await audit(db, {
      actorUserId: userId,
      action: "auth.passkey_revoked",
      entityType: "passkey",
      entityId: req.params.id,
      ip: req.ip,
    });
    return reply.status(204).send();
  });

  // ---- Entrada (sem sessão; o aparelho escolhe a passkey) ----
  app.post("/v1/auth/passkeys/login/options", { config: { rateLimit: RATE } }, async () => {
    const options = await generateAuthenticationOptions({
      rpID: rpId,
      userVerification: "required",
    });
    const c = await newChallenge(options.challenge, "login");
    return { challengeId: c.id, options };
  });

  app.post(
    "/v1/auth/passkeys/login/verify",
    { config: { rateLimit: RATE } },
    async (req, reply) => {
      const body = z.object({ challengeId: z.uuid(), response: Credential }).parse(req.body);
      const expectedChallenge = await useChallenge(body.challengeId, "login");
      const p = await db.passkey.findUnique({
        where: { credentialId: body.response.id },
        include: { user: { include: { platformAdmin: true } } },
      });
      if (!p || p.revokedAt || p.user.disabledAt || p.user.platformAdmin) throw invalid("login");
      let result;
      try {
        result = await verifyAuthenticationResponse({
          response: body.response as unknown as AuthenticationResponseJSON,
          expectedChallenge,
          expectedOrigin: origins,
          expectedRPID: rpId,
          credential: {
            id: p.credentialId,
            publicKey: new Uint8Array(p.publicKey),
            counter: Number(p.counter),
            transports: p.transports as AuthenticatorTransportFuture[],
          },
          requireUserVerification: true,
        });
      } catch (err) {
        req.log.warn({ reason: (err as Error).message }, "passkey: entrada recusada");
        throw invalid("login");
      }
      if (!result.verified) throw invalid("login");
      await db.passkey.update({
        where: { id: p.id },
        data: { counter: BigInt(result.authenticationInfo.newCounter), lastUsedAt: ctx.now() },
      });
      const s = await openSession(ctx, p.userId, "web", { userAgent: req.headers["user-agent"] });
      await audit(db, {
        actorUserId: p.userId,
        action: "auth.login",
        entityType: "session",
        entityId: s.session.id,
        data: { channel: "web", method: "passkey", passkeyId: p.id },
        ip: req.ip,
      });
      setSessionCookie(reply, ctx, s.access);
      return { user: sessionUser(p.user) };
    },
  );
}
