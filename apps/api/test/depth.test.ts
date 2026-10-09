/**
 * G8 — módulos de profundidade atrás de chave por fazenda e ocorrências (T42).
 */
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
const base = () => `/v1/farms/${t.farmId}`;

beforeAll(async () => {
  env = await createTestEnv();
  t = await createTenant(env.db);
  owner = await login(env.app, (await createUser(env.db, t.orgId, "owner")).email);
  field = await login(
    env.app,
    (await createUser(env.db, t.orgId, "field", { farmIds: [t.farmId] })).email,
  );
});
afterAll(() => env.close());

describe("chaves de módulo", () => {
  it("desligado por padrão: rotas e relatórios respondem 409", async () => {
    const s = (await owner.get(`${base()}/settings`)).json();
    expect(s.features).toEqual({
      confinement: false,
      slaughter: false,
      result: false,
      pasture: false,
      assets: false,
    });
    expect((await owner.get(`${base()}/confinement`)).statusCode).toBe(409);
    expect(
      (await owner.get(`${base()}/reports/result?from=2026-01-01&to=2026-12-31`)).statusCode,
    ).toBe(409);
    const on = await owner.patch(`${base()}/settings`, {
      features: { confinement: true, slaughter: true, result: true, pasture: true, assets: true },
    });
    expect(on.json().features.confinement).toBe(true);
    expect(
      (await field.patch(`${base()}/settings`, { features: { assets: false } })).statusCode,
    ).toBe(403);
  });
});

describe("ocorrências", () => {
  it("registra em animal (entra no histórico) e resolve", async () => {
    const a = (await owner.post(`${base()}/animals`, newAnimal())).json();
    const r = await field.post(`${base()}/occurrences`, {
      targetType: "animal",
      targetId: a.id,
      title: "Cerca quebrada no curral",
      severity: "high",
      occurredOn: "2026-10-07",
    });
    expect(r.statusCode).toBe(201);
    const list = (await owner.get(`${base()}/occurrences`)).json().items;
    expect(list[0]).toMatchObject({ status: "open", severity: "high" });
    const types = (await owner.get(`${base()}/animals/${a.id}/history`))
      .json()
      .timeline.map((e: { type: string }) => e.type);
    expect(types).toContain("occurrence");
    expect(
      (
        await field.post(`${base()}/occurrences/${list[0].id}/resolve`, {
          resolution: "Consertada",
          resolvedOn: "2026-10-08",
        })
      ).statusCode,
    ).toBe(200);
  });
});

describe("confinamento", () => {
  it("baia, leitura de cocho (uma por dia, correção auditada) e fechamento", async () => {
    const g = (await owner.post(`${base()}/groups`, { name: "Baia 1" })).json();
    expect(
      (
        await owner.patch(`${base()}/groups/${g.id}/pen`, {
          isPen: true,
          penCapacity: 50,
          penStartedOn: "2026-08-01",
        })
      ).statusCode,
    ).toBe(200);
    const a = (
      await owner.post(
        `${base()}/animals`,
        newAnimal({ sex: "male", category: "steer", groupId: g.id }),
      )
    ).json();
    await owner.post(`${base()}/animals/${a.id}/weights`, {
      weightKg: 380,
      measuredOn: "2026-08-01",
    });
    await owner.post(`${base()}/animals/${a.id}/weights`, {
      weightKg: 440,
      measuredOn: "2026-09-30",
    });
    const p = (
      await owner.post(`${base()}/products`, { name: "Ração terminação", kind: "feed", unit: "kg" })
    ).json();
    await owner.post(`${base()}/stock/movements`, {
      productId: p.id,
      kind: "entry",
      quantity: 1000,
      unitCost: 2,
      occurredOn: "2026-08-01",
    });
    await field.post(`${base()}/feedings`, {
      date: "2026-09-01",
      groupId: g.id,
      diet: "Terminação",
      productId: p.id,
      quantity: 600,
    });
    expect(
      (await field.post(`${base()}/bunk-readings`, { groupId: g.id, date: "2026-10-08", score: 2 }))
        .statusCode,
    ).toBe(201);
    await field.post(`${base()}/bunk-readings`, { groupId: g.id, date: "2026-10-08", score: 1 });
    expect(await env.db.bunkReading.count({ where: { groupId: g.id } })).toBe(1);
    expect(await env.db.auditEntry.count({ where: { action: "bunk_reading.correct" } })).toBe(1);
    const c = (await owner.get(`${base()}/confinement`)).json();
    expect(c.pens[0]).toMatchObject({ name: "Baia 1", heads: 1, capacity: 50 });
    const r = (
      await owner.get(`${base()}/reports/confinement?from=2026-08-01&to=2026-09-30`)
    ).json();
    expect(r.rows[0]).toMatchObject({
      pen: "Baia 1",
      heads: 1,
      days: 60,
      gainKg: 60,
      feedCost: 1200,
      perKgGain: 20,
    });
  });
});

