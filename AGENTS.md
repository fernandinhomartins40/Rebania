# Instruções para agentes (Claude/Codex)

Leia antes de alterar: `docs/STATUS.md`, `docs/DECISIONS.md`, `docs/PLANO_DE_IMPLEMENTACAO.md` e os ADRs em `docs/adr`.

Regras do projeto:
- **Tenant:** nunca aceitar `organizationId` do cliente; usar `requireFarm`/`requireOrg`. Toda nova tabela de negócio leva `organization_id` e FK composta. Adicionar caso no `tenant-isolation.test.ts`.
- **Histórico:** append-only; correção cria evento/versão; nada de `DELETE` de histórico.
- **Escritas de campo:** idempotentes (`mutationId`/`Idempotency-Key`), com política de conflito explícita em `packages/sync-core/src/policies.ts`. Nada de last-write-wins universal.
- **Regras de negócio** ficam em `packages/domain` com teste unitário; datas civis no timezone da fazenda; kg vivo ≠ arroba.
- **Visual:** seguir as pranchas (`docs/referencia`) e o pacote de marca (`docs/brand/pacote-landing`). Ícones Lucide; figura bovina = símbolo PNG; nunca recompor o wordmark com fonte.
- **Honestidade de produto:** não exibir como disponível o que não existe; nada de dados fictícios fora de prévias rotuladas "Tela ilustrativa".
- **Infra:** nunca `docker compose down -v`, `prune` global ou bind em 80/443. Não publicar nem enviar às lojas sem autorização.
- Antes de concluir: `pnpm format:check && pnpm turbo run typecheck lint test && pnpm test:integration` e atualizar `docs/STATUS.md`.
