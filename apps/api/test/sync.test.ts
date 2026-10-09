/**
 * Testes obrigatórios 4 e 5 (MN §15): modo avião com 100 eventos, reenvio sem
 * duplicar, conflito entre dois aparelhos com política explícita.
 * Usa o Outbox real de @rebania/sync-core contra a API real.
 */
import { randomUUID } from "node:crypto";
import type { SyncMutation } from "@rebania/contracts";
import { MemoryOutboxStorage, Outbox, type SyncTransport } from "@rebania/sync-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTenant,
  createTestEnv,
  createUser,
  login,
  newAnimal,
  type Client,
  type Tenant,
  type TestEnv,
} from "./helpers.ts";

let env: TestEnv;
let t: Tenant;
let field: Client;
const ts = () => new Date().toISOString();

beforeAll(async () => {
  env = await createTestEnv();
  t = await createTenant(env.db);
  field = await login(
    env.app,
    (await createUser(env.db, t.orgId, "field", { farmIds: [t.farmId] })).email,
  );
});
afterAll(() => env.close());

function transport(c: Client): SyncTransport {
  return {
    async push(input) {
      const res = await c.post("/v1/sync/push", input);
      if (res.statusCode !== 200) throw new Error(`push ${res.statusCode}: ${res.body}`);
      return res.json();
    },
  };
}

function createMutation(animalId: string, tag: string): SyncMutation {
  return {
    type: "animal.create",
    mutationId: randomUUID(),
    entityId: animalId,
    occurredAt: ts(),
    createdAt: ts(),
    schemaVersion: 1,
    payload: newAnimal({ identifiers: [{ type: "visual_tag", value: tag }] }) as never,
  };
}

function weightMutation(animalId: string, weightKg: number, measuredOn: string): SyncMutation {
  return {
    type: "weight.record",
    mutationId: randomUUID(),
    entityId: animalId,
    occurredAt: ts(),
    createdAt: ts(),
    schemaVersion: 1,
    payload: { weightKg, measuredOn },
  };
}

