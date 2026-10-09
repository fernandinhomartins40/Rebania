# Rebania — Plano de Implementação

> **Sua fazenda em dia.**
> Versão 1.0 • 08/10/2026 • Derivado de `docs/referencia/Rebania_Modelo_de_Negocios_e_Implementacao.md` (doravante **MN**) e `docs/referencia/Rebania_Pranchas_e_Experiencia.pdf` (doravante **PR**).
> **Atualização 09/10/2026:** G1 concluído e G2 em andamento. O que já existe está em `docs/STATUS.md`. A logo bovina, a direção visual das pranchas e o pacote de marca foram aprovados (`docs/DECISIONS.md` D-07 a D-11); a seção 1.6 abaixo ficou como registro histórico.

---

## 1. O que entendi dos documentos

### 1.1 O produto em uma frase
Rebania é um **SaaS de gestão operacional para pecuária de corte (cria, recria e engorda)** que transforma identificação do animal e registros de campo em **histórico confiável, tarefas claras e decisões acompanháveis** — funcionando **offline**, no **web/PWA e em apps nativos Android/iOS**, com **IA opcional** que prepara rascunhos e nunca grava sozinha.

### 1.2 A ideia central de experiência
Toda tarefa frequente segue **Identificar → Informar → Confirmar**. Não é "três cliques"; é três etapas com significado. A complexidade existe (44 famílias de telas, ~38 áreas funcionais), mas aparece só quando necessária.

- Navegação mobile fixa: **Hoje • Rebanho • Registrar (central) • Agenda • Fazenda**.
- Reprodução, Sanidade e Produção **não são cadastros paralelos**: são visões do mesmo rebanho.
- **Modo Curral**: sessão contínua de manejo (leitor identifica → balança envia peso → operador confirma o que foi realmente feito → próximo).
- **Passaporte do animal**: histórico, fotos, parentesco, pesos, reprodução, sanidade, movimentos, próximos eventos.
- **Assistente**: barra contextual; nunca obrigatório para tarefa básica.

### 1.3 O negócio
- **Receita**: implantação (única) + mensalidade (plano completo com limites contratuais, **não** cobrança por cabeça) + **pacotes pré-pagos de créditos de IA** (opcionais, por organização).
- Sem créditos, **tudo que não é IA continua funcionando** (cadastro, leitura, manejo, relatórios, fotos).
- Cliente inicial = **piloto**. Expansão para organizações multi-fazenda.
- Preços, provedor de pagamento e provedor de IA **não estão definidos**.

### 1.4 As regras que mais pesam na engenharia
1. **Multi-tenant estrito** (organização → fazendas), testado contra acesso cruzado, inclusive nas ferramentas de IA.
2. **Offline-first real**: SQLite (nativo) / IndexedDB (web), outbox com `mutationId`, cursor, versão esperada, idempotência e **política de conflito por tipo** (nada de last-write-wins universal).
3. **Histórico append-only + correções versionadas** (sem event sourcing integral; tabelas tipadas).
4. **ID interno imutável**; brinco, RFID, NFC são **aliases** com histórico. UID não é autenticação.
5. **Operações em grupo com snapshot** e marcação individual: "35 selecionados, 32 vacinados → 32 históricos e 32 consumos".
6. **Transações** em nascimento (parto + crias + vínculos + tarefas), estoque e financeiro. Decimais, unidades explícitas, sem float em saldo.
7. **IA desacoplada por adapter**, ferramentas tipadas e tenant-scoped, sem SQL livre, mutação só após confirmação revalidada; créditos em **ledger** com quote → reserve → consume/release idempotentes.
8. **Hardware honesto**: RFID LF 134,2 kHz exige leitor externo; NFC do celular não lê isso; iOS não tem SPP universal; homologação só com teste físico; fallback manual sempre.
9. **Deploy em VPS compartilhada** sem disputar 80/443, sem `prune` global, sem `compose down -v`, backup externo com restore testado.
10. **Nada de dados ilustrativos em produção** (datas, números e produtos das pranchas são fictícios).

