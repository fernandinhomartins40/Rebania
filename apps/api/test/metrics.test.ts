/** G7 — observabilidade: métricas protegidas por token. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestEnv, type TestEnv } from "./helpers.ts";

let env: TestEnv;
const token = "token-de-metricas-com-mais-de-24-caracteres";
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

describe("métricas", () => {
  it("sem token configurado ou com token errado: 404", async () => {
    expect((await env.app.inject({ method: "GET", url: "/v1/metrics" })).statusCode).toBe(404);
  });
});

describe("métricas com token", () => {
  it("expõe latência, sync, jobs e IA em formato Prometheus", async () => {
    const e = await createTestEnv({}, { METRICS_TOKEN: token });
    await e.app.inject({ method: "GET", url: "/v1/health" });
    expect(
      (
        await e.app.inject({
          method: "GET",
          url: "/v1/metrics",
          headers: { authorization: "Bearer errado-errado-errado-errado-errad" },
        })
      ).statusCode,
    ).toBe(404);
    const r = await e.app.inject({
      method: "GET",
      url: "/v1/metrics",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toMatch(/text\/plain/);
    expect(r.body).toContain("rebania_http_request_duration_seconds_bucket");
    expect(r.body).toContain("rebania_sync_receipts_24h");
    expect(r.body).toContain("rebania_jobs_failed");
    await e.close();
  });
});
