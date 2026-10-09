# Status da implementação

Atualizado em 09/10/2026. "Testado" significa coberto por teste automatizado que roda no CI, salvo indicação.

## Implementado e testado

| Área | O que existe | Evidência |
|---|---|---|
| Monorepo | pnpm 10 + Turborepo + TS strict; lint, typecheck, Prettier | `pnpm turbo run typecheck lint test` (31 tarefas verdes) + `pnpm test:integration` (77 testes) |
| Domínio (`packages/domain`) | Datas civis por timezone; categorias × sexo; identificadores; GMD com intervalo positivo; arroba só com rendimento explícito; projeção reprodutiva; carência configurada com fonte; quantidades em milésimos e dinheiro em centavos; preço por cabeça/kg/@; rateio sem perda de centavo; relatórios com cobertura; CSV pt-BR; papéis/permissões | 57 testes unitários |
| Banco (`packages/db`) | Prisma 7 + PostgreSQL 16; FKs compostas de tenant; unicidade parcial de identificadores ativos (fazenda: brinco; organização: RFID/NFC/QR); auditoria append-only por trigger; fila de jobs | migração `init`; `migrate diff` sem divergência |
| Auth | Login web (cookie httpOnly, SameSite=Strict, anti-CSRF por header); mobile (access 15 min + refresh rotativo, uso único); logout; sessões e revogação; convites com hash, expiração, uso único, papel limitado ao do convidante | `apps/api/test/auth.test.ts` (7) |
| Isolamento A×B (teste obrigatório 1) | Leituras/escritas cruzadas → 404 sem gravar (rebanho, reprodução, sanidade, estoque, curral, venda, financeiro, relatórios); FKs impedem referência cruzada; mutationId de outro tenant não vaza recibo | `tenant-isolation.test.ts` (7) |
| Fotos e importação (G2) | Upload retomável com sha256, derivados WebP/JPEG sem EXIF no worker, galeria; importação CSV com prévia e confirmação; leitura de QR/código pela câmera (BarcodeDetector) | `media-import.test.ts` + Playwright |
| Reprodução e agenda (G3, teste obrigatório 2) | IA/monta/repasse em grupo, diagnóstico, previsão de parto com origem e janela, nascimento com gêmeos/natimorto, desmama, estações, protocolos versionados, agenda derivada, correção por anulação | `repro.test.ts` + Playwright |
| Sanidade, estoque e Modo Curral (G4, testes obrigatórios 3 e 6 lado servidor) | Produtos, lotes/validade, movimentos com conferência de saldo negativo, aplicação em grupo, carência com fonte, tratamentos, exames, calendário pelo plano da fazenda, sêmen com baixa por IA; Modo Curral offline com leitor em modo teclado, supressão de repetidos, ID desconhecido, fora da seleção, retomada e encerramento | `health.test.ts` (14) + Playwright |
| Comercial, trato e financeiro (G5, testes obrigatórios 5-venda e 7) | Venda atômica com verificação de carência (exceção só do proprietário, auditada), conflito entre aparelhos sem venda dupla, compra que cadastra animais e conta a pagar, morte/descarte/transferência, trato com custo médio, contas a pagar/receber, relatórios (inventário, GMD, reprodução, mortalidade, sanidade, trato, comercial, caixa) com fórmula/cobertura e CSV | `commerce.test.ts` (11) + `commerce.test.ts` do domínio + Playwright |
| Rebanho | Cadastro mínimo, edição com versão, movimentação com data efetiva e conflito, pesagem com alerta de inconsistência, retag que preserva o histórico, busca por identificador, resumo da fazenda, lotes e pastos | `animals.test.ts` (13) |
| Idempotência | `Idempotency-Key` (REST) e `mutationId` (sync) devolvem o mesmo recibo; conteúdo diferente com o mesmo id é rejeitado; requisições concorrentes não duplicam | `animals.test.ts`, `sync.test.ts` |
| Sync (testes obrigatórios 4 e 5) | 100 eventos offline + reinício + reconexão sem perda/duplicação; lote parcial; conflito entre dois aparelhos sem sobrescrever; append de pesagens; pull incremental por cursor | `sync.test.ts` (7) + `sync-core` (7) |
| Worker | Fila PostgreSQL com SKIP LOCKED, backoff, deduplicação; limpeza de sessões e recibos | `apps/worker/test` (3) |
| Web/PWA | Hoje, Rebanho, Identificar, Passaporte, Cadastro/Pesagem/Movimentação em 3 etapas, Equipe e convites, Lotes e pastos, Central de sincronização, Conta; outbox em IndexedDB; rascunho sobrevive ao refresh; estado único de conectividade | `engine.test.ts` (3) + roteiro Playwright manual (convite → cadastro → pesagem online/offline → reconexão → passaporte) |
| Landing (T01) | Copy do pacote, fotos WebP com `srcset`, prévias HTML rotuladas, FAQ nativo, formulário desabilitado | Verificada em 390 e 1280 px sem rolagem horizontal (Playwright) |
| Hardware (`packages/hardware`) | Contratos de leitor/balança, parser RFID/balança, leitor em modo teclado (HID), supressão de leitura repetida do Modo Curral | 10 testes unitários |
| Design tokens | Valores do pacote de marca; contraste AA verificado por par | 12 testes |
| App nativo (Expo SDK 57) | Login com SecureStore, SQLite offline com o mesmo motor de sync, Hoje, Rebanho, Passaporte, Pesagem em 3 etapas, Agenda, Fazenda/sincronização/sair | typecheck + lint + bundle Metro Android e iOS (`expo export`) |
| Infra | Dockerfiles multi-stage sem root (api, worker, migrate, web/Nginx); compose de produção com porta só em loopback; backup e restauração verificada | Imagens construídas e stack completa executada localmente; backup → restore em banco separado conferido |
| CI | GitHub Actions: formato, typecheck, lint, unitários, integração com PostgreSQL, schema × migrations, builds e imagens | `.github/workflows/ci.yml` |

## Pendente (não implementado)

- **App nativo:** reprodução, sanidade, Modo Curral, venda, trato e financeiro existem só na web; o app nativo cobre rebanho, cadastro, pesagem, movimentação e fotos.
- **NFC e leitores BLE nativos; OCR de brinco:** não implementados (dependem de aparelho homologado).
- **Tratamentos, exames, compra e venda:** exigem conexão (rascunho preservado); aplicação, curral, trato e saída funcionam offline.
- **G6:** console da plataforma, cobrança, créditos e assistente de IA (aguardam provedores, P-02).
- **Homologação de hardware:** nenhum aparelho foi testado fisicamente (P-03).
- **Testes em aparelhos:** o app nativo só foi empacotado; não rodou em Android/iOS físico nem em emulador.
- **Testes obrigatórios 6 (físico), 8–10 e 12** dependem de G6/G7 e de aparelhos físicos.
- **Deploy:** nada foi publicado; a VPS não foi auditada (P-04).
