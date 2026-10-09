import type { TaskDto } from "@rebania/contracts";
import { useEffect, useState } from "react";
import { get } from "../api/client.ts";
import { idbGet, idbPut } from "../offline/idb.ts";
import { useSync } from "./sync.tsx";

/** Tarefas abertas (online) com a última lista guardada no aparelho para uso offline. */
export function useOpenTasks(farmId: string) {
  const { version } = useSync();
  const [tasks, setTasks] = useState<TaskDto[] | null>(null);
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    let alive = true;
    const key = `tasks:${farmId}`;
    get<TaskDto[]>(`/v1/farms/${farmId}/tasks`).then(
      async (list) => {
        if (!alive) return;
        setTasks(list);
        setOffline(false);
        await idbPut("meta", JSON.stringify(list), key);
      },
      async () => {
        const cached = await idbGet<string>("meta", key);
        if (!alive) return;
        setTasks(cached ? (JSON.parse(cached) as TaskDto[]) : []);
        setOffline(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [farmId, version]);
  return { tasks, offline };
}
