# syntax=docker/dockerfile:1.7
# Web/PWA/landing estáticos servidos pelo Nginx interno do Rebania.
ARG NODE_IMAGE=node:22.22.0-bookworm-slim
ARG NGINX_IMAGE=nginx:1.28.0-alpine

FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter "@rebania/web..."
RUN pnpm --filter @rebania/web build

FROM ${NGINX_IMAGE} AS web
COPY infra/nginx/rebania.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
LABEL org.opencontainers.image.title="rebania-web" project="rebania"
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