### 1.5 O que as pranchas (PDF) acrescentam
- Duas pranchas de alta fidelidade: **Campo** (6 telas mobile: Hoje, Rebanho, Passaporte, Registrar nascimento, Modo Curral, Assistente) e **Gestão** (dashboard web "Hoje na fazenda", drawer "Revisar ação", Confinamento, Plano e créditos).
- **44 telas/famílias (T01–T44)** especificadas em texto — mapeadas para os goals na seção 7.
- Critérios explícitos de estados: vazio, carregando, erro, parcial, offline, sincronizando, conflito, duplicidade, sessão expirada, sem permissão, sucesso. "Salvo no aparelho" ≠ "Registrado e sincronizado".
- A prancha mostra estados de conectividade contraditórios ("Sincronizado" e "Offline" ao mesmo tempo) — **a implementação deve ter um estado único por sessão**.

### 1.6 Sobre a logo enviada nesta conversa
A imagem anexada (cabeça bovina em verde profundo com **brinco ocre**, wordmark "rebania" em minúsculas e tagline "Sua fazenda em dia.") é **diferente** do símbolo em laço das pranchas. Interpreto como **nova candidata de logo**. Foi salva como referência em `docs/brand/logo-candidata-cabeca-bovina.png`.
Pelo MN §14/§19, logo e direção visual estão **"aguardando revisão"**: preciso do registro formal ("aprovado" / "aprovado com ajustes") antes de gerar assets finais (SVG, versões clara/escura/mono, ícones de app). Até lá, uso apenas os **design tokens candidatos** (cores abaixo), que são compatíveis com as duas versões.

| Token | Valor candidato | Observação |
|---|---|---|
| `color.brand.primary` | `#163E32` (pranchas) / ~`#0B3A2C` (logo nova) | definir um valor único após aprovação |
| `color.bg.canvas` | `#F7F4ED` | |
| `color.brand.sage` | `#DDE6D8` | |
| `color.brand.ochre` | `#C48A38` (pranchas) / ~`#E0952B` (brinco da logo) | não usar como texto pequeno sobre branco sem teste de contraste |
| `color.text.primary` | `#182A24` | |
| Tipografia | Source Sans 3 (candidata) | confirmar licença |
| Corpo mobile / alvo de toque | 16px / 48px | WCAG 2.2 AA por par real |

---

## 2. Decisões — aprovado, proposto, pendente

| Tema | Estado | Fonte |
|---|---|---|
| Nome Rebania, SaaS, ciclo completo de corte | **Aprovado** | MN §19 |
| Implantação + mensalidade + créditos de IA | **Aprovado** | MN §4 |
| Identificação completa (RFID/NFC/QR/OCR/digitação) | **Aprovado** | MN §8 |
| Web responsiva + PWA + nativo Android/iOS (não WebView) | **Aprovado** | MN §1 |
| Monorepo pnpm/Turborepo/TS; Docker + Nginx em VPS compartilhada | **Aprovado** | MN §12 |
| Stack: React/Vite, React Native/Expo dev builds, Fastify, Prisma/PostgreSQL, fila em PostgreSQL | **Proposto** (confirmar compatibilidade e fixar versões) | MN §12 |
| Logo (laço × cabeça bovina) e direção visual das pranchas | **Pendente de aprovação** | MN §14, PR p.16 |
| Preços, pacotes, expiração/recarga de créditos | **Pendente** (não implementar expiração/recarga automática) | MN §4 |
| Provedor de IA e de pagamento | **Pendente** | MN §9 |
| Leitor RFID, bastão, balança homologados | **Pendente** (adapters prontos, homologação só com teste físico) | MN §8 |
| Dimensionamento e inventário da VPS | **Pendente** | MN §12 |
| Disponibilidade de marca (INPI) e domínio | **Não verificada** | MN §0 |

---

## 3. Como vamos implementar — arquitetura alvo

### 3.1 Estrutura do monorepo

```
apps/
  web/            # React + Vite: landing, app web responsivo, PWA, console SaaS (rota separada)
  mobile/         # React Native + Expo (development builds), Android e iOS
  api/            # Fastify, REST /v1 + OpenAPI, auth, módulos de domínio, sync, IA, billing
  worker/         # jobs: mídia, notificações, relatórios, agentes de agenda/qualidade
packages/
  domain/         # regras puras: GMD, carência, previsão de parto, máquina de estados reprodutiva
  contracts/      # schemas Zod -> DTOs, OpenAPI, client gerado
  db/             # Prisma schema, migrations, repositórios tenant-aware
  sync-core/      # envelope de mutação, outbox, cursor, políticas de merge por tipo
  ai-gateway/     # adapters (texto/áudio/visão), tools tipadas, quotes, budgets, circuit breaker
  hardware/       # interfaces IdentifierReader/ScaleReader + adapters por plataforma
  design-tokens/  # cores, espaçamentos, tipografia, semântica de estados
  ui-web/         # componentes DOM acessíveis
  ui-native/      # componentes RN
  config/         # eslint, tsconfig, vitest, prettier
infra/
  docker/  nginx/  compose/
docs/
  goals/  adr/  runbooks/  acceptance/  referencia/  brand/
```

