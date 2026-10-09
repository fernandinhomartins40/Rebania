# Runbook — Backup e restauração

- `infra/scripts/backup.sh <dir>`: `pg_dump` em formato custom + sha256 + validação com `pg_restore --list`.
- `infra/scripts/restore-check.sh <arquivo.dump>`: confere o checksum, restaura num banco **separado** (`rebania_restore_check`), compara contagens das tabelas principais e apaga o banco temporário. Nunca restaura sobre produção.
- Ambos usam `infra/compose/.env` (ou `ENV_FILE=...`).

**Verificado em 09/10/2026** com a stack em containers: backup → restauração → contagens iguais.

## Política proposta (aprovar RPO/RTO com o cliente)
- Diário às 03:00 (cron) + antes de cada migração.
- Cópia para **fora da VPS** (storage S3-compatível ou outro servidor) com retenção de 7 diários e 4 semanais.
- Teste de restauração mensal com `restore-check.sh`, registrado aqui.
- Mídia (quando existir, G2): volume próprio com o mesmo ciclo de backup.

## Restauração real (desastre)
1. Pare `api` e `worker`.
2. Crie um banco novo, restaure com `pg_restore --no-owner -d <novo>`, confira as contagens.
3. Aponte `DATABASE_URL` para o banco restaurado (ou renomeie os bancos) e suba de novo.
4. Os aparelhos reenviam o outbox pendente: recibos idempotentes evitam duplicação do que já existia no backup.
