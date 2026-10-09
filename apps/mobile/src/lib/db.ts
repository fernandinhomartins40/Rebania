import type { LocalAnimal, LocalCache, OutboxItem, OutboxStorage, Place } from "@rebania/sync-core";
import * as SQLite from "expo-sqlite";

/**
 * Persistência local nativa em SQLite. Guardamos documentos JSON por chave
 * (o servidor é a fonte da verdade e as regras ficam em @rebania/domain).
 */
let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function db() {
  dbPromise ??= (async () => {
    const d = await SQLite.openDatabaseAsync("rebania.db");
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS outbox (mutation_id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL, doc TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS animals (id TEXT PRIMARY KEY NOT NULL, farm_id TEXT NOT NULL, doc TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS animals_farm ON animals (farm_id);
      CREATE TABLE IF NOT EXISTS places (id TEXT PRIMARY KEY NOT NULL, farm_id TEXT NOT NULL, doc TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    `);
    return d;
  })();
  return dbPromise;
}

type Row = { doc: string };

export const sqliteOutbox: OutboxStorage = {
  async get(id) {
    const r = await (
      await db()
    ).getFirstAsync<Row>("SELECT doc FROM outbox WHERE mutation_id = ?", id);
    return r ? (JSON.parse(r.doc) as OutboxItem) : undefined;
  },
  async put(item) {
    await (
      await db()
    ).runAsync(
      "INSERT OR REPLACE INTO outbox (mutation_id, created_at, doc) VALUES (?, ?, ?)",
      item.mutation.mutationId,
      item.mutation.createdAt,
      JSON.stringify(item),
    );
  },
  async remove(id) {
    await (await db()).runAsync("DELETE FROM outbox WHERE mutation_id = ?", id);
  },
  async list() {
    const rows = await (await db()).getAllAsync<Row>("SELECT doc FROM outbox ORDER BY created_at");
    return rows.map((r) => JSON.parse(r.doc) as OutboxItem);
  },
};

async function inTx(fn: (d: SQLite.SQLiteDatabase) => Promise<void>) {
  const d = await db();
  await d.withTransactionAsync(() => fn(d));
}

export const sqliteCache: LocalCache = {
  putAnimals: (animals) =>
    inTx(async (d) => {
      for (const a of animals) {
        await d.runAsync(
          "INSERT OR REPLACE INTO animals (id, farm_id, doc) VALUES (?, ?, ?)",
          a.id,
          a.farmId,
          JSON.stringify(a),
        );
      }
    }),
  deleteAnimals: (ids) =>
    inTx(async (d) => {
      for (const id of ids) await d.runAsync("DELETE FROM animals WHERE id = ?", id);
    }),
  putPlaces: (places) =>
    inTx(async (d) => {
      for (const p of places) {
        await d.runAsync(
          "INSERT OR REPLACE INTO places (id, farm_id, doc) VALUES (?, ?, ?)",
          p.id,
          p.farmId,
          JSON.stringify(p),
        );
      }
    }),
  deletePlaces: (ids) =>
    inTx(async (d) => {
      for (const id of ids) await d.runAsync("DELETE FROM places WHERE id = ?", id);
    }),
  async getMeta(key) {
    const r = await (
      await db()
    ).getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", key);
    return r?.value;
  },
  async setMeta(key, value) {
    await (
      await db()
    ).runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", key, value);
  },
};

export async function localAnimals(farmId: string): Promise<LocalAnimal[]> {
  const rows = await (
    await db()
  ).getAllAsync<Row>("SELECT doc FROM animals WHERE farm_id = ?", farmId);
  return rows.map((r) => JSON.parse(r.doc) as LocalAnimal);
}

export async function localPlaces(farmId: string): Promise<Place[]> {
  const rows = await (
    await db()
  ).getAllAsync<Row>("SELECT doc FROM places WHERE farm_id = ?", farmId);
  return rows.map((r) => JSON.parse(r.doc) as Place);
}

/** Logout em aparelho compartilhado: remove todos os dados operacionais locais. */
export async function wipeLocalData() {
  await (
    await db()
  ).execAsync("DELETE FROM outbox; DELETE FROM animals; DELETE FROM places; DELETE FROM meta;");
}