Compartilha-se **domínio, contratos, sync, IA, hardware e tokens**. UI web e nativa são separadas.

### 3.2 Decisões técnicas a registrar como ADR (G0)

| ADR | Decisão proposta |
|---|---|
| ADR-001 Stack | pnpm + Turborepo + TypeScript strict; versões fixas no lockfile, nada de `latest` |
| ADR-002 Tenancy | `organization_id` em toda tabela de negócio; chaves compostas `(organization_id, id)` onde houver FK cruzada; repositórios exigem `TenantContext`; teste automatizado de acesso cruzado por endpoint. Avaliar Row-Level Security do PostgreSQL como segunda barreira |
| ADR-003 Sync | Outbox no cliente; `POST /v1/sync/push` (lote limitado) e `GET /v1/sync/pull?cursor=`; recibos idempotentes por `mutationId`; políticas por tipo (append livre para pesagem/foto; revisão obrigatória para venda, retag, lote, situação) |
| ADR-004 Auth | Web: cookie httpOnly/Secure/SameSite + CSRF. Mobile: access token curto + refresh rotativo em Keychain/Keystore. MFA para papéis críticos. Convites com expiração |
| ADR-005 Histórico | Tabelas tipadas por evento + `animal_event` (projeção de timeline) + `event_correction` versionada; `audit_entry` append-only |
| ADR-006 IA | Gateway com adapter por provedor; tools tipadas; rascunho com hash/versão; confirmação revalida tenant, permissão, versão, regras e saldo |
| ADR-007 Créditos | Ledger imutável (`credit_ledger`), reserva atômica com `SELECT … FOR UPDATE`/constraint de saldo ≥ 0, idempotência por `request_id` |
| ADR-008 Mídia | Upload retomável (tus ou chunked próprio), derivados WebP/JPEG + thumbnail no worker, checksum, URLs assinadas expirantes, volume persistente → S3-compatível quando justificar |
| ADR-009 Deploy | Nginx do Rebania atrás do proxy existente (ou porta loopback dedicada); API/DB/worker sem portas públicas; build fora da VPS |
| ADR-010 Filas | Fila em PostgreSQL (ex.: pg-boss ou tabela própria com `SKIP LOCKED`); sem Redis até medição justificar |

### 3.3 Modelo de dados núcleo (P1)

Agrupado por contexto (nomes em `snake_case` no banco, `camelCase` nos contratos):

- **Plataforma/tenancy**: `organization`, `farm`, `user`, `membership`, `role`, `permission_grant`, `invitation`, `support_access_grant`, `audit_entry`.
- **Rebanho**: `animal` (id imutável, sexo, raça, nascimento, origem, categoria, situação, `version`), `animal_identifier` (tipo, valor, escopo, validade, status, origem), `parentage`, `group` (lote), `pasture`, `pen`, `group_membership_history`, `location_history`.
- **Eventos**: `animal_event` (timeline), `event_correction`, `handling_session`, `handling_session_item` (snapshot + status por animal: realizado/pendente/exceção).
- **Reprodução**: `breeding_season`, `reproductive_protocol_version`, `protocol_execution`, `breeding_event` (IA/monta/repasse), `pregnancy_check`, `birth`, `calf_link`.
- **Sanidade**: `product`, `product_batch`, `health_application`, `treatment`, `withdrawal_period`, `exam`.
- **Produção**: `weight_measurement`, `feeding_event`, `diet`.
- **Estoque/financeiro/comercial**: `stock_location`, `stock_movement`, `semen_batch`, `commercial_transaction`, `commercial_transaction_item`, `financial_entry`, `counterparty`.
- **Agenda/mídia**: `task`, `notification`, `attachment`.
- **Sync**: `sync_mutation` (recibo idempotente), `device`.
- **IA/SaaS**: `ai_draft`, `ai_usage`, `credit_ledger`, `rate_card_version`, `contract`, `subscription`, `invoice`, `payment_event`.

