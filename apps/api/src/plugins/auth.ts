import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sha256 } from "../lib/crypto.ts";
import { HttpError, unauthorized } from "../lib/errors.ts";
import type { AppContext } from "../lib/context.ts";

export const SESSION_COOKIE = "rebania_session";
export const CSRF_HEADER = "x-rebania-csrf";

export interface AuthInfo {
  userId: string;
  sessionId: string;
  channel: "web" | "mobile";
}

declare module "fastify" {
  interface FastifyRequest {
    auth: AuthInfo | null;
  }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Autenticação:
 * - web: cookie httpOnly `rebania_session` (SameSite=Strict). Requisições que alteram
 *   dados exigem o header `x-rebania-csrf: 1` (não enviável cross-site sem CORS).
 * - mobile: `Authorization: Bearer <access token>` de curta duração.
 * Tokens nunca são guardados em claro no banco (somente sha256).
 */
export function registerAuth(app: FastifyInstance, ctx: AppContext) {
  app.decorateRequest("auth", null);

  app.addHook("onRequest", async (req) => {
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7).trim()
      : undefined;

    // Webhooks de pagamento não usam cookie: são autenticados pela assinatura HMAC.
    const isWebhook = req.url.startsWith("/v1/billing/webhooks/");
    if (
      !bearer &&
      !isWebhook &&
      !SAFE_METHODS.has(req.method) &&
      !req.url.startsWith("/v1/health")
    ) {
      if (req.headers[CSRF_HEADER] !== "1") {
        throw new HttpError(403, "csrf_required", "Requisição bloqueada por segurança.");
      }
    }

    const token = bearer ?? req.cookies[SESSION_COOKIE];
    if (!token) return;
    const now = ctx.now();
    const session = await ctx.db.authSession.findUnique({
      where: { accessHash: sha256(token) },
      include: { user: { select: { disabledAt: true } } },
    });
    if (
      !session ||
      session.revokedAt ||
      session.accessExpiresAt <= now ||
      session.user.disabledAt ||
      (bearer && session.channel !== "mobile") ||
      (!bearer && session.channel !== "web")
    ) {
      return; // segue como anônimo; rotas protegidas respondem 401
    }
    req.auth = { userId: session.userId, sessionId: session.id, channel: session.channel };

    // Sessão web deslizante: renova no uso (no máximo a cada 5 minutos).
    if (now.getTime() - session.lastUsedAt.getTime() > 5 * 60_000) {
      await ctx.db.authSession.update({
        where: { id: session.id },
        data: {
          lastUsedAt: now,
          ...(session.channel === "web"
            ? { accessExpiresAt: new Date(now.getTime() + ctx.config.webSessionTtlMs) }
            : {}),
        },
      });
    }
  });
}

export function requireAuth(req: FastifyRequest): AuthInfo {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

export function setSessionCookie(reply: FastifyReply, ctx: AppContext, token: string) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: ctx.config.cookieSecure,
    sameSite: "strict",
    path: "/",
    maxAge: Math.floor(ctx.config.webSessionTtlMs / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply, ctx: AppContext) {
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: ctx.config.cookieSecure,
    sameSite: "strict",
    path: "/",
  });
}
