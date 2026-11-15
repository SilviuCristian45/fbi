#!/usr/bin/env bash
# Update in productie: git pull + rebuild/restart doar pentru serviciile
# ale caror fisiere s-au schimbat.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/prod-update.sh [optiuni]

Face `git pull --ff-only`, compara commit-ul vechi cu cel nou si
reconstruieste/reporneste doar serviciile afectate:
  fbi-backend/              -> backend
  fbi-frontend/             -> frontend
  face-recog-microservice/  -> python-ai
  fbi-media-service/        -> file-api
  nginx/                    -> nginx
  docker-compose*.y*ml      -> tot stack-ul (compose recreeaza ce s-a schimbat)
Schimbarile din scripts/, docs/ si *.md nu repornesc nimic.

Atentie: .env.prod nu e in git. Dupa ce il editezi ruleaza
scripts/prod-deploy.sh (sau prod-update.sh --all).

Optiuni:
  --all           reconstruieste si reporneste tot stack-ul
  --no-pull       nu face git pull; compara cu --since <commit>
  --since REF     commit-ul de referinta (implicit HEAD dinainte de pull)
  --dry-run       doar afiseaza ce ar face
  --timeout SEC   cat sa astepte healthcheck-urile (implicit 900)
  -h, --help      acest mesaj
USAGE
}

ALL=0; PULL=1; SINCE=""; DRY=0; TIMEOUT=900
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) ALL=1 ;;
    --no-pull) PULL=0 ;;
    --since) SINCE="${2:?--since cere un commit}"; shift ;;
    --dry-run) DRY=1 ;;
    --timeout) TIMEOUT="${2:?--timeout cere o valoare}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Optiune necunoscuta: $1 (vezi --help)" ;;
  esac
  shift
done

require_docker
require_cmd git
use_env prod
validate_prod_env
cd "$ROOT_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  die "Exista modificari locale in fisierele din git (git status). Nu fac pull peste ele."
fi

OLD="$(git rev-parse HEAD)"
[[ -n "$SINCE" ]] && OLD="$(git rev-parse "$SINCE")"
if (( PULL )) && (( DRY )); then
  # Dry run: doar fetch, comparam cu branch-ul remote urmarit
  git fetch --quiet
  NEW="$(git rev-parse '@{u}')"
elif (( PULL )); then
  info "git pull --ff-only..."
  git pull --ff-only
  NEW="$(git rev-parse HEAD)"
else
  NEW="$(git rev-parse HEAD)"
fi

declare -A TARGETS=()
FULL=$ALL
if [[ "$OLD" != "$NEW" ]]; then
  info "Schimbari ${OLD:0:8}..${NEW:0:8}:"
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    printf '    %s\n' "$f"
    case "$f" in
      fbi-backend/*) TARGETS[backend]=1 ;;
      fbi-frontend/*) TARGETS[frontend]=1 ;;
      face-recog-microservice/*) TARGETS[python-ai]=1 ;;
      fbi-media-service/*) TARGETS[file-api]=1 ;;
      nginx/*) TARGETS[nginx]=1 ;;
      docker-compose.yaml|docker-compose.prod.yml) FULL=1 ;;
      keycloak/realm-export.json)
        warn "realm-export.json s-a schimbat. Importul ruleaza doar daca realm-ul NU exista:
         aplica modificarile manual in consola Keycloak (vezi docs/prod)." ;;
      postgres-init/*)
        warn "postgres-init/ s-a schimbat. Scriptul ruleaza doar pe un volum Postgres gol." ;;
    esac
  done < <(git diff --name-only "$OLD" "$NEW")
elif (( ! ALL )); then
  ok "Nicio schimbare (HEAD ${NEW:0:8}). Nimic de facut."
  exit 0
fi

if (( FULL )); then
  plan="tot stack-ul (up -d --build)"
elif (( ${#TARGETS[@]} > 0 )); then
  plan="${!TARGETS[*]}"
else
  ok "Nicio schimbare care sa necesite rebuild."
  exit 0
fi
info "De reconstruit/repornit: $plan"
(( DRY )) && { ok "Dry run: nu am schimbat nimic."; exit 0; }

if (( FULL )); then
  compose up -d --build --remove-orphans
  wait_ok=0; wait_healthy "$TIMEOUT" || wait_ok=$?
  failed=("${WAIT_FAILED[@]}")
else
  services=("${!TARGETS[@]}")
  compose up -d --build --no-deps "${services[@]}"
  wait_ok=0; wait_healthy "$TIMEOUT" "${services[@]}" || wait_ok=$?
  failed=("${WAIT_FAILED[@]}")
fi
if (( wait_ok != 0 )); then
  show_logs "${failed[@]}"
  die "Update incomplet. Pentru revenire: git checkout ${OLD:0:8} && scripts/prod-update.sh --no-pull --since ${NEW:0:8}"
fi
reload_nginx
compose ps
ok "Update reusit (${OLD:0:8} -> ${NEW:0:8})."
