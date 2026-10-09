# Runbook — Incidente

## 1. Classificar (primeiros 15 min)
| Gravidade | Exemplos | Ação |
|---|---|---|
| Alta | API fora, perda/corrupção de dados, acesso entre clientes, vazamento | Comunicar o cliente piloto, congelar deploys, abrir registro do incidente |
| Média | Sync rejeitando em massa, worker parado (fotos não processam), relatório errado | Corrigir no dia; avisar se afetar manejo |
| Baixa | Erro visual, lentidão pontual | Fila normal |

O manejo de campo continua offline: registros ficam no aparelho e sobem quando a API voltar. Avise os usuários para **não apagar o app nem limpar dados do navegador** durante o incidente.

## 2. Diagnóstico
```bash
docker compose ps
docker compose logs --since 30m api worker | tail -200
curl -fsS http://127.0.0.1:${REBANIA_HTTP_PORT}/v1/health
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" http://127.0.0.1:${REBANIA_HTTP_PORT}/v1/metrics | grep -E "status=\"5xx\"|sync_receipts|jobs_failed"
docker compose exec postgres psql -U rebania -c "select count(*) from pg_stat_activity"
```
- `rebania_sync_receipts_24h{status="rejected"}` alto: ver a Central de Sincronização do usuário e o código do recibo.
- `rebania_jobs{status="failed"}`: `select queue, last_error, count(*) from jobs where status='failed' group by 1,2`.
- Disco: `df -h` e `du -sh` do volume de mídia.

## 3. Mitigar
- Erro após deploy: rollback (ver `deploy.md`).
- Worker travado: `docker compose restart worker` (jobs presos são liberados pelo próprio worker).
- Banco cheio de conexões: reduzir `DB_POOL_MAX` e reiniciar a API.
- Suspeita de acesso indevido: revogar sessões (`update auth_sessions set revoked_at = now() where user_id = ...`), trocar segredos, preservar logs.

## 4. Encerrar
Registrar linha do tempo, causa, impacto (clientes, registros) e ação preventiva. Se houve dados afetados, confirmar com o cliente o que foi recuperado.

## Nunca
`docker compose down -v`, `prune` global, apagar `sync_mutations`/`audit_entries`/`credit_ledger` (são trilha de auditoria; os dois últimos têm trigger que impede).
