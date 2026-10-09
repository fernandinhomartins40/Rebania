<p align="center"><img src="apps/web/public/brand/rebania-logo.png" alt="Rebania — Sua fazenda em dia." height="72"></p>

# Rebania

SaaS de gestão para pecuária de corte (cria, recria e engorda): identificação, manejos em três etapas (**identificar → informar → confirmar**), histórico confiável e operação offline. Web/PWA e apps nativos Android/iOS.

> Em desenvolvimento. Estado detalhado em [`docs/STATUS.md`](docs/STATUS.md).

## Estrutura
```
apps/api        Fastify · REST /v1 · auth · tenancy · rebanho · sync · CLI de implantação
apps/worker     jobs em fila PostgreSQL
apps/web        React + Vite · app web/PWA (offline em IndexedDB) · landing pública
apps/mobile     Expo / React Native · SQLite offline
packages/domain        regras de negócio puras (GMD, identificadores, permissões…)
packages/contracts     schemas Zod compartilhados
packages/db            Prisma 7 + migrations + fila
packages/sync-core     outbox, motor de sync, políticas de conflito
packages/hardware      contratos e parsers de leitores/balanças
packages/design-tokens cores, espaçamentos e tipografia da marca
infra/                 Dockerfiles, Nginx, compose, scripts de backup
docs/                  plano, decisões, ADRs, runbooks, referência e marca
```

## Começar
Veja [`docs/runbooks/desenvolvimento.md`](docs/runbooks/desenvolvimento.md).

## Documentos
- [Plano de implementação](docs/PLANO_DE_IMPLEMENTACAO.md) · [Decisões](docs/DECISIONS.md) · [Goals](docs/GOALS.md) · [Matriz funcional](docs/MATRIZ_FUNCIONAL.md)
- [ADRs](docs/adr) · [Deploy](docs/runbooks/deploy.md) · [Backup](docs/runbooks/backup-restore.md) · [Homologação de hardware](docs/runbooks/homologacao-hardware.md)
- Referências: [modelo de negócios](docs/referencia/Rebania_Modelo_de_Negocios_e_Implementacao.md), [pranchas](docs/referencia/Rebania_Pranchas_e_Experiencia.pdf), [pacote de marca](docs/brand/pacote-landing)