Regras de domínio em `packages/domain` com testes unitários (Vitest), incluindo: compatibilidade sexo/categoria × evento; data ≥ nascimento; parto com N crias; pai desconhecido/múltiplos touros; previsão de parto como estimativa com origem; diagnóstico com qualidade da exposição; morte/venda encerram sem apagar; GMD só com intervalo positivo e mesma unidade; kg vivo ≠ arroba (rendimento explícito); taxa de prenhez com denominador por coorte e "sem diagnóstico ≠ vazia"; datas civis no timezone da fazenda, timestamps técnicos em UTC.

### 3.4 Envelope de sincronização

```ts
type SyncMutation = {
  mutationId: string;      // UUID gerado no aparelho
  farmId: string;          // tenant validado no servidor (nunca confiado)
  deviceId: string;
  actorId: string;         // conferido contra a sessão
  entity: string;          // ex.: "birth", "weight_measurement"
  entityId: string;
  expectedVersion?: number;
  occurredAt: string;      // data do fato (não decide prioridade)
  createdAt: string;
  schemaVersion: number;
  payload: unknown;        // validado pelo contrato da entidade
  attachmentRefs?: string[];
};
type SyncReceipt =
  | { mutationId; status: "accepted"; version; cursor }
  | { mutationId; status: "rejected"; reason; fixHint }
  | { mutationId; status: "conflict"; serverVersion; diff; policy };
```

Reenvio do mesmo `mutationId` → **mesmo recibo, sem reexecutar**.

---

## 4. Princípios de execução

1. **Fatias verticais**: cada goal entrega DB + API + permissões + UI web + UI nativa (quando aplicável) + testes + runbook. Nada de "só frontend".
2. **Não iniciar todos os goals ao mesmo tempo**. Ordem com dependências (seção 5).
3. **`docs/STATUS.md`** sempre atualizado: implementado / testado / pendente, com evidência.
4. **`docs/goals/Gx.md`** criado ao iniciar cada goal, com arquivos/símbolos reais, endpoints, migrations, testes, risco e rollback.
5. **Feature flags** para P2/P3; nada rotulado como disponível antes de existir.
6. **Sem publicação** (VPS de produção, lojas) sem autorização específica.
7. **Visual**: enquanto logo/direção estiverem pendentes, UI usa tokens candidatos e componentes neutros; o conceito das pranchas não é implementado "silenciosamente".

---

## 5. Roadmap por goals (G0–G8)

Legenda de tamanho relativo (estimativa, não compromisso): **P** pequeno • **M** médio • **G** grande • **GG** muito grande.

```
G0 ──► G1 ──► G2 ──► G3 ──┐
                 └──► G4 ──┼──► G5 ──► G6 ──► G7 (lançamento piloto) ──► G8
                           │
          (G6 pode iniciar a parte de console/billing após G1)
```

### G0 — Descoberta e decisões (P)
**Objetivo**: transformar pendências em decisões registradas e criar a linha de base.
- [ ] `docs/DECISIONS.md` (aprovado/proposto/pendente) — semente: seção 2 deste plano.
- [ ] `docs/GOALS.md` com G0–G8, dependências e critérios.
- [ ] Matriz funcional rastreável (inventário MN §5 → goal → tela T-xx → teste).
- [ ] ADR-001 a ADR-010.
- [ ] Roteiro de entrevista do piloto: tamanho/composição do rebanho, planilhas atuais, equipamentos, conectividade, tempo de manejo, vocabulário, frequência de vendas.
- [ ] Coletar planilha real (amostra autorizada) e modelos de brinco/leitor/balança.
- [ ] Inventário da VPS (portas, proxy, certificados, RAM/CPU/disco, containers, backups) — **somente leitura**.
- [ ] Medir linha de base do piloto (tempo por registro hoje).
- [ ] Revisão visual: logo (laço × cabeça bovina), telas, perguntas do PR p.16.

**Aceite**: escopo, identidade e linha de base registrados; ADRs aceitos.

