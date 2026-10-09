import type { Animal, SyncMutation, SyncPullResponse } from "@rebania/contracts";
import { Outbox, type OutboxItem, type OutboxStorage, type SyncTransport } from "./outbox.ts";

export interface LocalAnimal extends Animal {
  /** Alteração local ainda não confirmada pelo servidor. */
  pending?: boolean;
}

export interface Place {
  id: string;
  farmId: string;
  kind: "group" | "pasture";
  name: string;
  notes: string | null;
}

/** Armazenamento local do rebanho: IndexedDB (web) ou SQLite (nativo). */
export interface LocalCache {
  putAnimals(animals: LocalAnimal[]): Promise<void>;
  deleteAnimals(ids: string[]): Promise<void>;
  putPlaces(places: Place[]): Promise<void>;
  deletePlaces(ids: string[]): Promise<void>;
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
}

export interface EngineApi extends SyncTransport {
  pull(farmId: string, cursor: string): Promise<SyncPullResponse>;
  getAnimal(farmId: string, id: string): Promise<Animal>;
  /** true quando o erro é falta de conexão (não uma resposta do servidor). */
  isNetworkError(err: unknown): boolean;
  errorMessage(err: unknown): string;
}

export interface SyncState {
  online: boolean;
  phase: "idle" | "syncing" | "error";
  pending: number;
  rejected: number;
  conflict: number;
  lastSyncAt: string | null;
  lastError: string | null;
}

export type SubmitResult =
  | { status: "synced"; entityId: string }
  | { status: "saved_locally" }
  | { status: "rejected" | "conflict"; message: string };

export interface SyncEngineOptions {
  farmId: string;
  deviceId: string;
  outboxStorage: OutboxStorage;
  cache: LocalCache;
  api: EngineApi;
  /** Indicação do sistema; a confirmação real vem do resultado das requisições. */
  isOnline?: () => boolean;
}

class NetworkFailure extends Error {}

/**
 * Motor de sincronização por fazenda: outbox (push) + feed incremental (pull).
 * Toda escrita passa pelo outbox: online confirma na hora; offline fica
 * "Salvo no aparelho" e é enviada ao reconectar. Nada é descartado sem decisão do usuário.
 */
export class SyncEngine {
  readonly farmId: string;
  private outbox: Outbox;
  private cache: LocalCache;
  private api: EngineApi;
  private isOnline: () => boolean;
  private listeners = new Set<(s: SyncState) => void>();
  private timer: unknown;
  private running: Promise<void> | null = null;
  state: SyncState;

  constructor(opts: SyncEngineOptions) {
    this.farmId = opts.farmId;
    this.outbox = new Outbox(opts.outboxStorage, opts.deviceId);
    this.cache = opts.cache;
    this.api = opts.api;
    this.isOnline = opts.isOnline ?? (() => true);
    this.state = {
      online: this.isOnline(),
      phase: "idle",
      pending: 0,
      rejected: 0,
      conflict: 0,
      lastSyncAt: null,
      lastError: null,
    };
  }

