#!/usr/bin/env bash
# Na VPS: cd /opt/sistema-pizzaria && ./deploy/vps-compose.sh
# Sem argumentos: sobe o stack com build. Com argumentos: repassa ao docker compose.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
COMPOSE=(docker compose -f docker-compose.prod.yml)
if [[ $# -eq 0 ]]; then
  exec "${COMPOSE[@]}" up -d --build
else
  exec "${COMPOSE[@]}" "$@"
fi
