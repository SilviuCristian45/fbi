#!/usr/bin/env bash
# Porneste stack-ul de dezvoltare (docker-compose.yaml + docker-compose.dev.yml).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/dev-up.sh [optiuni] [serviciu...]

Construieste imaginile si porneste stack-ul de dev in fundal, apoi asteapta
healthcheck-urile si afiseaza adresele utile. Fara servicii = tot stack-ul.

Optiuni:
  --no-build      nu reconstrui imaginile (doar porneste)
  --no-wait       nu astepta healthcheck-urile
  --timeout SEC   cat sa astepte healthcheck-urile (implicit 900)
  -h, --help      acest mesaj

Exemple:
  scripts/dev-up.sh                  # tot stack-ul
  scripts/dev-up.sh backend          # rebuild + restart doar backend
  scripts/dev-up.sh --no-build

Nota: prima rulare dureaza (imaginea AI cu TensorFlow are cativa GB).
Variabilele NEXT_PUBLIC_* sunt coapte la build: dupa ce schimbi PUBLIC_URL
sau API_KEY_SHARED in .env, ruleaza: scripts/dev-up.sh frontend
USAGE
}

BUILD=1; WAIT=1; TIMEOUT=900; SERVICES=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) BUILD=0 ;;
    --no-wait) WAIT=0 ;;
    --timeout) TIMEOUT="${2:?--timeout cere o valoare}"; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) die "Optiune necunoscuta: $1 (vezi --help)" ;;
    *) SERVICES+=("$1") ;;
  esac
  shift
done

require_docker
use_env dev

args=(up -d --remove-orphans)
(( BUILD )) && args+=(--build)
info "Pornesc stack-ul de dev (proiect: $(env_get COMPOSE_PROJECT_NAME))..."
compose "${args[@]}" "${SERVICES[@]}"

if (( WAIT )); then
  if ! wait_healthy "$TIMEOUT" "${SERVICES[@]}"; then
    show_logs "${WAIT_FAILED[@]}"
    die "Stack-ul nu a pornit complet. Vezi logurile de mai sus sau: scripts/dev-logs.sh <serviciu>"
  fi
fi
(( ${#SERVICES[@]} > 0 )) && reload_nginx

# Doar avertisment: indexul facial fata de "WantedImages"
if (( WAIT )) && { (( ${#SERVICES[@]} == 0 )) || [[ " ${SERVICES[*]} " == *" python-ai "* ]]; }; then
  check_face_index --dev
fi

public_url="$(env_get PUBLIC_URL)"
cat <<INFO

${C_BOLD}Adrese dev:${C_RESET}
  Aplicatia            ${public_url}
  Swagger (backend)    http://localhost:$(env_get DEV_BACKEND_PORT)/swagger
  Keycloak (admin)     http://localhost:$(env_get DEV_KEYCLOAK_PORT)/admin/   (user: $(env_get KEYCLOAK_ADMIN))
  MinIO/Silo consola   http://localhost:$(env_get DEV_MINIO_CONSOLE_PORT)
  RabbitMQ management  http://localhost:$(env_get DEV_RABBITMQ_MGMT_PORT)
  Postgres             localhost:$(env_get DEV_DB_PORT)  (db: $(env_get DB_NAME), user: $(env_get DB_USER))

Loguri: scripts/dev-logs.sh [serviciu]   Oprire: scripts/dev-down.sh
INFO
