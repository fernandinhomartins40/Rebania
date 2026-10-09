#!/usr/bin/env bash
# Backup do banco do Rebania (pg_dump formato custom) + checksum.
# Uso: infra/scripts/backup.sh /caminho/backups
# Envie o diretório para FORA da VPS (ver docs/runbooks/backup-restore.md).
set -euo pipefail
DEST="${1:?informe o diretório de destino}"
ENV_FILE="${ENV_FILE:-$(dirname "$0")/../compose/.env}"
COMPOSE="docker compose --env-file $ENV_FILE -f $(dirname "$0")/../compose/docker-compose.yml"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DEST"
OUT="$DEST/rebania-db-$STAMP.dump"
$COMPOSE exec -T postgres pg_dump -U rebania -d rebania --format=custom --no-owner > "$OUT"
(cd "$DEST" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256")
# Valida que o arquivo é um dump legível antes de considerar o backup concluído.
$COMPOSE exec -T postgres pg_restore --list < "$OUT" > /dev/null
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1))"
