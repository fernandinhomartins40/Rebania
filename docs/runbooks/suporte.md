# Runbook — Acesso de suporte e console da plataforma

- A equipe Rebania **não** vê dados das fazendas por padrão.
- O proprietário concede acesso de leitura em **Fazenda → Plano e créditos → Acesso de suporte**, informando o e-mail da pessoa da equipe, duração (1–72 h) e motivo. Pode revogar a qualquer momento.
- No console (**Fazenda → Console da plataforma → cliente**), concessões ativas mostram o link de leitura de suporte. Cada leitura gera `support.read` em `audit_entries`.
- Fora do app, nenhuma consulta direta ao banco de produção para ver dados de cliente sem concessão registrada e motivo documentado.

## Créditos
- Concessão/ajuste: console → cliente → Créditos (motivo obrigatório; vira lançamento imutável + auditoria).
- Estorno de uma pergunta: console → extrato → "Estornar" em um consumo (motivo obrigatório; uma vez por consumo).
- Tabela de créditos e pacotes: console → Tabela de créditos e pacotes. **Só valores aprovados (P-01).**

## Pagamentos
Com `BILLING_PROVIDER=hmac`, eventos chegam em `POST /v1/billing/webhooks/hmac` assinados (`x-rebania-signature: sha256=<hmac do corpo>`). Evento repetido não credita de novo (`payment_events` único por provedor+id). Fatura paga fora do sistema: console → Faturas → "Marcar paga" (fica auditado como baixa manual).
