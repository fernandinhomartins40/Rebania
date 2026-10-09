# ADR-007 — Créditos de IA
**Estado:** Implementado · preços, pacotes e provedor de pagamento pendentes (P-01/P-02)

`credit_accounts` (CHECK saldo >= 0) + `credit_ledger` imutável (trigger) + `credit_reservations` (request_id único). Cotação pela tabela versionada (`rate_cards`) → reserva atômica por débito condicional (saldo nunca negativo sob concorrência) → consumo único (transição reserved→consumed) → liberação em falha elegível → estorno auditado só pela plataforma. Webhooks verificados por adapter (`HmacWebhookAdapter` genérico) e idempotentes por (provider, event_id); pedido pago credita uma vez (pending→paid). Sem expiração nem recarga automática.
