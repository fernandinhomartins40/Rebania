# ADR-011 — Console da plataforma (operação SaaS)
**Estado:** Implementado · 11/10/2026 · decisões D-12 e D-13

Área própria da equipe Rebania (T07), fora do app da fazenda. Cobre clientes, implantação, planos e contratos, cobrança, créditos de IA, usuários dos clientes, suporte, comunicados, operação, auditoria, equipe e configurações.

## Acesso
- Conta da plataforma ≠ conta de cliente (D-12): `assertPlatformAccountSeparation`.
- Papéis da equipe (`platform_admins.role`): administrador, financeiro, suporte, implantação. Matriz em `packages/domain/src/platform.ts` (`PLATFORM_ROLE_PERMISSIONS`); o servidor valida cada rota com `requireStaff(ctx, req, permissão)`. Quem não é da equipe recebe 404 (o console não é revelado). A equipe nunca fica sem administrador.
- Verificação em duas etapas obrigatória (TOTP, RFC 6238, `apps/api/src/lib/totp.ts`) quando o cofre está configurado. Confirmada por sessão (`auth_sessions.mfa_verified_at`). Um administrador zera a de outra pessoa (celular perdido).
- Cofre: `PLATFORM_SECRETS_KEY` (AES-256-GCM, `packages/saas/src/secrets.ts`) guarda a chave do VeloMail e os segredos TOTP. O deploy gera a chave no servidor na primeira vez.

## Clientes e implantação
- Estágio (`organizations.stage`): negociação → implantação → ativo → suspenso → encerrado, com transições validadas (`assertStageTransition`).
- Ficha 360: cadastro, capacidade contratada × uso, contratos e aditivos, faturas, créditos, usuários, chamados, concessões, contatos, notas internas (append-only por trigger) e histórico (auditoria).
- Checklist de implantação por modelo (`onboarding_templates` → `onboarding_steps`) com responsável e prazo, mais sinais medidos no próprio app (dono aceitou, animais, importação, registros).

## Planos, contratos e cobrança (D-13)
- Catálogo versionado (`plans`, código + versão); contratos apontam para a versão de origem. Catálogo nasce vazio (P-01).
- Capacidade contratada (fazendas, animais ativos, usuários, mídia) é informativa: nada é bloqueado nem cobrado por cabeça.
- Aditivos (`contract_amendments`) não sobrescrevem o contrato: termos vigentes = `effectiveTerms` (domínio).
- Ciclo de cobrança (`packages/saas/src/billing.ts`, job `billing.daily` a cada 6 h, idempotente): fatura de implantação ao ativar; mensalidade emitida 10 dias antes do vencimento (`invoices` único por contrato+tipo+competência); régua (`invoice_reminders`, uma vez por etapa); modo de acesso recalculado.
- Somente leitura (`organizations.access_mode`): suspensão, encerramento ou fatura vencida há mais de 15 dias. Aplicado no servidor em `requireFarm`/`requireOrg` para todo método que escreve (inclui `/v1/sync/push`); ficam abertos suporte, concessões de suporte e perguntas ao assistente. A baixa da fatura devolve o acesso na hora. O sync offline mantém os registros no aparelho e reenvia depois.
- Sem provedor de pagamento (P-02): instruções de pagamento configuráveis e link por fatura; baixa manual auditada. O adapter de webhook continua pronto.

## E-mail (VeloMail)
- Porta única: `queueEmail` grava `email_messages` e enfileira `mail.send`; o worker entrega por `POST {base}/emails/send` (`x-api-key`), até 8 tentativas. Desligado = registrado como "não enviado" e o console mostra links para entrega manual.
- Webhook `POST /v1/mail/webhooks/velomail` (HMAC `X-Webhook-Signature`) marca entregue/falho.
- Modelos em `packages/saas/src/mail/templates.ts`: convite, boas-vindas da equipe, redefinição de senha, fatura, lembretes, somente leitura, acesso restabelecido, resposta de chamado, chamado novo (equipe), pedido de acesso de suporte, teste.

## Suporte
- Chamados (`support_tickets`/`support_messages`, mensagens append-only) abertos no app ou registrados pela equipe (WhatsApp, e-mail, telefone). Prazos por prioridade (`SLA_HOURS`); notas internas nunca chegam ao cliente; a equipe aparece ao cliente como "Equipe Rebania".
- Pedido de acesso (`support_access_requests`): a equipe pede, o proprietário aprova (vira `support_grants`) ou recusa no app. Cada leitura continua auditada.

## Pendências
- Provedor de pagamento (P-02) e nota fiscal: fora do sistema por enquanto.
- O indicador de sincronização mostra "sem conexão" quando o envio é recusado por somente leitura (os dados ficam no aparelho); a faixa do topo explica o motivo.
- App nativo: mostra a recusa do servidor; chamados e plano ficam no web/PWA.
