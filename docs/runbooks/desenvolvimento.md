# Runbook — Ambiente de desenvolvimento

```bash
pnpm install
docker compose -f infra/compose/docker-compose.dev.yml up -d   # ou PostgreSQL 16 local
cp .env.example .env
pnpm db:migrate
pnpm --filter @rebania/api bootstrap --org "Fazenda Demo" --farm "Boa Vista" --email voce@exemplo.com
pnpm --filter @rebania/api dev        # http://127.0.0.1:3000
pnpm --filter @rebania/web dev        # http://localhost:5173 (proxy /v1 → API, mesma origem)
```
Abra o link de convite impresso pelo bootstrap. A landing fica em `/` para visitantes; o login em `/entrar`.

## App nativo
```bash
cp apps/mobile/.env.example apps/mobile/.env     # EXPO_PUBLIC_API_URL = IP da máquina na rede
cd apps/mobile && npx expo run:android            # development build (Expo Go não suporta módulos nativos futuros)
```
O build iOS exige macOS/Xcode ou EAS Build; a VPS Linux não substitui isso.

## Verificações
```bash
pnpm turbo run typecheck lint test
TEST_DATABASE_URL=postgresql://rebania:rebania@localhost:5432/rebania_test pnpm test:integration
pnpm format:check
```
Os testes de integração **recriam** o banco indicado em `TEST_DATABASE_URL` (o nome precisa terminar em `_test`).
