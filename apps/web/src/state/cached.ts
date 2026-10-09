import { useCallback, useEffect, useState } from "react";
import { get } from "../api/client.ts";
import { idbGet, idbPut } from "../offline/idb.ts";
import { useSync } from "./sync.tsx";

/**
 * GET com a última resposta guardada no aparelho: offline, a tela continua útil
 * com os dados conhecidos e avisa que podem estar desatualizados.
 */
export function useCachedGet<T>(path: string | null, cacheKey: string) {
  const { version } = useSync();
  const [data, setData] = useState<T | null>(null);
  const [offline, setOffline] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    get<T>(path).then(
      async (v) => {
        if (!alive) return;
        setData(v);
        setOffline(false);
        try {
          await idbPut("meta", JSON.stringify(v), cacheKey);
        } catch {
          /* cache opcional */
        }
      },
      async () => {
        const cached = await idbGet<string>("meta", cacheKey).catch(() => undefined);
        if (!alive) return;
        setData(cached ? (JSON.parse(cached) as T) : null);
        setOffline(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [path, cacheKey, version, tick]);
  return { data, offline, reload };
}
