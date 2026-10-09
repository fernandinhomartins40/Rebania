/**
 * G5 — compra/venda com verificação de carência, saída, trato, financeiro e
 * relatórios. Teste obrigatório 5 (venda): dois aparelhos vendem o mesmo animal
 * → o segundo recebe CONFLITO, nada é reaberto ou vendido duas vezes.
 */
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
let manager: Client;
let field: Client;
let finance: Client;
const base = () => `/v1/farms/${t.farmId}`;
const ts = () => new Date().toISOString();

beforeAll(async () => {
  env = await createTestEnv();
  t = await createTenant(env.db);
  owner = await login(env.app, (await createUser(env.db, t.orgId, "owner")).email);
  manager = await login(
    env.app,
    (await createUser(env.db, t.orgId, "manager", { farmIds: [t.farmId] })).email,
  );
  field = await login(
    env.app,
    (await createUser(env.db, t.orgId, "field", { farmIds: [t.farmId] })).email,
  );
  finance = await login(
    env.app,
    (await createUser(env.db, t.orgId, "finance", { farmIds: [t.farmId] })).email,
  );
});
afterAll(() => env.close());

const steer = async (over: Record<string, unknown> = {}) =>
  (
    await owner.post(
      `${base()}/animals`,
      newAnimal({ sex: "male", category: "steer", birthDate: "2024-01-10", ...over }),
    )
  ).json();

async function withdrawalProduct() {
  const p = (
    await owner.post(`${base()}/products`, {
      name: `Antibiótico ${randomUUID().slice(0, 5)}`,
      kind: "medicine",
      unit: "mL",
      withdrawalMeatDays: 30,
      withdrawalSource: "Bula do fabricante",
    })
  ).json();
  return p.id as string;
}

