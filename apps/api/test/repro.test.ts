/**
 * Teste obrigatório 2 (MN §15) e regras de reprodução: cobertura em grupo com
 * exceções, diagnóstico, previsão de parto com origem, nascimento transacional
 * com gêmeos/natimorto, reenvio sem duplicar, correção rastreável, agenda derivada.
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

const cow = async (over: Record<string, unknown> = {}) =>
  (await owner.post(`${base()}/animals`, newAnimal({ birthDate: "2020-01-10", ...over }))).json();

describe("reprodução", () => {
  it("IA em grupo registra os aptos, lista exceções e agenda diagnóstico", async () => {
    const a = await cow();
    const b = await cow();
    const bull = await cow({ sex: "male", category: "bull" });
    const steer = await cow({ sex: "male", category: "steer" });
    const res = await field.post(`${base()}/events/breeding`, {
      kind: "artificial_insemination",
      date: "2026-01-10",
      femaleIds: [a.id, b.id, steer.id],
      sireId: bull.id,
      semen: "Partida 123",
      technician: "Inseminador João",
    });
    expect(res.statusCode).toBe(201);
    const r = res.json();
    expect(r.done).toEqual([a.id, b.id]);
    expect(r.exceptions).toEqual([
      expect.objectContaining({ animalId: steer.id, code: "not_female" }),
    ]);
    const tasks = (await field.get(`${base()}/tasks`)).json();
    const task = tasks.find(
      (x: { type: string; animalIds: string[] }) =>
        x.type === "pregnancy_check" && x.animalIds.includes(a.id),
    );
    expect(task).toMatchObject({ dueOn: "2026-02-09", animalIds: [a.id, b.id] });
    expect((await field.get(`${base()}/animals/${a.id}`)).json().repro).toMatchObject({
      status: "bred",
    });
  });

  it("diagnóstico atualiza situação, mostra origem da previsão e conclui a tarefa", async () => {
    const a = await cow();
    const b = await cow();
    await owner.post(`${base()}/events/breeding`, {
      kind: "artificial_insemination",
      date: "2026-01-10",
      femaleIds: [a.id, b.id],
    });
    const res = await owner.post(`${base()}/events/pregnancy`, {
      date: "2026-02-15",
      method: "ultrasound",
      examiner: "Dra. Ana",
      results: [
        { animalId: a.id, result: "pregnant" },
        { animalId: b.id, result: "open" },
      ],
    });
    expect(res.statusCode).toBe(201);
    expect((await owner.get(`${base()}/animals/${a.id}`)).json().repro).toEqual({
      status: "pregnant",
      since: "2026-02-15",
      expectedCalvingOn: "2026-10-27",
    });
    expect((await owner.get(`${base()}/animals/${b.id}`)).json().repro.status).toBe("open");
    const done = (await owner.get(`${base()}/tasks?status=done`)).json();
    expect(
      done.some(
        (x: { type: string; animalIds: string[] }) =>
          x.type === "pregnancy_check" && x.animalIds.includes(a.id),
      ),
    ).toBe(true);
    const calvings = (await owner.get(`${base()}/reproduction/expected-calvings?days=365`)).json();
    const ec = calvings.find((c: { animalId: string }) => c.animalId === a.id);
    expect(ec).toMatchObject({
      date: "2026-10-27",
      windowStart: "2026-10-17",
      windowEnd: "2026-11-06",
      overdue: false,
    });
    expect(ec.source).toMatch(/10\/01\/2026.*290 dias/);
    // prenha não recebe nova IA (exceção explícita)
    const again = await owner.post(`${base()}/events/breeding`, {
      kind: "artificial_insemination",
      date: "2026-03-01",
      femaleIds: [a.id],
    });
    expect(again.statusCode).toBe(422);
  });

  it("nascimento com duas crias + natimorto; reenvio não duplica; mãe atualizada; desmama agendada", async () => {
    const dam = await cow({ category: "heifer", birthDate: "2023-01-01" });
    const bull = await cow({ sex: "male", category: "bull" });
    await owner.post(`${base()}/events/breeding`, {
      kind: "artificial_insemination",
      date: "2025-12-01",
      femaleIds: [dam.id],
      sireId: bull.id,
    });
    await owner.post(`${base()}/events/pregnancy`, {
      date: "2026-01-10",
      results: [{ animalId: dam.id, result: "pregnant" }],
    });
    const key = randomUUID();
    const body = {
      damId: dam.id,
      date: "2026-09-15",
      assistance: "easy",
      calves: [
        { sex: "male", identifiers: [{ type: "visual_tag", value: "BZ-1" }], weightKg: 32 },
        { sex: "female", identifiers: [{ type: "provisional", value: "PROV-77" }] },
        { sex: "male", stillborn: true },
      ],
    };
    const r1 = await field.post(`${base()}/events/birth`, body, { "idempotency-key": key });
    const r2 = await field.post(`${base()}/events/birth`, body, { "idempotency-key": key });
    expect(r1.statusCode).toBe(201);
    expect(r2.json()).toEqual(r1.json());
    const { calfIds, stillborn, sireId } = r1.json();
    expect(calfIds).toHaveLength(2);
    expect(stillborn).toBe(1);
    expect(sireId).toBe(bull.id);
    expect(await env.db.birth.count({ where: { damId: dam.id } })).toBe(1);
    expect(await env.db.animal.count({ where: { damId: dam.id } })).toBe(2);

    const calf = (await field.get(`${base()}/animals/${calfIds[0]}`)).json();
    expect(calf).toMatchObject({
      category: "calf_male",
      origin: "born_on_farm",
      birthDate: "2026-09-15",
      damId: dam.id,
      sireId: bull.id,
      lastWeight: { weightKg: 32 },
    });
    const updatedDam = (await field.get(`${base()}/animals/${dam.id}`)).json();
    expect(updatedDam).toMatchObject({
      category: "cow",
      repro: { status: "open", since: "2026-09-15", expectedCalvingOn: null },
    });
    const tasks = (await field.get(`${base()}/tasks`)).json();
    expect(
      tasks.find(
        (x: { type: string; animalIds: string[] }) =>
          x.type === "weaning" && x.animalIds.includes(calfIds[0]),
      ),
    ).toMatchObject({ dueOn: "2027-04-13" });
    const hist = (await field.get(`${base()}/animals/${dam.id}/history`)).json();
    expect(hist.timeline[0].summary).toBe("Parto: 2 cria(s) viva(s) · 1 natimorto(s)");
  });

  it("nascimento: brinco repetido e mãe sem permissão de parir são rejeitados sem gravar nada", async () => {
    const dam = await cow();
    const tagged = await cow({ identifiers: [{ type: "visual_tag", value: "DUPCRIA" }] });
    const before = await env.db.animal.count({ where: { farmId: t.farmId } });
    const r = await field.post(`${base()}/events/birth`, {
      damId: dam.id,
      date: "2026-09-01",
      calves: [{ sex: "female", identifiers: [{ type: "visual_tag", value: "dupcria" }] }],
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.code).toBe("identifier_in_use");
    expect(await env.db.animal.count({ where: { farmId: t.farmId } })).toBe(before);
    expect(await env.db.birth.count({ where: { damId: dam.id } })).toBe(0);
    void tagged;
    const steer = await cow({ sex: "male", category: "steer" });
    expect(
      (
        await field.post(`${base()}/events/birth`, {
          damId: steer.id,
          date: "2026-09-01",
          calves: [{ sex: "male", stillborn: true }],
        })
      ).statusCode,
    ).toBe(422);
  });

  it("correção anula o diagnóstico, preserva o histórico e recalcula a situação", async () => {
    const a = await cow();
    await owner.post(`${base()}/events/breeding`, {
      kind: "natural_service",
      date: "2026-01-01",
      endDate: "2026-03-01",
      femaleIds: [a.id],
    });
    await owner.post(`${base()}/events/pregnancy`, {
      date: "2026-04-15",
      results: [{ animalId: a.id, result: "pregnant" }],
    });
    expect((await owner.get(`${base()}/animals/${a.id}`)).json().repro.status).toBe("pregnant");
    const repro = (await owner.get(`${base()}/animals/${a.id}/repro`)).json();
    expect(repro.projection.expectedCalving.source).toMatch(/estimativa ampla/);
    const checkId = repro.checks[0].id;
    expect(
      (
        await owner.post(`${base()}/corrections`, {
          kind: "pregnancy_check",
          id: checkId,
          reason: "Lançado na vaca errada",
        })
      ).statusCode,
    ).toBe(204);
    expect((await owner.get(`${base()}/animals/${a.id}`)).json().repro.status).toBe("bred");
    const after = (await owner.get(`${base()}/animals/${a.id}/repro`)).json();
    expect(after.checks[0]).toMatchObject({ id: checkId, voidReason: "Lançado na vaca errada" });
    const hist = (await owner.get(`${base()}/animals/${a.id}/history`)).json();
    expect(hist.timeline.map((e: { type: string }) => e.type)).toEqual(
      expect.arrayContaining(["correction", "pregnancy_check", "bred"]),
    );
    expect(
      await env.db.auditEntry.count({
        where: { entityId: checkId, action: "pregnancy_check.voided" },
      }),
    ).toBe(1);
  });

  it("desmama promove categoria, registra peso e conclui tarefa", async () => {
    const dam = await cow();
    const birth = (
      await owner.post(`${base()}/events/birth`, {
        damId: dam.id,
        date: "2026-02-01",
        calves: [{ sex: "female", identifiers: [{ type: "visual_tag", value: "DSM1" }] }],
      })
    ).json();
    const calfId = birth.calfIds[0];
    const r = await owner.post(`${base()}/events/weaning`, {
      date: "2026-09-01",
      items: [{ animalId: calfId, weightKg: 195 }, { animalId: dam.id }],
    });
    expect(r.json().done).toEqual([calfId]);
    expect(r.json().exceptions[0]).toMatchObject({ animalId: dam.id, code: "not_calf" });
    expect((await owner.get(`${base()}/animals/${calfId}`)).json()).toMatchObject({
      category: "heifer",
      lastWeight: { weightKg: 195 },
    });
    const done = (await owner.get(`${base()}/tasks?status=done`)).json();
    expect(
      done.some(
        (x: { type: string; animalIds: string[] }) =>
          x.type === "weaning" && x.animalIds.includes(calfId),
      ),
    ).toBe(true);
  });

  it("estação de monta: taxa com cobertura explícita", async () => {
    const season = (
      await owner.post(`${base()}/breeding-seasons`, {
        name: "Estação 24/25",
        startDate: "2024-11-01",
        endDate: "2025-02-28",
      })
    ).json();
    const [a, b, c] = [await cow(), await cow(), await cow()];
    await owner.post(`${base()}/events/breeding`, {
      kind: "artificial_insemination",
      date: "2024-12-10",
      seasonId: season.id,
      femaleIds: [a.id, b.id, c.id],
    });
    await owner.post(`${base()}/events/pregnancy`, {
      date: "2025-01-20",
      seasonId: season.id,
      results: [
        { animalId: a.id, result: "pregnant" },
        { animalId: b.id, result: "open" },
      ],
    });
    const rep = (await owner.get(`${base()}/breeding-seasons/${season.id}/report`)).json();
    expect(rep).toMatchObject({
      exposed: 3,
      diagnosed: 2,
      pregnant: 1,
      open: 1,
      notDiagnosed: 1,
      rateAmongDiagnosed: 0.5,
      coverage: 0.6667,
    });
    expect(rep.formula).toMatch(/sem diagnóstico ficam fora/);
  });

  it("protocolo IATF versionado gera tarefas por etapa; edição cria nova versão", async () => {
    const p = (
      await owner.post(`${base()}/protocols`, {
        name: "Protocolo da fazenda (definido pelo veterinário)",
        steps: [
          { day: 0, title: "Implante + aplicação" },
          { day: 8, title: "Retirada do implante" },
          { day: 10, title: "Inseminação", inseminate: true },
        ],
      })
    ).json();
    const v2 = (
      await owner.post(`${base()}/protocols/${p.id}/versions`, {
        name: p.name,
        steps: [
          { day: 0, title: "D0" },
          { day: 9, title: "IA", inseminate: true },
        ],
      })
    ).json();
    expect(v2).toMatchObject({ version: 2, lineageId: p.lineageId });
    expect(
      (await owner.get(`${base()}/protocols`)).json().map((x: { id: string }) => x.id),
    ).toContain(v2.id);
    const a = await cow();
    const ex = await owner.post(`${base()}/protocol-executions`, {
      protocolId: p.id,
      startDate: "2026-11-02",
      animalIds: [a.id],
    });
    expect(ex.statusCode).toBe(201);
    const tasks = (await owner.get(`${base()}/tasks`))
      .json()
      .filter((x: { sourceId: string }) => x.sourceId === ex.json().id);
    expect(tasks.map((x: { dueOn: string; type: string }) => [x.dueOn, x.type])).toEqual([
      ["2026-11-02", "protocol_step"],
      ["2026-11-10", "protocol_step"],
      ["2026-11-12", "protocol_insemination"],
    ]);
    const done = await owner.post(`${base()}/tasks/${tasks[0].id}/complete`, {
      resolution: "Feito",
    });
    expect(done.json()).toMatchObject({ status: "done", resolution: "Feito" });
    expect((await owner.post(`${base()}/tasks/${tasks[0].id}/complete`, {})).statusCode).toBe(409);
  });

  it("configurações: só gerente/proprietário altera; valores fora de faixa são recusados", async () => {
    expect(
      (await field.patch(`${base()}/settings`, { repro: { gestationDays: 285 } })).statusCode,
    ).toBe(403);
    const ok = await owner.patch(`${base()}/settings`, { repro: { gestationDays: 285 } });
    expect(ok.json().repro).toMatchObject({ gestationDays: 285, pregnancyCheckAfterDays: 30 });
    expect(
      (await owner.patch(`${base()}/settings`, { repro: { gestationDays: 400 } })).statusCode,
    ).toBe(400);
  });

  it("operações reprodutivas também chegam pelo sync offline", async () => {
    const a = await cow();
    const op = randomUUID();
    const ts = new Date().toISOString();
    const res = await field.post("/v1/sync/push", {
      farmId: t.farmId,
      deviceId: randomUUID(),
      mutations: [
        {
          type: "breeding.record",
          mutationId: op,
          entityId: op,
          occurredAt: ts,
          createdAt: ts,
          schemaVersion: 1,
          payload: { kind: "artificial_insemination", date: "2026-10-01", femaleIds: [a.id] },
        },
      ],
    });
    expect(res.json().receipts[0]).toMatchObject({ status: "accepted", detail: { done: [a.id] } });
  });
});
