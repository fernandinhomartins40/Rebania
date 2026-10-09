# Registro de decisões — Rebania

Estados: **Aprovado** (decidido pelo usuário) · **Adotado** (decisão técnica registrada em ADR, revisável) · **Pendente** (aguarda decisão; não implementar como se estivesse decidido).

| ID | Decisão | Estado | Fonte / evidência |
|---|---|---|---|
| D-01 | Nome Rebania; marca em minúsculas; tagline "Sua fazenda em dia." | Aprovado | MN §19 |
| D-02 | SaaS para pecuária de corte, ciclo completo (cria, recria, engorda); cliente inicial como piloto | Aprovado | MN §19 |
| D-03 | Receita: implantação + mensalidade + pacotes de créditos de IA; sem cobrança por cabeça | Aprovado | MN §4 |
| D-04 | Identificação completa: RFID por leitor homologado, NFC compatível, câmera/QR/OCR, digitação | Aprovado | MN §8 |
| D-05 | Canais: web responsiva + PWA + apps nativos Android/iOS (não WebView) | Aprovado | MN §1 |
| D-06 | Monorepo pnpm/Turborepo/TypeScript; Docker + Nginx em VPS compartilhada | Aprovado | MN §12 |
| D-07 | Logo: **cabeça bovina com brinco ocre** (substitui o laço das pranchas) | Aprovado | Enviada pelo usuário (09/10/2026) e confirmada no pacote `docs/brand/pacote-landing` ("última identidade escolhida") |
| D-08 | Direção visual das pranchas (layout, hierarquia, componentes) para o app | Aprovado | Usuário: "as telas estão ficando muito diferentes da proposta" (09/10/2026) |
| D-09 | Ícones: Lucide (`icon-map.json` do pacote); figura bovina = símbolo PNG da marca | Aprovado | Usuário pediu ícones de biblioteca; guia do pacote |
| D-10 | Tipografia: stack do sistema (sem fonte baixada); wordmark só pelo PNG oficial | Aprovado | `pacote-landing/design/tokens.css` e guia |
| D-11 | Landing pública com copy de `copy.json`, fotos do pacote e prévias HTML rotuladas "Tela ilustrativa" | Aprovado | Pacote de landing enviado pelo usuário |
| T-01 | Stack: React 19 + Vite 8 (web), Expo SDK 57 / RN 0.86 (mobile), Fastify 5, Prisma 7 + PostgreSQL 16, fila em PostgreSQL | Adotado | ADR-001 |
| T-02 | Tenancy por FKs compostas + `requireFarm`/`requireOrg` + teste A×B | Adotado | ADR-002 |
| T-03 | Sync: outbox + recibos idempotentes + políticas por tipo (sem LWW universal) | Adotado | ADR-003 |
| T-04 | Auth: cookie httpOnly/SameSite=Strict + header anti-CSRF (web); access 15 min + refresh rotativo em Keychain/Keystore (mobile) | Adotado | ADR-004 |
| T-05 | Senhas com scrypt (sem dependência nativa) | Adotado | ADR-004 |
| T-06 | Rotas de API aninhadas por fazenda (`/v1/farms/:farmId/...`) em vez de `/v1/animals` | Adotado | ADR-002 (tenant explícito na URL, validado no servidor) |
| T-07 | Identificador Android/iOS `com.rebania.app` | **Provisório** | Depende do domínio/conta de loja (pendente) |
| P-01 | Preços, tamanhos de pacote, expiração/recarga de créditos | Pendente | Não implementar expiração/recarga automática |
| P-02 | Provedor de IA e de pagamento | Parcial | IA: **DeepSeek** (decidido 09/10/2026), adapter implementado; liga com `AI_PROVIDER=deepseek` + `DEEPSEEK_API_KEY` no `.env` da VPS. Pagamento: pendente (`BILLING_PROVIDER=none`, ou `hmac` para conciliação assinada) |
| P-03 | Leitores RFID, bastões, balanças a homologar | Pendente | Adapters prontos; homologação exige aparelho físico |
| P-04 | Inventário e dimensionamento da VPS; caminho de ingress | Parcial | VPS definida: 72.60.10.112 (não a 108). Ingress: Nginx do host → `127.0.0.1:8088`. Deploy por GHCR + SSH com senha; único secret `VPS_PASSWORD` (`deploy.yml`). Falta a auditoria somente leitura (`docs/runbooks/deploy.md` §0) |
| P-05 | Domínio, marca no INPI, contas das lojas | Parcial | Domínio: www.rebania.com.br (canônico; apex redireciona). Marca no INPI e contas das lojas pendentes; nada enviado às lojas |
| P-06 | Endpoint de leads do formulário da landing | Pendente | Formulário desabilitado até haver endpoint, antispam e política de dados |
| P-07 | Entrevista e dados reais do piloto (planilha, equipamentos, conectividade) | Pendente | Sem isso não há linha de base de tempo de registro |
