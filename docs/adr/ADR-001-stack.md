# ADR-001 — Stack e monorepo
**Estado:** Adotado · 09/10/2026

**Decisão:** pnpm 10 + Turborepo 2 + TypeScript strict. Web: React 19 + Vite 8 + React Router 7. Nativo: Expo SDK 57 / React Native 0.86 com development builds (Expo Go não basta para NFC/BLE). API: Fastify 5. Banco: PostgreSQL 16 + Prisma 7 (driver adapter `pg`). Validação/contratos: Zod 4. Testes: Vitest 5 (+ PostgreSQL real nos testes de integração). Ícones: Lucide. Versões exatas fixadas (`save-exact`), nada de `latest`.

**Pacotes internos exportam TypeScript fonte** (`exports: ./src/index.ts`): Vite, Vitest, Metro e tsup transpilam; não há etapa de build por pacote. API e worker são empacotados com tsup (internos no bundle, terceiros em `node_modules` via `pnpm deploy --prod`), o que exige declarar em `apps/api`/`apps/worker` as dependências de runtime de `@rebania/db`.

**Consequências:** um único lockfile; Metro empacota os pacotes do monorepo (verificado com `expo export` Android e iOS).
