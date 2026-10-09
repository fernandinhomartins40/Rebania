import { uuid } from "./ids.ts";
import { processUploads } from "./uploads.ts";
import type { Animal, MeResponse, SyncPullResponse } from "@rebania/contracts";
import { newMutationBase, SyncEngine, type SyncState } from "@rebania/sync-core";
import * as Network from "expo-network";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  ApiError,
  errorMessage,
  hasSession,
  login as apiLogin,
  logout as apiLogout,
  NetworkError,
  setSessionLostHandler,
} from "./api.ts";
import { db, sqliteCache, sqliteOutbox, wipeLocalData } from "./db.ts";

export interface Farm {
  id: string;
  name: string;
  organizationName: string;
  timezone: string;
  permissions: string[];
}

interface SessionValue {
  status: "loading" | "anonymous" | "ready";
  me: MeResponse | null;
  farm: Farm | null;
  farms: Farm[];
  selectFarm: (id: string) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  engine: SyncEngine | null;
  sync: SyncState | null;
  /** Incrementa após cada sincronização para recarregar listas locais. */
  dataVersion: number;
  bump: () => void;
}

const Ctx = createContext<SessionValue | null>(null);

export { uuid };
export const mutationBase = (entityId: string) => newMutationBase(entityId, uuid);

async function getDeviceId() {
  let id = await sqliteCache.getMeta("deviceId");
  if (!id) {
    id = uuid();
    await sqliteCache.setMeta("deviceId", id);
  }
  return id;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionValue["status"]>("loading");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [online, setOnline] = useState(true);
  const onlineRef = useRef(true);
  onlineRef.current = online;

  const loadMe = useCallback(async () => {
    try {
      setMe(await api<MeResponse>("GET", "/v1/auth/me"));
      setStatus("ready");
    } catch (err) {
      if (err instanceof NetworkError && (await hasSession())) {
        // Sem conexão mas com sessão salva: opera com dados locais.
        const cachedMe = await sqliteCache.getMeta("me");
        if (cachedMe) {
          setMe(JSON.parse(cachedMe) as MeResponse);
          setStatus("ready");
          return;
        }
      }
      setStatus("anonymous");
    }
  }, []);

  useEffect(() => {
    setSessionLostHandler(() => setStatus("anonymous"));
    void db().then(loadMe);
    const sub = Network.addNetworkStateListener((s) =>
      setOnline(Boolean(s.isConnected && s.isInternetReachable !== false)),
    );
    return () => sub.remove();
  }, [loadMe]);

  useEffect(() => {
    if (me) void sqliteCache.setMeta("me", JSON.stringify(me));
  }, [me]);

  const farms = useMemo<Farm[]>(
    () =>
      me?.memberships.flatMap((m) =>
        m.farms.map((f) => ({
          id: f.id,
          name: f.name,
          timezone: f.timezone,
          organizationName: m.organizationName,
          permissions: m.permissions,
        })),
      ) ?? [],
    [me],
  );
  const farm = farms.find((f) => f.id === farmId) ?? farms[0] ?? null;

  useEffect(() => {
    if (!farm || status !== "ready") return;
    let e: SyncEngine | null = null;
    let unsub: (() => void) | undefined;
    void getDeviceId().then((deviceId) => {
      e = new SyncEngine({
        farmId: farm.id,
        deviceId,
        outboxStorage: sqliteOutbox,
        cache: sqliteCache,
        isOnline: () => onlineRef.current,
        api: {
          push: (input) => api("POST", "/v1/sync/push", input),
          pull: (f, cursor) =>
            api<SyncPullResponse>("GET", `/v1/sync/pull?farmId=${f}&cursor=${cursor}&limit=500`),
          getAnimal: (f, id) => api<Animal>("GET", `/v1/farms/${f}/animals/${id}`),
          isNetworkError: (err) => err instanceof NetworkError,
          errorMessage,
        },
      });
      let lastPhase = e.state.phase;
      unsub = e.subscribe((s) => {
        setSync(s);
        if (lastPhase === "syncing" && s.phase !== "syncing") {
          setDataVersion((v) => v + 1);
          if (s.online) void processUploads().then(() => setDataVersion((v) => v + 1));
        }
        lastPhase = s.phase;
      });
      setEngine(e);
      void e.start(30_000);
    });
    return () => {
      unsub?.();
      e?.stop();
      setEngine(null);
    };
  }, [farm?.id, status]);

  useEffect(() => {
    engine?.setOnline(online);
  }, [online, engine]);

  const value: SessionValue = {
    status,
    me,
    farm,
    farms,
    selectFarm: setFarmId,
    login: async (email, password) => {
      await apiLogin(email, password);
      await loadMe();
    },
    logout: async () => {
      await apiLogout();
      await wipeLocalData();
      setMe(null);
      setStatus("anonymous");
    },
    engine,
    sync,
    dataVersion,
    bump: () => setDataVersion((v) => v + 1),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession fora do provider");
  return v;
}

export { ApiError };
