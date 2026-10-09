import { summarizeSession, type HandlingItemStatus, type HealthKind } from "@rebania/domain";
import { sqliteCache } from "./db.ts";

/** Sessão do Modo Curral guardada no aparelho (SQLite): funciona sem sinal e sobrevive a reinício. */
export interface LocalSession {
  id: string;
  farmId: string;
  name: string;
  date: string;
  status: "open" | "closed";
  config: {
    weigh: boolean;
    healthKind: HealthKind;
    products: {
      productId: string;
      dose: number;
      route?: string | null;
      productName?: string;
      unit?: string;
    }[];
  };
  items: {
    animalId: string;
    status: HandlingItemStatus;
    added: boolean;
    weightKg: number | null;
    note: string | null;
    doneAt: string | null;
  }[];
  exceptions: {
    id: string;
    kind: string;
    value: string | null;
    note: string | null;
    createdAt: string;
  }[];
  reads: string[];
  readerConnected: boolean;
  createdAt: string;
}

const key = (id: string) => `curral:${id}`;
const index = (farmId: string) => `curral-index:${farmId}`;

export async function saveSession(s: LocalSession) {
  await sqliteCache.setMeta(key(s.id), JSON.stringify(s));
  const raw = await sqliteCache.getMeta(index(s.farmId));
  const ids: string[] = raw ? JSON.parse(raw) : [];
  if (!ids.includes(s.id))
    await sqliteCache.setMeta(index(s.farmId), JSON.stringify([s.id, ...ids].slice(0, 50)));
}

export async function loadSession(id: string): Promise<LocalSession | null> {
  const raw = await sqliteCache.getMeta(key(id));
  return raw ? (JSON.parse(raw) as LocalSession) : null;
}

export async function listSessions(farmId: string): Promise<LocalSession[]> {
  const raw = await sqliteCache.getMeta(index(farmId));
  const ids: string[] = raw ? JSON.parse(raw) : [];
  return (await Promise.all(ids.map(loadSession))).filter((s): s is LocalSession => s !== null);
}

export const summaryOf = (s: LocalSession) => summarizeSession(s.items, s.exceptions.length);
