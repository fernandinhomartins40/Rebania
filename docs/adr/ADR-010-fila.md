# ADR-010 — Fila de jobs
**Estado:** Adotado · 09/10/2026

Tabela `jobs` no PostgreSQL, consumida com `FOR UPDATE SKIP LOCKED`, com backoff exponencial, `max_attempts`, `dedupe_key` para agendamentos e liberação de jobs presos. Sem Redis até haver medição que o justifique. Teste: `apps/worker/test/queue.test.ts` (3 workers concorrentes executam cada job uma única vez).