describe("sync offline", () => {
  it("100 eventos offline + reinício + reconexão: nenhum perdido ou duplicado", async () => {
    const storage = new MemoryOutboxStorage();
    const deviceId = randomUUID();
    const outbox = new Outbox(storage, deviceId);
    const animals = Array.from({ length: 20 }, () => randomUUID());
    for (const [i, id] of animals.entries())
      await outbox.enqueue(t.farmId, createMutation(id, `OFF${i}`));
    for (let i = 0; i < 80; i++) {
      await outbox.enqueue(
        t.farmId,
        weightMutation(animals[i % 20]!, 200 + i, `2026-0${1 + Math.floor(i / 20)}-15`),
      );
    }
    // falha de rede no meio: nada se perde
    const offline = await new Outbox(storage, deviceId).flush({
      push: async () => {
        throw new Error("sem sinal");
      },
    });
    expect(offline).toMatchObject({ networkError: true, remaining: 100 });

    // reinício do app: nova instância sobre o mesmo armazenamento
    const reopened = new Outbox(storage, deviceId, () => Date.now() + 10 * 60_000);
    const r = await reopened.flush(transport(field));
    expect(r).toMatchObject({ accepted: 100, rejected: 0, conflicts: 0, remaining: 0 });
    expect(await env.db.animal.count({ where: { id: { in: animals } } })).toBe(20);
    expect(await env.db.weightMeasurement.count({ where: { animalId: { in: animals } } })).toBe(80);
  });

  it("reenviar o mesmo lote (resposta perdida) devolve os mesmos recibos sem duplicar", async () => {
    const animalId = randomUUID();
    const mutations = [
      createMutation(animalId, "RETRY1"),
      weightMutation(animalId, 300, "2026-10-01"),
    ];
    const body = { farmId: t.farmId, deviceId: randomUUID(), mutations };
    const first = (await field.post("/v1/sync/push", body)).json();
    const second = (await field.post("/v1/sync/push", body)).json();
    expect(second.receipts).toEqual(first.receipts);
    expect(first.receipts.every((r: { status: string }) => r.status === "accepted")).toBe(true);
    expect(await env.db.weightMeasurement.count({ where: { animalId } })).toBe(1);
    expect(await env.db.animalEvent.count({ where: { animalId } })).toBe(2);
  });

  it("lote com item inválido: os válidos são aceitos e o inválido fica rejeitado e visível", async () => {
    const animalId = randomUUID();
    const res = await field.post("/v1/sync/push", {
      farmId: t.farmId,
      deviceId: randomUUID(),
      mutations: [
        createMutation(animalId, "PART1"),
        weightMutation(animalId, 5, "2026-10-01"), // fora de faixa
        { type: "desconhecido", mutationId: "x" },
        weightMutation(animalId, 320, "2026-10-02"),
      ],
    });
    const statuses = res.json().receipts.map((r: { status: string }) => r.status);
    expect(statuses).toEqual(["accepted", "rejected", "rejected", "accepted"]);
    expect(res.json().receipts[1].code).toBe("weight_out_of_range");
  });

  it("dois aparelhos movem o mesmo animal: um aceito, outro em conflito, nada sobrescrito", async () => {
    const g1 = (
      await (
        await login(env.app, (await createUser(env.db, t.orgId, "owner")).email)
      ).post(`/v1/farms/${t.farmId}/groups`, { name: "Destino 1" })
    ).json();
    const owner = await login(env.app, (await createUser(env.db, t.orgId, "owner")).email);
    const g2 = (await owner.post(`/v1/farms/${t.farmId}/groups`, { name: "Destino 2" })).json();
    const animal = (await field.post(`/v1/farms/${t.farmId}/animals`, newAnimal())).json();
    const move = (groupId: string): SyncMutation => ({
      type: "animal.move",
      mutationId: randomUUID(),
      entityId: animal.id,
      occurredAt: ts(),
      createdAt: ts(),
      schemaVersion: 1,
      payload: { expectedVersion: 1, groupId, pastureId: null, effectiveOn: "2026-10-05" },
    });
    const deviceA = new Outbox(new MemoryOutboxStorage(), randomUUID());
    const deviceB = new Outbox(new MemoryOutboxStorage(), randomUUID());
    await deviceA.enqueue(t.farmId, move(g1.id));
    await deviceB.enqueue(t.farmId, move(g2.id));
    const [ra, rb] = await Promise.all([
      deviceA.flush(transport(field)),
      deviceB.flush(transport(owner)),
    ]);
    expect(ra.accepted + rb.accepted).toBe(1);
    expect(ra.conflicts + rb.conflicts).toBe(1);
    const loser = ra.conflicts ? deviceA : deviceB;
    const [item] = await loser.items();
    expect(item).toMatchObject({ state: "conflict", lastError: { code: "version_conflict" } });
    const final = (await field.get(`/v1/farms/${t.farmId}/animals/${animal.id}`)).json();
    expect(final.version).toBe(2);
    expect([g1.id, g2.id]).toContain(final.groupId);
  });

  it("pesagens de dois aparelhos coexistem (política append)", async () => {
    const animal = (await field.post(`/v1/farms/${t.farmId}/animals`, newAnimal())).json();
    const body = (w: number) => ({
      farmId: t.farmId,
      deviceId: randomUUID(),
      mutations: [weightMutation(animal.id, w, "2026-10-03")],
    });
    const [a, b] = await Promise.all([
      field.post("/v1/sync/push", body(410)),
      field.post("/v1/sync/push", body(412)),
    ]);
    expect(a.json().receipts[0].status).toBe("accepted");
    expect(b.json().receipts[0].status).toBe("accepted");
    expect(await env.db.weightMeasurement.count({ where: { animalId: animal.id } })).toBe(2);
  });

  it("pull incremental por cursor entrega mudanças e paginação", async () => {
    const start = (await field.get(`/v1/sync/pull?farmId=${t.farmId}&cursor=0&limit=500`)).json();
    let cursor = start.cursor;
    expect(start.changes.length).toBeGreaterThan(0);
    const created = (await field.post(`/v1/farms/${t.farmId}/animals`, newAnimal())).json();
    await field.post(`/v1/farms/${t.farmId}/animals/${created.id}/weights`, {
      weightKg: 333,
      measuredOn: "2026-10-04",
    });
    const delta = (await field.get(`/v1/sync/pull?farmId=${t.farmId}&cursor=${cursor}`)).json();
    const animalChange = delta.changes.find(
      (c: { entity: string; entityId: string }) =>
        c.entity === "animal" && c.entityId === created.id,
    );
    expect(animalChange.data).toMatchObject({ id: created.id, lastWeight: { weightKg: 333 } });
    expect(delta.changes.some((c: { entity: string }) => c.entity === "weight")).toBe(true);
    cursor = delta.cursor;
    const empty = (await field.get(`/v1/sync/pull?farmId=${t.farmId}&cursor=${cursor}`)).json();
    expect(empty).toEqual({ changes: [], cursor, hasMore: false });

    const paged = (await field.get(`/v1/sync/pull?farmId=${t.farmId}&cursor=0&limit=3`)).json();
    expect(paged.hasMore).toBe(true);
    expect(paged.changes.length).toBeLessThanOrEqual(3);
  });

  it("perfil sem permissão recebe recibo rejeitado por item", async () => {
    const vet = await login(
      env.app,
      (await createUser(env.db, t.orgId, "veterinarian", { farmIds: [t.farmId] })).email,
    );
    const res = await vet.post("/v1/sync/push", {
      farmId: t.farmId,
      deviceId: randomUUID(),
      mutations: [createMutation(randomUUID(), "VET1")],
    });
    expect(res.json().receipts[0]).toMatchObject({ status: "rejected", code: "forbidden" });
  });
});
