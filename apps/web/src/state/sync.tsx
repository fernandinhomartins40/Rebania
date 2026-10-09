import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SyncEngine, type SyncState } from "../offline/engine.ts";

interface SyncValue {
  engine: SyncEngine;
  state: SyncState;
  /** Incrementa a cada sincronização concluída — use como dependência para recarregar dados locais. */
  version: number;
}

const SyncContext = createContext<SyncValue | null>(null);

export function SyncProvider({ farmId, children }: { farmId: string; children: ReactNode }) {
  const [engine] = useState(() => new SyncEngine(farmId));
  const [state, setState] = useState<SyncState>(engine.state);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let lastPhase = engine.state.phase;
    const unsub = engine.subscribe((s) => {
      setState(s);
      if (lastPhase === "syncing" && s.phase !== "syncing") setVersion((v) => v + 1);
      lastPhase = s.phase;
    });
    void engine.start();
    return () => {
      unsub();
      engine.stop();
    };
  }, [engine]);

  return <SyncContext.Provider value={{ engine, state, version }}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const v = useContext(SyncContext);
  if (!v) throw new Error("useSync fora do SyncProvider");
  return v;
}