### G1 — Fundação (M)
**Objetivo**: esqueleto funcional, seguro e isolado nos três canais.
- [ ] Monorepo pnpm + Turborepo; `packages/config` (TS strict, ESLint, Prettier, Vitest).
- [ ] `infra/compose/dev` com PostgreSQL; `.env.example`; secrets fora do git.
- [ ] `packages/db`: Prisma com organização, fazenda, usuário, membership, papéis, convites, auditoria, dispositivo.
- [ ] `packages/contracts`: Zod → OpenAPI `/v1`; client gerado.
- [ ] `apps/api`: Fastify, `/v1/auth/*` (login, recuperação, convite, sessão, refresh, logout, revogação), `/v1/farms`, middleware `TenantContext`, rate limit, logs estruturados sem segredos, health check.
- [ ] `apps/web`: shell com Hoje/Rebanho/Registrar/Agenda/Fazenda (sidebar no desktop, barra inferior no mobile), login, aceite de convite, seleção de fazenda; PWA manifest + service worker básico.
- [ ] `apps/mobile`: Expo dev build com navegação de 5 abas, login com storage seguro.
- [ ] `apps/worker`: runner de fila em PostgreSQL.
- [ ] `packages/design-tokens` com valores candidatos.
- [ ] CI: lint, typecheck, testes unitários, testes de integração com PostgreSQL, build das imagens.
- [ ] Dockerfiles multi-stage (usuário não-root, health check, shutdown gracioso).

**Telas**: T02 Acesso, T04 Organização (base), T44 Configurações (base).
**Aceite**: login nos 3 canais; **teste 1 (isolamento A × B) passando**; migrations reversíveis documentadas.

### G2 — Rebanho offline (G)
**Objetivo**: o rebanho existe, é identificável, tem passaporte e funciona sem sinal.
- [ ] Animal, identificadores (aliases, unicidade por política, retag auditado), parentesco, lotes, pastos, histórico de lote/localização.
- [ ] `/v1/animals`, `/v1/animals/:id/history`, `/v1/identifiers/resolve`, `/v1/media/uploads`, `/v1/sync/push|pull`.
- [ ] `packages/sync-core`: outbox, cursor, tombstones, backoff, políticas por tipo; SQLite no nativo, IndexedDB na web; seleção de dados offline por fazenda/lote; limpeza segura no logout com pendências.
- [ ] Mídia: upload retomável, derivados no worker, checksum, URL assinada, remoção de EXIF/GPS sensível.
- [ ] `packages/hardware`: interfaces + adapter de **digitação** e **câmera/QR**; OCR de brinco com candidatos (pode ficar atrás de flag até G6 se usar API).
- [ ] Importação: preparar arquivo → revisar inconsistências/duplicidades → confirmar; rejeitados corrigíveis sem repetir aceitos.
- [ ] Indicador único de conectividade/sync por sessão; mensagens "Salvo no aparelho…" × "Registrado e sincronizado".
- [ ] Rascunhos persistentes; refresh não fecha drawer nem limpa formulário.

**Telas**: T08 Lista, T09 Identificar, T10 Cadastro, T11 Passaporte, T12 Galeria, T13 Retag, T14 Lotes, T15 Importação, T31 Pastos (cadastro básico).
**Aceite**: criar/editar/reiniciar/sincronizar sem perda ou duplicação; **teste 4 (modo avião, 100 eventos)** e **teste 5 (conflito entre dois aparelhos)** passando.

### G3 — Reprodução e cria (G)
- [ ] Estação de monta, templates de protocolo IATF **versionados e configurados pelo cliente/veterinário** (sem protocolo clínico inventado), execução individual/coletiva.
- [ ] Inseminação, monta natural, repasse; diagnóstico prenha/vazia/inconclusivo com evidência e qualidade da exposição; previsão de parto com origem e incerteza.
- [ ] Nascimento transacional: parto + N crias + vínculos + tarefas configuradas; gêmeos, natimorto, ID provisório, mãe não cadastrada (cadastro mínimo ou vínculo desconhecido conforme política).
- [ ] Bezerros: vínculo materno, cuidados, mortalidade, desmama.
- [ ] Endpoints: `/v1/events/breeding`, `/v1/events/pregnancy`, `/v1/events/birth`, `/v1/tasks`.
- [ ] Geração de tarefas determinísticas (agente de agenda como job).

**Telas**: T16 Estação, T17 IATF, T18 Inseminação, T19 Diagnóstico, T20 Partos previstos, T21 Nascimento, T22 Bezerros, T41 Agenda (base).
**Aceite**: **teste 2 (duas crias, retry, correção preserva histórico)**; critérios do PR p.12 (gêmeos, natimorto, brinco repetido, sessão expirada, reinício, conflito, sem permissão).

