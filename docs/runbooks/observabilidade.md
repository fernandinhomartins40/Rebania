# Runbook — Observabilidade

`GET /v1/metrics` (formato Prometheus) com `Authorization: Bearer $METRICS_TOKEN`. Sem token configurado, responde 404.

| Métrica | Uso |
|---|---|
| `rebania_http_requests_total{route,status}` | Erros 5xx/4xx por rota |
| `rebania_http_request_duration_seconds` | Latência (histograma) por rota |
| `rebania_sync_receipts_24h{status}` | Sync aceito × rejeitado × conflito nas últimas 24 h |
| `rebania_jobs{queue,status}`, `rebania_jobs_failed` | Fila do worker (fotos, limpeza) |
| `rebania_ai_requests_24h`, `rebania_ai_credits_24h`, `rebania_ai_tokens_24h` | Uso e custo do assistente por ação |

Alertas sugeridos (ajustar no piloto): 5xx > 1% em 10 min; `jobs_failed` > 0; conflitos de sync crescendo; latência p95 de `/v1/sync/push` > 2 s.

Logs da API são JSON (pino) com segredos ocultados; rotação pelo driver do Docker (`max-size`/`max-file` no compose).

## Acessibilidade e telas
`pnpm --filter @rebania/web a11y` (com a stack local de pé) roda axe (WCAG 2 A/AA) e verifica rolagem lateral em 360/768/1280 px nas telas principais.
