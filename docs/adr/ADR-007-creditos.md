# ADR-007 — Créditos de IA (planejado para G6)
**Estado:** Adotado como diretriz · implementação pendente

Ledger imutável (`credit_ledger`); cotação → reserva atômica (saldo nunca negativo sob concorrência) → consumo único → liberação em falha elegível → estorno auditado; `request_id` idempotente; webhooks de pagamento verificados e idempotentes. Sem expiração ou recarga automática até aprovação (P-01).
