# Matriz funcional rastreável

Origem: inventário do MN §5 e telas T01–T44 das pranchas. Situação: ✅ implementado · 🟡 parcial · ⬜ pendente.

| Área (MN §5) | Prioridade | Telas | Goal | Situação | Código / teste |
|---|---|---|---|---|---|
| Organização, fazendas, equipe, papéis, convites | P1 | T02, T04, T44 | G1 | ✅ | `apps/api/src/modules/{auth,org,farms}.ts`, `auth.test.ts` |
| Animal (ID estável, brinco, RFID, NFC, categoria, situação) | P1 | T10, T11 | G2 | ✅ (fotos ⬜) | `modules/animals`, `animals.test.ts` |
| Identificação (troca, leitura, duplicidade, busca) | P1 | T09, T13 | G2 | 🟡 (câmera/QR/NFC ⬜) | `identifiers/resolve`, `IdentifyAnimal.tsx`, `packages/hardware` |
| Inventário e lotes | P1 | T08, T14 | G2 | 🟡 (compra/venda/morte ⬜) | `farms.ts` (lotes/pastos) |
| Movimentação | P1 | T32 | G2/G5 | ✅ | `moveAnimal`, `sync.test.ts` (conflito) |
| Pesagem e GMD | P1 | T29, T30 | G5 (antecipado) | ✅ | `recordWeight`, `domain/weight.ts` |
| Mídia | P1/P2 | T12 | G2 | ⬜ | — |
| Importação | P1 | T15 | G2 | ⬜ | — |
| Sync offline e conflitos | P1 | estados (PR p.15) | G2 | ✅ | `packages/sync-core`, `SyncCenter.tsx` |
| Genealogia | P1/P2 | T11 | G3 | 🟡 (mãe/pai no cadastro) | `assertParent` |
| Reprodução, IATF, diagnóstico, nascimento, bezerros | P1 | T16–T22 | G3 | ⬜ | — |
| Sanidade, aplicação, carência, estoque | P1 | T23–T28, T37 | G4 | ⬜ | — |
| Modo Curral | P1 | T27 | G4 | 🟡 (deduper/parsers) | `packages/hardware` |
| Pastos | P1/P2 | T31 | G2/G5 | 🟡 (cadastro, sem mapa) | `Places.tsx` |
| Nutrição, confinamento | P1/P2 | T33, T34 | G5/G8 | ⬜ | — |
| Financeiro, comercialização, abate | P1/P2 | T35, T36, T38 | G5 | ⬜ | — |
| Agenda e ocorrências | P1 | T41, T42 | G3+ | ⬜ (estado vazio honesto) | `Agenda.tsx` |
| Relatórios e indicadores | P1/P2 | T39 | G5 | 🟡 (resumo da fazenda) | `/summary` |
| Assistente/IA, créditos | P1 | T06, T40 | G6 | ⬜ | — |
| Operação SaaS (console, plano, contrato) | P1 | T03, T05, T07 | G6 | ⬜ (implantação via CLI `bootstrap`) | `apps/api/src/cli/bootstrap.ts` |
| Landing | — | T01 | G6 | ✅ (form ⬜) | `apps/web/src/pages/landing` |
