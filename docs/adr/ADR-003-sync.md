# ADR-003 — Sincronização offline
**Estado:** Adotado · 09/10/2026

**Decisão:** toda escrita de campo passa por um **outbox** local (IndexedDB no web, SQLite no nativo) com envelope `{mutationId, entityId, type, payload, occurredAt, createdAt, schemaVersion}`. O servidor:
- processa cada mutação em transação própria e grava um **recibo** em `sync_mutations` (accepted / rejected / conflict); repetir o `mutationId` devolve o mesmo recibo sem reexecutar;
- aplica **política por tipo** (`packages/sync-core/src/policies.ts`): `append` (pesagens coexistem), `idempotent_create`, `version_check` (movimentação/edição exigem `expectedVersion`; divergência vira conflito para revisão humana). Não existe last-write-wins universal;
- registra mudanças em `change_log` (cursor `seq`) para o **pull incremental**.

O cliente nunca descarta rejeições ou conflitos sozinho: ficam visíveis na Central de Sincronização até o usuário decidir. Efeitos otimistas de mutações rejeitadas são desfeitos (cadastro removido; animal recarregado do servidor). A data do aparelho não decide prioridade.

**Motor compartilhado:** `SyncEngine` em `@rebania/sync-core`; web e nativo só implementam o armazenamento.
**Testes:** `sync.test.ts` (100 eventos, reinício, lote parcial, conflito entre aparelhos), `outbox.test.ts`, `apps/web/src/offline/engine.test.ts`.
