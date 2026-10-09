import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant, createTestEnv, createUser, PASSWORD, type TestEnv } from "./helpers.ts";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

const csrf = { "x-rebania-csrf": "1" };

describe("autenticação", () => {
  it("login web usa cookie httpOnly e não devolve tokens no corpo", async () => {
    const t = await createTenant(env.db);
    const u = await createUser(env.db, t.orgId, "owner");
    const res = await env.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: csrf,
      payload: { email: u.email.toUpperCase(), password: PASSWORD, channel: "web" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().tokens).toBeUndefined();
    const cookie = res.cookies.find((c) => c.name === "rebania_session")!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite).toBe("Strict");

    const me = await env.app.inject({
      method: "GET",
      url: "/v1/auth/me",
      cookies: { rebania_session: cookie.value },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().memberships[0].farms).toHaveLength(2);

    // Mutação via cookie sem header anti-CSRF é bloqueada
    const blocked = await env.app.inject({
      method: "POST",
      url: `/v1/orgs/${t.orgId}/farms`,
      cookies: { rebania_session: cookie.value },
      payload: { name: "Nova" },
    });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json().error.code).toBe("csrf_required");

    // Token de sessão web não vale como Bearer (canal errado)
    const asBearer = await env.app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${cookie.value}` },
    });
    expect(asBearer.statusCode).toBe(401);
  });

  it("senha errada e usuário inexistente têm a mesma resposta", async () => {
    const t = await createTenant(env.db);
    const u = await createUser(env.db, t.orgId, "owner");
    const a = await env.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: csrf,
      payload: { email: u.email, password: "errada", channel: "web" },
    });
    const b = await env.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: csrf,
      payload: { email: "ninguem@x.dev", password: "errada", channel: "web" },
    });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
  });

  it("mobile: refresh rotaciona e o token antigo deixa de valer; logout revoga", async () => {
    const t = await createTenant(env.db);
    const u = await createUser(env.db, t.orgId, "field");
    const login = await env.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: csrf,
      payload: { email: u.email, password: PASSWORD, channel: "mobile" },
    });
    const { accessToken, refreshToken } = login.json().tokens;
    const r1 = await env.app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: csrf,
      payload: { refreshToken },
    });
    expect(r1.statusCode).toBe(200);
    const r2 = await env.app.inject({
      method: "POST",
      url: "/v1/auth/refresh",
      headers: csrf,
      payload: { refreshToken },
    });
    expect(r2.statusCode).toBe(401);
    const old = await env.app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(old.statusCode).toBe(401);

    const fresh = r1.json().tokens.accessToken;
    const out = await env.app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${fresh}` },
    });
    expect(out.statusCode).toBe(204);
    const after = await env.app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${fresh}` },
    });
    expect(after.statusCode).toBe(401);
  });

  it("access token mobile expira", async () => {
    const t = await createTenant(env.db);
    const u = await createUser(env.db, t.orgId, "field");
    const login = await env.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: csrf,
      payload: { email: u.email, password: PASSWORD, channel: "mobile" },
    });
    const token = login.json().tokens.accessToken;
    const saved = env.clock.now;
    env.clock.now = new Date(saved.getTime() + 16 * 60_000);
    const res = await env.app.inject({
      method: "GET",
      url: "/v1/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    env.clock.now = saved;
    expect(res.statusCode).toBe(401);
  });
});

describe("convites", () => {
  async function ownerLogin() {
    const t = await createTenant(env.db);
    const owner = await createUser(env.db, t.orgId, "owner");
    const login = await env.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: csrf,
      payload: { email: owner.email, password: PASSWORD, channel: "mobile" },
    });
    const auth = { authorization: `Bearer ${login.json().tokens.accessToken}` };
    return { t, auth };
  }

  it("convite limitado a uma fazenda: aceito uma única vez e restringe acesso", async () => {
    const { t, auth } = await ownerLogin();
    const inv = await env.app.inject({
      method: "POST",
      url: `/v1/orgs/${t.orgId}/invitations`,
      headers: auth,
      payload: { email: "Peao@Fazenda.dev", role: "field", farmIds: [t.farmId] },
    });
    expect(inv.statusCode).toBe(201);
    const token = new URL(inv.json().acceptUrl).hash.replace("#token=", "");
    expect(await env.db.invitation.count({ where: { tokenHash: token } })).toBe(0); // só hash no banco

    const preview = await env.app.inject({ method: "GET", url: `/v1/auth/invitations/${token}` });
    expect(preview.json()).toMatchObject({
      email: "peao@fazenda.dev",
      role: "field",
      existingUser: false,
    });

    const accept = await env.app.inject({
      method: "POST",
      url: "/v1/auth/invitations/accept",
      headers: csrf,
      payload: { token, name: "Peão", password: "senha-forte-123" },
    });
    expect(accept.statusCode).toBe(200);
    const again = await env.app.inject({
      method: "POST",
      url: "/v1/auth/invitations/accept",
      headers: csrf,
      payload: { token, name: "Peão", password: "senha-forte-123" },
    });
    expect(again.statusCode).toBe(410);

    const login = await env.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: csrf,
      payload: { email: "peao@fazenda.dev", password: "senha-forte-123", channel: "mobile" },
    });
    const peao = { authorization: `Bearer ${login.json().tokens.accessToken}` };
    const me = await env.app.inject({ method: "GET", url: "/v1/auth/me", headers: peao });
    expect(me.json().memberships[0].farms.map((f: { id: string }) => f.id)).toEqual([t.farmId]);
    expect(me.json().memberships[0].permissions).not.toContain("finance.read");
    const other = await env.app.inject({
      method: "GET",
      url: `/v1/farms/${t.otherFarmId}/animals`,
      headers: peao,
    });
    expect(other.statusCode).toBe(404);
    const invite = await env.app.inject({
      method: "POST",
      url: `/v1/orgs/${t.orgId}/invitations`,
      headers: peao,
      payload: { email: "x@x.dev", role: "field", farmIds: [t.farmId] },
    });
    expect(invite.statusCode).toBe(403);
  });

  it("gerente não convida proprietário; convite expira", async () => {
    const t = await createTenant(env.db);
    const mgr = await createUser(env.db, t.orgId, "manager");
    const login = await env.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: csrf,
      payload: { email: mgr.email, password: PASSWORD, channel: "mobile" },
    });
    const auth = { authorization: `Bearer ${login.json().tokens.accessToken}` };
    const bad = await env.app.inject({
      method: "POST",
      url: `/v1/orgs/${t.orgId}/invitations`,
      headers: auth,
      payload: { email: "a@a.dev", role: "owner", allFarms: true },
    });
    expect(bad.statusCode).toBe(403);
    const ok = await env.app.inject({
      method: "POST",
      url: `/v1/orgs/${t.orgId}/invitations`,
      headers: auth,
      payload: { email: "b@b.dev", role: "field", farmIds: [t.farmId] },
    });
    expect(ok.statusCode).toBe(201);
    const token = new URL(ok.json().acceptUrl).hash.replace("#token=", "");
    const saved = env.clock.now;
    env.clock.now = new Date(saved.getTime() + 8 * 24 * 3600_000);
    const expired = await env.app.inject({ method: "GET", url: `/v1/auth/invitations/${token}` });
    env.clock.now = saved;
    expect(expired.statusCode).toBe(410);
  });

  it("membro revogado perde acesso imediatamente", async () => {
    const { t, auth } = await ownerLogin();
    const field = await createUser(env.db, t.orgId, "field");
    const fl = await env.app.inject({
      method: "POST",
      url: "/v1/auth/login",
      headers: csrf,
      payload: { email: field.email, password: PASSWORD, channel: "mobile" },
    });
    const fauth = { authorization: `Bearer ${fl.json().tokens.accessToken}` };
    expect(
      (
        await env.app.inject({
          method: "GET",
          url: `/v1/farms/${t.farmId}/animals`,
          headers: fauth,
        })
      ).statusCode,
    ).toBe(200);
    const rev = await env.app.inject({
      method: "POST",
      url: `/v1/orgs/${t.orgId}/members/${field.membershipId}/revoke`,
      headers: auth,
    });
    expect(rev.statusCode).toBe(204);
    expect(
      (
        await env.app.inject({
          method: "GET",
          url: `/v1/farms/${t.farmId}/animals`,
          headers: fauth,
        })
      ).statusCode,
    ).toBe(404);
  });
});
