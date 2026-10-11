import type { Db, Prisma, Tx } from "@rebania/db";
import type { SecretBox } from "./secrets.ts";

type Client = Db | Tx;

/** E-mail transacional (VeloMail). Desligado até a equipe configurar no console. */
export interface MailSettings {
  enabled: boolean;
  /** Só o endereço (o VeloMail recusa "Nome <endereço>"). */
  fromEmail: string;
  fromName: string;
  replyTo: string | null;
  apiBaseUrl: string;
  /** Caixa da equipe que recebe avisos internos (chamado novo etc.). */
  teamEmail: string | null;
}

export const DEFAULT_MAIL_SETTINGS: MailSettings = {
  enabled: false,
  fromEmail: "",
  fromName: "Rebania",
  replyTo: null,
  apiBaseUrl: "https://www.velomail.com.br/api",
  teamEmail: null,
};

/** Cobrança manual enquanto não há provedor (P-02): instruções mostradas na fatura e no e-mail. */
export interface BillingSettings {
  paymentInstructions: string | null;
}

export const DEFAULT_BILLING_SETTINGS: BillingSettings = { paymentInstructions: null };

export const SETTING_KEYS = { mail: "mail", billing: "billing" } as const;
export const SECRET_KEYS = {
  velomailApiKey: "velomail_api_key",
  velomailWebhookSecret: "velomail_webhook_secret",
} as const;

export async function getSetting<T extends object>(
  db: Client,
  key: string,
  fallback: T,
): Promise<T> {
  const row = await db.platformSetting.findUnique({ where: { key } });
  return { ...fallback, ...((row?.value as Partial<T> | undefined) ?? {}) };
}

export async function setSetting<T extends object>(
  db: Client,
  key: string,
  value: T,
  actorUserId: string | null,
): Promise<void> {
  const json = value as unknown as Prisma.InputJsonValue;
  await db.platformSetting.upsert({
    where: { key },
    create: { key, value: json, updatedById: actorUserId },
    update: { value: json, updatedById: actorUserId },
  });
}

export const getMailSettings = (db: Client) =>
  getSetting(db, SETTING_KEYS.mail, DEFAULT_MAIL_SETTINGS);
export const getBillingSettings = (db: Client) =>
  getSetting(db, SETTING_KEYS.billing, DEFAULT_BILLING_SETTINGS);

/** Lê um segredo; null se não existe ou se a chave do servidor mudou (precisa salvar de novo). */
export async function getSecret(db: Client, box: SecretBox, key: string): Promise<string | null> {
  if (!box.available) return null;
  const row = await db.platformSecret.findUnique({ where: { key } });
  if (!row) return null;
  try {
    return box.open(row.valueEnc);
  } catch {
    return null;
  }
}

/** Grava (ou apaga, com null) um segredo cifrado. */
export async function setSecret(
  db: Client,
  box: SecretBox,
  key: string,
  plain: string | null,
): Promise<void> {
  if (!plain) {
    await db.platformSecret.deleteMany({ where: { key } });
    return;
  }
  const valueEnc = box.seal(plain);
  await db.platformSecret.upsert({
    where: { key },
    create: { key, valueEnc },
    update: { valueEnc, rotatedAt: new Date() },
  });
}

export async function secretStatus(db: Client, key: string) {
  const row = await db.platformSecret.findUnique({ where: { key }, select: { rotatedAt: true } });
  return { configured: Boolean(row), rotatedAt: row?.rotatedAt.toISOString() ?? null };
}
