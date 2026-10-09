import type { FarmSummary, MeResponse } from "@rebania/contracts";
import type { Permission, Role } from "@rebania/domain";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { get, post } from "../api/client.ts";
import { clearAll } from "../offline/idb.ts";

export interface CurrentFarm extends FarmSummary {
  organizationName: string;
  role: Role;
  permissions: Permission[];
}

interface SessionValue {
  status: "loading" | "anonymous" | "ready";
  me: MeResponse | null;
  farms: CurrentFarm[];
  farm: CurrentFarm | null;
  selectFarm: (id: string) => void;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
  can: (p: Permission) => boolean;
}

const SessionContext = createContext<SessionValue | null>(null);
const FARM_KEY = "rebania.farmId";

function readPref(): string | null {
  try {
    return localStorage.getItem(FARM_KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionValue["status"]>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [farmId, setFarmId] = useState<string | null>(readPref);

  const reload = useCallback(async () => {
    try {
      const data = await get<MeResponse>("/v1/auth/me");
      setMe(data);
      setStatus("ready");
    } catch {
      setMe(null);
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    void reload();
    const onUnauthorized = () => setStatus((s) => (s === "ready" ? "anonymous" : s));
    window.addEventListener("rebania:unauthorized", onUnauthorized);
    return () => window.removeEventListener("rebania:unauthorized", onUnauthorized);
  }, [reload]);

  const farms = useMemo<CurrentFarm[]>(
    () =>
      me?.memberships.flatMap((m) =>
        m.farms.map((f) => ({ ...f, organizationName: m.organizationName, role: m.role, permissions: m.permissions })),
      ) ?? [],
    [me],
  );
  const farm = farms.find((f) => f.id === farmId) ?? farms[0] ?? null;

  const selectFarm = useCallback((id: string) => {
    setFarmId(id);
    try {
      localStorage.setItem(FARM_KEY, id);
    } catch {
      /* preferência opcional */
    }
  }, []);

  const logout = useCallback(async () => {
    await post("/v1/auth/logout").catch(() => undefined);
    await clearAll(); // aparelho compartilhado: remove dados operacionais locais
    setMe(null);
    setStatus("anonymous");
  }, []);

  const can = useCallback((p: Permission) => Boolean(farm?.permissions.includes(p)), [farm]);

  return (
    <SessionContext.Provider value={{ status, me, farms, farm, selectFarm, reload, logout, can }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const v = useContext(SessionContext);
  if (!v) throw new Error("useSession fora do SessionProvider");
  return v;
}
