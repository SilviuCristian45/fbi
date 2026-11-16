#!/usr/bin/env bash
# Sterge complet stack-ul de dezvoltare, INCLUSIV datele (volumele).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/dev-reset.sh [optiuni]

Opreste stack-ul de dev si STERGE volumele lui: baza de date (inclusiv
Keycloak), fisierele urcate, cozile RabbitMQ, indexul facial. La urmatorul
dev-up totul porneste de la zero (realm-ul Keycloak se reimporta).
Afecteaza doar proiectul compose din .env (COMPOSE_PROJECT_NAME), nu alte
containere de pe masina.

Optiuni:
  --images     sterge si imaginile construite local (rebuild complet)
  -y, --yes    nu mai cere confirmare
  -h, --help   acest mesaj
USAGE
}

RMI=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --images) RMI=1 ;;
    -y|--yes) export ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Optiune necunoscuta: $1 (vezi --help)" ;;
  esac
  shift
done

require_docker
use_env dev
project="$(project_name)"
[[ -n "$project" ]] || die "Nu pot determina numele proiectului compose."

volumes="$(docker volume ls -q --filter "label=com.docker.compose.project=$project" | tr '\n' ' ')"
info "Proiect: $project"
info "Volume care vor fi sterse: ${volumes:-(niciunul)}"
confirm "Toate datele de dev ale proiectului '$project' vor fi sterse definitiv." "reset"

compose down -v --remove-orphans
if (( RMI )); then
  # Imaginile proprii au nume explicit (${IMAGE_PREFIX}/<serviciu>:dev), deci
  # `down --rmi local` nu le-ar sterge; le stergem doar pe ale noastre.
  dev_tag="$(env_get IMAGE_TAG)"
  for s in "${OWN_SERVICES[@]}"; do
    docker image rm "$(own_image "$s" "${dev_tag:-dev}")" >/dev/null 2>&1 && ok "sters $(own_image "$s" "${dev_tag:-dev}")"
  done
fi
ok "Reset complet. Porneste din nou cu: scripts/dev-up.sh"
