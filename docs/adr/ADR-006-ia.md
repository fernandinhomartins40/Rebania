# ADR-006 — IA
**Estado:** Implementado sem provedor · adapter do provedor pendente (P-02)

Gateway neutro em `packages/ai-gateway` (mensagens com blocos text/tool_use/tool_result, mapeáveis a APIs de mensagens com ferramentas), com timeout, retry com backoff, disjuntor, orçamento de tokens e cache por tenant. Provedor padrão `DisabledProvider`: o assistente aparece indisponível e nunca finge resposta. Ferramentas tipadas e presas à fazenda da sessão (`searchAnimals`, `getAnimalHistory`, `listDueTasks`, `getHerdMetrics`, `prepareHealthEvent`, `prepareMovement`, `prepareMating`, `prepareTask`); sem SQL livre; resultados de ferramenta vão marcados como dados não confiáveis. Ferramentas `prepare*` só criam rascunho com hash; a confirmação é humana (`/ai/drafts/:id/confirm`), revalida tenant, permissão, hash, validade e regras do domínio, e é idempotente. Falha do provedor devolve os créditos e não bloqueia o manejo manual.

Ao decidir o provedor: implementar `AiProvider` no gateway (ex.: SDK oficial do provedor) e selecionar por `AI_PROVIDER`; nenhuma rota muda.