### G4 — Sanidade, estoque e Modo Curral (G)
- [ ] Produtos, lotes/validade, locais de estoque, movimentos (entrada/consumo/perda/ajuste), mínimos; estoque de sêmen (partida/touro).
- [ ] Calendário sanitário por categoria/plano configurado; aplicação (produto, dose/unidade, lote, via, aplicador, motivo); tratamento; exames.
- [ ] Carência configurada por produto/protocolo validado → pendência em venda.
- [ ] **Sessão de manejo / Modo Curral**: configurar uma vez, snapshot de IDs, leitura contínua, supressão de leitura repetida por sessão, marcação individual de realizados, exceções, reinício retoma sessão, leitor desconectado → digitação, identificador desconhecido → associação revisada, encerramento com resumo (realizados/pendentes/exceções/sync/anexos).
- [ ] Adapters de hardware: RFID por leitor externo (BLE/HID/USB conforme modelo), balança, NFC compatível (nativo). **Homologação só com aparelho físico** → lista de homologação (fabricante, modelo, firmware, plataforma, pareamento, reconexão, alcance, bateria, fallback).
- [ ] `/v1/handling-sessions`, `/v1/events/health`, `/v1/events/weight`, `/v1/stock`.

**Telas**: T23 Calendário, T24 Aplicação, T25 Tratamento, T26 Exames, T27 Sessão de Curral, T28 Carência + encerramento, T37 Estoque.
**Aceite**: **teste 3 (35 selecionados → 32 realizados → 32 históricos/consumos)**; **teste 6 (leitor repetido/desconectado/ID desconhecido)**; ao menos 1 combinação de hardware homologada em aparelho físico (ou pendência explicitamente registrada).

### G5 — Recria, engorda e resultado básico (G)
- [ ] Pesagem (leitura estável ou digitação, origem, correção justificada), GMD, peso à desmama, alertas de inconsistência.
- [ ] Movimentação (lote/pasto/fazenda) com data efetiva; pastos com lotação e "última atualização declarada" (sem GPS do animal).
- [ ] Nutrição/trato básico por lote: dieta, quantidade, consumo de estoque, custo.
- [ ] Compra/venda: animais, peso, preço, documento, contraparte, **verificação de carência**, baixa e receita; encerramento parcial de lote.
- [ ] Financeiro P1: receitas/despesas, pagar/receber, caixa, rateio por animal/lote.
- [ ] Relatórios e indicadores P1 com fórmula, período, coorte e **cobertura de dados** visíveis; exportação CSV/PDF.
- [ ] `/v1/events/movement`, `/v1/reports`.

**Telas**: T29 Pesagem, T30 Desempenho, T32 Movimentação, T33 Nutrição, T35 Compra/venda, T38 Financeiro, T39 Relatórios, T42 Ocorrências.
**Aceite**: ciclo completo operável com indicadores auditáveis; **teste 7 (GMD com data igual/invertida, peso incoerente, divisão por zero)**; kg vivo × arroba distintos.

### G6 — Comercial SaaS e IA (G)
*A parte de console/contratos pode começar após G1; a IA depende de G2–G5 para ter ferramentas úteis.*
- [ ] **Console da plataforma** (área separada): organizações, implantação, contratos, assinaturas, faturas, uso, suporte com **acesso excepcional concedido, com prazo e auditado**.
- [ ] Billing: adapter de pagamento (provedor pendente), webhooks verificados e idempotentes, estados pendente/aprovado/falho.
- [ ] Créditos: `rate_card_version`, quote → reserve (atômica) → consume (uma vez) → release (falha elegível) → estorno auditado; saldo nunca negativo sob concorrência.
- [ ] `packages/ai-gateway`: adapter de provedor (pendente), timeout, budget, cache tenant-aware, retry com backoff, circuit breaker, fallback manual.
- [ ] Tools: `searchAnimals`, `getAnimalHistory`, `listDueTasks`, `getHerdMetrics`, `prepareBirth`, `prepareMating`, `prepareHealthEvent`, `prepareMovement`, `prepareTask`, `quoteAiAction`, `confirmDraft`. Tenant/IDs derivados da sessão.
- [ ] Assistente: barra contextual, respostas com período/origem/IDs, rascunho editável com alvos/campos/impacto/custo; drawer "Revisar ação"; voz → campos tipados; anexos tratados como dados não confiáveis.
- [ ] Rótulos completos: "Inseminação artificial" × "Assistente inteligente".
- [ ] Landing pública (sem preços não aprovados; CTA "Agendar demonstração").
- [ ] `/v1/ai/quotes`, `/v1/ai/drafts`, `/v1/ai/drafts/:id/confirm`, `/v1/credits`, `/v1/billing/webhooks`.

