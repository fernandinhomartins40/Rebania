import {
  getSecret,
  refreshOrgAccess,
  SECRET_KEYS,
  VELOMAIL_EVENT_STATUS,
  verifyVeloMailSignature,
} from "@rebania/saas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { InvalidSignatureError, resolveBilling } from "../lib/billing.ts";
import type { AppContext } from "../lib/context.ts";
import { settleOrder } from "../lib/credits.ts";
import { HttpError, notFound } from "../lib/errors.ts";

/** Webhooks com corpo bruto preservado para verificar a assinatura (pagamento e VeloMail). */
export function webhookRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;
  const billing = resolveBilling(ctx);

  void app.register(async (child) => {
    child.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
      (req as unknown as { rawBody: string }).rawBody = body as string;
      try {
        done(null, JSON.parse(body as string));
      } catch {
        done(new HttpError(400, "invalid_json", "JSON inválido."), undefined);
      }
    });

    // ---- Pagamento: assinatura verificada, idempotente por event_id ----
    child.post<{ Params: { provider: string } }>(
      "/v1/billing/webhooks/:provider",
      { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
      async (req, reply) => {
        if (!billing || billing.id !== req.params.provider) throw notFound("Webhook");
        const raw = (req as unknown as { rawBody: string }).rawBody ?? "";
        let ev;
        try {
          ev = billing.verify(req.headers, raw);
        } catch (err) {
          if (err instanceof InvalidSignatureError)
            return reply
              .status(401)
              .send({ error: { code: "invalid_signature", message: err.message } });
          throw err;
        }
        try {
          await db.paymentEvent.create({
            data: {
              provider: billing.id,
              eventId: ev.eventId,
              type: ev.type,
              payload: JSON.parse(raw),
            },
          });
        } catch {
          // Evento repetido: já registrado; responde 200 sem reprocessar.
          return { ok: true, duplicate: true };
        }
        const result = await db.$transaction(async (tx) => {
          let r = "ignored";
          if (ev.type === "credit_order.paid" || ev.type === "credit_order.failed") {
            const order = await tx.creditOrder.findFirst({
              where: { providerRef: ev.ref, provider: billing.id },
            });
            if (order)
              r = await settleOrder(tx, order.id, ev.type === "credit_order.paid", ctx.now());
          } else {
            const inv = await tx.invoice.findFirst({
              where: {
                OR: [
                  { providerRef: ev.ref },
                  { id: z.uuid().safeParse(ev.ref).success ? ev.ref : undefined },
                ],
              },
            });
            if (inv) {
              const u = await tx.invoice.updateMany({
                where: { id: inv.id, status: "pending" },
                data: {
                  status: ev.type === "invoice.paid" ? "paid" : "failed",
                  paidAt: ev.type === "invoice.paid" ? ctx.now() : null,
                },
              });
              r = u.count ? "updated" : "ignored";
              if (u.count)
                await refreshOrgAccess(tx, inv.organizationId, ctx.now(), config.webBaseUrl);
            }
          }
          await tx.paymentEvent.update({
            where: { provider_eventId: { provider: billing.id, eventId: ev.eventId } },
            data: { processedAt: ctx.now(), result: r },
          });
          return r;
        });
        return { ok: true, result };
      },
    );

    // ---- VeloMail: situação de entrega (HMAC X-Webhook-Signature) ----
    child.post(
      "/v1/mail/webhooks/velomail",
      { config: { rateLimit: { max: 600, timeWindow: "1 minute" } } },
      async (req, reply) => {
        const raw = (req as unknown as { rawBody: string }).rawBody ?? "";
        const secret = ctx.secrets
          ? await getSecret(db, ctx.secrets, SECRET_KEYS.velomailWebhookSecret)
          : null;
        const sig = req.headers["x-webhook-signature"];
        if (!secret || typeof sig !== "string" || !verifyVeloMailSignature(raw, sig, secret))
          return reply
            .status(401)
            .send({ error: { code: "invalid_signature", message: "Assinatura inválida." } });
        const payload = (req.body ?? {}) as {
          event?: string;
          data?: { message_id?: string; messageId?: string; error?: string; reason?: string };
        };
        const event = String(payload.event ?? req.headers["x-webhook-event"] ?? "");
        const status = VELOMAIL_EVENT_STATUS[event];
        const messageId = payload.data?.message_id ?? payload.data?.messageId;
        // Eventos desconhecidos (abertura/clique ficam desligados) são ignorados.
        if (!status || !messageId) return { ok: true, ignored: true };
        const email = await db.emailMessage.findFirst({
          where: { providerMessageId: String(messageId) },
        });
        if (!email) return { ok: true, ignored: true };
        // Entregue não volta a falho por evento atrasado/repetido.
        if (email.status === "delivered" && status !== "delivered") return { ok: true };
        await db.emailMessage.update({
          where: { id: email.id },
          data:
            status === "delivered"
              ? { status, deliveredAt: ctx.now(), error: null }
              : {
                  status,
                  error: String(payload.data?.error ?? payload.data?.reason ?? event).slice(0, 500),
                },
        });
        return { ok: true };
      },
    );
  });
}
