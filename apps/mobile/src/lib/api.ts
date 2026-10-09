import type { LoginResponse } from "@rebania/contracts";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Credenciais ficam no Keychain/Keystore (expo-secure-store), nunca em AsyncStorage. */
const KEY = "rebania.tokens";
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

type Tokens = NonNullable<LoginResponse["tokens"]>;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export class NetworkError extends Error {
  constructor() {
    super("Sem conexão com o servidor.");
  }
}

let cached: Tokens | null | undefined;
let refreshing: Promise<boolean> | null = null;
let onSessionLost: (() => void) | null = null;

export function setSessionLostHandler(fn: () => void) {
  onSessionLost = fn;
}

async function readTokens(): Promise<Tokens | null> {
  if (cached !== undefined) return cached;
  const raw = await SecureStore.getItemAsync(KEY);
  cached = raw ? (JSON.parse(raw) as Tokens) : null;
  return cached;
}

async function saveTokens(t: Tokens | null) {
  cached = t;
  if (t) await SecureStore.setItemAsync(KEY, JSON.stringify(t));
  else await SecureStore.deleteItemAsync(KEY);
}

export async function hasSession() {
  return Boolean(await readTokens());
}

async function rawFetch(method: string, path: string, body: unknown, token: string | null) {
  try {
    return await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        "x-rebania-csrf": "1",
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError();
  }
}

/** Rotação do refresh token; chamadas concorrentes compartilham a mesma rotação. */
async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const t = await readTokens();
    if (!t) return false;
    const res = await rawFetch("POST", "/v1/auth/refresh", { refreshToken: t.refreshToken }, null);
    if (!res.ok) {
      if (res.status === 401) await saveTokens(null);
      return false;
    }
    const data = (await res.json()) as LoginResponse;
    await saveTokens(data.tokens!);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function api<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
): Promise<T> {
  let t = await readTokens();
  if (t && new Date(t.accessExpiresAt).getTime() - Date.now() < 30_000) {
    await refresh();
    t = await readTokens();
  }
  let res = await rawFetch(method, path, body, t?.accessToken ?? null);
  if (res.status === 401 && t) {
    if (await refresh())
      res = await rawFetch(method, path, body, (await readTokens())!.accessToken);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) onSessionLost?.();
    throw new ApiError(
      res.status,
      data?.error?.code ?? "error",
      data?.error?.message ?? "Erro inesperado.",
    );
  }
  return data as T;
}

export async function login(email: string, password: string) {
  const res = await rawFetch(
    "POST",
    "/v1/auth/login",
    { email, password, channel: "mobile", deviceLabel: `Rebania ${Platform.OS}` },
    null,
  );
  const data = await res.json().catch(() => null);
  if (!res.ok)
    throw new ApiError(
      res.status,
      data?.error?.code ?? "error",
      data?.error?.message ?? "Falha ao entrar.",
    );
  await saveTokens((data as LoginResponse).tokens!);
}

export async function logout() {
  const t = await readTokens();
  if (t) await rawFetch("POST", "/v1/auth/logout", {}, t.accessToken).catch(() => undefined);
  await saveTokens(null);
}

export function errorMessage(err: unknown) {
  return err instanceof ApiError || err instanceof NetworkError ? err.message : "Erro inesperado.";
}