**Telas**: T01 Landing, T03 Implantação, T05 Plano, T06 Créditos, T07 Console, T40 Assistente.
**Aceite**: **teste 8 (IA tentando tenant alheio, prompt injection em anexo, mutação sem confirmação)**, **teste 9 (consumo concorrente, retry, webhook duplicado)**, **teste 10 (créditos zerados/API fora → manejo e relatórios manuais normais)**.

### G7 — Lançamento do piloto (M)
- [ ] QA completo das jornadas reais com o cliente piloto (um ciclo de manejo autorizado).
- [ ] Acessibilidade: 360/390/430, 768/1024, 1280/1440, zoom 200%, teclado, leitor de tela, redução de movimento, legibilidade ao sol, luvas.
- [ ] Builds de loja Android/iOS (pipeline macOS/EAS; **não** na VPS). **Envio às lojas só com autorização.**
- [ ] VPS: integração com o proxy existente (sem 80/443 próprios), limites de CPU/RAM **medidos**, logs com rotação, backup externo DB + mídia, **restore testado em ambiente separado**, rollback de imagem/migration ensaiado, smoke tests.
- [ ] Observabilidade: métricas de sync, conflitos, erros, latência, custo de IA por ação.
- [ ] Runbooks: deploy, rollback, restore, incidente, acesso de suporte.

**Aceite**: **teste 11 (restore DB + mídia)**, **teste 12 (aparelhos físicos, telas, acessibilidade, conexão lenta)**; metas do piloto medidas: 90% das tarefas comuns sem ajuda após treino, zero perda conhecida, zero duplicação em retry, −30% no tempo de registro vs. linha de base.

### G8 — Profundidade (contínuo)
Cada módulo com aceite próprio, atrás de feature flag:
- Confinamento completo (T34): baias, leitura de cocho, tratos, fechamento.
- Pastagem avançada: rotação, descanso, mapas/geodados.
- DRE gerencial, custo por animal/lote, margem (Resultado).
- Abate/retorno de frigorífico (T36).
- Reprodução avançada: ressincronização, TE/FIV, doadora/receptora, embriões, botijão.
- Genética/DEPs/associações (somente com integração real).
- Rastreabilidade/SISBOV (somente com layout validado; sem alegar certificação).
- Patrimônio, máquinas, chuva (T43); automação de trato; integrações fiscais/bancárias; API pública.

---

## 6. Testes obrigatórios de valor × goal

| # | Teste (MN §15) | Goal onde passa a ser obrigatório |
|---|---|---|
| 1 | Isolamento cliente A × B (dados, fotos, relatórios, tools) | G1 (e regressão em todos) |
| 2 | Nascimento com duas crias; retry não duplica; correção preserva histórico | G3 |
| 3 | 35 selecionados, 32 vacinados → estoque/agenda com 32 | G4 |
| 4 | Modo avião, 100 eventos, fechar/reabrir, reconectar | G2 |
| 5 | Dois aparelhos alteram lote/venda → conflito com política | G2 (lote) / G5 (venda) |
| 6 | Leitor repetido/desconectado e ID desconhecido | G4 |
| 7 | GMD com data igual/invertida, peso incoerente | G5 |
| 8 | IA: tenant alheio, injeção em anexo, mutação sem confirmação | G6 |
| 9 | Créditos concorrentes, retry, webhook duplicado | G6 |
| 10 | Sem créditos / API fora: operação manual normal | G6 |
| 11 | Restore DB + mídia em ambiente separado | G7 |
| 12 | Aparelhos físicos, breakpoints, teclado, leitor de tela, zoom, rede lenta | G7 |

Ferramentas: Vitest (domínio), integração com PostgreSQL real (API/sync/ledger), Playwright (web), Maestro ou Detox (mobile, após verificar compatibilidade).

---

## 7. Rastreabilidade das 44 telas (PR) → goal