  subscribe(fn: (s: SyncState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private async refreshCounts() {
    const items = await this.problems();
    this.set({
      pending: items.filter((i) => i.state === "pending").length,
      rejected: items.filter((i) => i.state === "rejected").length,
      conflict: items.filter((i) => i.state === "conflict").length,
    });
  }

  /** Avisos do sistema operacional/navegador sobre conectividade. */
  setOnline(online: boolean) {
    this.set({ online });
    if (online) void this.syncNow();
  }

  async start(intervalMs = 60_000) {
    this.timer = setInterval(() => void this.syncNow(), intervalMs);
    const last = await this.cache.getMeta(`lastSync:${this.farmId}`);
    this.set({ lastSyncAt: last ?? null });
    await this.refreshCounts();
    await this.syncNow();
  }

  stop() {
    clearInterval(this.timer as Parameters<typeof clearInterval>[0]);
  }

  /** Envia pendências e baixa mudanças. Chamadas concorrentes compartilham a execução. */
  syncNow(): Promise<void> {
    this.running ??= this.doSync().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async doSync() {
    this.set({ phase: "syncing" });
    try {
      const before = await this.outbox.items();
      const r = await this.outbox.flush(this.api);
      if (r.networkError) throw new NetworkFailure();
      await this.reconcile(before);
      await this.pull();
      const now = new Date().toISOString();
      await this.cache.setMeta(`lastSync:${this.farmId}`, now);
      this.set({ phase: "idle", online: true, lastSyncAt: now, lastError: null });
    } catch (err) {
      const offline = err instanceof NetworkFailure || this.api.isNetworkError(err);
      this.set({
        phase: offline ? "idle" : "error",
        online: offline ? false : this.state.online,
        lastError: offline ? null : this.api.errorMessage(err),
      });
    } finally {
      await this.refreshCounts();
    }
  }

  /** Desfaz efeitos otimistas de mutações rejeitadas/em conflito. */
  private async reconcile(before: OutboxItem[]) {
    const after = new Map((await this.outbox.items()).map((i) => [i.mutation.mutationId, i]));
    for (const item of before) {
      const now = after.get(item.mutation.mutationId);
      if (!now || now.state === "pending" || item.state !== "pending") continue;
      if (item.mutation.type === "animal.create") {
        await this.cache.deleteAnimals([item.mutation.entityId]);
      } else {
        await this.refetchAnimal(item.mutation.entityId);
      }
    }
  }

  private async refetchAnimal(id: string) {
    try {
      await this.cache.putAnimals([await this.api.getAnimal(this.farmId, id)]);
    } catch {
      /* o próximo pull corrige */
    }
  }

  async pull() {
    const key = `cursor:${this.farmId}`;
    let cursor = (await this.cache.getMeta(key)) ?? "0";
    for (let page = 0; page < 50; page++) {
      const res = await this.api.pull(this.farmId, cursor);
      const upAnimals: LocalAnimal[] = [];
      const upPlaces: Place[] = [];
      const delAnimals: string[] = [];
      const delPlaces: string[] = [];
      for (const c of res.changes) {
        if (c.entity === "animal") {
          if (c.op === "upsert") upAnimals.push(c.data as Animal);
          else delAnimals.push(c.entityId);
        } else if (c.entity === "group" || c.entity === "pasture") {
          if (c.op === "upsert") {
            const d = c.data as { id: string; name: string; notes: string | null };
            upPlaces.push({ ...d, farmId: this.farmId, kind: c.entity });
          } else delPlaces.push(c.entityId);
        }
      }
      // Não sobrescreve animal com alteração local pendente.
      const pendingIds = new Set(
        (await this.outbox.items())
          .filter((i) => i.state === "pending")
          .map((i) => i.mutation.entityId),
      );
      await this.cache.putAnimals(upAnimals.filter((a) => !pendingIds.has(a.id)));
      await this.cache.deleteAnimals(delAnimals);
      await this.cache.putPlaces(upPlaces);
      await this.cache.deletePlaces(delPlaces);
      cursor = res.cursor;
      await this.cache.setMeta(key, cursor);
      if (!res.hasMore) break;
    }
  }

  /**
   * Registra uma mutação. `optimistic` aplica o efeito local imediatamente.
   * O resultado diferencia "Registrado e sincronizado" de "Salvo no aparelho".
   */
  async submit(mutation: SyncMutation, optimistic?: () => Promise<void>): Promise<SubmitResult> {
    await this.outbox.enqueue(this.farmId, mutation);
    if (optimistic) await optimistic();
    await this.refreshCounts();
    if (!this.isOnline()) {
      this.set({ online: false });
      return { status: "saved_locally" };
    }
    await this.syncNow();
    const item = (await this.outbox.items()).find(
      (i) => i.mutation.mutationId === mutation.mutationId,
    );
    if (!item) return { status: "synced", entityId: mutation.entityId };
    if (item.state === "pending") return { status: "saved_locally" };
    return {
      status: item.state,
      message: item.lastError?.message ?? "Não foi possível registrar.",
    };
  }

  async problems(): Promise<OutboxItem[]> {
    return (await this.outbox.items()).filter((i) => i.farmId === this.farmId);
  }

  async discard(mutationId: string) {
    const item = (await this.outbox.items()).find((i) => i.mutation.mutationId === mutationId);
    await this.outbox.discard(mutationId);
    if (item?.mutation.type === "animal.create" && item.state === "pending") {
      await this.cache.deleteAnimals([item.mutation.entityId]);
    } else if (item) {
      await this.refetchAnimal(item.mutation.entityId);
    }
    await this.refreshCounts();
  }
}

/** Campos comuns de uma nova mutação gerada no aparelho. */
export function newMutationBase(entityId: string, uuid: () => string) {
  const now = new Date().toISOString();
  return {
    mutationId: uuid(),
    entityId,
    occurredAt: now,
    createdAt: now,
    schemaVersion: 1 as const,
  };
}
