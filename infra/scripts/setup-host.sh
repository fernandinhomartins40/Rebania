#!/usr/bin/env bash
# Preparação da VPS 72.60.10.112 para o Rebania. Idempotente e não interativo:
# o workflow de deploy roda este script (como root, via SSH) antes de cada deploy.
# - instala Docker (+ compose) se faltar (Debian/Ubuntu);
# - cria /opt/rebania/infra/compose/.env a partir do exemplo SÓ se não existir
#   (senha do banco gerada aqui, nunca sai da VPS);
# - instala o vhost do Nginx do host para rebania.com.br / www.rebania.com.br
#   SEM sobrescrever um existente e sem tocar nos de outras aplicações;
# - emite o certificado (certbot) quando ainda não existe; falha aqui não
#   derruba o deploy (ex.: DNS ainda não aponta para a VPS).
# Uso: infra/scripts/setup-host.sh [email-para-o-certbot]
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}"
SITE=rebania.com.br
CERT_EMAIL="${1:-${CERT_EMAIL:-}}"
ENV_FILE="$APP_DIR/infra/compose/.env"

[ "$(id -u)" = 0 ] || { echo "rode como root" >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive

apt_install() {
  command -v apt-get >/dev/null 2>&1 || { echo "ERRO: instale manualmente: $*" >&2; return 1; }
  apt-get update -qq && apt-get install -y -qq "$@" >/dev/null
}

echo "=== Docker ==="
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker ausente: instalando"
  apt_install docker.io
  systemctl enable --now docker
fi
if ! docker compose version >/dev/null 2>&1 && ! command -v docker-compose >/dev/null 2>&1; then
  echo "Docker Compose ausente: instalando"
  apt_install docker-compose-v2 || apt_install docker-compose-plugin || apt_install docker-compose
fi

echo "=== Diretórios e .env ==="
mkdir -p "$APP_DIR/infra/compose" /var/backups/rebania
if [ ! -f "$ENV_FILE" ]; then
  install -m 600 "$APP_DIR/infra/compose/.env.production.example" "$ENV_FILE"
  sed -i "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=$(openssl rand -hex 24)#" "$ENV_FILE"
  echo "Criado $ENV_FILE (senha do banco gerada na VPS)."
else
  echo "$ENV_FILE já existe; mantido."
fi
chmod 600 "$ENV_FILE"

echo "=== Nginx do host ==="
if ! command -v nginx >/dev/null 2>&1; then
  if ss -ltn '( sport = :80 )' | grep -q LISTEN; then
    echo "AVISO: a porta 80 já pertence a outro servidor (não é Nginx). Encaminhe www.$SITE para 127.0.0.1:8088 nele (docs/runbooks/deploy.md)."
    exit 0
  fi
  echo "Nginx ausente e porta 80 livre: instalando Nginx e certbot"
  apt_install nginx certbot python3-certbot-nginx
  systemctl enable --now nginx
fi

AVAIL=/etc/nginx/sites-available/$SITE
if [ -f "$AVAIL" ]; then
  echo "$AVAIL já existe; mantido."
else
  install -m 644 "$APP_DIR/infra/nginx/host/$SITE.conf" "$AVAIL"
  ln -sf "$AVAIL" "/etc/nginx/sites-enabled/$SITE"
  if nginx -t 2>/dev/null; then
    systemctl reload nginx
    echo "vhost $SITE instalado e Nginx recarregado."
  else
    rm -f "/etc/nginx/sites-enabled/$SITE" "$AVAIL"
    echo "AVISO: nginx -t falhou com o vhost do Rebania; removido, nada mudou." >&2
    exit 0
  fi
fi

echo "=== Certificado ==="
if [ -d "/etc/letsencrypt/live/$SITE" ]; then
  echo "Certificado de $SITE já existe."
elif command -v certbot >/dev/null 2>&1; then
  if [ -n "$CERT_EMAIL" ]; then EMAIL_ARGS=(-m "$CERT_EMAIL"); else EMAIL_ARGS=(--register-unsafely-without-email); fi
  certbot --nginx --non-interactive --agree-tos "${EMAIL_ARGS[@]}" --redirect \
    -d "$SITE" -d "www.$SITE" \
    || echo "AVISO: certbot falhou (o DNS de $SITE e www.$SITE já aponta para esta VPS?). O próximo deploy tenta de novo."
else
  echo "AVISO: certbot não instalado; instale e rode: certbot --nginx --redirect -d $SITE -d www.$SITE"
fi
