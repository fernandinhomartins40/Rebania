#!/usr/bin/env bash
# Deploy do Rebania na VPS (72.60.10.112), chamado pelo workflow .github/workflows/deploy.yml
# no runner self-hosted. A VPS NÃO compila: só baixa as imagens do GHCR e sobe.
#
# Uso: RELEASE=<sha> infra/scripts/deploy.sh
#   APP_DIR         diretório do deploy (padrão /opt/rebania)
#   REGISTRY        prefixo das imagens (padrão ghcr.io/fernandinhomartins40/)
#   BACKUP_DIR      destino do backup pré-migração (padrão /var/backups/rebania)
#
# Garantias (CLAUDE.md / ADR-009):
# - nunca `down -v`, nunca prune global, nunca bind em 80/443;
# - backup do banco ANTES de migrar (exceto no primeiro deploy, banco vazio);
# - healthcheck falhou -> volta para a release anterior automaticamente;
# - limpeza de imagens restrita às do Rebania, preservando a atual e a anterior.
set -euo pipefail

RELEASE="${RELEASE:?informe RELEASE (sha do commit)}"
APP_DIR="${APP_DIR:-/opt/rebania}"
REGISTRY="${REGISTRY:-ghcr.io/fernandinhomartins40/}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/rebania}"
ENV_FILE="$APP_DIR/infra/compose/.env"
COMPOSE_FILE="$APP_DIR/infra/compose/docker-compose.yml"

if docker compose version >/dev/null 2>&1; then
  DOCKER_COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DOCKER_COMPOSE="docker-compose"
else
  echo "ERRO: docker compose não encontrado na VPS" >&2
  exit 1
fi
export DOCKER_COMPOSE ENV_FILE
compose() { $DOCKER_COMPOSE --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"; }

env_get() { grep -E "^$1=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true; }
env_set() {
  local tmp
  tmp="$(mktemp "$ENV_FILE.XXXXXX")"
  grep -vE "^$1=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
}

wait_healthy() {
  local service="$1" tries="$2" i status name
  for ((i = 1; i <= tries; i++)); do
    name="$(compose ps -q "$service" 2>/dev/null | head -1)"
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$name" 2>/dev/null || echo ausente)"
    [ "$status" = "healthy" ] && return 0
    sleep 5
  done
  echo "AVISO: $service não ficou healthy (último estado: $status)" >&2
  return 1
}

http_ok() {
  local port i
  port="$(env_get REBANIA_HTTP_PORT)"
  port="${port:-8088}"
  for ((i = 1; i <= 24; i++)); do
    if curl -fsS "http://127.0.0.1:$port/v1/health" >/dev/null 2>&1; then
      echo "OK: http://127.0.0.1:$port/v1/health"
      return 0
    fi
    sleep 5
  done
  return 1
}

echo "=== Validando $ENV_FILE ==="
if [ ! -f "$ENV_FILE" ]; then
  echo "ERRO: $ENV_FILE não existe. Crie a partir de infra/compose/.env.production.example (docs/runbooks/deploy.md)." >&2
  exit 1
fi
for v in POSTGRES_PASSWORD PUBLIC_URL; do
  if [ -z "$(env_get "$v")" ]; then
    echo "ERRO: $v vazio em $ENV_FILE" >&2
    exit 1
  fi
done
chmod 600 "$ENV_FILE"

PREVIOUS="$(env_get REBANIA_TAG)"
echo "Release anterior: ${PREVIOUS:-<nenhuma>} -> nova: $RELEASE"
env_set REBANIA_REGISTRY "$REGISTRY"
env_set REBANIA_TAG "$RELEASE"

echo "=== Baixando imagens prontas ==="
compose --profile migrate pull migrate api worker web

echo "=== Banco ==="
compose up -d postgres
wait_healthy postgres 36

# Backup só quando já existe uma versão rodando (no 1º deploy o banco está vazio).
API_ID="$(compose ps -q api 2>/dev/null | head -1)"
if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$RELEASE" ] && [ -n "$API_ID" ] \
  && [ "$(docker inspect -f '{{.State.Running}}' "$API_ID" 2>/dev/null)" = "true" ]; then
  echo "=== Backup antes de migrar ==="
  "$APP_DIR/infra/scripts/backup.sh" "$BACKUP_DIR"
fi

echo "=== Migrações ==="
compose --profile migrate run --rm migrate

echo "=== Subindo aplicação ==="
compose up -d api worker web

if ! wait_healthy api 36 || ! http_ok; then
  echo "ERRO: a nova release não respondeu ao healthcheck" >&2
  compose logs --tail=80 api web >&2 || true
  if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$RELEASE" ]; then
    echo "=== Rollback para $PREVIOUS (migrações são aditivas) ===" >&2
    env_set REBANIA_TAG "$PREVIOUS"
    compose up -d api worker web
    http_ok || echo "ERRO: rollback também não respondeu; ver docs/runbooks/incidente.md" >&2
  fi
  exit 1
fi

PUBLIC_URL="$(env_get PUBLIC_URL)"
if curl -fsS "$PUBLIC_URL/v1/health" >/dev/null 2>&1; then
  echo "OK: $PUBLIC_URL/v1/health"
else
  echo "AVISO: $PUBLIC_URL ainda não responde (DNS, vhost ou certificado do Nginx do host; ver infra/scripts/setup-host.sh)"
fi

echo "=== Limpando versões antigas (só imagens do Rebania; mantém $RELEASE e ${PREVIOUS:-nenhuma}) ==="
docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep -E "^${REGISTRY}rebania-(api|worker|migrate|web):" \
  | while read -r img; do
      tag="${img##*:}"
      case "$tag" in
        "$RELEASE" | latest | buildcache) ;;
        *) [ -n "$PREVIOUS" ] && [ "$tag" = "$PREVIOUS" ] || echo "$img" ;;
      esac
    done \
  | xargs -r docker rmi 2>/dev/null || true

compose ps
echo "=== Deploy concluído (REBANIA_TAG=$RELEASE) ==="
