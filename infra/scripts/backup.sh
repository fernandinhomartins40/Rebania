#!/usr/bin/env bash
# Backup do banco do Rebania (pg_dump formato custom) + checksum.
# Uso: infra/scripts/backup.sh /caminho/backups
# Envie o diretório para FORA da VPS (ver docs/runbooks/backup-restore.md).
set -euo pipefail
DEST="${1:?informe o diretório de destino}"
ENV_FILE="${ENV_FILE:-$(dirname "$0")/../compose/.env}"
COMPOSE="${DOCKER_COMPOSE:-docker compose} --env-file $ENV_FILE -f $(dirname "$0")/../compose/docker-compose.yml"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DEST"
OUT="$DEST/rebania-db-$STAMP.dump"
$COMPOSE exec -T postgres pg_dump -U rebania -d rebania --format=custom --no-owner > "$OUT"
(cd "$DEST" && sha256sum "$(basename "$OUT")" > "$(basename "$OUT").sha256")
# Valida que o arquivo é um dump legível antes de considerar o backup concluído.
$COMPOSE exec -T postgres pg_restore --list < "$OUT" > /dev/null
# Mídia (fotos): arquivo tar do volume compartilhado, lido pelo container da API.
MEDIA_OUT="$DEST/rebania-media-$STAMP.tar.gz"
$COMPOSE exec -T api tar -C /data/media -czf - . > "$MEDIA_OUT"
(cd "$DEST" && sha256sum "$(basename "$MEDIA_OUT")" > "$(basename "$MEDIA_OUT").sha256")
echo "backup ok: $OUT ($(du -h "$OUT" | cut -f1)) + $MEDIA_OUT ($(du -h "$MEDIA_OUT" | cut -f1))"
