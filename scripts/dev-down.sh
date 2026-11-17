#!/usr/bin/env bash
# Opreste stack-ul de dezvoltare. Volumele (datele) raman.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/dev-down.sh [-h|--help]

Opreste si sterge containerele stack-ului de dev. Datele (Postgres, MinIO,
RabbitMQ, indexul facial) raman in volume. Pentru a sterge si datele:
scripts/dev-reset.sh
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    *) die "Optiune necunoscuta: $1 (vezi --help)" ;;
  esac
done

require_docker
use_env dev
info "Opresc stack-ul de dev..."
compose down --remove-orphans
ok "Stack oprit. Datele au ramas in volume."
