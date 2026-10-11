import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomToken, sha256 } from "../src/lib/crypto.ts";
import {
  createStaff,
  createTenant,
  createTestEnv,
  createUser,
  login,
  PASSWORD,
  type TestEnv,
} from "./helpers.ts";

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

describe("conta da plataforma × cliente", () => {
  it("superadmin entra sem fazenda e /me sinaliza a conta da plataforma", async () => {
    const staff = await createStaff(env.db);
    const c = await login(env.app, staff.email);
    const me = (await c.get("/v1/auth/me")).json();
    expect(me.platformAdmin).toBe(true);
    expect(me.memberships).toEqual([]);
    expect((await c.get("/v1/platform/orgs")).statusCode).toBe(200);
  });

  it("superadmin não pode ser convidado para uma organização", async () => {
    const staff = await createStaff(env.db);
    const t = await createTenant(env.db);
    const owner = await createUser(env.db, t.orgId, "owner");
    const c = await login(env.app, owner.email);
    const res = await c.post(`/v1/orgs/${t.orgId}/invitations`, {
      email: staff.email,
      role: "manager",
      allFarms: true,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("platform_account_separation");
  });

  it("superadmin não aceita convite já emitido (e o convite não é consumido)", async () => {
    const staff = await createStaff(env.db);
    const t = await createTenant(env.db);
    const token = randomToken();
    const inv = await env.db.invitation.create({
      data: {
        organizationId: t.orgId,
        email: staff.email,
        role: "field",
        allFarms: true,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    const res = await env.app.inject({
      method: "POST",
      url: "/v1/auth/invitations/accept",
      headers: { "x-rebania-csrf": "1" },
      payload: { token, password: PASSWORD },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("platform_account_separation");
    const after = await env.db.invitation.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.acceptedAt).toBeNull();
    expect(await env.db.membership.count({ where: { userId: staff.id } })).toBe(0);
  });

  it("implantação não aceita superadmin como proprietário", async () => {
    const staff = await createStaff(env.db);
    const other = await createStaff(env.db);
    const c = await login(env.app, staff.email);
    const res = await c.post("/v1/platform/orgs", {
      orgName: `Org ${randomUUID().slice(0, 6)}`,
      farmName: "Fazenda",
      ownerEmail: other.email,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("platform_account_separation");
  });
});
