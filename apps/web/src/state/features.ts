import type { FarmSettings } from "@rebania/contracts";
import { parseFeatures, type FeatureFlags } from "@rebania/domain";
import { useEffect, useState } from "react";
import { get } from "../api/client.ts";
import { idbGet, idbPut } from "../offline/idb.ts";

const listeners = new Set<() => void>();
/** Avisa as telas para recarregar as chaves (após salvar Configurações). */
export function invalidateFeatures() {
  for (const fn of listeners) fn();
}

/** Módulos ligados na fazenda (cache no aparelho para uso offline). */
export function useFeatures(farmId: string): FeatureFlags | null {
  const [flags, setFlags] = useState<FeatureFlags | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const fn = () => setTick((n) => n + 1);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  useEffect(() => {
    const key = `features:${farmId}`;
    let alive = true;
    get<FarmSettings>(`/v1/farms/${farmId}/settings`).then(
      (s) => {
        if (!alive) return;
        setFlags(s.features);
        void idbPut("meta", JSON.stringify(s.features), key).catch(() => {});
      },
      async () => {
        const cached = await idbGet<string>("meta", key).catch(() => undefined);
        if (alive) setFlags(parseFeatures(cached ? JSON.parse(cached) : {}));
      },
    );
    return () => {
      alive = false;
    };
  }, [farmId, tick]);
  return flags;
}
