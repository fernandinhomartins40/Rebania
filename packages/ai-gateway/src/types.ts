/**
 * Formato NEUTRO de conversa com ferramentas. Mapeia 1:1 para APIs de mensagens
 * com tool use (blocos text / tool_use / tool_result). O provedor real ainda
 * não foi decidido (P-02): cada provedor entra como um adapter `AiProvider`.
 */
export type AiBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError?: boolean };

export interface AiMessage {
  role: "user" | "assistant";
  content: AiBlock[];
}

export interface AiToolDef {
  name: string;
  description: string;
  /** JSON Schema do input (objeto, additionalProperties: false). */
  inputSchema: Record<string, unknown>;
}

export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal";

export interface AiRequest {
  system: string;
  messages: AiMessage[];
  tools: AiToolDef[];
  maxOutputTokens: number;
  signal?: AbortSignal;
}

export interface AiResponse {
  content: AiBlock[];
  stopReason: StopReason;
  usage: { inputTokens: number; outputTokens: number };
}

export interface AiProvider {
  readonly id: string;
  /** false quando não configurado: o gateway nem tenta chamar. */
  readonly available: boolean;
  readonly unavailableReason?: string;
  complete(req: AiRequest): Promise<AiResponse>;
}

/** Erro do provedor; `retryable` para limite de taxa, 5xx e falha de rede. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class AiUnavailableError extends Error {
  readonly code = "ai_unavailable";
}
