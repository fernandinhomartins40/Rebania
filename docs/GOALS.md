# Goals G0–G8

Detalhamento e critérios completos: `docs/PLANO_DE_IMPLEMENTACAO.md` §5. Estado atual: `docs/STATUS.md`.

| Goal | Depende de | Situação |
|---|---|---|
| G0 Descoberta e decisões | — | Parcial: decisões, ADRs e matriz registradas; entrevista do piloto e inventário da VPS pendentes |
| G1 Fundação | G0 | **Concluído** (ver STATUS) |
| G2 Rebanho offline | G1 | **Em andamento**: núcleo pronto (cadastro, identificadores, retag, lotes/pastos, pesagem, movimentação, sync, web offline, app nativo); faltam mídia, importação, câmera/QR |
| G3 Reprodução e cria | G2 | Não iniciado |
| G4 Sanidade, estoque e Modo Curral | G2 | Iniciado só em `@rebania/hardware` (parsers e supressão de leitura) |
| G5 Recria, engorda e resultado | G3, G4 | Pesagem/GMD e movimentação antecipados no G2 |
| G6 Comercial SaaS e IA | G1 (console/billing); G2–G5 (IA) | Landing (T01) entregue; restante pendente de provedores |
| G7 Lançamento do piloto | G2–G6 | Infra de deploy, backup/restore e CI prontos; QA com piloto pendente |
| G8 Profundidade | G7 | Não iniciado |
