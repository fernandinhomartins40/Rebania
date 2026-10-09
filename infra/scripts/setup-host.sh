#!/usr/bin/env bash
# Preparação ÚNICA da VPS 72.60.10.112 para o Rebania (rodar como root, uma vez).
# - cria /opt/rebania e o .env a partir do exemplo (se ainda não existir);
# - instala o vhost do Nginx do host para rebania.com.br / www.rebania.com.br
#   SEM sobrescrever um vhost existente e sem tocar nos de outras aplicações;
# - emite o certificado com certbot (se instalado) quando o DNS já aponta para cá.
# Uso: sudo infra/scripts/setup-host.sh [email-para-o-certbot]
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="${APP_DIR:-/opt/rebania}"
SITE=rebania.com.br
CERT_EMAIL="${1:-}"

[ "$(id -u)" = 0 ] || { echo "rode como root" >&2; exit 1; }

mkdir -p "$APP_DIR/infra/compose" "$APP_DIR/infra/scripts" /var/backups/rebania
if [ ! -f "$APP_DIR/infra/compose/.env" ]; then
  install -m 600 "$REPO_DIR/infra/compose/.env.production.example" "$APP_DIR/infra/compose/.env"
  sed -i "s#^POSTGRES_PASSWORD=.*#POSTGRES_PASSWORD=$(openssl rand -hex 24)#" "$APP_DIR/infra/compose/.env"
  echo "Criado $APP_DIR/infra/compose/.env (senha do banco gerada). Revise antes do 1º deploy."
else
  echo "$APP_DIR/infra/compose/.env já existe; mantido."
fi

if command -v nginx >/dev/null 2>&1; then
  AVAIL=/etc/nginx/sites-available/$SITE
  if [ -f "$AVAIL" ]; then
    echo "$AVAIL já existe; mantido (compare com infra/nginx/host/$SITE.conf)."
  else
    install -m 644 "$REPO_DIR/infra/nginx/host/$SITE.conf" "$AVAIL"
    ln -sf "$AVAIL" "/etc/nginx/sites-enabled/$SITE"
    if nginx -t; then
      systemctl reload nginx
      echo "vhost $SITE instalado e Nginx recarregado."
    else
      rm -f "/etc/nginx/sites-enabled/$SITE" "$AVAIL"
      echo "ERRO: nginx -t falhou; vhost removido, nada mudou." >&2
      exit 1
    fi
  fi
  if command -v certbot >/dev/null 2>&1 && [ -n "$CERT_EMAIL" ]; then
    certbot --nginx --non-interactive --agree-tos -m "$CERT_EMAIL" --redirect \
      -d "$SITE" -d "www.$SITE"
  else
    echo "Certificado: rode depois que o DNS apontar para esta VPS:"
    echo "  certbot --nginx --redirect -d $SITE -d www.$SITE"
  fi
else
  echo "Nginx não encontrado no host. Encaminhe www.$SITE para 127.0.0.1:8088 no proxy existente (docs/runbooks/deploy.md)."
fi
