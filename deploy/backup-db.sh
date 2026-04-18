#!/usr/bin/env bash
# Backup do PostgreSQL (producao com Docker Compose).
# Uso na VPS, na raiz do repositorio (onde esta docker-compose.prod.yml):
#   chmod +x deploy/backup-db.sh
#   ./deploy/backup-db.sh
#
# Variaveis opcionais:
#   COMPOSE_FILE   default: docker-compose.prod.yml
#   BACKUP_DIR     default: ./backups (relativo a raiz do projeto)
#   RETENTION_DAYS default: 14 — remove .sql.gz mais antigos nesta pasta

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

OUT="$BACKUP_DIR/pizzaria-db-${TIMESTAMP}.sql.gz"

if ! docker compose -f "$COMPOSE_FILE" ps --status running -q db >/dev/null 2>&1; then
  echo "Erro: container do servico 'db' nao esta em execucao. Suba o stack antes." >&2
  exit 1
fi

docker compose -f "$COMPOSE_FILE" exec -T db \
  sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' | gzip >"$OUT"

echo "Backup concluido: $OUT"

if [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] && [[ "$RETENTION_DAYS" -gt 0 ]]; then
  find "$BACKUP_DIR" -maxdepth 1 -name 'pizzaria-db-*.sql.gz' -type f -mtime "+${RETENTION_DAYS}" -delete 2>/dev/null || true
fi
