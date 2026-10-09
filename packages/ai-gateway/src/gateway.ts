import {
  AiUnavailableError,
  ProviderError,
  type AiBlock,
  type AiMessage,
  type AiProvider,
  type AiToolDef,
} from "./types.ts";

/** Provedor padrão enquanto P-02 não é decidido: nunca finge resposta. */
export class DisabledProvider implements AiProvider {
  readonly id = "none";
  readonly available = false;
  readonly unavailableReason =
    "Assistente indisponível: o provedor de IA ainda não foi configurado. O manejo manual continua normal.";
  async complete(): Promise<never> {
    throw new AiUnavailableError(this.unavailableReason);
  }
}

/** Disjuntor: após N falhas seguidas, recusa chamadas por `cooldownMs`. */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  constructor(
    private readonly threshold = 3,
    private readonly cooldownMs = 60_000,
    private readonly now: () => number = Date.now,
  ) {}
  get open(): boolean {
    if (this.openedAt === null) return false;
    if (this.now() - this.openedAt >= this.cooldownMs) {
      this.openedAt = null;
      this.failures = this.threshold - 1; // meia-abertura: 1 tentativa
      return false;
    }
    return true;
  }
  success() {
    this.failures = 0;
    this.openedAt = null;
  }
  failure() {
    this.failures++;
    if (this.failures >= this.threshold) this.openedAt = this.now();
  }
}

/** Cache por tenant (org+fazenda): nunca devolve resposta de outro cliente. */
export class TenantCache<T> {
  private map = new Map<string, { at: number; value: T }>();
  constructor(
    private readonly ttlMs = 5 * 60_000,
    private readonly max = 500,
    private readonly now: () => number = Date.now,
  ) {}
  private k(tenant: string, key: string) {
    return `${tenant}\u0000${key}`;
  }
  get(tenant: string, key: string): T | undefined {
    const e = this.map.get(this.k(tenant, key));
    if (!e) return undefined;
    if (this.now() - e.at > this.ttlMs) {
      this.map.delete(this.k(tenant, key));
      return undefined;
    }
    return e.value;
  }
  set(tenant: string, key: string, value: T) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value!);
    this.map.set(this.k(tenant, key), { at: this.now(), value });
  }
}

/**
 * Ferramenta executada no servidor. O contexto (tenant, usuário, permissões) é
 * fechado na criação da ferramenta — o modelo NÃO informa org/fazenda/usuário.
 * Ferramentas de escrita só criam RASCUNHOS; nada é gravado sem confirmação humana.
 */
export interface ToolImpl {
  def: AiToolDef;
  run(input: unknown): Promise<unknown>;
}

export interface RunOptions {
  system: string;
  question: string;
  tools: ToolImpl[];
  maxSteps?: number;
  timeoutMs?: number;
  /** Teto de tokens (entrada+saída) por pergunta. */
  budgetTokens?: number;
  maxOutputTokens?: number;
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface RunResult {
  answer: string;
  toolCalls: { name: string; input: unknown; ok: boolean }[];
  usage: { inputTokens: number; outputTokens: number };
  stopReason: string;
}

/**
 * Conteúdo vindo de ferramentas (inclusive textos e anexos digitados por
 * usuários) é DADO, não instrução: vai embrulhado e marcado como não confiável.
 */
export function wrapUntrusted(value: unknown): string {
  const json = JSON.stringify(value ?? null);
  return `<dados_nao_confiaveis>\n${json.replace(/<\/?dados_nao_confiaveis>/g, "")}\n</dados_nao_confiaveis>`;
}

export class AiGateway {
  readonly breaker: CircuitBreaker;
  constructor(
    readonly provider: AiProvider,
    breaker?: CircuitBreaker,
  ) {
    this.breaker = breaker ?? new CircuitBreaker();
  }

  get available() {
    return this.provider.available && !this.breaker.open;
  }

