#!/usr/bin/env bash
# Restaura um dump num banco SEPARADO (rebania_restore_check) e confere contagens.
# Nunca restaura sobre o banco de produção. Uso: infra/scripts/restore-check.sh arquivo.dump
set -euo pipefail
DUMP="${1:?informe o arquivo .dump}"
(cd "$(dirname "$DUMP")" && sha256sum -c "$(basename "$DUMP").sha256")
ENV_FILE="${ENV_FILE:-$(dirname "$0")/../compose/.env}"
COMPOSE="docker compose --env-file $ENV_FILE -f $(dirname "$0")/../compose/docker-compose.yml"
$COMPOSE exec -T postgres psql -U rebania -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS rebania_restore_check" -c "CREATE DATABASE rebania_restore_check"
$COMPOSE exec -T postgres pg_restore -U rebania -d rebania_restore_check --no-owner --exit-on-error < "$DUMP"
for t in organizations farms users animals animal_identifiers weight_measurements animal_events audit_entries; do
  a=$($COMPOSE exec -T postgres psql -U rebania -d rebania -Atc "select count(*) from $t")
  b=$($COMPOSE exec -T postgres psql -U rebania -d rebania_restore_check -Atc "select count(*) from $t")
  printf "%-22s origem=%-8s restaurado=%s\n" "$t" "$a" "$b"
done
$COMPOSE exec -T postgres psql -U rebania -d postgres -c "DROP DATABASE rebania_restore_check" >/dev/null
echo "restauração verificada"
