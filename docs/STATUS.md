# Status da implementação

Atualizado em 09/10/2026. "Testado" significa coberto por teste automatizado que roda no CI, salvo indicação.

## Implementado e testado

| Área | O que existe | Evidência |
|---|---|---|
| Monorepo | pnpm 10 + Turborepo + TS strict; lint, typecheck, Prettier | `pnpm turbo run typecheck lint test` (28 tarefas verdes) |
| Domínio (`packages/domain`) | Datas civis por timezone; categorias × sexo; identificadores (RFID ISO 11784 15 dígitos, NFC, brinco com zeros à esquerda); GMD com intervalo positivo; arroba só com rendimento explícito; prenhez com cobertura; papéis/permissões | 21 testes unitários |
| Banco (`packages/db`) | Prisma 7 + PostgreSQL 16; FKs compostas de tenant; unicidade parcial de identificadores ativos (fazenda: brinco; organização: RFID/NFC/QR); auditoria append-only por trigger; fila de jobs | migração `init`; `migrate diff` sem divergência |
| Auth | Login web (cookie httpOnly, SameSite=Strict, anti-CSRF por header); mobile (access 15 min + refresh rotativo, uso único); logout; sessões e revogação; convites com hash, expiração, uso único, papel limitado ao do convidante | `apps/api/test/auth.test.ts` (7) |
| Isolamento A×B (teste obrigatório 1) | Leituras/escritas cruzadas → 404 sem gravar; FKs impedem referência cruzada mesmo se a aplicação falhar; mutationId de outro tenant não vaza recibo | `tenant-isolation.test.ts` (7) |
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

- **G2:** upload de fotos e galeria (as telas mostram "Sem foto"), importação de planilha, leitura de QR/OCR pela câmera, cadastro e movimentação no app nativo, NFC e leitores BLE nativos.
- **G3–G5:** reprodução, IATF, nascimento, sanidade, estoque, Modo Curral, trato, compra e venda, financeiro, relatórios.
- **G6:** console da plataforma, cobrança, créditos e assistente de IA (aguardam provedores, P-02).
- **Homologação de hardware:** nenhum aparelho foi testado fisicamente (P-03).
- **Testes em aparelhos:** o app nativo só foi empacotado; não rodou em Android/iOS físico nem em emulador.
- **Testes obrigatórios 2, 3, 6 (físico), 8–10 e 12** dependem dos goals acima.
- **Deploy:** nada foi publicado; a VPS não foi auditada (P-04).
