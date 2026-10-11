import { enqueueJob, type Db, type Tx } from "@rebania/db";
import type { SecretBox } from "../secrets.ts";
import { getMailSettings, getSecret, SECRET_KEYS } from "../settings.ts";
import { renderEmail, type TemplateData, type TemplateName } from "./templates.ts";
import { sendViaVeloMail, VeloMailError, type Fetch } from "./velomail.ts";

type Client = Db | Tx;

export const MAIL_QUEUE = "mail.send";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Porta única de envio: grava o e-mail e enfileira a entrega no worker (na mesma
 * transação da ação de negócio). Com o envio desligado, fica registrado como "skipped".
 */
export async function queueEmail<T extends TemplateName>(
  db: Client,
  input: {
    to: string;
    template: T;
    data: TemplateData<T>;
    baseUrl: string;
    organizationId?: string | null;
  },
): Promise<string | null> {
  const to = input.to.trim().toLowerCase();
  if (!EMAIL_RE.test(to)) return null;
  const settings = await getMailSettings(db);
  const r = renderEmail(input.template, input.baseUrl, input.data);
  const enabled = settings.enabled && Boolean(settings.fromEmail);
  const email = await db.emailMessage.create({
    data: {
      organizationId: input.organizationId ?? null,
      toEmail: to,
      subject: r.subject,
      template: input.template,
      html: r.html,
      text: r.text,
      status: enabled ? "queued" : "skipped",
      error: enabled ? null : "Envio de e-mail desligado no console.",
    },
  });
  if (enabled) await enqueueJob(db, MAIL_QUEUE, { emailId: email.id }, { maxAttempts: 8 });
  return email.id;
}

/** Entrega um e-mail da fila. Erro de rede/limite relança para a fila tentar de novo. */
export async function deliverEmail(
  db: Db,
  box: SecretBox,
  emailId: string,
  opts: { fetch?: Fetch } = {},
): Promise<"sent" | "failed" | "skipped" | "noop"> {
  const email = await db.emailMessage.findUnique({ where: { id: emailId } });
  if (!email || email.status !== "queued") return "noop";
  const settings = await getMailSettings(db);
  const apiKey = await getSecret(db, box, SECRET_KEYS.velomailApiKey);
  if (!settings.enabled || !settings.fromEmail || !apiKey) {
    await db.emailMessage.update({
      where: { id: email.id },
      data: { status: "skipped", error: "Envio desligado ou chave do VeloMail ausente." },
    });
    return "skipped";
  }
  await db.emailMessage.update({ where: { id: email.id }, data: { attempts: { increment: 1 } } });
  try {
    const { messageId } = await sendViaVeloMail(
      settings.apiBaseUrl,
      apiKey,
      {
        from: settings.fromEmail,
        from_name: settings.fromName,
        to: email.toEmail,
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(settings.replyTo ? { reply_to: settings.replyTo } : {}),
        tags: [email.template],
        tracking_enabled: false,
      },
      { fetch: opts.fetch },
    );
    await db.emailMessage.update({
      where: { id: email.id },
      data: { status: "sent", providerMessageId: messageId, sentAt: new Date(), error: null },
    });
    return "sent";
  } catch (err) {
    const retryable = !(err instanceof VeloMailError) || err.retryable;
    const message = err instanceof Error ? err.message.slice(0, 500) : String(err);
    await db.emailMessage.update({
      where: { id: email.id },
      data: retryable ? { error: message } : { status: "failed", error: message },
    });
    if (retryable) throw err;
    return "failed";
  }
}

/** Esgotadas as tentativas da fila, o e-mail fica como falho (visível no console). */
export async function markEmailFailed(db: Db, emailId: string, error: string) {
  await db.emailMessage.updateMany({
    where: { id: emailId, status: "queued" },
    data: { status: "failed", error: error.slice(0, 500) },
  });
}
