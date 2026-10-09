# Matriz funcional rastreável

Origem: inventário do MN §5 e telas T01–T44 das pranchas. Situação: ✅ implementado · 🟡 parcial · ⬜ pendente. "Web" e "App" indicam o canal.

| Área (MN §5) | Prioridade | Telas | Goal | Situação | Código / teste |
|---|---|---|---|---|---|
| Organização, fazendas, equipe, papéis, convites | P1 | T02, T04, T44 | G1 | ✅ Web | `modules/{auth,org,farms}.ts`, `auth.test.ts` |
| Animal (ID estável, brinco, RFID, NFC, categoria, situação) | P1 | T10, T11 | G2 | ✅ Web/App (NFC nativo ⬜, P-03) | `modules/animals`, `animals.test.ts` |
| Identificação (troca, leitura, duplicidade, busca, QR) | P1 | T09, T13 | G2 | 🟡 (OCR de brinco e leitores BLE ⬜ — homologação) | `IdentifyAnimal.tsx`, `CameraScanner.tsx`, `packages/hardware` |
| Inventário, lotes, compra, venda, morte | P1 | T08, T14, T35 | G2/G5 | ✅ Web (saída também no App) | `commerce/service.ts`, `commerce.test.ts` |
| Movimentação | P1 | T32 | G2/G5 | ✅ Web/App | `moveAnimal`, `sync.test.ts` |
| Pesagem e GMD | P1 | T29, T30 | G5 | ✅ Web/App | `domain/weight.ts`, relatório de desempenho |
| Mídia | P1/P2 | T12 | G2 | ✅ Web/App | `modules/media.ts`, `media-import.test.ts` |
| Importação | P1 | T15 | G2 | ✅ Web | `modules/imports.ts` |
| Sync offline e conflitos | P1 | estados | G2 | ✅ Web/App | `packages/sync-core`, `sync.test.ts` |
| Genealogia | P1/P2 | T11 | G3 | ✅ (mãe/pai, crias do parto) | `recordBirth` |
| Reprodução, IATF, diagnóstico, nascimento, desmama | P1 | T16–T22 | G3 | ✅ Web (nascimento também no App) | `modules/repro`, `repro.test.ts` |
| Sanidade, aplicação, carência, tratamentos, exames | P1 | T23–T26, T28 | G4 | ✅ Web (aplicação também no App) | `modules/health`, `health.test.ts` |
| Estoque (insumos, lotes, sêmen) | P1 | T37 | G4 | ✅ Web | `Stock.tsx`, `health.test.ts` |
| Modo Curral | P1 | T27, T28 | G4 | ✅ Web/App (balança integrada ⬜ — homologação) | `curral/Run.tsx`, `mobile/screens/Curral.tsx` |
| Pastos e chuva | P1/P2 | T31 | G8 | ✅ (módulo opcional; mapas ⬜) | `modules/depth.ts`, `depth.test.ts` |
| Nutrição/trato | P1 | T33 | G5 | ✅ Web/App | `recordFeeding` |
| Confinamento | P2 | T34 | G8 | ✅ (módulo opcional) | `Confinement.tsx` |
| Abate / retorno do frigorífico | P2 | T36 | G8 | ✅ (módulo opcional) | `Slaughter.tsx` |
| Financeiro e resultado | P1/P2 | T38 | G5/G8 | ✅ Web (DRE como módulo opcional) | `Finance.tsx`, relatório `result` |
| Agenda e ocorrências | P1 | T41, T42 | G3+ | ✅ Web/App | `Agenda.tsx`, `Occurrences.tsx` |
| Relatórios e indicadores | P1/P2 | T39 | G5 | ✅ Web (CSV/PDF) | `commerce/reports.ts` |
| Patrimônio | P3 | T43 | G8 | ✅ (módulo opcional) | `Assets.tsx` |
| Assistente/IA, créditos | P1 | T06, T40 | G6 | 🟡 estrutura completa; provedor de IA e de pagamento pendentes (P-02) | `packages/ai-gateway`, `ai-credits.test.ts` |
| Operação SaaS (console, plano, contrato, suporte) | P1 | T03, T05, T07 | G6 | ✅ Web | `modules/platform.ts` |
| Observabilidade | — | — | G7 | ✅ (`/v1/metrics`) | `metrics.test.ts` |
| Acessibilidade | — | todas | G7 | ✅ axe WCAG A/AA + 360/768/1280 sem rolagem lateral (aparelhos físicos ⬜) | `apps/web/e2e/a11y.mjs` |
| Landing | — | T01 | G6 | ✅ (formulário ⬜, P-06) | `pages/landing` |
| Genética/DEPs, SISBOV, integrações fiscais/bancárias, API pública | P3 | — | G8 | ⬜ (só com integração/layout validados) | — |
