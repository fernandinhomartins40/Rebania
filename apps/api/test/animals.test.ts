import { randomUUID } from "node:crypto";
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
let owner: Client;
let field: Client;
let vet: Client;
const base = () => `/v1/farms/${t.farmId}`;

beforeAll(async () => {
  env = await createTestEnv();
  t = await createTenant(env.db);
  owner = await login(env.app, (await createUser(env.db, t.orgId, "owner")).email);
  field = await login(
    env.app,
    (await createUser(env.db, t.orgId, "field", { farmIds: [t.farmId] })).email,
  );
  vet = await login(
    env.app,
    (await createUser(env.db, t.orgId, "veterinarian", { farmIds: [t.farmId] })).email,
  );
});
afterAll(() => env.close());

describe("cadastro e passaporte", () => {
  it("cadastra com identificadores, lote e mostra no passaporte", async () => {
    const group = (await owner.post(`${base()}/groups`, { name: "Lote 03" })).json();
    const res = await field.post(
      `${base()}/animals`,
      newAnimal({
        groupId: group.id,
        identifiers: [
          { type: "visual_tag", value: " 0512 " },
          { type: "rfid", value: "982 000123456789" },
        ],
      }),
    );
    expect(res.statusCode).toBe(201);
    const a = res.json();
    expect(a).toMatchObject({
      category: "cow",
      status: "active",
      groupName: "Lote 03",
      version: 1,
      primaryIdentifier: "0512",
    });
    expect(a.identifiers.map((i: { display: string }) => i.display)).toEqual([
      "0512",
      "982 000123456789",
    ]);

    const list = await field.get(`${base()}/animals?q=0512`);
    expect(list.json().items.map((x: { id: string }) => x.id)).toContain(a.id);
    const byRfid = await field.get(`${base()}/identifiers/resolve?value=982000123456789`);
    expect(byRfid.json().matches[0]).toMatchObject({ animalId: a.id, identifierType: "rfid" });

    const hist = await field.get(`${base()}/animals/${a.id}/history`);
    expect(hist.json().timeline[0]).toMatchObject({
      type: "registered",
      summary: "Cadastrado como Matriz",
    });
  });

  it("valida regras: categoria × sexo, data futura, brinco duplicado", async () => {
    const wrong = await field.post(
      `${base()}/animals`,
      newAnimal({ sex: "male", category: "cow" }),
    );
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json().error.code).toBe("category_sex_mismatch");
    const future = await field.post(`${base()}/animals`, newAnimal({ birthDate: "2027-01-01" }));
    expect(future.json().error.code).toBe("event_in_future");
    await field.post(
      `${base()}/animals`,
      newAnimal({ identifiers: [{ type: "visual_tag", value: "DUP1" }] }),
    );
    const dup = await field.post(
      `${base()}/animals`,
      newAnimal({ identifiers: [{ type: "visual_tag", value: "dup1" }] }),
    );
    expect(dup.statusCode).toBe(422);
    expect(dup.json().error.code).toBe("identifier_in_use");
    const noId = await field.post(`${base()}/animals`, newAnimal({ identifiers: [] }));
    expect(noId.statusCode).toBe(400);
  });

  it("veterinário não cadastra animal (permissão)", async () => {
    const res = await vet.post(`${base()}/animals`, newAnimal());
    expect(res.statusCode).toBe(403);
  });

  it("mesma Idempotency-Key cria um único animal; conteúdo diferente é rejeitado", async () => {
    const key = randomUUID();
    const body = newAnimal();
    const r1 = await field.post(`${base()}/animals`, body, { "idempotency-key": key });
    const r2 = await field.post(`${base()}/animals`, body, { "idempotency-key": key });
    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    expect(r2.json().id).toBe(r1.json().id);
    expect(
      await env.db.animal.count({
        where: { identifiers: { some: { normalizedValue: body.identifiers[0]!.value } } },
      }),
    ).toBe(1);
    const r3 = await field.post(`${base()}/animals`, newAnimal(), { "idempotency-key": key });
    expect(r3.json().error.code).toBe("mutation_id_reused");
  });

  it("requisições concorrentes com a mesma chave não duplicam", async () => {
    const key = randomUUID();
    const body = newAnimal();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        field.post(`${base()}/animals`, body, { "idempotency-key": key }),
      ),
    );
    const ids = new Set(results.map((r) => r.json().id));
    expect(results.every((r) => r.statusCode === 201)).toBe(true);
    expect(ids.size).toBe(1);
  });
});

