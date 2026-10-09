import type { Animal, SyncPullResponse } from "@rebania/contracts";
import {
  newMutationBase as baseMutation,
  SyncEngine as CoreEngine,
  type LocalAnimal,
  type LocalCache,
  type OutboxItem,
  type OutboxStorage,
  type Place,
} from "@rebania/sync-core";
import { errorMessage, get, NetworkError, post } from "../api/client.ts";
import { idbAll, idbByFarm, idbDelete, idbDeleteMany, idbGet, idbPut, idbPutMany } from "./idb.ts";

export type { LocalAnimal, Place, SubmitResult, SyncState } from "@rebania/sync-core";

class IdbOutboxStorage implements OutboxStorage {
  get = (id: string) => idbGet<OutboxItem>("outbox", id);
  put = (item: OutboxItem) => idbPut("outbox", item);
  remove = (id: string) => idbDelete("outbox", id);
  list = () => idbAll<OutboxItem>("outbox");
}

const idbCache: LocalCache = {
  putAnimals: (a) => idbPutMany("animals", a),
  deleteAnimals: (ids) => idbDeleteMany("animals", ids),
  putPlaces: (p) => idbPutMany("places", p),
  deletePlaces: (ids) => idbDeleteMany("places", ids),
  getMeta: (k) => idbGet<string>("meta", k),
  setMeta: (k, v) => idbPut("meta", v, k),
};

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

/** Motor de sync do web: IndexedDB + API por cookie + eventos online/offline do navegador. */
export class SyncEngine extends CoreEngine {
  private onOnline = () => this.setOnline(true);
  private onOffline = () => this.setOnline(false);

  constructor(farmId: string) {
    super({
      farmId,
      deviceId: deviceId(),
      outboxStorage: new IdbOutboxStorage(),
      cache: idbCache,
      isOnline: () => navigator.onLine,
      api: {
        push: (input) => post("/v1/sync/push", input),
        pull: (f, cursor) =>
          get<SyncPullResponse>(`/v1/sync/pull?farmId=${f}&cursor=${cursor}&limit=500`),
        getAnimal: (f, id) => get<Animal>(`/v1/farms/${f}/animals/${id}`),
        isNetworkError: (err) => err instanceof NetworkError,
        errorMessage: (err) => (err instanceof Error ? errorMessage(err) : "Falha ao sincronizar."),
      },
    });
  }

  override async start() {
    window.addEventListener("online", this.onOnline);
    window.addEventListener("offline", this.onOffline);
    await super.start();
  }

  override stop() {
    window.removeEventListener("online", this.onOnline);
    window.removeEventListener("offline", this.onOffline);
    super.stop();
  }
}

// ---- Leituras locais --------------------------------------------------------

export const localAnimals = (farmId: string) => idbByFarm<LocalAnimal>("animals", farmId);
export const localAnimal = (id: string) => idbGet<LocalAnimal>("animals", id);
export const localPlaces = (farmId: string) => idbByFarm<Place>("places", farmId);
export const putLocalAnimal = (a: LocalAnimal) => idbPut("animals", a);
export const newMutationBase = (entityId: string) =>
  baseMutation(entityId, () => crypto.randomUUID());
