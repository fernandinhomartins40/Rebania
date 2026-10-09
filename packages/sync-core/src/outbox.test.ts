import { describe, expect, it } from "vitest";
import type { SyncMutation, SyncReceipt } from "@rebania/contracts";
import { MemoryOutboxStorage, Outbox, type SyncTransport } from "./outbox.ts";
import { backoffMs, MERGE_POLICY } from "./policies.ts";

const FARM = "00000000-0000-4000-8000-000000000001";
const DEVICE = "00000000-0000-4000-8000-0000000000aa";
let n = 0;
function weight(): SyncMutation {
  n++;
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const ts = new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString();
  return {
    type: "weight.record",
    mutationId: id,
    entityId: FARM,
    occurredAt: ts,
    createdAt: ts,
    schemaVersion: 1,
    payload: { weightKg: 200 + n, measuredOn: "2026-01-01" },
  };
}

function transport(
  handler: (m: SyncMutation) => SyncReceipt["status"],
): SyncTransport & { calls: number } {
  const t = {
    calls: 0,
    async push({ mutations }: { mutations: SyncMutation[] }) {
      t.calls++;
      return {
        cursor: "1",
        receipts: mutations.map((m): SyncReceipt => {
          const s = handler(m);
          if (s === "accepted")
            return { mutationId: m.mutationId, status: s, entityId: m.entityId, version: 1 };
          if (s === "rejected")
            return { mutationId: m.mutationId, status: s, code: "x", message: "x" };
          return {
            mutationId: m.mutationId,
            status: s,
            entityId: m.entityId,
            serverVersion: 2,
            code: "c",
            message: "c",
          };
        }),
      };
    },
  };
  return t;
}

describe("Outbox", () => {
  it("enfileirar é idempotente por mutationId", async () => {
    const ob = new Outbox(new MemoryOutboxStorage(), DEVICE);
    const m = weight();
    await ob.enqueue(FARM, m);
    await ob.enqueue(FARM, m);
    expect((await ob.items()).length).toBe(1);
  });

  it("100 eventos offline são enviados em lote sem perda", async () => {
    const storage = new MemoryOutboxStorage();
    const ob = new Outbox(storage, DEVICE);
    for (let i = 0; i < 100; i++) await ob.enqueue(FARM, weight());
    // "reinício": nova instância sobre o mesmo armazenamento
    const reopened = new Outbox(storage, DEVICE);
    const t = transport(() => "accepted");
    const r = await reopened.flush(t);
    expect(r).toMatchObject({ accepted: 100, remaining: 0, networkError: false });
    expect(t.calls).toBe(1);
  });

  it("falha de rede mantém itens e aplica backoff", async () => {
    let now = 1_000;
    const ob = new Outbox(new MemoryOutboxStorage(), DEVICE, () => now);
    await ob.enqueue(FARM, weight());
    const failing: SyncTransport = {
      push: async () => {
        throw new Error("offline");
      },
    };
    const r = await ob.flush(failing);
    expect(r.networkError).toBe(true);
    expect(r.remaining).toBe(1);
    const t = transport(() => "accepted");
    expect((await ob.flush(t)).accepted).toBe(0); // ainda em backoff
    now += 120_000;
    expect((await ob.flush(t)).accepted).toBe(1);
  });

  it("rejeitados e conflitos continuam visíveis e não são reenviados", async () => {
    const ob = new Outbox(new MemoryOutboxStorage(), DEVICE);
    const a = weight();
    const b = weight();
    const c = weight();
    for (const m of [a, b, c]) await ob.enqueue(FARM, m);
    const t = transport((m) =>
      m.mutationId === a.mutationId
        ? "accepted"
        : m.mutationId === b.mutationId
          ? "rejected"
          : "conflict",
    );
    const r = await ob.flush(t);
    expect(r).toMatchObject({ accepted: 1, rejected: 1, conflicts: 1, remaining: 2 });
    expect(await ob.counts()).toEqual({ pending: 0, rejected: 1, conflict: 1 });
    const again = await ob.flush(t);
    expect(t.calls).toBe(1);
    expect(again.accepted).toBe(0);
  });

  it("recibo ausente mantém pendente", async () => {
    const ob = new Outbox(new MemoryOutboxStorage(), DEVICE);
    await ob.enqueue(FARM, weight());
    const r = await ob.flush({ push: async () => ({ cursor: "0", receipts: [] }) });
    expect(r.remaining).toBe(1);
    expect((await ob.counts()).pending).toBe(1);
  });
});

describe("políticas", () => {
  it("não há last-write-wins para alterações de estado", () => {
    expect(MERGE_POLICY["animal.move"]).toBe("version_check");
    expect(MERGE_POLICY["weight.record"]).toBe("append");
  });
  it("backoff cresce e tem teto", () => {
    expect(backoffMs(1, () => 1)).toBe(1000);
    expect(backoffMs(3, () => 1)).toBe(4000);
    expect(backoffMs(30, () => 1)).toBe(60000);
  });
});
