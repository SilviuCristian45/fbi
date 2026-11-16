#!/usr/bin/env bash
# Construieste PE PC imaginile proprii pentru productie, etichetate cu commit-ul
# curent: ${IMAGE_PREFIX}/<serviciu>:<git-sha-scurt>. Pe VPS nu se construieste
# nimic; imaginile se trimit apoi cu scripts/release-push.sh.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/release-build.sh [optiuni]

Ruleaza pe PC (Git Bash / Linux), NU pe VPS.

Pasi:
  1. verifica .env.prod LOCAL (DOMAIN real, fara CHANGE_ME): DOMAIN si
     API_KEY_SHARED se coc in frontend (NEXT_PUBLIC_*), deci trebuie sa fie
     aceleasi ca in .env.prod de pe VPS
  2. verifica working tree-ul git (curat = tag-ul corespunde codului)
  3. construieste, pe rand, backend, frontend, python-ai, file-api, nginx
     pentru TARGET_PLATFORM (implicit linux/amd64; buildx daca difera de PC)
  4. afiseaza dimensiunile imaginilor

Tag: <git-sha-scurt> (ex. fbi/backend:1a2b3c4); cu --allow-dirty: <sha>-dirty.

Optiuni:
  --allow-dirty     construieste si cu modificari necommise (DOAR pentru teste)
  --measure         afiseaza si dimensiunea gzip (cat se trimite la primul push)
  --no-cache        build fara cache
  --env-file FILE   alt fisier in loc de .env.prod (teste)
  -h, --help        acest mesaj

Variabile: TARGET_PLATFORM (sau din .env.prod), IMAGE_PREFIX (din .env.prod,
implicit fbi). Imaginile se construiesc una cate una (fara build-uri paralele).

Urmatorul pas: scripts/release-push.sh user@vps [cale-proiect]
USAGE
}

ALLOW_DIRTY=0; MEASURE=0; NO_CACHE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --measure) MEASURE=1 ;;
    --no-cache) NO_CACHE=1 ;;
    --env-file) PROD_ENV_FILE="$(cd "$(dirname "${2:?--env-file cere un fisier}")" && pwd)/$(basename "$2")"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Optiune necunoscuta: $1 (vezi --help)" ;;
  esac
  shift
done

require_docker
require_cmd git
use_env prod
# Build = base + build + prod; IMAGE_TAG vine din shell, nu din .env.release
OVERLAY_FILES=(docker-compose.build.yml docker-compose.prod.yml)
RELEASE_FILE=""

info "Verific $(basename "$ENV_FILE") local..."
validate_prod_env
DOMAIN="$(env_get DOMAIN)"
ok "DOMAIN=$DOMAIN (copt in frontend: https://$DOMAIN/api, /hubs/surveillance, /upload)"

cd "$ROOT_DIR"
TAG="$(release_tag_from_git "$ALLOW_DIRTY")"

PLATFORM="${TARGET_PLATFORM:-$(env_get TARGET_PLATFORM)}"
PLATFORM="${PLATFORM:-linux/amd64}"
LOCAL_PLATFORM="linux/$(docker version -f '{{.Server.Arch}}')"
if [[ "$PLATFORM" != "$LOCAL_PLATFORM" ]]; then
  docker buildx version >/dev/null 2>&1 || die "Platforma $PLATFORM difera de cea locala ($LOCAL_PLATFORM) si lipseste docker buildx."
  warn "Build cross-platform $LOCAL_PLATFORM -> $PLATFORM prin buildx (emulare QEMU, mult mai lent)."
fi

export IMAGE_TAG="$TAG"
GIT_SHA="$(git rev-parse HEAD)"; export GIT_SHA
export PUBLIC_URL="https://$DOMAIN"
export DOCKER_DEFAULT_PLATFORM="$PLATFORM"

compose config -q || die "docker compose config a esuat (vezi eroarea de mai sus)."

build_args=(build)
(( NO_CACHE )) && build_args+=(--no-cache)
start=$SECONDS
# Cate un serviciu pe rand: `compose build` cu mai multe servicii trece prin
# `buildx bake`, care le construieste in paralel (ignora COMPOSE_PARALLEL_LIMIT).
for s in "${OWN_SERVICES[@]}"; do
  info "Construiesc $(own_image "$s" "$TAG") pentru $PLATFORM..."
  compose "${build_args[@]}" "$s"
done
ok "Build terminat in $((SECONDS - start))s."

echo
printf '%s%-38s %-14s %10s' "$C_BOLD" "IMAGINE" "PLATFORMA" "DIMENSIUNE"
(( MEASURE )) && printf ' %10s' "GZIP"
printf '%s\n' "$C_RESET"
total=0; total_gz=0
for s in "${OWN_SERVICES[@]}"; do
  img="$(own_image "$s" "$TAG")"
  docker image inspect "$img" >/dev/null 2>&1 || die "Lipseste imaginea $img dupa build."
  plat="$(docker image inspect -f '{{.Os}}/{{.Architecture}}' "$img")"
  [[ "$plat" == "$PLATFORM" ]] || die "$img are platforma $plat, nu $PLATFORM."
  size="$(docker image inspect -f '{{.Size}}' "$img")"
  total=$((total + size))
  printf '%-38s %-14s %10s' "$img" "$plat" "$(human_size "$size")"
  if (( MEASURE )); then
    gz="$(docker save --platform "$PLATFORM" "$img" | gzip -c | wc -c | tr -d ' ')"
    total_gz=$((total_gz + gz))
    printf ' %10s' "$(human_size "$gz")"
  fi
  echo
done
printf '%-38s %-14s %10s' "TOTAL" "" "$(human_size "$total")"
(( MEASURE )) && printf ' %10s' "$(human_size "$total_gz")"
echo
echo
ok "Imagini gata: $(image_prefix)/*:$TAG"
info "Urmatorul pas: scripts/release-push.sh user@vps [cale-proiect]   (primul deploy: --with-index)"