  get unavailableReason(): string {
    if (!this.provider.available)
      return this.provider.unavailableReason ?? "Assistente indisponível.";
    return "Assistente temporariamente indisponível após falhas seguidas do provedor. O manejo manual continua normal.";
  }

  async run(o: RunOptions): Promise<RunResult> {
    if (!this.available) throw new AiUnavailableError(this.unavailableReason);
    const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
    const byName = new Map(o.tools.map((t) => [t.def.name, t]));
    const messages: AiMessage[] = [{ role: "user", content: [{ type: "text", text: o.question }] }];
    const usage = { inputTokens: 0, outputTokens: 0 };
    const toolCalls: RunResult["toolCalls"] = [];
    const budget = o.budgetTokens ?? 60_000;
    for (let step = 0; step < (o.maxSteps ?? 6); step++) {
      const res = await this.callWithRetry(o, messages, sleep);
      usage.inputTokens += res.usage.inputTokens;
      usage.outputTokens += res.usage.outputTokens;
      messages.push({ role: "assistant", content: res.content });
      const uses = res.content.filter(
        (b): b is Extract<AiBlock, { type: "tool_use" }> => b.type === "tool_use",
      );
      const text = res.content
        .filter((b): b is Extract<AiBlock, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (res.stopReason !== "tool_use" || !uses.length) {
        return { answer: text, toolCalls, usage, stopReason: res.stopReason };
      }
      if (usage.inputTokens + usage.outputTokens > budget) {
        return {
          answer:
            text || "Limite de processamento desta pergunta atingido. Tente ser mais específico.",
          toolCalls,
          usage,
          stopReason: "budget",
        };
      }
      // Todas as respostas de ferramenta voltam numa única mensagem.
      const results: AiBlock[] = [];
      for (const u of uses) {
        const tool = byName.get(u.name);
        if (!tool) {
          toolCalls.push({ name: u.name, input: u.input, ok: false });
          results.push({
            type: "tool_result",
            toolUseId: u.id,
            content: "Ferramenta inexistente.",
            isError: true,
          });
          continue;
        }
        try {
          const out = await tool.run(u.input);
          toolCalls.push({ name: u.name, input: u.input, ok: true });
          results.push({ type: "tool_result", toolUseId: u.id, content: wrapUntrusted(out) });
        } catch (err) {
          toolCalls.push({ name: u.name, input: u.input, ok: false });
          results.push({
            type: "tool_result",
            toolUseId: u.id,
            content: err instanceof Error ? err.message : "Falha na ferramenta.",
            isError: true,
          });
        }
      }
      messages.push({ role: "user", content: results });
    }
    return {
      answer: "Não consegui concluir dentro do limite de etapas. Reformule a pergunta.",
      toolCalls,
      usage,
      stopReason: "max_steps",
    };
  }

  private async callWithRetry(
    o: RunOptions,
    messages: AiMessage[],
    sleep: (ms: number) => Promise<void>,
  ) {
    const retries = o.retries ?? 2;
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 30_000);
      try {
        const res = await this.provider.complete({
          system: o.system,
          messages,
          tools: o.tools.map((t) => t.def),
          maxOutputTokens: o.maxOutputTokens ?? 2_000,
          signal: ctrl.signal,
        });
        this.breaker.success();
        return res;
      } catch (err) {
        const retryable =
          (err instanceof ProviderError && err.retryable) ||
          (err instanceof Error && err.name === "AbortError");
        if (!retryable || attempt >= retries) {
          if (!(err instanceof AiUnavailableError)) this.breaker.failure();
          throw err instanceof ProviderError || err instanceof AiUnavailableError
            ? err
            : new ProviderError(err instanceof Error ? err.message : "Falha do provedor.", false);
        }
        await sleep(Math.min(8_000, 500 * 2 ** attempt));
      } finally {
        clearTimeout(timer);
      }
    }
  }
}
