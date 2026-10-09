# ADR-006 — IA
**Estado:** Implementado · provedor DeepSeek (`AI_PROVIDER=deepseek`), desligado até a chave ser configurada no servidor

Gateway neutro em `packages/ai-gateway` (mensagens com blocos text/tool_use/tool_result, mapeáveis a APIs de mensagens com ferramentas), com timeout, retry com backoff, disjuntor, orçamento de tokens e cache por tenant. Provedor padrão `DisabledProvider`: o assistente aparece indisponível e nunca finge resposta. Ferramentas tipadas e presas à fazenda da sessão (`searchAnimals`, `getAnimalHistory`, `listDueTasks`, `getHerdMetrics`, `prepareHealthEvent`, `prepareMovement`, `prepareMating`, `prepareTask`); sem SQL livre; resultados de ferramenta vão marcados como dados não confiáveis. Ferramentas `prepare*` só criam rascunho com hash; a confirmação é humana (`/ai/drafts/:id/confirm`), revalida tenant, permissão, hash, validade e regras do domínio, e é idempotente. Falha do provedor devolve os créditos e não bloqueia o manejo manual.

Provedor escolhido (P-02): **DeepSeek**, via `DeepSeekProvider` (`packages/ai-gateway/src/deepseek.ts`). Ele usa a API chat/completions com chamada de funções, por `fetch`, sem SDK adicional.
- Configuração no servidor: `AI_PROVIDER=deepseek` e `DEEPSEEK_API_KEY`. Os opcionais são `DEEPSEEK_MODEL` (padrão `deepseek-chat`) e `DEEPSEEK_BASE_URL`.
- Sem chave, a API não sobe com `AI_PROVIDER=deepseek`. Com `AI_PROVIDER=none`, o assistente fica indisponível.
- 429/5xx/falha de rede são temporários (retry e disjuntor). 401 (chave) e 402 (saldo DeepSeek) não são retentados.
- O corpo de erro do provedor nunca é repassado.
- A cobrança ao cliente continua pela tabela de créditos da plataforma (ADR-007), não pelos tokens. Os tokens ficam registrados em `ai_usage` para medir custo.

Trocar de provedor: implementar outro `AiProvider` e selecionar por `AI_PROVIDER`. Nenhuma rota muda.
