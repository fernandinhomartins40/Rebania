import { z } from "zod";

/** O compose passa `VAR=` vazio para opcionais não definidos: vazio = ausente. */
const optionalSecret = (min: number) =>
  z.preprocess((v) => (v === "" ? undefined : v), z.string().min(min).optional());

const Env = z
  .object({
    DATABASE_URL: z.string().min(1),
    API_PORT: z.coerce.number().int().default(3000),
    API_HOST: z.string().default("127.0.0.1"),
    WEB_ORIGINS: z.string().default("http://localhost:5173"),
    WEB_BASE_URL: z.string().default("http://localhost:5173"),
    COOKIE_SECURE: z
      .enum(["true", "false"])
      .default("true")
      .transform((v) => v === "true"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    // Relativo ao diretório do processo (apps/api ou apps/worker): ambos apontam
    // para <raiz>/var/media. Em produção use caminho absoluto (volume /data/media).
    MEDIA_DIR: z.string().default("../../var/media"),
    // IA (P-02): DeepSeek. "none" mantém o assistente indisponível, sem simular.
    AI_PROVIDER: z.enum(["none", "deepseek"]).default("none"),
    DEEPSEEK_API_KEY: optionalSecret(20),
    DEEPSEEK_MODEL: z.string().min(1).default("deepseek-chat"),
    DEEPSEEK_BASE_URL: z.url().default("https://api.deepseek.com"),
    // Pagamento ainda não decidido (P-02).
    // "hmac": webhook genérico assinado (HMAC-SHA256) para conciliação manual/bancária.
    BILLING_PROVIDER: z.enum(["none", "hmac"]).default("none"),
    BILLING_WEBHOOK_SECRET: optionalSecret(32),
    // Token do coletor de métricas (Prometheus). Sem token, /v1/metrics responde 404.
    METRICS_TOKEN: optionalSecret(24),
  })
  .refine((e) => e.AI_PROVIDER !== "deepseek" || e.DEEPSEEK_API_KEY, {
    message: "AI_PROVIDER=deepseek exige DEEPSEEK_API_KEY",
    path: ["DEEPSEEK_API_KEY"],
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
  aiProvider: "none" | "deepseek";
  deepseek: { apiKey: string; model: string; baseUrl: string } | null;
  billingProvider: "none" | "hmac";
  billingWebhookSecret: string | null;
  metricsToken: string | null;
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
    deepseek:
      e.AI_PROVIDER === "deepseek" && e.DEEPSEEK_API_KEY
        ? { apiKey: e.DEEPSEEK_API_KEY, model: e.DEEPSEEK_MODEL, baseUrl: e.DEEPSEEK_BASE_URL }
        : null,
    billingProvider: e.BILLING_PROVIDER,
    billingWebhookSecret: e.BILLING_WEBHOOK_SECRET ?? null,
    metricsToken: e.METRICS_TOKEN ?? null,
    webSessionTtlMs: 12 * 3600_000,
    mobileAccessTtlMs: 15 * 60_000,
    mobileRefreshTtlMs: 30 * 24 * 3600_000,
    invitationTtlMs: 7 * 24 * 3600_000,
  };
}
