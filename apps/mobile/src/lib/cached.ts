import { useCallback, useEffect, useState } from "react";
import { api } from "./api.ts";
import { sqliteCache } from "./db.ts";
import { useSession } from "./session.tsx";

/** GET com a última resposta guardada no aparelho (SQLite) para uso sem sinal. */
export function useCachedGet<T>(path: string | null, key: string) {
  const { dataVersion } = useSession();
  const [data, setData] = useState<T | null>(null);
  const [offline, setOffline] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    api<T>("GET", path).then(
      async (v) => {
        if (!alive) return;
        setData(v);
        setOffline(false);
        await sqliteCache.setMeta(`cache:${key}`, JSON.stringify(v)).catch(() => {});
      },
      async () => {
        const c = await sqliteCache.getMeta(`cache:${key}`).catch(() => undefined);
        if (!alive) return;
        setData(c ? (JSON.parse(c) as T) : null);
        setOffline(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [path, key, dataVersion, tick]);
  return { data, offline, reload };
}
