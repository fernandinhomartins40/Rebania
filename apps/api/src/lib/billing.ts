import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifiedEvent {
  eventId: string;
  type: "credit_order.paid" | "credit_order.failed" | "invoice.paid" | "invoice.failed";
  /** Referência do pedido/fatura no provedor (provider_ref) ou id interno. */
  ref: string;
}

/**
 * Adapter de pagamento. O provedor real (cartão/Pix/boleto) ainda não foi
 * decidido (P-02); quando for, implementa esta interface. Nenhum checkout é
 * simulado: sem adapter, a compra de créditos aparece como indisponível.
 */
export interface PaymentAdapter {
  readonly id: string;
  /** Verifica assinatura e devolve o evento; lança se inválido. */
  verify(headers: Record<string, string | string[] | undefined>, rawBody: string): VerifiedEvent;
}

export class InvalidSignatureError extends Error {}

/**
 * Webhook genérico assinado com HMAC-SHA256 (cabeçalho `x-rebania-signature:
 * sha256=<hex>` sobre o corpo bruto). Útil para conciliação bancária/manual
 * integrada; não cria cobranças.
 */
export class HmacWebhookAdapter implements PaymentAdapter {
  readonly id = "hmac";
  constructor(private readonly secret: string) {}

  sign(rawBody: string) {
    return `sha256=${createHmac("sha256", this.secret).update(rawBody).digest("hex")}`;
  }

  verify(headers: Record<string, string | string[] | undefined>, rawBody: string): VerifiedEvent {
    const sig = headers["x-rebania-signature"];
    if (typeof sig !== "string") throw new InvalidSignatureError("Assinatura ausente.");
    const expected = Buffer.from(this.sign(rawBody));
    const got = Buffer.from(sig);
    if (expected.length !== got.length || !timingSafeEqual(expected, got))
      throw new InvalidSignatureError("Assinatura inválida.");
    const body = JSON.parse(rawBody) as Partial<VerifiedEvent>;
    if (!body.eventId || !body.type || !body.ref)
      throw new InvalidSignatureError("Evento incompleto.");
    return { eventId: String(body.eventId), type: body.type, ref: String(body.ref) };
  }
}
