import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEMO_ORG_SLUG, DEMO_USERS, seedDemo } from "../src/lib/demo-seed.ts";
import { createTestEnv, type TestEnv } from "./helpers.ts";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

const csrf = { "x-rebania-csrf": "1" };

async function login(email: string, password: string) {
  return env.app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: csrf,
    payload: { email, password, channel: "web" },
  });
}

describe("seed de demonstração", () => {
  it("cria um usuário por perfil com acesso à fazenda e dados de exemplo", async () => {
    const r = await seedDemo(env.db, { password: "demo-senha-123", now: env.clock.now });
    expect(r.animalsCreated).toBe(12);
    expect(r.users.map((u) => u.role)).toEqual([
      "owner",
      "manager",
      "field",
      "veterinarian",
      "finance",
    ]);

    for (const u of DEMO_USERS) {
      const res = await login(u.email, "demo-senha-123");
      expect(res.statusCode).toBe(200);
    }
    const res = await login(DEMO_USERS[0]!.email, "demo-senha-123");
    const cookie = res.cookies.find((c) => c.name === "rebania_session")!;
    const animals = await env.app.inject({
      method: "GET",
      url: `/v1/farms/${r.farmId}/animals`,
      cookies: { rebania_session: cookie.value },
    });
    expect(animals.statusCode).toBe(200);
    expect(JSON.stringify(animals.json())).toContain("3487");
    const weights = await env.db.weightMeasurement.count({ where: { farmId: r.farmId } });
    expect(weights).toBe(24);
  });

  it("é idempotente e a nova senha substitui a anterior", async () => {
    const first = await env.db.organization.findUniqueOrThrow({ where: { slug: DEMO_ORG_SLUG } });
    const r = await seedDemo(env.db, { password: "outra-senha-456", now: env.clock.now });
    expect(r.organizationId).toBe(first.id);
    expect(r.animalsCreated).toBe(0);
    expect(await env.db.organization.count({ where: { slug: DEMO_ORG_SLUG } })).toBe(1);
    expect(await env.db.animal.count({ where: { farmId: r.farmId } })).toBe(12);
    expect((await login(DEMO_USERS[1]!.email, "demo-senha-123")).statusCode).toBe(401);
    expect((await login(DEMO_USERS[1]!.email, "outra-senha-456")).statusCode).toBe(200);
  });

  it("recusa senha curta", async () => {
    await expect(seedDemo(env.db, { password: "curta" })).rejects.toThrow();
  });
});
