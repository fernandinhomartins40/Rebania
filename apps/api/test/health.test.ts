/**
 * G4 — sanidade, estoque, carência e Modo Curral.
 * Teste obrigatório 3 (MN §15): 35 selecionados, 32 manejados → histórico,
 * estoque e agenda refletem exatamente 32. Teste 6 (lado servidor): ID
 * desconhecido, animal fora da seleção, leitor desconectado, marcação repetida.
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
let other: Tenant;
let owner: Client;
let field: Client;
let finance: Client;
let outsider: Client;
const base = () => `/v1/farms/${t.farmId}`;
const ts = () => new Date().toISOString();

beforeAll(async () => {
  env = await createTestEnv();
  t = await createTenant(env.db);
  other = await createTenant(env.db);
  owner = await login(env.app, (await createUser(env.db, t.orgId, "owner")).email);
  field = await login(
    env.app,
    (await createUser(env.db, t.orgId, "field", { farmIds: [t.farmId] })).email,
  );
  finance = await login(
    env.app,
    (await createUser(env.db, t.orgId, "finance", { farmIds: [t.farmId] })).email,
  );
  outsider = await login(env.app, (await createUser(env.db, other.orgId, "owner")).email);
});
afterAll(() => env.close());

const animal = async (over: Record<string, unknown> = {}) =>
  (await owner.post(`${base()}/animals`, newAnimal({ birthDate: "2022-01-10", ...over }))).json();

async function product(over: Record<string, unknown> = {}) {
  const res = await owner.post(`${base()}/products`, {
    name: `Vacina ${randomUUID().slice(0, 6)}`,
    kind: "vaccine",
    unit: "mL",
    minStock: 50,
    ...over,
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}

async function entry(productId: string, quantity: number, extra: Record<string, unknown> = {}) {
  const res = await owner.post(`${base()}/stock/movements`, {
    productId,
    kind: "entry",
    quantity,
    occurredOn: "2026-10-01",
    ...extra,
  });
  expect(res.statusCode).toBe(201);
}

const productDto = async (id: string) =>
  (await owner.get(`${base()}/products?archived=1`))
    .json()
    .items.find((p: { id: string }) => p.id === id);

describe("produtos e estoque", () => {
  it("carência configurada exige fonte técnica; sem prazo é 'não configurado'", async () => {
    const bad = await owner.post(`${base()}/products`, {
      name: "Antibiótico X",
      kind: "medicine",
      unit: "mL",
      withdrawalMeatDays: 30,
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe("withdrawal_source_required");
    const p = await product();
    expect(p.withdrawalMeatDays).toBeNull();
  });

  it("entrada cria partida; saldo por partida; consumo administrativo não passa do saldo", async () => {
    const p = await product();
    await entry(p.id, 100, { batchCode: "l-778", expiresOn: "2027-05-01", unitCost: 1.25 });
    let dto = await productDto(p.id);
    expect(dto.balance).toBe(100);
    expect(dto.batches).toEqual([
      expect.objectContaining({ code: "L-778", expiresOn: "2027-05-01", balance: 100 }),
    ]);
    const over = await owner.post(`${base()}/stock/movements`, {
      productId: p.id,
      kind: "loss",
      quantity: 150,
      occurredOn: "2026-10-02",
    });
    expect(over.statusCode).toBe(422);
    expect(over.json().error.code).toBe("insufficient_stock");
    const loss = await owner.post(`${base()}/stock/movements`, {
      productId: p.id,
      kind: "loss",
      quantity: 2.5,
      occurredOn: "2026-10-02",
      batchId: dto.batches[0].id,
    });
    expect(loss.statusCode).toBe(201);
    dto = await productDto(p.id);
    expect(dto.balance).toBe(97.5);
    // Ajuste sem justificativa é recusado.
    const adj = await owner.post(`${base()}/stock/movements`, {
      productId: p.id,
      kind: "adjustment",
      quantity: -1,
      occurredOn: "2026-10-02",
    });
    expect(adj.statusCode).toBe(400);
  });

  it("perfis: campo não movimenta estoque; administrativo sim", async () => {
    const p = await product();
    const denied = await field.post(`${base()}/stock/movements`, {
      productId: p.id,
      kind: "entry",
      quantity: 1,
      occurredOn: "2026-10-01",
    });
    expect(denied.statusCode).toBe(403);
    const ok = await finance.post(`${base()}/stock/movements`, {
      productId: p.id,
      kind: "entry",
      quantity: 1,
      occurredOn: "2026-10-01",
    });
    expect(ok.statusCode).toBe(201);
  });

  it("isolamento: outra organização não vê nem usa produtos desta fazenda", async () => {
    const p = await product();
    expect((await outsider.get(`${base()}/products`)).statusCode).toBe(404);
    const res = await outsider.post(`/v1/farms/${other.farmId}/stock/movements`, {
      productId: p.id,
      kind: "entry",
      quantity: 1,
      occurredOn: "2026-10-01",
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("product_not_found");
  });
});

describe("aplicação, carência e calendário", () => {
  it("aplicação em grupo baixa estoque, gera histórico e carência; correção estorna", async () => {
    const p = await product({
      name: "Antibiótico LA",
      kind: "medicine",
      withdrawalMeatDays: 28,
      withdrawalSource: "Bula do fabricante, conferida pela Dra. Ana",
    });
    await entry(p.id, 10);
    const a = await animal();
    const b = await animal();
    const res = await field.post(`${base()}/events/health`, {
      kind: "treatment",
      date: "2026-10-05",
      animalIds: [a.id, b.id],
      products: [{ productId: p.id, dose: 3, route: "intramuscular" }],
      applicator: "João",
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().done).toHaveLength(2);
    expect((await productDto(p.id)).balance).toBe(4);
    const dto = (await owner.get(`${base()}/animals/${a.id}`)).json();
    expect(dto.withdrawal).toEqual({ meatUntil: "2026-11-02", milkUntil: null });
    const list = (await owner.get(`${base()}/withdrawals`)).json().items;
    const mine = list.find((w: { animalId: string }) => w.animalId === a.id);
    expect(mine.sources[0]).toMatchObject({
      productName: "Antibiótico LA",
      source: "Bula do fabricante, conferida pela Dra. Ana",
    });

    const apps = (await owner.get(`${base()}/health/applications?animalId=${a.id}`)).json().items;
    const v = await owner.post(`${base()}/health/applications/${apps[0].id}/void`, {
      reason: "Lançado no animal errado",
    });
    expect(v.statusCode).toBe(200);
    expect((await owner.get(`${base()}/animals/${a.id}`)).json().withdrawal).toBeNull();
    expect((await productDto(p.id)).balance).toBe(7);
    const timeline = (await owner.get(`${base()}/animals/${a.id}/history`)).json().timeline;
    expect(timeline.map((e: { type: string }) => e.type)).toEqual(
      expect.arrayContaining(["health_applied", "correction"]),
    );
  });

  it("consumo de campo sem saldo é registrado e fica para conferência", async () => {
    const p = await product();
    const a = await animal();
    const res = await field.post(`${base()}/events/health`, {
      kind: "vaccination",
      date: "2026-10-05",
      animalIds: [a.id],
      products: [{ productId: p.id, dose: 5 }],
    });
    expect(res.statusCode).toBe(201);
    const dto = await productDto(p.id);
    expect(dto.balance).toBe(-5);
    expect(dto.pendingReview).toBe(1);
    const pending = (await owner.get(`${base()}/stock/movements?review=1`)).json().items;
    const mv = pending.find((m: { productId: string }) => m.productId === p.id);
    await owner.post(`${base()}/stock/movements/${mv.id}/review`, { note: "Nota fiscal atrasada" });
    expect((await productDto(p.id)).pendingReview).toBe(0);
  });

  it("lote vencido é recusado na aplicação", async () => {
    const p = await product();
    await entry(p.id, 10, { batchCode: "VELHO", expiresOn: "2026-09-01" });
    const batch = (await productDto(p.id)).batches[0];
    const a = await animal();
    const res = await field.post(`${base()}/events/health`, {
      kind: "vaccination",
      date: "2026-10-05",
      animalIds: [a.id],
      products: [{ productId: p.id, batchId: batch.id, dose: 2 }],
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("batch_expired");
  });

  it("tratamento e exame com resultado entram no histórico", async () => {
    const a = await animal();
    const tr = await field.post(`${base()}/treatments`, {
      animalId: a.id,
      startedOn: "2026-10-03",
      condition: "Pododermatite",
      plan: "Conforme orientação do veterinário responsável",
      responsible: "Dra. Ana",
    });
    expect(tr.statusCode).toBe(201);
    const id = tr.json().id;
    expect(
      (await field.patch(`${base()}/treatments/${id}`, { status: "resolved", outcome: "Ok" }))
        .statusCode,
    ).toBe(200);
    const ex = await field.post(`${base()}/exams`, {
      kind: "brucellosis",
      animalIds: [a.id],
      collectedOn: "2026-10-04",
    });
    expect(ex.statusCode).toBe(201);
    const exams = (await owner.get(`${base()}/exams?status=pending`)).json().items;
    const mine = exams.find((e: { animalId: string }) => e.animalId === a.id);
    await field.post(`${base()}/exams/${mine.id}/result`, {
      result: "Negativo",
      resultOn: "2026-10-07",
    });
    const h = (await owner.get(`${base()}/animals/${a.id}/health`)).json();
    expect(h.treatments[0]).toMatchObject({ status: "resolved", endedOn: "2026-10-08" });
    expect(h.exams[0]).toMatchObject({ status: "done", result: "Negativo" });
  });

  it("calendário: usa o plano configurado; sem plano não inventa nada", async () => {
    const empty = await createTenant(env.db);
    const o2 = await login(env.app, (await createUser(env.db, empty.orgId, "owner")).email);
    expect((await o2.get(`/v1/farms/${empty.farmId}/health/calendar`)).json().items).toEqual([]);
  });
});

describe("Modo Curral — teste obrigatório 3", () => {
  it("35 selecionados, 32 manejados: histórico, estoque e agenda com 32", async () => {
    const p = await product({ name: "Vacina Aftosa (teste)", unit: "dose" });
    await entry(p.id, 100);
    const plan = await owner.post(`${base()}/health/plan`, {
      name: "Vacinação de matrizes (teste)",
      kind: "vaccination",
      productId: p.id,
      categories: ["cow"],
      everyDays: 180,
      source: "Plano do veterinário responsável",
    });
    expect(plan.statusCode).toBe(201);
    const herd = [];
    for (let i = 0; i < 35; i++) herd.push(await animal());
    const ids = herd.map((h) => h.id);

    const sessionId = randomUUID();
    const open = await field.post(
      `${base()}/handling-sessions`,
      {
        id: sessionId,
        name: "Vacinação outubro",
        date: "2026-10-08",
        config: {
          weigh: true,
          healthKind: "vaccination",
          products: [{ productId: p.id, dose: 2, route: "subcutaneous" }],
          planItemId: plan.json().id,
        },
        animalIds: ids,
      },
      { "idempotency-key": sessionId },
    );
    expect(open.statusCode).toBe(201);
    expect(open.json().summary).toMatchObject({ total: 35, pending: 35 });

    const mark = (animalId: string, body: Record<string, unknown>, key = randomUUID()) =>
      field.post(
        `${base()}/handling-sessions/${sessionId}/marks`,
        { animalId, ...body },
        { "idempotency-key": key },
      );
    for (const [i, id] of ids.slice(0, 32).entries()) {
      const r = await mark(id, { status: "done", weightKg: 400 + i, weightSource: "scale" });
      expect(r.statusCode).toBe(201);
    }
    // Leitura repetida (outra mutação) não reaplica nada.
    const again = await mark(ids[0], { status: "done", weightKg: 999 });
    expect(again.json()).toMatchObject({ alreadyDone: true });
    // Retry da mesma mutação devolve o mesmo recibo.
    const key = randomUUID();
    const r1 = await mark(ids[32], { status: "skipped", note: "Mancando, ficou no brete" }, key);
    const r2 = await mark(ids[32], { status: "skipped", note: "Mancando, ficou no brete" }, key);
    expect(r2.json()).toEqual(r1.json());

    const close = await field.post(`${base()}/handling-sessions/${sessionId}/close`, {});
    expect(close.statusCode).toBe(201);
    expect(close.json().summary).toMatchObject({ total: 35, done: 32, skipped: 1, pending: 2 });

    expect(await env.db.healthApplication.count({ where: { sessionId, voidedAt: null } })).toBe(32);
    expect(
      await env.db.weightMeasurement.count({
        where: { animalId: { in: ids }, voidedAt: null },
      }),
    ).toBe(32);
    expect((await productDto(p.id)).balance).toBe(100 - 32 * 2);

    const tasks = (await owner.get(`${base()}/tasks`)).json();
    const pendingTask = tasks.find((x: { sourceId: string | null }) => x.sourceId === sessionId);
    expect(pendingTask.animalIds.sort()).toEqual(ids.slice(32).sort());

    // Calendário: só os 3 não manejados continuam devidos para este item do plano.
    const cal = (await owner.get(`${base()}/health/calendar`)).json().items;
    const due = cal
      .filter((c: { planItemId: string }) => c.planItemId === plan.json().id)
      .flatMap((c: { animalIds: string[] }) => c.animalIds)
      .filter((id: string) => ids.includes(id));
    expect(due.sort()).toEqual(ids.slice(32).sort());

    // Sessão encerrada não aceita novas marcações.
    const late = await mark(ids[33], { status: "done" });
    expect(late.statusCode).toBe(422);
    expect(late.json().error.code).toBe("session_closed");
  });

  it("desfazer marcação estorna aplicação, estoque e pesagem", async () => {
    const p = await product();
    await entry(p.id, 10);
    const a = await animal();
    const sessionId = randomUUID();
    await field.post(`${base()}/handling-sessions`, {
      id: sessionId,
      name: "Teste desfazer",
      date: "2026-10-08",
      config: { weigh: true, products: [{ productId: p.id, dose: 1 }] },
      animalIds: [a.id],
    });
    await field.post(`${base()}/handling-sessions/${sessionId}/marks`, {
      animalId: a.id,
      status: "done",
      weightKg: 410,
    });
    expect((await productDto(p.id)).balance).toBe(9);
    await field.post(`${base()}/handling-sessions/${sessionId}/marks`, {
      animalId: a.id,
      status: "pending",
    });
    expect((await productDto(p.id)).balance).toBe(10);
    const s = (await owner.get(`${base()}/handling-sessions/${sessionId}`)).json();
    expect(s.items[0]).toMatchObject({ status: "pending", weightKg: null });
    expect(
      await env.db.weightMeasurement.count({ where: { animalId: a.id, voidedAt: null } }),
    ).toBe(0);
  });
});

describe("Modo Curral — teste obrigatório 6 (servidor)", () => {
  it("ID desconhecido, animal fora da seleção e leitor desconectado ficam registrados", async () => {
    const p = await product();
    const inSnap = await animal();
    const outside = await animal();
    const sessionId = randomUUID();
    await field.post(`${base()}/handling-sessions`, {
      id: sessionId,
      name: "Exceções",
      date: "2026-10-08",
      config: { products: [{ productId: p.id, dose: 1 }] },
      animalIds: [inSnap.id],
    });
    const unknownId = randomUUID();
    const ex = await field.post(`${base()}/handling-sessions/${sessionId}/exceptions`, {
      id: unknownId,
      kind: "unknown_identifier",
      value: "982000999888777",
    });
    expect(ex.statusCode).toBe(201);
    await field.post(`${base()}/handling-sessions/${sessionId}/exceptions`, {
      id: randomUUID(),
      kind: "reader_disconnected",
      note: "Bastão sem bateria; seguiu por digitação",
    });
    // Associação revisada do ID desconhecido a um animal existente.
    await field.post(`${base()}/handling-sessions/${sessionId}/exceptions`, {
      id: unknownId,
      kind: "unknown_identifier",
      resolvedAnimalId: outside.id,
    });
    const r = await field.post(`${base()}/handling-sessions/${sessionId}/marks`, {
      animalId: outside.id,
      status: "done",
    });
    expect(r.statusCode).toBe(201);
    const s = (await owner.get(`${base()}/handling-sessions/${sessionId}`)).json();
    expect(s.items).toEqual([
      expect.objectContaining({ animalId: inSnap.id, status: "pending", added: false }),
      expect.objectContaining({ animalId: outside.id, status: "done", added: true }),
    ]);
    expect(s.exceptions).toHaveLength(2);
    expect(s.exceptions[0]).toMatchObject({
      value: "982000999888777",
      resolvedAnimalId: outside.id,
    });
    expect(s.summary).toMatchObject({ total: 2, done: 1, addedDuringSession: 1, exceptions: 2 });
  });

  it("sessão via sync offline: abrir, marcar, reenviar lote e encerrar sem duplicar", async () => {
    const p = await product();
    await entry(p.id, 20);
    const a = await animal();
    const b = await animal();
    const sessionId = randomUUID();
    const env1 = (type: string, payload: unknown) => ({
      type,
      mutationId: randomUUID(),
      entityId: sessionId,
      occurredAt: ts(),
      createdAt: ts(),
      schemaVersion: 1,
      payload,
    });
    const mutations = [
      env1("handling.open", {
        name: "Curral offline",
        date: "2026-10-08",
        config: { products: [{ productId: p.id, dose: 2 }] },
        animalIds: [a.id, b.id],
      }),
      env1("handling.mark", { animalId: a.id, status: "done" }),
      env1("handling.mark", { animalId: b.id, status: "skipped" }),
      env1("handling.close", {}),
    ];
    const body = { farmId: t.farmId, deviceId: randomUUID(), mutations };
    const first = (await field.post("/v1/sync/push", body)).json();
    expect(first.receipts.map((r: { status: string }) => r.status)).toEqual([
      "accepted",
      "accepted",
      "accepted",
      "accepted",
    ]);
    const second = (await field.post("/v1/sync/push", body)).json();
    expect(second.receipts).toEqual(first.receipts);
    expect((await productDto(p.id)).balance).toBe(18);
    const s = (await owner.get(`${base()}/handling-sessions/${sessionId}`)).json();
    expect(s.status).toBe("closed");
  });
});

describe("estoque de sêmen", () => {
  it("IA com sêmen do estoque baixa 1 dose por fêmea e a correção estorna", async () => {
    const semen = await product({ name: "Sêmen Touro Teste", kind: "semen", unit: "dose" });
    await entry(semen.id, 10, { batchCode: "P-01" });
    const batch = (await productDto(semen.id)).batches[0];
    const a = await animal({ birthDate: "2020-01-10" });
    const b = await animal({ birthDate: "2020-01-10" });
    const res = await field.post(`${base()}/events/breeding`, {
      kind: "artificial_insemination",
      date: "2026-10-06",
      femaleIds: [a.id, b.id],
      semenProductId: semen.id,
      semenBatchId: batch.id,
    });
    expect(res.statusCode).toBe(201);
    let dto = await productDto(semen.id);
    expect(dto.balance).toBe(8);
    expect(dto.batches[0].balance).toBe(8);
    const repro = (await owner.get(`${base()}/animals/${a.id}/repro`)).json();
    expect(repro.breedings[0].semen).toBe("Sêmen Touro Teste");
    await owner.post(`${base()}/corrections`, {
      kind: "breeding",
      id: repro.breedings[0].id,
      reason: "Fêmea errada",
    });
    dto = await productDto(semen.id);
    expect(dto.balance).toBe(9);
  });
});