describe("pesagem e GMD", () => {
  it("registra pesagens, calcula GMD e alerta inconsistência sem bloquear", async () => {
    const a = (
      await field.post(
        `${base()}/animals`,
        newAnimal({ category: "steer", sex: "male", birthDate: "2025-06-01" }),
      )
    ).json();
    expect(
      (
        await field.post(`${base()}/animals/${a.id}/weights`, {
          weightKg: 200,
          measuredOn: "2026-07-01",
        })
      ).statusCode,
    ).toBe(201);
    const second = await field.post(`${base()}/animals/${a.id}/weights`, {
      weightKg: 254,
      measuredOn: "2026-08-30",
    });
    expect(second.json().warning).toBeNull();
    const weird = await field.post(`${base()}/animals/${a.id}/weights`, {
      weightKg: 400,
      measuredOn: "2026-09-01",
    });
    expect(weird.statusCode).toBe(201);
    expect(weird.json().warning).toMatch(/Confira o peso/);
    const hist = (await field.get(`${base()}/animals/${a.id}/history`)).json();
    expect(hist.weights).toHaveLength(3);
    expect(hist.adg).toMatchObject({ from: "2026-07-01", to: "2026-09-01", days: 62 });
    expect(hist.timeline.find((e: { type: string }) => e.type === "weighed").summary).toMatch(/kg/);
    expect((await field.get(`${base()}/animals/${a.id}`)).json().lastWeight).toEqual({
      weightKg: 400,
      measuredOn: "2026-09-01",
    });
  });

  it("rejeita pesagem antes do nascimento, futura ou fora de faixa", async () => {
    const a = (
      await field.post(
        `${base()}/animals`,
        newAnimal({ birthDate: "2026-01-01", category: "calf_female" }),
      )
    ).json();
    expect(
      (
        await field.post(`${base()}/animals/${a.id}/weights`, {
          weightKg: 50,
          measuredOn: "2025-12-01",
        })
      ).json().error.code,
    ).toBe("event_before_birth");
    expect(
      (
        await field.post(`${base()}/animals/${a.id}/weights`, {
          weightKg: 50,
          measuredOn: "2026-10-09",
        })
      ).json().error.code,
    ).toBe("event_in_future");
    expect(
      (
        await field.post(`${base()}/animals/${a.id}/weights`, {
          weightKg: 5,
          measuredOn: "2026-10-01",
        })
      ).json().error.code,
    ).toBe("weight_out_of_range");
  });

  it("'hoje' respeita o timezone da fazenda", async () => {
    // 2026-10-09T01:00Z = 08/10 22h em São Paulo: 09/10 ainda é futuro na fazenda.
    const saved = env.clock.now;
    env.clock.now = new Date("2026-10-09T01:00:00Z");
    const fresh = await login(
      env.app,
      (await createUser(env.db, t.orgId, "field", { farmIds: [t.farmId] })).email,
    );
    const a = (await fresh.post(`${base()}/animals`, newAnimal())).json();
    const res = await fresh.post(`${base()}/animals/${a.id}/weights`, {
      weightKg: 400,
      measuredOn: "2026-10-09",
    });
    env.clock.now = saved;
    expect(res.json().error.code).toBe("event_in_future");
  });
});

