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

Context, Dockerfile, build args si labels vin din docker-compose.build.yml
(compose config --format json, citit cu Python 3); build-ul e `docker build`
(`docker buildx build --load` pentru alta platforma), nu `compose build`.

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
# Configuratia de build = base + build + prod; IMAGE_TAG vine din shell, nu din .env.release
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

# Sursa de adevar pentru context/Dockerfile/args/labels: docker-compose.build.yml,
# interpolat de compose (base + build + prod, cu variabilele de mai jos).
# Build-ul insusi NU trece prin compose (`compose build` se agata uneori dupa
# ce imaginea e gata): `docker build` direct, cate un serviciu pe rand.
export IMAGE_TAG="$TAG"
GIT_SHA="$(git rev-parse HEAD)"; export GIT_SHA
export PUBLIC_URL="https://$DOMAIN"

PY=""
for c in python3 python; do
  if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import json' >/dev/null 2>&1; then PY="$c"; break; fi
done
[[ -n "$PY" ]] || die "Lipseste Python 3 (folosit pentru a citi configuratia de build din compose config --format json)."

# Linii "serviciu<US>tip<US>cheie<US>valoare" (tip: context, dockerfile, target, arg, label).
# Separator \x1f (unit separator), nu tab: tab-ul e spatiu alb pentru IFS si
# doua tab-uri consecutive (cheie goala) s-ar contopi la `read`.
specs="$(compose config --format json | "$PY" -c '
import json, sys
services = json.load(sys.stdin)["services"]
for name in sys.argv[1:]:
    b = services.get(name, {}).get("build")
    if not b:
        sys.exit("Serviciul %s nu are build in docker-compose.build.yml" % name)
    rows = [("context", "", b["context"]), ("dockerfile", "", b.get("dockerfile") or "Dockerfile")]
    if b.get("target"):
        rows.append(("target", "", b["target"]))
    for kind, key in (("arg", "args"), ("label", "labels")):
        rows += [(kind, k, "" if v is None else str(v)) for k, v in (b.get(key) or {}).items()]
    for kind, k, v in rows:
        if "\x1f" in v or "\n" in v:
            sys.exit("Valoare nesuportata (newline) pentru %s.%s" % (name, k))
        print("\x1f".join((name, kind, k, v)))
' "${OWN_SERVICES[@]}" | tr -d '\r')" || die "Nu pot citi configuratia de build (docker compose config)."

# --progress=plain si stdin din /dev/null: fara ele, clientul docker build
# ramanea uneori agatat dupa ce imaginea era gata (rulare fara terminal).
if [[ "$PLATFORM" != "$LOCAL_PLATFORM" ]]; then
  builder=(docker buildx build --progress=plain --platform "$PLATFORM" --load)
else
  builder=(docker build --progress=plain --platform "$PLATFORM")
fi
(( NO_CACHE )) && builder+=(--no-cache)

start=$SECONDS
for s in "${OWN_SERVICES[@]}"; do
  img="$(own_image "$s" "$TAG")"
  context=""; dockerfile=""; extra=()
  while IFS=$'\x1f' read -r svc kind key val; do
    [[ "$svc" == "$s" ]] || continue
    case "$kind" in
      context) context="$val" ;;
      dockerfile) dockerfile="$val" ;;
      target) extra+=(--target "$val") ;;
      arg) extra+=(--build-arg "$key=$val") ;;
      label) extra+=(--label "$key=$val") ;;
    esac
  done <<<"$specs"
  [[ -n "$context" ]] || die "Lipseste contextul de build pentru $s."
  # Dockerfile relativ la context (ca in compose), daca nu e absolut
  [[ "$dockerfile" == /* || "$dockerfile" =~ ^[A-Za-z]: ]] || dockerfile="$context/$dockerfile"
  info "Construiesc $img pentru $PLATFORM..."
  s_start=$SECONDS
  "${builder[@]}" -t "$img" -f "$dockerfile" "${extra[@]}" "$context" </dev/null     || die "Build-ul $s a esuat."
  ok "$img ($((SECONDS - s_start))s)"
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
