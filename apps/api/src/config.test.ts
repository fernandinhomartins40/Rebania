import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.ts";

const base = { DATABASE_URL: "postgresql://x/y" };

describe("config da IA", () => {
  it("padrão: sem provedor", () => {
    const c = loadConfig(base);
    expect(c.aiProvider).toBe("none");
    expect(c.deepseek).toBeNull();
  });

  it("deepseek sem chave falha na subida, não em produção silenciosa", () => {
    expect(() => loadConfig({ ...base, AI_PROVIDER: "deepseek" })).toThrow(/DEEPSEEK_API_KEY/);
  });

  it("deepseek com chave usa modelo e URL padrão", () => {
    const c = loadConfig({
      ...base,
      AI_PROVIDER: "deepseek",
      DEEPSEEK_API_KEY: "sk-0123456789abcdef0123",
    });
    expect(c.deepseek).toEqual({
      apiKey: "sk-0123456789abcdef0123",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
    });
  });

  it("chave sem AI_PROVIDER=deepseek não liga o assistente", () => {
    expect(
      loadConfig({ ...base, DEEPSEEK_API_KEY: "sk-0123456789abcdef0123" }).deepseek,
    ).toBeNull();
  });

  it("variáveis vazias vindas do compose contam como ausentes", () => {
    const c = loadConfig({
      ...base,
      DEEPSEEK_API_KEY: "",
      METRICS_TOKEN: "",
      BILLING_WEBHOOK_SECRET: "",
    });
    expect(c).toMatchObject({ deepseek: null, metricsToken: null, billingWebhookSecret: null });
    expect(() => loadConfig({ ...base, AI_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "" })).toThrow(
      /DEEPSEEK_API_KEY/,
    );
  });
});