describe("movimentação, edição e retag", () => {
  it("movimenta com versão e detecta conflito sem sobrescrever", async () => {
    const g1 = (
      await owner.post(`${base()}/groups`, { name: `L-${randomUUID().slice(0, 4)}` })
    ).json();
    const g2 = (
      await owner.post(`${base()}/groups`, { name: `L-${randomUUID().slice(0, 4)}` })
    ).json();
    const a = (await field.post(`${base()}/animals`, newAnimal())).json();
    const m1 = await field.post(`${base()}/animals/${a.id}/move`, {
      expectedVersion: 1,
      groupId: g1.id,
      pastureId: null,
      effectiveOn: "2026-10-01",
    });
    expect(m1.statusCode).toBe(200);
    expect(m1.json()).toMatchObject({ groupId: g1.id, version: 2 });
    const stale = await field.post(`${base()}/animals/${a.id}/move`, {
      expectedVersion: 1,
      groupId: g2.id,
      pastureId: null,
      effectiveOn: "2026-10-02",
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error).toMatchObject({
      code: "version_conflict",
      details: { serverVersion: 2 },
    });
    expect((await field.get(`${base()}/animals/${a.id}`)).json().groupId).toBe(g1.id);
  });

  it("edição gera evento com antes/depois", async () => {
    const a = (await field.post(`${base()}/animals`, newAnimal({ breed: "Nelore" }))).json();
    const res = await field.patch(`${base()}/animals/${a.id}`, {
      expectedVersion: 1,
      patch: { breed: "Angus" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ breed: "Angus", version: 2 });
    const ev = (await field.get(`${base()}/animals/${a.id}/history`))
      .json()
      .timeline.find((e: { type: string }) => e.type === "updated");
    expect(ev.data).toMatchObject({ before: { breed: "Nelore" }, after: { breed: "Angus" } });
  });

  it("retag preserva identificador antigo e exige permissão", async () => {
    const a = (
      await field.post(
        `${base()}/animals`,
        newAnimal({ identifiers: [{ type: "visual_tag", value: "OLD1" }] }),
      )
    ).json();
    const denied = await field.post(`${base()}/animals/${a.id}/identifiers`, {
      type: "visual_tag",
      value: "NEW1",
      replaceActiveOfSameType: true,
    });
    expect(denied.statusCode).toBe(403);
    const ok = await owner.post(`${base()}/animals/${a.id}/identifiers`, {
      type: "visual_tag",
      value: "NEW1",
      replaceActiveOfSameType: true,
      reason: "brinco perdido",
    });
    expect(ok.statusCode).toBe(201);
    const ids = ok.json().identifiers;
    expect(ids).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "OLD1", status: "retired" }),
        expect.objectContaining({ value: "NEW1", status: "active" }),
      ]),
    );
    expect(ok.json().primaryIdentifier).toBe("NEW1");
    // brinco antigo fica livre para outro animal, mas a busca ainda encontra o histórico
    const resolve = (await field.get(`${base()}/identifiers/resolve?value=OLD1`)).json();
    expect(resolve.matches[0]).toMatchObject({ animalId: a.id, identifierStatus: "retired" });
    expect(
      await env.db.auditEntry.count({ where: { entityId: a.id, action: "animal.retagged" } }),
    ).toBe(1);
  });

  it("auditoria é append-only no banco", async () => {
    const entry = await env.db.auditEntry.findFirst();
    await expect(
      env.db.auditEntry.update({ where: { id: entry!.id }, data: { action: "x" } }),
    ).rejects.toThrow();
  });
});

describe("resumo da fazenda", () => {
  it("conta animais ativos por categoria e lotes", async () => {
    const s = (await owner.get(`${base()}/summary`)).json();
    expect(s.activeAnimals).toBeGreaterThan(0);
    expect(s.byCategory.cow).toBeGreaterThan(0);
    expect(s.today).toBe("2026-10-08");
  });
});