describe("venda", () => {
  it("por kg vivo: baixa animais, gera receita e rateia o valor sem perder centavo", async () => {
    const a = await steer();
    const b = await steer();
    const res = await manager.post(`${base()}/sales`, {
      date: "2026-10-05",
      items: [
        { animalId: a.id, liveWeightKg: 450 },
        { animalId: b.id, liveWeightKg: 451.5 },
      ],
      priceMode: "per_kg_live",
      unitPrice: 10.33,
      counterparty: "Frigorífico Teste",
      document: "NF 123",
    });
    expect(res.statusCode).toBe(201);
    const id = res.json().id;
    const dto = (await manager.get(`${base()}/commercial/${id}`)).json();
    expect(dto.totalCents).toBe(Math.round(1033 * 901.5));
    expect(
      dto.items.reduce((s: number, i: { allocatedCents: number }) => s + i.allocatedCents, 0),
    ).toBe(dto.totalCents);
    const animal = (await owner.get(`${base()}/animals/${a.id}`)).json();
    expect(animal.status).toBe("sold");
    const entries = (await finance.get(`${base()}/finance/entries?kind=income`)).json().items;
    expect(entries.find((e: { sourceId: string }) => e.sourceId === id)).toMatchObject({
      status: "open",
      amountCents: dto.totalCents,
      category: "animal_sale",
    });
    // Animal vendido não recebe manejo.
    const w = await field.post(`${base()}/animals/${a.id}/weights`, {
      weightKg: 460,
      measuredOn: "2026-10-06",
    });
    expect(w.statusCode).toBe(422);
  });

  it("arroba exige rendimento informado; kg vivo não vira arroba", async () => {
    const a = await steer();
    const bad = await manager.post(`${base()}/sales`, {
      date: "2026-10-05",
      items: [{ animalId: a.id, liveWeightKg: 540 }],
      priceMode: "per_arroba",
      unitPrice: 300,
      counterparty: "Frigorífico",
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe("yield_required");
    const ok = await manager.post(`${base()}/sales`, {
      date: "2026-10-05",
      items: [{ animalId: a.id, liveWeightKg: 540 }],
      priceMode: "per_arroba",
      unitPrice: 300,
      carcassYieldPercent: 52,
      counterparty: "Frigorífico",
    });
    expect(ok.statusCode).toBe(201);
    const dto = (await manager.get(`${base()}/commercial/${ok.json().id}`)).json();
    expect(dto.estimatedArrobas).toBe(18.72);
    expect(dto.formula).toMatch(/estimativa/);
  });

  it("carência bloqueia; gerente não libera; proprietário libera com motivo auditado", async () => {
    const pid = await withdrawalProduct();
    await owner.post(`${base()}/stock/movements`, {
      productId: pid,
      kind: "entry",
      quantity: 100,
      occurredOn: "2026-10-01",
    });
    const a = await steer();
    await field.post(`${base()}/events/health`, {
      kind: "treatment",
      date: "2026-10-01",
      animalIds: [a.id],
      products: [{ productId: pid, dose: 5 }],
    });
    const check = (
      await manager.post(`${base()}/sales/check`, { date: "2026-10-08", animalIds: [a.id] })
    ).json();
    expect(check.ok).toBe(false);
    expect(check.issues[0].code).toBe("in_withdrawal");
    expect(check.canOverrideWithdrawal).toBe(false);
    const sale = {
      date: "2026-10-08",
      items: [{ animalId: a.id, liveWeightKg: 400 }],
      priceMode: "per_head",
      unitPrice: 3000,
      counterparty: "Vizinho",
    };
    const blocked = await manager.post(`${base()}/sales`, sale);
    expect(blocked.json().error.code).toBe("withdrawal_pending");
    const forbidden = await manager.post(`${base()}/sales`, {
      ...sale,
      withdrawalOverride: { reason: "Animal para recria, não abate" },
    });
    expect(forbidden.json().error.code).toBe("withdrawal_override_forbidden");
    const ok = await owner.post(`${base()}/sales`, {
      ...sale,
      withdrawalOverride: { reason: "Venda para recria, não abate imediato" },
    });
    expect(ok.statusCode).toBe(201);
    const dto = (await owner.get(`${base()}/commercial/${ok.json().id}`)).json();
    expect(dto.withdrawalOverride).toMatchObject({
      reason: "Venda para recria, não abate imediato",
    });
    const auditRow = await env.db.auditEntry.findFirst({
      where: { entityId: ok.json().id, action: "sale.create.withdrawal_override" },
    });
    expect(auditRow).not.toBeNull();
  });

  it("teste 5 (venda): dois aparelhos vendem o mesmo animal → conflito, sem venda dupla", async () => {
    const a = await steer();
    const mut = () => ({
      type: "sale.record",
      mutationId: randomUUID(),
      entityId: randomUUID(),
      occurredAt: ts(),
      createdAt: ts(),
      schemaVersion: 1,
      payload: {
        date: "2026-10-05",
        items: [{ animalId: a.id }],
        priceMode: "per_head",
        unitPrice: 2500,
        counterparty: "Comprador",
      },
    });
    const first = (
      await manager.post("/v1/sync/push", {
        farmId: t.farmId,
        deviceId: randomUUID(),
        mutations: [mut()],
      })
    ).json();
    const second = (
      await manager.post("/v1/sync/push", {
        farmId: t.farmId,
        deviceId: randomUUID(),
        mutations: [mut()],
      })
    ).json();
    expect(first.receipts[0].status).toBe("accepted");
    expect(second.receipts[0]).toMatchObject({ status: "conflict", code: "animal_not_active" });
    expect(await env.db.commercialItem.count({ where: { animalId: a.id } })).toBe(1);
  });

  it("anular venda devolve animais e cancela a receita, preservando o histórico", async () => {
    const a = await steer();
    const s = await manager.post(`${base()}/sales`, {
      date: "2026-10-05",
      items: [{ animalId: a.id }],
      priceMode: "total",
      unitPrice: 2800,
      counterparty: "Comprador X",
    });
    const id = s.json().id;
    expect(
      (await manager.post(`${base()}/commercial/${id}/void`, { reason: "Comprador desistiu" }))
        .statusCode,
    ).toBe(200);
    expect((await owner.get(`${base()}/animals/${a.id}`)).json().status).toBe("active");
    const e = await env.db.financialEntry.findFirst({ where: { sourceId: id } });
    expect(e?.status).toBe("cancelled");
    const types = (await owner.get(`${base()}/animals/${a.id}/history`))
      .json()
      .timeline.map((x: { type: string }) => x.type);
    expect(types).toEqual(expect.arrayContaining(["sold", "correction"]));
  });

  it("campo não vende", async () => {
    const a = await steer();
    const r = await field.post(`${base()}/sales`, {
      date: "2026-10-05",
      items: [{ animalId: a.id }],
      priceMode: "per_head",
      unitPrice: 1,
      counterparty: "Comprador X",
    });
    expect(r.statusCode).toBe(403);
  });
});

describe("compra", () => {
  it("cria animais comprados, pesagem de entrada e conta a pagar", async () => {
    const res = await finance.post(`${base()}/purchases`, {
      date: "2026-09-01",
      animals: [
        {
          sex: "male",
          category: "steer",
          liveWeightKg: 300,
          identifiers: [{ type: "visual_tag", value: "C001" }],
        },
        {
          sex: "male",
          category: "steer",
          liveWeightKg: 310,
          identifiers: [{ type: "visual_tag", value: "C002" }],
        },
      ],
      priceMode: "per_kg_live",
      unitPrice: 12,
      counterparty: "Fazenda Vizinha",
      dueOn: "2026-10-01",
    });
    expect(res.statusCode).toBe(201);
    const { animalIds, totalCents } = res.json();
    expect(totalCents).toBe(732000);
    const a = (await owner.get(`${base()}/animals/${animalIds[0]}`)).json();
    expect(a).toMatchObject({ origin: "purchased", entryDate: "2026-09-01" });
    expect(a.lastWeight.weightKg).toBe(300);
    const entries = (await finance.get(`${base()}/finance/entries?status=open&kind=expense`)).json()
      .items;
    expect(entries.find((e: { amountCents: number }) => e.amountCents === 732000)).toBeTruthy();
  });
});

describe("saída", () => {
  it("morte encerra situação, cancela tarefas só do animal e repetição vira conflito", async () => {
    const a = await steer();
    const r = await field.post(`${base()}/animals/${a.id}/exit`, {
      kind: "dead",
      date: "2026-10-06",
      reason: "Picada de cobra",
    });
    expect(r.statusCode).toBe(201);
    const dto = (await owner.get(`${base()}/animals/${a.id}`)).json();
    expect(dto.status).toBe("dead");
    const again = await field.post(`${base()}/animals/${a.id}/exit`, {
      kind: "dead",
      date: "2026-10-06",
      reason: "Picada de cobra",
    });
    expect(again.statusCode).toBe(409);
  });
});

describe("trato e financeiro", () => {
  it("trato consome estoque e calcula custo médio; lançamentos pagos entram no caixa", async () => {
    const group = (
      await owner.post(`${base()}/groups`, { name: `Lote trato ${randomUUID().slice(0, 4)}` })
    ).json();
    await steer({ groupId: group.id });
    await steer({ groupId: group.id });
    const p = (
      await owner.post(`${base()}/products`, {
        name: `Sal mineral ${randomUUID().slice(0, 4)}`,
        kind: "supplement",
        unit: "kg",
      })
    ).json();
    await owner.post(`${base()}/stock/movements`, {
      productId: p.id,
      kind: "entry",
      quantity: 100,
      unitCost: 3.5,
      occurredOn: "2026-10-01",
    });
    const f = await field.post(`${base()}/feedings`, {
      date: "2026-10-05",
      groupId: group.id,
      diet: "Sal mineral no cocho",
      productId: p.id,
      quantity: 10,
    });
    expect(f.statusCode).toBe(201);
    expect(f.json()).toMatchObject({ heads: 2, costCents: 3500 });
    const products = (await owner.get(`${base()}/products`)).json().items;
    expect(products.find((x: { id: string }) => x.id === p.id).balance).toBe(90);

    const e = await finance.post(`${base()}/finance/entries`, {
      kind: "expense",
      category: "labor",
      description: "Diária vaqueiro",
      amount: 150,
      dueOn: "2026-10-05",
      paidOn: "2026-10-05",
    });
    expect(e.statusCode).toBe(201);
    const mismatch = await finance.post(`${base()}/finance/entries`, {
      kind: "income",
      category: "labor",
      description: "Receita lançada na categoria errada",
      amount: 1,
      dueOn: "2026-10-05",
    });
    expect(mismatch.json().error.code).toBe("category_mismatch");
    const rep = (
      await finance.get(`${base()}/reports/financial?from=2026-10-01&to=2026-10-31`)
    ).json();
    expect(rep.rows.find((r: { category: string }) => r.category === "Mão de obra").expense).toBe(
      150,
    );
  });
});

describe("relatórios", () => {
  it("desempenho mostra fórmula e cobertura; CSV com ; e BOM", async () => {
    const g = (
      await owner.post(`${base()}/groups`, { name: `Lote GMD ${randomUUID().slice(0, 4)}` })
    ).json();
    const a = await steer({ groupId: g.id });
    await steer({ groupId: g.id });
    await owner.post(`${base()}/animals/${a.id}/weights`, {
      weightKg: 300,
      measuredOn: "2026-08-01",
    });
    await owner.post(`${base()}/animals/${a.id}/weights`, {
      weightKg: 330,
      measuredOn: "2026-08-31",
    });
    const r = (
      await owner.get(`${base()}/reports/performance?from=2026-08-01&to=2026-09-30`)
    ).json();
    const row = r.rows.find((x: { label: string }) => x.label === g.name);
    expect(row).toMatchObject({ animals: 2, withAdg: 1, meanAdg: 1 });
    expect(r.formula).toMatch(/GMD/);
    expect(r.coverage.total).toBeGreaterThanOrEqual(2);
    const csv = await owner.get(
      `${base()}/reports/performance?from=2026-08-01&to=2026-09-30&format=csv`,
    );
    expect(csv.headers["content-type"]).toMatch(/text\/csv/);
    expect(csv.body.startsWith("﻿Lote;Animais")).toBe(true);
  });

  it("campo não acessa relatórios financeiros", async () => {
    expect(
      (await field.get(`${base()}/reports/financial?from=2026-01-01&to=2026-12-31`)).statusCode,
    ).toBe(403);
  });
});
