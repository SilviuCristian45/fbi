#!/usr/bin/env bash
# Afiseaza logurile stack-ului de dezvoltare.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/dev-logs.sh [optiuni] [serviciu...]

Urmareste logurile (Ctrl+C pentru iesire). Fara servicii = toate.
Servicii: db keycloak rabbitmq minio backend frontend python-ai file-api nginx

Optiuni:
  --tail N       cate linii anterioare sa afiseze (implicit 200)
  --no-follow    afiseaza si iese, fara urmarire
  -h, --help     acest mesaj
USAGE
}

TAIL=200; FOLLOW=1; SERVICES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tail) TAIL="${2:?--tail cere o valoare}"; shift ;;
    --no-follow) FOLLOW=0 ;;
    -h|--help) usage; exit 0 ;;
    -*) die "Optiune necunoscuta: $1 (vezi --help)" ;;
    *) SERVICES+=("$1") ;;
  esac
  shift
done

require_docker
use_env dev
args=(logs --tail="$TAIL")
(( FOLLOW )) && args+=(-f)
compose "${args[@]}" "${SERVICES[@]}"
