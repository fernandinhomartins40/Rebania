import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTenant,
  createTestEnv,
  createUser,
  login,
  PASSWORD,
  type TestEnv,
} from "./helpers.ts";

// Arquivo próprio: app próprio, então os logins daqui não gastam o limite de auth.test.ts.
let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

const csrf = { "x-rebania-csrf": "1" };

describe("troca de senha", () => {
  it("senha provisória: só libera me/troca/logout até trocar; a troca encerra as outras sessões", async () => {
    const t = await createTenant(env.db);
    const u = await createUser(env.db, t.orgId, "owner");
    await env.db.user.update({ where: { id: u.id }, data: { mustChangePassword: true } });
    const other = await login(env.app, u.email);
    const c = await login(env.app, u.email);

    const me = await c.get("/v1/auth/me");
    expect(me.statusCode).toBe(200);
    expect(me.json().user.mustChangePassword).toBe(true);
    expect(me.json().platformAdmin).toBe(false);

    const blocked = await c.get(`/v1/farms/${t.farmId}/animals`);
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("password_change_required");

    const wrong = await c.post("/v1/auth/password", {
      currentPassword: "errada-errada",
      newPassword: "nova-senha-forte-1",
    });
    expect(wrong.statusCode).toBe(401);
    const same = await c.post("/v1/auth/password", {
      currentPassword: PASSWORD,
      newPassword: PASSWORD,
    });
    expect(same.statusCode).toBe(400);
    const short = await c.post("/v1/auth/password", {
      currentPassword: PASSWORD,
      newPassword: "curta",
    });
    expect(short.statusCode).toBe(400);

    const ok = await c.post("/v1/auth/password", {
      currentPassword: PASSWORD,
      newPassword: "nova-senha-forte-1",
    });
    expect(ok.statusCode).toBe(204);
    expect((await c.get("/v1/auth/me")).json().user.mustChangePassword).toBe(false);
    expect((await c.get(`/v1/farms/${t.farmId}/animals`)).statusCode).toBe(200);
    // A outra sessão foi encerrada pela troca
    expect((await other.get("/v1/auth/me")).statusCode).toBe(401);

    const oldPw = await env.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: csrf,
      payload: { email: u.email, password: PASSWORD, channel: "web" },
    });
    expect(oldPw.statusCode).toBe(401);
    const newPw = await env.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: csrf,
      payload: { email: u.email, password: "nova-senha-forte-1", channel: "web" },
    });
    expect(newPw.statusCode).toBe(200);
    expect(newPw.json().user.mustChangePassword).toBe(false);

    const audited = await env.db.auditEntry.count({
      where: { action: "auth.password_changed", entityId: u.id },
    });
    expect(audited).toBe(1);
  });
});
