import { createHmac, timingSafeEqual } from "node:crypto";

/** API de envio do VeloMail: POST {base}/emails/send com header x-api-key (re_...). */
export interface VeloMailPayload {
  from: string;
  from_name?: string;
  to: string;
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  tags?: string[];
  tracking_enabled?: boolean;
}

export class VeloMailError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    /** Rede, 5xx ou limite do plano: vale tentar de novo. 4xx de dados/chave: não. */
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export type Fetch = typeof fetch;

export async function sendViaVeloMail(
  baseUrl: string,
  apiKey: string,
  payload: VeloMailPayload,
  opts: { fetch?: Fetch; timeoutMs?: number } = {},
): Promise<{ messageId: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await (opts.fetch ?? fetch)(`${baseUrl.replace(/\/$/, "")}/emails/send`, {
      method: "POST",
      headers: { "x-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new VeloMailError(
      aborted ? "VeloMail não respondeu a tempo." : "Falha de rede com o VeloMail.",
      0,
      "NETWORK",
      true,
    );
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (res.ok) {
    const id = body.message_id ?? body.messageId ?? body.id;
    return { messageId: typeof id === "string" ? id : null };
  }
  const code = (body.code ?? body.error_code ?? null) as string | null;
  const message = String(body.error ?? body.message ?? `HTTP ${res.status}`);
  throw new VeloMailError(message, res.status, code, res.status === 429 || res.status >= 500);
}

/** Webhook: `X-Webhook-Signature: sha256=<hex>` = HMAC-SHA256 do corpo bruto. */
export function verifyVeloMailSignature(rawBody: string, signature: string, secret: string) {
  const expected = Buffer.from(
    `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`,
  );
  const got = Buffer.from(signature || "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

/** Evento do webhook → situação do e-mail (abertura/clique ficam desligados e são ignorados). */
export const VELOMAIL_EVENT_STATUS: Record<string, "delivered" | "failed" | "bounced"> = {
  "email.delivered": "delivered",
  "email.failed": "failed",
  "email.bounced": "bounced",
  "email.spam_complaint": "failed",
};