describe("abate", () => {
  it("retorno do frigorífico calcula arroba e rendimento reais", async () => {
    const a = (
      await owner.post(`${base()}/animals`, newAnimal({ sex: "male", category: "steer" }))
    ).json();
    const sale = await owner.post(`${base()}/sales`, {
      date: "2026-10-01",
      items: [{ animalId: a.id, liveWeightKg: 540 }],
      priceMode: "per_arroba",
      unitPrice: 300,
      carcassYieldPercent: 52,
      counterparty: "Frigorífico Teste",
    });
    const id = sale.json().id;
    const r = await owner.post(`${base()}/commercial/${id}/slaughter-return`, {
      receivedOn: "2026-10-05",
      plant: "Frigorífico Teste",
      items: [{ animalId: a.id, carcassKg: 286.2 }],
      finalTotal: 5724,
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().items[0]).toMatchObject({ arrobas: 19.08, yieldPercent: 53 });
    const rep = (
      await owner.get(`${base()}/reports/slaughter?from=2026-10-01&to=2026-10-31`)
    ).json();
    expect(rep.rows[0]).toMatchObject({
      estimatedArrobas: 18.72,
      realArrobas: 19.08,
      realYield: 53,
    });
  });
});

describe("resultado, pastagem e patrimônio", () => {
  it("DRE separa realizado e previsto", async () => {
    await owner.post(`${base()}/finance/entries`, {
      kind: "expense",
      category: "labor",
      description: "Folha",
      amount: 1000,
      dueOn: "2026-10-05",
      paidOn: "2026-10-05",
    });
    await owner.post(`${base()}/finance/entries`, {
      kind: "expense",
      category: "fuel",
      description: "Diesel",
      amount: 300,
      dueOn: "2026-10-20",
    });
    const r = (await owner.get(`${base()}/reports/result?from=2026-10-01&to=2026-10-31`)).json();
    expect(r.rows.find((x: { line: string }) => x.line.includes("Mão de obra"))).toMatchObject({
      realized: -1000,
      planned: 0,
    });
    expect(r.rows.find((x: { line: string }) => x.line.includes("Combustível"))).toMatchObject({
      realized: 0,
      planned: -300,
    });
  });

  it("ocupação/descanso dos pastos pelas movimentações e chuva", async () => {
    const p1 = (await owner.post(`${base()}/pastures`, { name: "Piquete A" })).json();
    const p2 = (await owner.post(`${base()}/pastures`, { name: "Piquete B" })).json();
    await owner.patch(`${base()}/pastures/${p1.id}/details`, { areaHa: 10, restTargetDays: 30 });
    const a = (await owner.post(`${base()}/animals`, newAnimal({ pastureId: p2.id }))).json();
    const dto = (await owner.get(`${base()}/animals/${a.id}`)).json();
    await owner.post(`${base()}/animals/${a.id}/move`, {
      expectedVersion: dto.version,
      groupId: null,
      pastureId: p1.id,
      effectiveOn: "2026-10-01",
    });
    await field.post(`${base()}/rain`, { date: "2026-10-03", mm: 25, pastureId: p1.id });
    const st = (await owner.get(`${base()}/pastures/status`)).json();
    const A = st.pastures.find((x: { name: string }) => x.name === "Piquete A");
    const B = st.pastures.find((x: { name: string }) => x.name === "Piquete B");
    expect(A).toMatchObject({
      heads: 1,
      occupiedSince: "2026-10-01",
      occupiedDays: 7,
      headsPerHa: 0.1,
      rain30dMm: 25,
    });
    expect(B).toMatchObject({ heads: 0, restingSince: "2026-10-01", restDays: 7 });
  });

  it("manutenção com próxima data vira tarefa na agenda", async () => {
    const a = (
      await owner.post(`${base()}/assets`, { name: "Trator 4x4", kind: "machine" })
    ).json();
    expect(
      (
        await field.post(`${base()}/assets/${a.id}/maintenance`, {
          date: "2026-10-01",
          description: "Troca de óleo",
          cost: 450,
          nextDueOn: "2027-01-01",
        })
      ).statusCode,
    ).toBe(201);
    const tasks = (await owner.get(`${base()}/tasks`)).json();
    expect(tasks.find((x: { title: string }) => x.title === "Manutenção: Trator 4x4")).toBeTruthy();
  });
});
