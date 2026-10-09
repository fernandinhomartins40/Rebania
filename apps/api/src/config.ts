import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().default(3000),
  API_HOST: z.string().default("127.0.0.1"),
  WEB_ORIGINS: z.string().default("http://localhost:5173"),
  WEB_BASE_URL: z.string().default("http://localhost:5173"),
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  TRUST_PROXY: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  // Relativo ao diretório do processo (apps/api ou apps/worker): ambos apontam
  // para <raiz>/var/media. Em produção use caminho absoluto (volume /data/media).
  MEDIA_DIR: z.string().default("../../var/media"),
  // Provedores de IA e pagamento ainda não decididos (P-02): padrão "none".
  AI_PROVIDER: z.enum(["none"]).default("none"),
  // "hmac": webhook genérico assinado (HMAC-SHA256) para conciliação manual/bancária.
  BILLING_PROVIDER: z.enum(["none", "hmac"]).default("none"),
  BILLING_WEBHOOK_SECRET: z.string().min(32).optional(),
});

export type Config = {
  databaseUrl: string;
  port: number;
  host: string;
  webOrigins: string[];
  webBaseUrl: string;
  cookieSecure: boolean;
  logLevel: z.infer<typeof Env>["LOG_LEVEL"];
  trustProxy: boolean;
  dbPoolMax: number;
  mediaDir: string;
  aiProvider: "none";
  billingProvider: "none" | "hmac";
  billingWebhookSecret: string | null;
  /** Durações de sessão (ms). */
  webSessionTtlMs: number;
  mobileAccessTtlMs: number;
  mobileRefreshTtlMs: number;
  invitationTtlMs: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = Env.parse(env);
  return {
    databaseUrl: e.DATABASE_URL,
    port: e.API_PORT,
    host: e.API_HOST,
    webOrigins: e.WEB_ORIGINS.split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    webBaseUrl: e.WEB_BASE_URL.replace(/\/$/, ""),
    cookieSecure: e.COOKIE_SECURE,
    logLevel: e.LOG_LEVEL,
    trustProxy: e.TRUST_PROXY,
    dbPoolMax: e.DB_POOL_MAX,
    mediaDir: e.MEDIA_DIR,
    aiProvider: e.AI_PROVIDER,
    billingProvider: e.BILLING_PROVIDER,
    billingWebhookSecret: e.BILLING_WEBHOOK_SECRET ?? null,
    webSessionTtlMs: 12 * 3600_000,
    mobileAccessTtlMs: 15 * 60_000,
    mobileRefreshTtlMs: 30 * 24 * 3600_000,
    invitationTtlMs: 7 * 24 * 3600_000,
  };
}
