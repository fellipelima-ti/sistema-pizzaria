#!/usr/bin/env bash
# Na VPS: cd /opt/sistema-pizzaria && ./deploy/vps-compose.sh
#
# Sem argumentos     → up -d --build (rebuild com cache do Docker)
# fresh              → rebuild SEM cache da api e web + recria containers (use quando o site não mudar)
# qualquer outro     → repassa ao docker compose -f docker-compose.prod.yml
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f docker-compose.prod.yml)
if [[ $# -eq 0 ]]; then
  exec "${COMPOSE[@]}" up -d --build
elif [[ "${1:-}" == "fresh" ]]; then
  "${COMPOSE[@]}" build --no-cache api web
  exec "${COMPOSE[@]}" up -d --force-recreate api web caddy
else
  exec "${COMPOSE[@]}" "$@"
fi
