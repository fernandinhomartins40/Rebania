import type { SyncMutation, SyncReceipt } from "@rebania/contracts";
import { SYNC_PUSH_MAX } from "@rebania/contracts";
import { backoffMs } from "./policies.ts";

export type OutboxState = "pending" | "rejected" | "conflict";

export interface OutboxItem {
  mutation: SyncMutation;
  farmId: string;
  state: OutboxState;
  attempts: number;
  nextAttemptAt: number;
  lastError?: { code: string; message: string };
}

/** Persistência local: SQLite no nativo, IndexedDB no web, memória nos testes. */
export interface OutboxStorage {
  get(mutationId: string): Promise<OutboxItem | undefined>;
  put(item: OutboxItem): Promise<void>;
  remove(mutationId: string): Promise<void>;
  list(): Promise<OutboxItem[]>;
}

export interface SyncTransport {
  push(input: {
    farmId: string;
    deviceId: string;
    mutations: SyncMutation[];
  }): Promise<{ receipts: SyncReceipt[]; cursor: string }>;
}

export class MemoryOutboxStorage implements OutboxStorage {
  private items = new Map<string, OutboxItem>();
  async get(id: string) {
    const v = this.items.get(id);
    return v ? clone(v) : undefined;
  }
  async put(item: OutboxItem) {
    this.items.set(item.mutation.mutationId, clone(item));
  }
  async remove(id: string) {
    this.items.delete(id);
  }
  async list() {
    return [...this.items.values()].map((v) => clone(v));
  }
}

export interface FlushResult {
  accepted: number;
  rejected: number;
  conflicts: number;
  networkError: boolean;
  remaining: number;
}

export class Outbox {
  constructor(
    private readonly storage: OutboxStorage,
    private readonly deviceId: string,
    private readonly now: () => number = Date.now,
  ) {}

  /** Enfileirar é idempotente: o mesmo mutationId nunca gera duas entradas. */
  async enqueue(farmId: string, mutation: SyncMutation): Promise<void> {
    if (await this.storage.get(mutation.mutationId)) return;
    await this.storage.put({ mutation, farmId, state: "pending", attempts: 0, nextAttemptAt: 0 });
  }

  /** Itens visíveis ao usuário, em ordem de criação (inclui rejeitados e conflitos). */
  async items(): Promise<OutboxItem[]> {
    const all = await this.storage.list();
    return all.sort((a, b) => a.mutation.createdAt.localeCompare(b.mutation.createdAt));
  }

  async counts() {
    const all = await this.storage.list();
    return {
      pending: all.filter((i) => i.state === "pending").length,
      rejected: all.filter((i) => i.state === "rejected").length,
      conflict: all.filter((i) => i.state === "conflict").length,
    };
  }

  /** Descartar exige decisão explícita do usuário (ex.: após revisar conflito). */
  async discard(mutationId: string): Promise<void> {
    await this.storage.remove(mutationId);
  }

  /** Envia pendentes em lotes ordenados. Rejeitados/conflitos ficam visíveis, nunca somem. */
  async flush(transport: SyncTransport): Promise<FlushResult> {
    const result: FlushResult = {
      accepted: 0,
      rejected: 0,
      conflicts: 0,
      networkError: false,
      remaining: 0,
    };
    const now = this.now();
    const due = (await this.items()).filter((i) => i.state === "pending" && i.nextAttemptAt <= now);
    const byFarm = new Map<string, OutboxItem[]>();
    for (const item of due) {
      byFarm.set(item.farmId, [...(byFarm.get(item.farmId) ?? []), item]);
    }

    outer: for (const [farmId, items] of byFarm) {
      for (let i = 0; i < items.length; i += SYNC_PUSH_MAX) {
        const batch = items.slice(i, i + SYNC_PUSH_MAX);
        let response;
        try {
          response = await transport.push({
            farmId,
            deviceId: this.deviceId,
            mutations: batch.map((b) => b.mutation),
          });
        } catch {
          result.networkError = true;
          for (const item of batch) {
            item.attempts += 1;
            item.nextAttemptAt = this.now() + backoffMs(item.attempts);
            await this.storage.put(item);
          }
          break outer;
        }
        const receipts = new Map(response.receipts.map((r) => [r.mutationId, r]));
        for (const item of batch) {
          const receipt = receipts.get(item.mutation.mutationId);
          if (!receipt) continue; // permanece pendente; servidor não processou
          if (receipt.status === "accepted") {
            await this.storage.remove(item.mutation.mutationId);
            result.accepted++;
          } else if (receipt.status === "rejected") {
            item.state = "rejected";
            item.lastError = { code: receipt.code, message: receipt.message };
            await this.storage.put(item);
            result.rejected++;
          } else {
            item.state = "conflict";
            item.lastError = { code: receipt.code, message: receipt.message };
            await this.storage.put(item);
            result.conflicts++;
          }
        }
      }
    }
    result.remaining = (await this.storage.list()).length;
    return result;
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
