import { describe, expect, it } from "vitest";
import { DeepSeekProvider, toChatMessages } from "./deepseek.ts";
import { AiGateway } from "./gateway.ts";
import { ProviderError } from "./types.ts";

const noSleep = async () => {};

function fakeFetch(replies: (object | number)[]) {
  const calls: { url: string; init: RequestInit; body: Record<string, unknown> }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    const r = replies.shift();
    if (typeof r === "number") return new Response("{}", { status: r });
    return new Response(JSON.stringify(r), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const reply = (message: object, finish_reason: string) => ({
  choices: [{ message, finish_reason }],
  usage: { prompt_tokens: 100, completion_tokens: 20 },
});

describe("DeepSeekProvider", () => {
  it("sem chave: indisponível e o gateway não chama a rede", async () => {
    const { f, calls } = fakeFetch([]);
    const g = new AiGateway(new DeepSeekProvider({ apiKey: null, fetch: f }));
    expect(g.available).toBe(false);
    expect(g.unavailableReason).toMatch(/chave do DeepSeek/);
    await expect(g.run({ system: "", question: "oi", tools: [] })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("ciclo completo com ferramenta: formato de requisição, tool_calls e resultado", async () => {
    const { f, calls } = fakeFetch([
      reply(
        {
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "searchAnimals", arguments: '{"q":"0284"}' },
            },
          ],
        },
        "tool_calls",
      ),
      reply({ content: "A 0284 está no Pasto 3." }, "stop"),
    ]);
    const g = new AiGateway(
      new DeepSeekProvider({ apiKey: "sk-teste", fetch: f, baseUrl: "https://ds.test/" }),
    );
    const seen: unknown[] = [];
    const r = await g.run({
      system: "Você é o assistente.",
      question: "Onde está a 0284?",
      sleep: noSleep,
      tools: [
        {
          def: {
            name: "searchAnimals",
            description: "Busca animais",
            inputSchema: { type: "object", properties: { q: { type: "string" } } },
          },
          run: async (input) => {
            seen.push(input);
            return { animal: "0284", pasto: "Pasto 3" };
          },
        },
      ],
    });
    expect(r.answer).toBe("A 0284 está no Pasto 3.");
    expect(r.usage).toEqual({ inputTokens: 200, outputTokens: 40 });
    expect(seen).toEqual([{ q: "0284" }]);

    expect(calls[0]!.url).toBe("https://ds.test/chat/completions");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(
      "Bearer sk-teste",
    );
    const first = calls[0]!.body;
    expect(first.model).toBe("deepseek-chat");
    expect(first.messages).toEqual([
      { role: "system", content: "Você é o assistente." },
      { role: "user", content: "Onde está a 0284?" },
    ]);
    expect(first.tools).toEqual([
      {
        type: "function",
        function: {
          name: "searchAnimals",
          description: "Busca animais",
          parameters: { type: "object", properties: { q: { type: "string" } } },
        },
      },
    ]);
    const second = calls[1]!.body.messages as Record<string, unknown>[];
    expect(second[2]).toMatchObject({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "call_1", function: { name: "searchAnimals", arguments: '{"q":"0284"}' } },
      ],
    });
    expect(second[3]).toMatchObject({ role: "tool", tool_call_id: "call_1" });
    expect(String(second[3]!.content)).toMatch(/^<dados_nao_confiaveis>/);
  });

  it("429/5xx são temporários (retry); 401/402 não", async () => {
    const { f } = fakeFetch([429, reply({ content: "ok" }, "stop")]);
    const r = await new AiGateway(new DeepSeekProvider({ apiKey: "k", fetch: f })).run({
      system: "",
      question: "x",
      tools: [],
      sleep: noSleep,
    });
    expect(r.answer).toBe("ok");

    for (const [status, msg] of [
      [401, /chave inválida/],
      [402, /saldo insuficiente/],
    ] as const) {
      const { f: f2, calls } = fakeFetch([status, status, status]);
      const err = await new AiGateway(new DeepSeekProvider({ apiKey: "k", fetch: f2 }))
        .run({ system: "", question: "x", tools: [], sleep: noSleep })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ProviderError);
      expect((err as ProviderError).message).toMatch(msg);
      expect(calls).toHaveLength(1);
    }
  });

  it("finish_reason length e argumentos inválidos não quebram o gateway", async () => {
    const { f } = fakeFetch([
      reply(
        {
          content: null,
          tool_calls: [{ id: "c", type: "function", function: { name: "t", arguments: "{" } }],
        },
        "tool_calls",
      ),
      reply({ content: "parcial" }, "length"),
    ]);
    const inputs: unknown[] = [];
    const r = await new AiGateway(new DeepSeekProvider({ apiKey: "k", fetch: f })).run({
      system: "",
      question: "x",
      sleep: noSleep,
      tools: [
        {
          def: { name: "t", description: "", inputSchema: {} },
          run: async (i) => {
            inputs.push(i);
            throw new Error("input inválido");
          },
        },
      ],
    });
    expect(inputs).toEqual([null]);
    expect(r).toMatchObject({ answer: "parcial", stopReason: "max_tokens" });
  });

  it("resultado de erro de ferramenta é marcado para o modelo", () => {
    const msgs = toChatMessages("s", [
      { role: "user", content: [{ type: "text", text: "q" }] },
      {
        role: "assistant",
        content: [{ type: "tool_use", id: "a", name: "t", input: {} }],
      },
      {
        role: "user",
        content: [{ type: "tool_result", toolUseId: "a", content: "falhou", isError: true }],
      },
    ]);
    expect(msgs.at(-1)).toEqual({ role: "tool", tool_call_id: "a", content: "ERRO: falhou" });
  });
});
