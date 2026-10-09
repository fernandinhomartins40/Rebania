/** Wrapper mínimo de IndexedDB (sem dependências). */
const DB_NAME = "rebania";
const VERSION = 1;

export type StoreName = "outbox" | "animals" | "places" | "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("outbox", { keyPath: "mutation.mutationId" });
      const animals = db.createObjectStore("animals", { keyPath: "id" });
      animals.createIndex("farmId", "farmId");
      const places = db.createObjectStore("places", { keyPath: "id" });
      places.createIndex("farmId", "farmId");
      db.createObjectStore("meta");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function tx<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T> | Promise<T> | void,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let result: T;
    const r = fn(s);
    if (r instanceof IDBRequest) {
      r.onsuccess = () => {
        result = r.result;
      };
    } else if (r instanceof Promise) {
      r.then((v) => (result = v), reject);
    }
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export const idbGet = <T>(store: StoreName, key: IDBValidKey) => tx<T | undefined>(store, "readonly", (s) => s.get(key));
export const idbPut = (store: StoreName, value: unknown, key?: IDBValidKey): Promise<void> =>
  tx<void>(store, "readwrite", (s) => void s.put(value, key));
export const idbDelete = (store: StoreName, key: IDBValidKey): Promise<void> =>
  tx<void>(store, "readwrite", (s) => void s.delete(key));
export const idbAll = <T>(store: StoreName) => tx<T[]>(store, "readonly", (s) => s.getAll());
export const idbByFarm = <T>(store: "animals" | "places", farmId: string) =>
  tx<T[]>(store, "readonly", (s) => s.index("farmId").getAll(farmId));

export async function idbPutMany(store: StoreName, values: unknown[]) {
  if (!values.length) return;
  await tx(store, "readwrite", (s) => {
    for (const v of values) s.put(v);
  });
}

export async function idbDeleteMany(store: StoreName, keys: IDBValidKey[]) {
  if (!keys.length) return;
  await tx(store, "readwrite", (s) => {
    for (const k of keys) s.delete(k);
  });
}

/** Remove todos os dados locais (logout). */
export async function clearAll() {
  const db = await openDb();
  await Promise.all(
    (["outbox", "animals", "places", "meta"] as const).map(
      (name) =>
        new Promise<void>((resolve, reject) => {
          const t = db.transaction(name, "readwrite");
          t.objectStore(name).clear();
          t.oncomplete = () => resolve();
          t.onerror = () => reject(t.error);
        }),
    ),
  );
}

export { wrap };
