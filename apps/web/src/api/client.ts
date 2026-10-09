/** Cliente HTTP do web. Autenticação por cookie httpOnly (mesma origem). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Falha de rede (sem resposta do servidor). */
export class NetworkError extends Error {
  constructor() {
    super("Sem conexão com o servidor.");
  }
}

type Method = "GET" | "POST" | "PATCH";

export async function api<T>(
  method: Method,
  path: string,
  body?: unknown,
  opts: { idempotencyKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { "x-rebania-csrf": "1" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new NetworkError();
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? {};
    if (res.status === 401) window.dispatchEvent(new CustomEvent("rebania:unauthorized"));
    throw new ApiError(
      res.status,
      err.code ?? "error",
      err.message ?? "Erro inesperado.",
      err.details,
    );
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>("GET", path);
export const post = <T>(path: string, body?: unknown, opts?: { idempotencyKey?: string }) =>
  api<T>("POST", path, body ?? {}, opts);
export const patch = <T>(path: string, body?: unknown, opts?: { idempotencyKey?: string }) =>
  api<T>("PATCH", path, body ?? {}, opts);

/** Mensagem amigável para qualquer erro. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError || err instanceof NetworkError) return err.message;
  return "Erro inesperado. Tente novamente.";
}
