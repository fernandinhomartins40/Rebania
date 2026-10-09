import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, type Db, type Role } from "@rebania/db";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.ts";
import type { AppContext } from "../src/lib/context.ts";
import { loadConfig } from "../src/config.ts";
import { hashPassword } from "../src/lib/crypto.ts";

export const PASSWORD = "senha-de-teste-123";
let cachedHash: string | undefined;

export interface TestEnv {
  app: FastifyInstance;
  db: Db;
  clock: { now: Date };
  mediaDir: string;
  close: () => Promise<void>;
}

export async function createTestEnv(
  extra: Pick<AppContext, "ai" | "billing"> = {},
): Promise<TestEnv> {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgresql://rebania:rebania@localhost:5432/rebania_test";
  const config = {
    ...loadConfig({
      DATABASE_URL: url,
      COOKIE_SECURE: "false",
      LOG_LEVEL: "silent",
      WEB_BASE_URL: "http://web.test",
    }),
    mediaDir: mkdtempSync(path.join(tmpdir(), "rebania-media-")),
  };
  const db = createDb({ url, max: 5 });
  const clock = { now: new Date("2026-10-08T15:00:00Z") };
  const app = await buildApp({ db, config, now: () => clock.now, ...extra });
  return {
    app,
    db,
    clock,
    mediaDir: config.mediaDir,
    close: async () => {
      await app.close();
      await db.$disconnect();
    },
  };
}

export interface Tenant {
  orgId: string;
  farmId: string;
  otherFarmId: string;
}

export async function createTenant(
  db: Db,
  name = `Org ${randomUUID().slice(0, 6)}`,
): Promise<Tenant> {
  const org = await db.organization.create({ data: { name, slug: `org-${randomUUID()}` } });
  const farm = await db.farm.create({
    data: { organizationId: org.id, name: "Fazenda Principal" },
  });
  const other = await db.farm.create({ data: { organizationId: org.id, name: "Fazenda Dois" } });
  return { orgId: org.id, farmId: farm.id, otherFarmId: other.id };
}

export async function createUser(
  db: Db,
  orgId: string,
  role: Role,
  opts: { allFarms?: boolean; farmIds?: string[] } = {},
) {
  cachedHash ??= await hashPassword(PASSWORD);
  const email = `u-${randomUUID()}@teste.dev`;
  const user = await db.user.create({
    data: { email, name: `Usuário ${role}`, passwordHash: cachedHash },
  });
  const m = await db.membership.create({
    data: {
      organizationId: orgId,
      userId: user.id,
      role,
      allFarms: opts.allFarms ?? !opts.farmIds,
    },
  });
  if (opts.farmIds?.length) {
    await db.membershipFarm.createMany({
      data: opts.farmIds.map((farmId) => ({ membershipId: m.id, farmId, organizationId: orgId })),
    });
  }
  return { id: user.id, email, membershipId: m.id };
}

/** Cliente HTTP autenticado via Bearer (canal mobile). */
export async function login(app: FastifyInstance, email: string) {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    headers: { "x-rebania-csrf": "1" },
    payload: { email, password: PASSWORD, channel: "mobile" },
  });
  if (res.statusCode !== 200) throw new Error(`login falhou: ${res.body}`);
  const token = res.json().tokens.accessToken as string;
  return client(app, { authorization: `Bearer ${token}` });
}

export function client(app: FastifyInstance, headers: Record<string, string>) {
  const call = (
    method: "GET" | "POST" | "PATCH",
    url: string,
    payload?: unknown,
    extra: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url,
      headers: { ...headers, ...extra },
      ...(payload !== undefined ? { payload: payload as object } : {}),
    });
  return {
    headers,
    get: (url: string) => call("GET", url),
    post: (url: string, payload?: unknown, extra?: Record<string, string>) =>
      call("POST", url, payload ?? {}, extra),
    patch: (url: string, payload?: unknown, extra?: Record<string, string>) =>
      call("PATCH", url, payload ?? {}, extra),
  };
}

export type Client = ReturnType<typeof client>;

let tagSeq = 0;
export function newAnimal(overrides: Record<string, unknown> = {}) {
  tagSeq++;
  return {
    sex: "female",
    category: "cow",
    origin: "purchased",
    breed: "Nelore",
    birthDate: "2021-03-10",
    identifiers: [{ type: "visual_tag", value: `T${String(tagSeq).padStart(4, "0")}` }],
    ...overrides,
  };
}
