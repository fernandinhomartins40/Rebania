# syntax=docker/dockerfile:1.7
# API, worker e migrações do Rebania. Build multi-stage; runtime sem root.
# Uso (contexto = raiz do monorepo):
#   docker build -f infra/docker/node.Dockerfile --target api -t rebania-api .
#   docker build -f infra/docker/node.Dockerfile --target worker -t rebania-worker .
#   docker build -f infra/docker/node.Dockerfile --target migrate -t rebania-migrate .
ARG NODE_IMAGE=node:22.22.0-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter "@rebania/api..." --filter "@rebania/worker..." --filter "@rebania/db..."
RUN pnpm --filter @rebania/db generate \
 && pnpm --filter @rebania/api build \
 && pnpm --filter @rebania/worker build
RUN pnpm --filter @rebania/api deploy --prod --legacy /out/api \
 && pnpm --filter @rebania/worker deploy --prod --legacy /out/worker \
 && pnpm --filter @rebania/db deploy --legacy /out/db

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
USER node

FROM runtime AS api
COPY --from=build --chown=node:node /out/api /app
EXPOSE 3000
ENV API_HOST=0.0.0.0 API_PORT=3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
LABEL org.opencontainers.image.title="rebania-api" project="rebania"
CMD ["node", "--enable-source-maps", "dist/server.js"]

FROM runtime AS worker
COPY --from=build --chown=node:node /out/worker /app
LABEL org.opencontainers.image.title="rebania-worker" project="rebania"
CMD ["node", "--enable-source-maps", "dist/main.js"]

# Executado como job antes de cada release (faça backup antes; ver runbook).
FROM runtime AS migrate
COPY --from=build --chown=node:node /out/db /app
LABEL org.opencontainers.image.title="rebania-migrate" project="rebania"
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
