import type { Animal, SyncMutation, SyncPullResponse, SyncReceipt } from "@rebania/contracts";
import { Outbox, type OutboxItem, type OutboxStorage, type SyncTransport } from "@rebania/sync-core";
import { ApiError, get, NetworkError, post } from "../api/client.ts";
import { idbAll, idbByFarm, idbDelete, idbDeleteMany, idbGet, idbPut, idbPutMany } from "./idb.ts";

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

class IdbOutboxStorage implements OutboxStorage {
  get = (id: string) => idbGet<OutboxItem>("outbox", id);
  put = (item: OutboxItem) => idbPut("outbox", item);
  remove = (id: string) => idbDelete("outbox", id);
  list = () => idbAll<OutboxItem>("outbox");
}

export function deviceId(): string {
  const KEY = "rebania.deviceId";
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Motor de sincronização por fazenda: outbox (push) + feed incremental (pull).
 * Toda escrita passa pelo outbox: online confirma na hora; offline fica
 * "Salvo no aparelho" e é enviada ao reconectar. Nada é descartado sem decisão do usuário.
 */
export class SyncEngine {
  private outbox: Outbox;
  private listeners = new Set<(s: SyncState) => void>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private running: Promise<void> | null = null;
  state: SyncState = {
    online: typeof navigator === "undefined" ? true : navigator.onLine,
    phase: "idle",
    pending: 0,
    rejected: 0,
    conflict: 0,
    lastSyncAt: null,
    lastError: null,
  };

  constructor(public readonly farmId: string) {
    this.outbox = new Outbox(new IdbOutboxStorage(), deviceId());
  }

  private transport: SyncTransport = {
    push: (input) => post("/v1/sync/push", input),
  };

  subscribe(fn: (s: SyncState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private async refreshCounts() {
    const items = (await this.outbox.items()).filter((i) => i.farmId === this.farmId);
    this.set({
      pending: items.filter((i) => i.state === "pending").length,
      rejected: items.filter((i) => i.state === "rejected").length,
      conflict: items.filter((i) => i.state === "conflict").length,
    });
  }

  private onOnline = () => {
    this.set({ online: true });
    void this.syncNow();
  };
  private onOffline = () => this.set({ online: false });

  async start() {
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    this.timer = setInterval(() => void this.syncNow(), 60_000);
    const last = await idbGet<string>("meta", `lastSync:${this.farmId}`);
    this.set({ lastSyncAt: last ?? null });
    await this.refreshCounts();
    await this.syncNow();
  }

  stop() {
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    clearInterval(this.timer);
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
      const r = await this.outbox.flush(this.transport);
      if (r.networkError) throw new NetworkError();
      await this.reconcile(before);
      await this.pull();
      const now = new Date().toISOString();
      await idbPut("meta", now, `lastSync:${this.farmId}`);
      this.set({ phase: "idle", online: true, lastSyncAt: now, lastError: null });
    } catch (err) {
      const offline = err instanceof NetworkError;
      this.set({
        phase: offline ? "idle" : "error",
        online: offline ? false : this.state.online,
        lastError: offline ? null : err instanceof ApiError ? err.message : "Falha ao sincronizar.",
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
        await idbDelete("animals", item.mutation.entityId);
      } else {
        await this.refetchAnimal(item.mutation.entityId);
      }
    }
  }

  private async refetchAnimal(id: string) {
    try {
      const a = await get<Animal>(`/v1/farms/${this.farmId}/animals/${id}`);
      await idbPut("animals", a);
    } catch {
      /* próximo pull corrige */
    }
  }

  async pull() {
    const key = `cursor:${this.farmId}`;
    let cursor = (await idbGet<string>("meta", key)) ?? "0";
    for (let page = 0; page < 50; page++) {
      const res = await get<SyncPullResponse>(
        `/v1/sync/pull?farmId=${this.farmId}&cursor=${cursor}&limit=500`,
      );
      const upAnimals: Animal[] = [];
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
        (await this.outbox.items()).filter((i) => i.state === "pending").map((i) => i.mutation.entityId),
      );
      await idbPutMany("animals", upAnimals.filter((a) => !pendingIds.has(a.id)));
      await idbDeleteMany("animals", delAnimals);
      await idbPutMany("places", upPlaces);
      await idbDeleteMany("places", delPlaces);
      cursor = res.cursor;
      await idbPut("meta", cursor, key);
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
    if (!navigator.onLine) {
      this.set({ online: false });
      return { status: "saved_locally" };
    }
    await this.syncNow();
    const item = (await this.outbox.items()).find((i) => i.mutation.mutationId === mutation.mutationId);
    if (!item) return { status: "synced", entityId: mutation.entityId };
    if (item.state === "pending") return { status: "saved_locally" };
    return { status: item.state, message: item.lastError?.message ?? "Não foi possível registrar." };
  }

  async problems(): Promise<OutboxItem[]> {
    return (await this.outbox.items()).filter((i) => i.farmId === this.farmId);
  }

  async discard(mutationId: string) {
    const item = (await this.outbox.items()).find((i) => i.mutation.mutationId === mutationId);
    await this.outbox.discard(mutationId);
    if (item?.mutation.type === "animal.create" && item.state === "pending") {
      await idbDelete("animals", item.mutation.entityId);
    } else if (item) {
      await this.refetchAnimal(item.mutation.entityId);
    }
    await this.refreshCounts();
  }
}

// ---- Leituras locais --------------------------------------------------------

export const localAnimals = (farmId: string) => idbByFarm<LocalAnimal>("animals", farmId);
export const localAnimal = (id: string) => idbGet<LocalAnimal>("animals", id);
export const localPlaces = (farmId: string) => idbByFarm<Place>("places", farmId);
export const putLocalAnimal = (a: LocalAnimal) => idbPut("animals", a);

export function newMutationBase(entityId: string) {
  const now = new Date().toISOString();
  return { mutationId: crypto.randomUUID(), entityId, occurredAt: now, createdAt: now, schemaVersion: 1 as const };
}

export type { SyncReceipt };
