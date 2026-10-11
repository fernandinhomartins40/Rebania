# Runbook — Acesso de suporte e console da plataforma

- A equipe Rebania **não** vê dados das fazendas por padrão.
- O proprietário concede acesso de leitura em **Fazenda → Plano e créditos → Acesso de suporte**, informando o e-mail da pessoa da equipe, duração (1–72 h) e motivo. Pode revogar a qualquer momento.
- A equipe usa conta própria, sem fazendas (D-12), e entra direto no console (`/console`) com verificação em duas etapas.
- Para ver dados de uma fazenda: ficha do cliente → Suporte → **Pedir acesso ao proprietário** (motivo e duração). O proprietário aprova ou recusa em Fazenda → Plano e créditos. Com a concessão ativa, a mesma aba mostra o link de leitura. Cada leitura gera `support.read` em `audit_entries`.

## Chamados
- Clientes abrem em **Fazenda → Suporte**. Atendimentos por WhatsApp, e-mail ou telefone são registrados na ficha do cliente → Suporte → *Registrar atendimento*.
- Fila em **Console → Suporte**: filtros por situação, responsável e prioridade; prazos de 1ª resposta e solução por prioridade (urgente 2 h/24 h, alta 4 h/48 h, normal 24 h/120 h, baixa 48 h/240 h).
- *Nota interna* nunca aparece ao cliente. *Registrar fala do cliente* guarda o que chegou por outro canal.

## Usuários dos clientes
- Ficha → Usuários: link de senha (por e-mail; com e-mail desligado o link aparece para entrega manual), encerrar sessões, desativar/reativar. Motivo obrigatório; tudo fica na auditoria do cliente.
- Fora do app, nenhuma consulta direta ao banco de produção para ver dados de cliente sem concessão registrada e motivo documentado.

## Créditos
- Concessão/ajuste: console → cliente → Créditos (motivo obrigatório; vira lançamento imutável + auditoria).
- Estorno de uma pergunta: console → extrato → "Estornar" em um consumo (motivo obrigatório; uma vez por consumo).
- Tabela de créditos e pacotes: console → Tabela de créditos e pacotes. **Só valores aprovados (P-01).**

## Pagamentos
Com `BILLING_PROVIDER=hmac`, eventos chegam em `POST /v1/billing/webhooks/hmac` assinados (`x-rebania-signature: sha256=<hmac do corpo>`). Evento repetido não credita de novo (`payment_events` único por provedor+id). Fatura paga fora do sistema: Console → Cobrança (ou ficha → Faturas) → **Dar baixa** com a forma de pagamento (auditado). A baixa recalcula o acesso na hora: cliente em somente leitura volta ao normal.

## Cobrança (D-13)
- O worker roda o ciclo a cada 6 h: fatura de implantação ao ativar o contrato, mensalidade 10 dias antes do vencimento, lembretes (3 dias antes, no dia, após o vencimento e após 7 dias) e somente leitura com mais de 15 dias de atraso.
- *Rodar cobrança agora* (Cobrança ou ficha → Faturas) executa o ciclo na hora; é idempotente.
- Instruções de pagamento (Pix, transferência) em Console → Configurações; cada fatura aceita um link próprio.
