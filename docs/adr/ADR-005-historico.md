# ADR-005 — Histórico e correções
**Estado:** Adotado · 09/10/2026

Tabelas tipadas por domínio (`weight_measurements`, futuramente `births`, `health_applications`…) **e** uma projeção de linha do tempo `animal_events` (append-only, com `corrects_event_id` para correções). Não usamos event sourcing integral. Edições de animal geram evento com antes/depois e incrementam `version`. Retag aposenta o identificador antigo (`status=retired`), sem apagar. `audit_entries` é append-only por trigger no banco.
