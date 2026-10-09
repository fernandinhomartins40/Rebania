import {
  ProviderError,
  type AiBlock,
  type AiMessage,
  type AiProvider,
  type AiRequest,
  type AiResponse,
  type StopReason,
} from "./types.ts";

/**
 * Adapter do DeepSeek (P-02: provedor de IA escolhido). API de chat no formato
 * chat/completions com chamada de funções. A chave fica só no servidor
 * (DEEPSEEK_API_KEY); sem chave o provedor fica indisponível e nada é simulado.
 */
export interface DeepSeekOptions {
  apiKey: string | null;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

interface ChatResponse {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: { id: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const FINISH: Record<string, StopReason> = {
  stop: "end_turn",
  tool_calls: "tool_use",
  length: "max_tokens",
  content_filter: "refusal",
};

/** Converte a conversa neutra para mensagens do chat/completions. */
export function toChatMessages(system: string, messages: AiMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "assistant") {
      const text = m.content
        .filter((b): b is Extract<AiBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      const calls = m.content
        .filter((b): b is Extract<AiBlock, { type: "tool_use" }> => b.type === "tool_use")
        .map((b) => ({
          id: b.id,
          type: "function" as const,
          function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
        }));
      out.push({
        role: "assistant",
        content: text || null,
        ...(calls.length ? { tool_calls: calls } : {}),
      });
      continue;
    }
    // Resultados de ferramenta viram mensagens "tool" (uma por chamada), antes do texto.
    const texts: string[] = [];
    for (const b of m.content) {
      if (b.type === "tool_result") {
        out.push({
          role: "tool",
          tool_call_id: b.toolUseId,
          content: b.isError ? `ERRO: ${b.content}` : b.content,
        });
      } else if (b.type === "text") {
        texts.push(b.text);
      }
    }
    if (texts.length) out.push({ role: "user", content: texts.join("\n") });
  }
  return out;
}

/** Converte a resposta do chat/completions para o formato neutro. */
export function fromChatResponse(body: ChatResponse): AiResponse {
  const choice = body.choices?.[0];
  if (!choice?.message) throw new ProviderError("Resposta do DeepSeek sem conteúdo.", true);
  const content: AiBlock[] = [];
  const text = choice.message.content?.trim();
  if (text) content.push({ type: "text", text });
  for (const call of choice.message.tool_calls ?? []) {
    let input: unknown = null;
    try {
      input = JSON.parse(call.function?.arguments || "{}");
    } catch {
      // JSON inválido: a ferramenta valida o input e devolve erro ao modelo.
      input = null;
    }
    content.push({ type: "tool_use", id: call.id, name: call.function?.name ?? "", input });
  }
  const hasCalls = content.some((b) => b.type === "tool_use");
  const finish = choice.finish_reason ?? "stop";
  if (finish === "insufficient_system_resource")
    throw new ProviderError("DeepSeek sem capacidade no momento.", true);
  return {
    content,
    stopReason: hasCalls ? "tool_use" : (FINISH[finish] ?? "end_turn"),
    usage: {
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
    },
  };
}

export class DeepSeekProvider implements AiProvider {
  readonly id = "deepseek";
  readonly available: boolean;
  readonly unavailableReason?: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;

  constructor(private readonly o: DeepSeekOptions) {
    this.available = Boolean(o.apiKey);
    if (!this.available)
      this.unavailableReason =
        "Assistente indisponível: a chave do DeepSeek não foi configurada no servidor. O manejo manual continua normal.";
    this.model = o.model ?? "deepseek-chat";
    this.baseUrl = (o.baseUrl ?? "https://api.deepseek.com").replace(/\/$/, "");
    this.doFetch = o.fetch ?? fetch;
  }

  async complete(req: AiRequest): Promise<AiResponse> {
    let res: Response;
    try {
      res = await this.doFetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.o.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: toChatMessages(req.system, req.messages),
          max_tokens: req.maxOutputTokens,
          temperature: 0.2,
          stream: false,
          ...(req.tools.length
            ? {
                tools: req.tools.map((t) => ({
                  type: "function",
                  function: { name: t.name, description: t.description, parameters: t.inputSchema },
                })),
              }
            : {}),
        }),
        signal: req.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") throw err;
      throw new ProviderError("Falha de rede ao chamar o DeepSeek.", true);
    }
    if (!res.ok) {
      // Nunca repassa o corpo cru (pode ecoar dados da requisição); só o status.
      const retryable = res.status === 429 || res.status >= 500;
      const reason =
        res.status === 401
          ? "chave inválida"
          : res.status === 402
            ? "saldo insuficiente na conta DeepSeek"
            : res.status === 429
              ? "limite de requisições"
              : `HTTP ${res.status}`;
      throw new ProviderError(`DeepSeek recusou a chamada (${reason}).`, retryable);
    }
    return fromChatResponse((await res.json()) as ChatResponse);
  }
}
