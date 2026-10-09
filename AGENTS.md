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

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
