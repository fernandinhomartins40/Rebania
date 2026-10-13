import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  client,
  createStaff,
  createTenant,
  createTestEnv,
  createUser,
  sessionClient,
  type Client,
  type TestEnv,
} from "./helpers.ts";

/** Autenticador de software: faz o papel do celular (digital/Face ID) no teste. */
const ORIGIN = "http://web.test";
const RP_ID = "web.test";
const b64u = (b: Uint8Array | Buffer) => Buffer.from(b).toString("base64url");
const sha = (b: Uint8Array | string) => createHash("sha256").update(b).digest();
const UP = 0x01;
const UV = 0x04;
const AT = 0x40;

class SoftAuthenticator {
  readonly credentialId = randomBytes(32);
  private readonly key: KeyObject;
  private readonly cose: Uint8Array;
  private counter = 0;
  userHandle = "";

  constructor() {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.key = privateKey;
    const jwk = publicKey.export({ format: "jwk" });
    this.cose = isoCBOR.encode(
      new Map<number, number | Uint8Array>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, Buffer.from(jwk.x!, "base64url")],
        [-3, Buffer.from(jwk.y!, "base64url")],
      ]),
    );
  }

  private authData(flags: number, withCredential: boolean) {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    const parts = [sha(RP_ID), Buffer.from([flags]), count];
    if (withCredential) {
      const len = Buffer.alloc(2);
      len.writeUInt16BE(this.credentialId.length);
      parts.push(Buffer.alloc(16), len, this.credentialId, Buffer.from(this.cose));
    }
    return Buffer.concat(parts);
  }

  register(options: { challenge: string; user: { id: string } }, flags = UP | UV | AT) {
    this.userHandle = options.user.id;
    const clientData = Buffer.from(
      JSON.stringify({ type: "webauthn.create", challenge: options.challenge, origin: ORIGIN }),
    );
    const attestationObject = isoCBOR.encode(
      new Map<string, unknown>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", this.authData(flags, true)],
      ]) as never,
    );
    return {
      id: b64u(this.credentialId),
      rawId: b64u(this.credentialId),
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64u(clientData),
        attestationObject: b64u(attestationObject),
        transports: ["internal"],
      },
    };
  }

  login(options: { challenge: string }, flags = UP | UV) {
    this.counter += 1;
    const clientData = Buffer.from(
      JSON.stringify({ type: "webauthn.get", challenge: options.challenge, origin: ORIGIN }),
    );
    const authData = this.authData(flags, false);
    const signature = sign("sha256", Buffer.concat([authData, sha(clientData)]), this.key);
    return {
      id: b64u(this.credentialId),
      rawId: b64u(this.credentialId),
      type: "public-key",
      authenticatorAttachment: "platform",
      clientExtensionResults: {},
      response: {
        clientDataJSON: b64u(clientData),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        userHandle: this.userHandle,
      },
    };
  }
}

let env: TestEnv;
let anon: Client;

beforeAll(async () => {
  env = await createTestEnv();
  anon = client(env.app, { "x-rebania-csrf": "1" });
});
afterAll(() => env.close());

async function registerFor(c: Client, auth: SoftAuthenticator, label = "Celular do teste") {
  const o = await c.post("/v1/auth/passkeys/register/options");
  expect(o.statusCode).toBe(200);
  const { challengeId, options } = o.json();
  return c.post("/v1/auth/passkeys/register/verify", {
    challengeId,
    response: auth.register(options),
    label,
  });
}

async function loginWith(auth: SoftAuthenticator, flags?: number) {
  const o = await anon.post("/v1/auth/passkeys/login/options");
  expect(o.statusCode).toBe(200);
  const { challengeId, options } = o.json();
  return anon.post("/v1/auth/passkeys/login/verify", {
    challengeId,
    response: auth.login(options, flags),
  });
}

