import type { HandlingSessionDto } from "@rebania/contracts";
import { summarizeSession, type HandlingItemStatus, type HealthKind } from "@rebania/domain";
import { idbGet, idbPut } from "./idb.ts";

/**
 * Sessão do Modo Curral guardada no aparelho. É a fonte da tela durante o manejo
 * (funciona sem sinal e sobrevive a reinício); cada ação também vira mutação no
 * outbox, e o servidor é a referência depois de sincronizado.
 */
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
      batchId?: string | null;
      dose: number;
      route?: string | null;
      productName?: string;
      unit?: string;
    }[];
    applicator?: string;
    reason?: string;
    planItemId?: string | null;
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
    resolvedAnimalId: string | null;
    createdAt: string;
  }[];
  /** Valores lidos nesta sessão (restaura a supressão de repetidos após reinício). */
  reads: string[];
  /** Animal na tela quando o app foi fechado (retomada). */
  currentId: string | null;
  readerConnected: boolean;
  createdAt: string;
  closedAt: string | null;
}

const key = (id: string) => `curral:${id}`;
const indexKey = (farmId: string) => `curral-index:${farmId}`;

export async function saveSession(s: LocalSession) {
  await idbPut("meta", JSON.stringify(s), key(s.id));
  const raw = await idbGet<string>("meta", indexKey(s.farmId));
  const ids: string[] = raw ? JSON.parse(raw) : [];
  if (!ids.includes(s.id)) {
    ids.unshift(s.id);
    await idbPut("meta", JSON.stringify(ids.slice(0, 50)), indexKey(s.farmId));
  }
}

export async function loadSession(id: string): Promise<LocalSession | null> {
  const raw = await idbGet<string>("meta", key(id));
  return raw ? (JSON.parse(raw) as LocalSession) : null;
}

export async function listLocalSessions(farmId: string): Promise<LocalSession[]> {
  const raw = await idbGet<string>("meta", indexKey(farmId));
  const ids: string[] = raw ? JSON.parse(raw) : [];
  const all = await Promise.all(ids.map(loadSession));
  return all.filter((s): s is LocalSession => s !== null);
}

export function fromServer(farmId: string, dto: HandlingSessionDto): LocalSession {
  return {
    id: dto.id,
    farmId,
    name: dto.name,
    date: dto.date,
    status: dto.status,
    config: dto.config,
    items: dto.items.map((i) => ({
      animalId: i.animalId,
      status: i.status,
      added: i.added,
      weightKg: i.weightKg,
      note: i.note,
      doneAt: i.doneAt,
    })),
    exceptions: dto.exceptions,
    reads: [],
    currentId: null,
    readerConnected: true,
    createdAt: dto.createdAt,
    closedAt: dto.closedAt,
  };
}

export const summaryOf = (s: LocalSession) => summarizeSession(s.items, s.exceptions.length);