| Família | Telas | Goal |
|---|---|---|
| 01 Entrada e SaaS | T01 Landing, T02 Acesso, T03 Implantação, T04 Organização, T05 Plano, T06 Créditos, T07 Console | T02/T04 → G1; T01/T03/T05/T06/T07 → G6 |
| 02 Rebanho e memória visual | T08 Lista, T09 Identificar, T10 Cadastro, T11 Passaporte, T12 Galeria, T13 Retag, T14 Lotes, T15 Importação | G2 |
| 03 Reprodução e nascimento | T16 Estação, T17 IATF, T18 Inseminação, T19 Diagnóstico, T20 Partos, T21 Nascimento, T22 Bezerros | G3 (avançados → G8) |
| 04 Sanidade e Curral | T23 Calendário, T24 Aplicação, T25 Tratamento, T26 Exames, T27 Sessão de Curral, T28 Carência/encerramento | G4 |
| 05 Recria, engorda e pastos | T29 Pesagem, T30 Desempenho, T31 Pastos, T32 Movimentação, T33 Nutrição, T34 Confinamento, T35 Compra/venda, T36 Abate | G5 (T31 base em G2; T34/T36 → G8) |
| 06 Gestão e inteligência | T37 Estoque, T38 Financeiro, T39 Relatórios, T40 Assistente, T41 Agenda, T42 Ocorrências, T43 Patrimônio, T44 Configurações | T37 → G4; T38/T39/T42 → G5; T40 → G6; T41 → G3; T43 → G8; T44 → G1+ |
| Tela "Hoje" (prancha) | Prioridades justificadas, tarefas, iniciar manejo | Base G1, enriquecida a cada goal |

---

## 8. Deploy na VPS compartilhada (resumo operacional)

1. **Auditar antes de tocar** (somente leitura): `ss -tlnp`, proxy atual (CyberPanel/LiteSpeed/Nginx), certificados, `docker ps`, RAM/CPU/disco, rotina de backup.
2. Escolher caminho: (a) proxy central → Nginx interno do Rebania por domínio; ou (b) proxy existente → `127.0.0.1:<porta dedicada>`. **Nunca** bind em 80/443.
3. Containers: `rebania-nginx`, `rebania-api`, `rebania-worker`, `rebania-postgres` (ou DB/usuário isolado em instância existente, após avaliação). Labels `project=rebania`, volumes nomeados separados.
4. Build no CI, push para registry, pull na VPS por digest.
5. Migrations com backup prévio e compatibilidade entre releases; smoke test; rollback documentado.
6. Limpeza apenas de imagens `project=rebania` antigas. **Proibido**: `docker system prune`, `compose down -v`, reinstalar servidor.
7. Backup externo DB + mídia, RPO/RTO acordados, restore ensaiado.

---

## 9. Riscos principais e mitigação

| Risco | Mitigação |
|---|---|
| Escopo enorme virar entrega rasa | Fatias verticais, P1 primeiro, feature flags, aceite por goal |
| Sync com perda/duplicação | Idempotência por `mutationId`, testes de modo avião/reinício/concorrência desde G2 |
| Hardware não homologado no piloto | Adapters + fallback manual; homologação condicionada a aparelho físico; registrar pendência |
| Vazamento entre tenants | `TenantContext` obrigatório, teste A×B em CI, avaliar RLS |
| Custo de IA imprevisível | Rate card versionado, cotação antes, budget por pessoa/finalidade, circuit breaker |
| VPS subdimensionada ou proxy afetado | Auditoria prévia, limites medidos, ingress via proxy existente |
| Dados ilustrativos indo para produção | Fixtures só em testes/demo separada; revisão de seed em CI |
| Identidade visual mudar depois | Tokens centralizados; UI neutra até aprovação |
| Alegações indevidas (SISBOV, diagnóstico por foto, "primeiro do mercado") | Revisão de copy; limites explícitos na interface |

---

## 10. Perguntas materiais (rodada 1 — máximo 3)

1. **Logo**: a imagem da cabeça bovina com brinco ocre **substitui** o símbolo em laço das pranchas? Posso registrá-la como "aprovada" (ou "aprovada com ajustes") e unificar a paleta pelo verde/ocre dela?
2. **Piloto**: conseguimos uma entrevista e uma amostra da planilha/registros atuais do cliente piloto, além dos modelos de brinco, leitor RFID e balança que ele usa?
3. **VPS**: posso receber acesso somente-leitura (ou a saída dos comandos de inventário) para dimensionar o deploy, e qual proxy já roda lá?

Enquanto essas respostas não chegam, é possível avançar sem bloqueio em: G0 (documentos/ADRs) e G1 (fundação, auth, tenancy, CI, Docker local).

---

## 11. Próximos passos imediatos

1. Aprovar este plano (ou ajustar a ordem dos goals).
2. Responder às 3 perguntas da seção 10.
3. Iniciar **G0**: `docs/DECISIONS.md`, `docs/GOALS.md`, `docs/STATUS.md`, matriz funcional e ADRs.
4. Iniciar **G1** em paralelo: scaffold do monorepo, banco, auth, tenancy e CI.
