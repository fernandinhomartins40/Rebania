/**
 * Teste obrigatório 1 (MN §15): cliente A não consulta/altera dados do cliente B.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTenant, createTestEnv, createUser, login, newAnimal, type Client, type Tenant, type TestEnv } from "./helpers.ts";

let env: TestEnv;
let A: Tenant;
let B: Tenant;
let clientA: Client;
let animalB: string;
let groupB: string;

beforeAll(async () => {
  env = await createTestEnv();
  A = await createTenant(env.db, "Org A");
  B = await createTenant(env.db, "Org B");
  const ua = await createUser(env.db, A.orgId, "owner");
  const ub = await createUser(env.db, B.orgId, "owner");
  clientA = await login(env.app, ua.email);
  const clientB = await login(env.app, ub.email);
  groupB = (await clientB.post(`/v1/farms/${B.farmId}/groups`, { name: "Lote B" })).json().id;
  const created = await clientB.post(`/v1/farms/${B.farmId}/animals`, newAnimal({ identifiers: [{ type: "visual_tag", value: "0284" }] }));
  expect(created.statusCode).toBe(201);
  animalB = created.json().id;
});
afterAll(() => env.close());

describe("isolamento entre organizações", () => {
  it("leituras da fazenda B respondem 404 para A", async () => {
    for (const url of [
      `/v1/farms/${B.farmId}/animals`,
      `/v1/farms/${B.farmId}/animals/${animalB}`,
      `/v1/farms/${B.farmId}/animals/${animalB}/history`,
      `/v1/farms/${B.farmId}/summary`,
      `/v1/farms/${B.farmId}/groups`,
      `/v1/farms/${B.farmId}/identifiers/resolve?value=0284`,
      `/v1/sync/pull?farmId=${B.farmId}`,
      `/v1/orgs/${B.orgId}/members`,
    ]) {
      const res = await clientA.get(url);
      expect(res.statusCode, url).toBe(404);
    }
  });

  it("escritas na fazenda B respondem 404 e nada é gravado", async () => {
    const before = await env.db.animal.count({ where: { farmId: B.farmId } });
    const attempts = [
      clientA.post(`/v1/farms/${B.farmId}/animals`, newAnimal()),
      clientA.post(`/v1/farms/${B.farmId}/animals/${animalB}/weights`, { weightKg: 300, measuredOn: "2026-10-01" }),
      clientA.post(`/v1/farms/${B.farmId}/groups`, { name: "invasor" }),
      clientA.post(`/v1/orgs/${B.orgId}/invitations`, { email: "x@x.dev", role: "owner", allFarms: true }),
      clientA.post(`/v1/orgs/${B.orgId}/farms`, { name: "invasora" }),
      clientA.post(`/v1/sync/push`, {
        farmId: B.farmId,
        deviceId: randomUUID(),
        mutations: [{ type: "weight.record", mutationId: randomUUID(), entityId: animalB, occurredAt: new Date().toISOString(), createdAt: new Date().toISOString(), schemaVersion: 1, payload: { weightKg: 300, measuredOn: "2026-10-01" } }],
      }),
    ];
    for (const res of await Promise.all(attempts)) expect(res.statusCode).toBe(404);
    expect(await env.db.animal.count({ where: { farmId: B.farmId } })).toBe(before);
    expect(await env.db.weightMeasurement.count({ where: { farmId: B.farmId } })).toBe(0);
  });

  it("A não acessa animal de B usando a própria fazenda na URL", async () => {
    expect((await clientA.get(`/v1/farms/${A.farmId}/animals/${animalB}`)).statusCode).toBe(404);
    const w = await clientA.post(`/v1/farms/${A.farmId}/animals/${animalB}/weights`, { weightKg: 300, measuredOn: "2026-10-01" });
    expect(w.statusCode).toBe(404);
    expect((await clientA.get(`/v1/farms/${A.farmId}/animals/${animalB}/history`)).statusCode).toBe(404);
  });

  it("A não referencia lote, mãe ou animal de B ao cadastrar", async () => {
    const withGroup = await clientA.post(`/v1/farms/${A.farmId}/animals`, newAnimal({ groupId: groupB }));
    expect(withGroup.statusCode).toBe(422);
    expect(withGroup.json().error.code).toBe("group_not_found");
    const withDam = await clientA.post(`/v1/farms/${A.farmId}/animals`, newAnimal({ category: "calf_female", birthDate: "2026-09-01", damId: animalB }));
    expect(withDam.statusCode).toBe(422);
    expect(withDam.json().error.code).toBe("parent_not_found");
    // Mesmo id de animal gerado pelo cliente: não sobrescreve/colide com B
    const hijack = await clientA.post(`/v1/farms/${A.farmId}/animals`, newAnimal({ id: animalB }));
    expect(hijack.statusCode).toBe(422);
    expect((await env.db.animal.findUnique({ where: { id: animalB } }))!.farmId).toBe(B.farmId);
  });

  it("A pode usar o mesmo número de brinco que B (unicidade por fazenda)", async () => {
    const res = await clientA.post(`/v1/farms/${A.farmId}/animals`, newAnimal({ identifiers: [{ type: "visual_tag", value: "0284" }] }));
    expect(res.statusCode).toBe(201);
    const resolve = await clientA.get(`/v1/farms/${A.farmId}/identifiers/resolve?value=0284`);
    expect(resolve.json().matches).toHaveLength(1);
    expect(resolve.json().matches[0].animalId).toBe(res.json().id);
  });

  it("banco recusa referência cruzada mesmo se a aplicação falhar (FK composta)", async () => {
    const animalA = (await clientA.post(`/v1/farms/${A.farmId}/animals`, newAnimal())).json().id;
    await expect(
      env.db.animal.update({ where: { id: animalA }, data: { groupId: groupB } }),
    ).rejects.toThrow();
    await expect(
      env.db.weightMeasurement.create({
        data: { organizationId: A.orgId, farmId: A.farmId, animalId: animalB, weightKg: "300", measuredOn: new Date("2026-10-01") },
      }),
    ).rejects.toThrow();
  });

  it("mutationId de B não vaza recibo para A", async () => {
    const mutationId = randomUUID();
    const ub = await createUser(env.db, B.orgId, "owner");
    const clientB = await login(env.app, ub.email);
    const body = { weightKg: 301, measuredOn: "2026-10-01" };
    const okB = await clientB.post(`/v1/farms/${B.farmId}/animals/${animalB}/weights`, body, { "idempotency-key": mutationId });
    expect(okB.statusCode).toBe(201);
    const animalA = (await clientA.post(`/v1/farms/${A.farmId}/animals`, newAnimal())).json().id;
    const reuse = await clientA.post(`/v1/farms/${A.farmId}/animals/${animalA}/weights`, body, { "idempotency-key": mutationId });
    expect(reuse.statusCode).toBe(422);
    expect(reuse.json().error.code).toBe("mutation_id_reused");
    expect(JSON.stringify(reuse.json())).not.toContain(animalB);
  });
});
