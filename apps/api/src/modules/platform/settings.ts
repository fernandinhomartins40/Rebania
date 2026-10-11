import {
  getBillingSettings,
  getMailSettings,
  queueEmail,
  secretStatus,
  SECRET_KEYS,
  setSecret,
  setSetting,
  SETTING_KEYS,
} from "@rebania/saas";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../../lib/audit.ts";
import type { AppContext } from "../../lib/context.ts";
import { HttpError } from "../../lib/errors.ts";
import { requireStaff } from "../../lib/staff.ts";

/** Configurações da plataforma: e-mail (VeloMail) e instruções de pagamento. Segredos nunca voltam. */
export function settingsRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, config } = ctx;

  app.get("/v1/platform/settings", async (req) => {
    await requireStaff(ctx, req, "settings.manage");
    const [mail, billing, apiKey, webhook] = await Promise.all([
      getMailSettings(db),
      getBillingSettings(db),
      secretStatus(db, SECRET_KEYS.velomailApiKey),
      secretStatus(db, SECRET_KEYS.velomailWebhookSecret),
    ]);
    return {
      secretsKeyConfigured: Boolean(ctx.secrets?.available),
      mail: {
        ...mail,
        apiKey,
        webhookSecret: webhook,
        webhookUrl: `${config.webBaseUrl}/v1/mail/webhooks/velomail`,
      },
      billing,
    };
  });

  app.put("/v1/platform/settings/mail", async (req) => {
    const staff = await requireStaff(ctx, req, "settings.manage");
    const body = z
      .object({
        enabled: z.boolean(),
        fromEmail: z.email().max(254).or(z.literal("")),
        fromName: z.string().trim().min(2).max(80),
        replyTo: z.email().max(254).nullable(),
        apiBaseUrl: z.url().max(200),
        teamEmail: z.email().max(254).nullable(),
        /** Só quando trocar; vazio = manter. */
        apiKey: z.string().trim().max(300).optional(),
        webhookSecret: z.string().trim().max(300).optional(),
      })
      .parse(req.body);
    if ((body.apiKey || body.webhookSecret) && !ctx.secrets?.available)
      throw new HttpError(
        503,
        "secrets_unavailable",
        "Defina PLATFORM_SECRETS_KEY no servidor antes de salvar chaves.",
      );
    if (body.enabled && !body.fromEmail)
      throw new HttpError(422, "from_required", "Informe o remetente para ligar o envio.");
    const { apiKey, webhookSecret, ...settings } = body;
    if (apiKey) await setSecret(db, ctx.secrets!, SECRET_KEYS.velomailApiKey, apiKey);
    if (webhookSecret)
      await setSecret(db, ctx.secrets!, SECRET_KEYS.velomailWebhookSecret, webhookSecret);
    await setSetting(
      db,
      SETTING_KEYS.mail,
      { ...settings, fromEmail: settings.fromEmail.toLowerCase() },
      staff.userId,
    );
    await audit(db, {
      actorUserId: staff.userId,
      action: "settings.mail",
      entityType: "platform_setting",
      entityId: SETTING_KEYS.mail,
      data: {
        enabled: body.enabled,
        apiKeyChanged: Boolean(apiKey),
        webhookChanged: Boolean(webhookSecret),
      },
    });
    return { ok: true };
  });

  app.post("/v1/platform/settings/mail/test", async (req) => {
    const staff = await requireStaff(ctx, req, "settings.manage");
    const { to } = z.object({ to: z.email() }).parse(req.body);
    const id = await queueEmail(db, {
      to,
      template: "mail_test",
      baseUrl: config.webBaseUrl,
      data: {},
    });
    const e = id ? await db.emailMessage.findUnique({ where: { id } }) : null;
    await audit(db, {
      actorUserId: staff.userId,
      action: "settings.mail_test",
      entityType: "email",
      entityId: id,
    });
    return { id, status: e?.status ?? null, error: e?.error ?? null };
  });

  app.put("/v1/platform/settings/billing", async (req) => {
    const staff = await requireStaff(ctx, req, "billing.manage");
    const body = z
      .object({ paymentInstructions: z.string().trim().max(1000).nullable() })
      .parse(req.body);
    await setSetting(
      db,
      SETTING_KEYS.billing,
      { paymentInstructions: body.paymentInstructions || null },
      staff.userId,
    );
    await audit(db, {
      actorUserId: staff.userId,
      action: "settings.billing",
      entityType: "platform_setting",
      entityId: SETTING_KEYS.billing,
    });
    return { ok: true };
  });
}