describe("passkeys (digital, senha do celular, Face ID)", () => {
  it("cadastra no aparelho e entra sem senha, com sessão web e auditoria", async () => {
    const t = await createTenant(env.db);
    const u = await createUser(env.db, t.orgId, "field");
    const me = await sessionClient(env, u.id);
    const auth = new SoftAuthenticator();

    const o = (await me.post("/v1/auth/passkeys/register/options")).json();
    expect(o.options.rp.id).toBe(RP_ID);
    expect(o.options.authenticatorSelection).toMatchObject({
      residentKey: "required",
      userVerification: "required",
    });
    const reg = await me.post("/v1/auth/passkeys/register/verify", {
      challengeId: o.challengeId,
      response: auth.register(o.options),
      label: "Meu Android",
    });
    expect(reg.statusCode).toBe(201);
    // O desafio é de uso único.
    expect(
      (
        await me.post("/v1/auth/passkeys/register/verify", {
          challengeId: o.challengeId,
          response: auth.register(o.options),
        })
      ).statusCode,
    ).toBe(422);
    const list = (await me.get("/v1/auth/passkeys")).json().items;
    expect(list).toMatchObject([{ label: "Meu Android", lastUsedAt: null }]);

    const login = await loginWith(auth);
    expect(login.statusCode).toBe(200);
    expect(login.json().user.id).toBe(u.id);
    const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
    expect(cookie).toMatch(/^rebania_session=/);
    const who = await client(env.app, { cookie }).get("/v1/auth/me");
    expect(who.statusCode).toBe(200);
    expect(who.json().user.id).toBe(u.id);
    expect((await me.get("/v1/auth/passkeys")).json().items[0].lastUsedAt).not.toBeNull();

    const logs = await env.db.auditEntry.findMany({
      where: { actorUserId: u.id, action: { in: ["auth.passkey_added", "auth.login"] } },
    });
    expect(logs.map((l) => l.action).sort()).toEqual(["auth.login", "auth.passkey_added"]);
    expect(logs.find((l) => l.action === "auth.login")!.data).toMatchObject({
      method: "passkey",
    });
  });

  it("recusa assinatura de outro aparelho, desafio reaproveitado e falta de biometria", async () => {
    const t = await createTenant(env.db);
    const u = await createUser(env.db, t.orgId, "owner");
    const me = await sessionClient(env, u.id);
    const auth = new SoftAuthenticator();
    expect((await registerFor(me, auth)).statusCode).toBe(201);

    // Outro aparelho tentando se passar pela mesma credencial: assinatura não confere.
    const impostor = new SoftAuthenticator();
    Object.assign(impostor, { credentialId: auth.credentialId, userHandle: auth.userHandle });
    expect((await loginWith(impostor)).statusCode).toBe(401);

    // Sem verificação do usuário (só "toque", sem digital/PIN/Face ID): recusado.
    expect((await loginWith(auth, UP)).statusCode).toBe(401);

    // Desafio reaproveitado.
    const o = (await anon.post("/v1/auth/passkeys/login/options")).json();
    const ok = await anon.post("/v1/auth/passkeys/login/verify", {
      challengeId: o.challengeId,
      response: auth.login(o.options),
    });
    expect(ok.statusCode).toBe(200);
    const again = await anon.post("/v1/auth/passkeys/login/verify", {
      challengeId: o.challengeId,
      response: auth.login(o.options),
    });
    expect(again.statusCode).toBe(401);
    expect(again.json().error.code).toBe("passkey_invalid");
  });

  it("passkey removida e usuário desativado deixam de entrar", async () => {
    const t = await createTenant(env.db);
    const u = await createUser(env.db, t.orgId, "manager");
    const me = await sessionClient(env, u.id);
    const a1 = new SoftAuthenticator();
    const a2 = new SoftAuthenticator();
    const r1 = await registerFor(me, a1, "Celular");
    expect((await registerFor(me, a2, "Tablet")).statusCode).toBe(201);

    // Só o dono remove a própria passkey.
    const other = await sessionClient(env, (await createUser(env.db, t.orgId, "owner")).id);
    expect((await other.post(`/v1/auth/passkeys/${r1.json().id}/revoke`)).statusCode).toBe(404);
    expect((await me.post(`/v1/auth/passkeys/${r1.json().id}/revoke`)).statusCode).toBe(204);
    expect((await loginWith(a1)).statusCode).toBe(401);
    expect((await loginWith(a2)).statusCode).toBe(200);
    expect(await env.db.passkey.count({ where: { userId: u.id } })).toBe(2); // revogada fica

    await env.db.user.update({ where: { id: u.id }, data: { disabledAt: env.clock.now } });
    expect((await loginWith(a2)).statusCode).toBe(401);
  });

  it("conta da plataforma não usa passkey (entra com senha e código)", async () => {
    const s = await createStaff(env.db);
    const staff = await sessionClient(env, s.id);
    const r = await staff.post("/v1/auth/passkeys/register/options");
    expect(r.statusCode).toBe(422);
    expect(r.json().error.code).toBe("platform_account");
  });
});
