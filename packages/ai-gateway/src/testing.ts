import type { AiProvider, AiRequest, AiResponse } from "./types.ts";

/**
 * Provedor ROTEIRIZADO para testes automatizados (não é IA): devolve respostas
 * pré-definidas em sequência. Nunca é usado fora dos testes.
 */
export class ScriptedProvider implements AiProvider {
  readonly id = "scripted-test";
  readonly available = true;
  readonly requests: AiRequest[] = [];
  constructor(private readonly script: (AiResponse | Error | ((req: AiRequest) => AiResponse))[]) {}
  async complete(req: AiRequest): Promise<AiResponse> {
    this.requests.push(structuredClone({ ...req, signal: undefined }));
    const next = this.script.shift();
    if (!next) throw new Error("roteiro esgotado");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next(req) : next;
  }
}

export const text = (t: string): AiResponse => ({
  content: [{ type: "text", text: t }],
  stopReason: "end_turn",
  usage: { inputTokens: 100, outputTokens: 20 },
});

export const toolCall = (name: string, input: unknown, id = `tu_${name}`): AiResponse => ({
  content: [{ type: "tool_use", id, name, input }],
  stopReason: "tool_use",
  usage: { inputTokens: 100, outputTokens: 20 },
});
