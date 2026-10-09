import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SyncEngine,
  localAnimals,
  newMutationBase,
  putLocalAnimal,
  type LocalAnimal,
} from "./engine.ts";
import { clearAll } from "./idb.ts";

const FARM = "11111111-1111-4111-8111-111111111111";

function animal(id: string): LocalAnimal {
  return {
    id,
    farmId: FARM,
    sex: "female",
    category: "cow",
    status: "active",
    breed: null,
    birthDate: null,
    birthDateEstimated: false,
    origin: "unknown",
    entryDate: null,
    groupId: null,
    groupName: null,
    pastureId: null,
    pastureName: null,
    damId: null,
    sireId: null,
    notes: null,
    version: 1,
    identifiers: [],
    primaryIdentifier: "1",
    lastWeight: null,
    withdrawal: null,
    photo: null,
    repro: null,
    createdAt: "",
    updatedAt: "",
  };
}

describe("SyncEngine (web)", () => {
  beforeEach(async () => {
    await clearAll();
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
  });
  afterEach(() => vi.restoreAllMocks());

  it("offline: salva no aparelho, mantém otimista e envia ao reconectar", async () => {
    const engine = new SyncEngine(FARM);
    const id = crypto.randomUUID();
    const result = await engine.submit(
      {
        ...newMutationBase(id),
        type: "weight.record",
        payload: { weightKg: 300, measuredOn: "2026-10-01" },
      },
      () => putLocalAnimal({ ...animal(id), pending: true }),
    );
    expect(result).toEqual({ status: "saved_locally" });
    expect(engine.state.pending).toBe(1);
    expect((await localAnimals(FARM)).map((a) => a.id)).toEqual([id]);

    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method} ${url}`);
        if (url === "/v1/sync/push") {
          const body = JSON.parse(String(init!.body));
          return new Response(
            JSON.stringify({
              cursor: "1",
              receipts: body.mutations.map((m: { mutationId: string; entityId: string }) => ({
                mutationId: m.mutationId,
                status: "accepted",
                entityId: m.entityId,
                version: null,
              })),
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            changes: [
              {
                seq: "1",
                entity: "animal",
                entityId: id,
                op: "upsert",
                data: { ...animal(id), version: 1 },
              },
            ],
            cursor: "1",
            hasMore: false,
          }),
          { status: 200 },
        );
      }),
    );
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await engine.syncNow();
    expect(engine.state).toMatchObject({ pending: 0, online: true, phase: "idle" });
    expect(calls[0]).toBe("POST /v1/sync/push");
    expect((await localAnimals(FARM))[0]!.pending).toBeUndefined();
  });

  it("falha de rede durante sync mantém pendências e marca offline", async () => {
    const engine = new SyncEngine(FARM);
    await engine.submit({
      ...newMutationBase(crypto.randomUUID()),
      type: "weight.record",
      payload: { weightKg: 300, measuredOn: "2026-10-01" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await engine.syncNow();
    expect(engine.state).toMatchObject({ pending: 1, online: false });
  });

  it("rejeição remove cadastro otimista e fica visível para o usuário", async () => {
    const engine = new SyncEngine(FARM);
    const id = crypto.randomUUID();
    await engine.submit(
      {
        ...newMutationBase(id),
        type: "animal.create",
        payload: {
          sex: "female",
          category: "cow",
          origin: "unknown",
          identifiers: [{ type: "visual_tag", value: "1" }],
        },
      },
      () => putLocalAnimal({ ...animal(id), pending: true }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/v1/sync/push") {
          const body = JSON.parse(String(init!.body));
          return new Response(
            JSON.stringify({
              cursor: "0",
              receipts: [
                {
                  mutationId: body.mutations[0].mutationId,
                  status: "rejected",
                  code: "identifier_in_use",
                  message: "Brinco em uso",
                },
              ],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ changes: [], cursor: "0", hasMore: false }), {
          status: 200,
        });
      }),
    );
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
    await engine.syncNow();
    expect(engine.state.rejected).toBe(1);
    expect(await localAnimals(FARM)).toEqual([]);
    const [problem] = await engine.problems();
    expect(problem!.lastError!.message).toBe("Brinco em uso");
  });
});
