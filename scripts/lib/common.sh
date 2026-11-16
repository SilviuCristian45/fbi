#!/usr/bin/env bash
# ============================================================================
# Functii comune pentru scripturile din scripts/. Se include cu:
#   source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
#
# Ofera: mesaje colorate, selectia mediului (dev/prod), wrapper `compose`,
# citirea sigura a fisierului .env, validarea .env.prod, asteptarea
# healthcheck-urilor, confirmari interactive.
# ============================================================================

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Git Bash pe Windows: nu lasam MSYS sa "traduca" caile din argumente
# (ex. /backup din containere); caile de pe host le convertim explicit.
export MSYS_NO_PATHCONV=1

# Cale de pe host in formatul inteles de docker (pe Windows: D:/fbi/...)
host_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "$1"
  else
    printf '%s' "$1"
  fi
}

ROOT_DIR_HOST="$(host_path "$ROOT_DIR")"

# --- Mesaje -----------------------------------------------------------------
if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
  C_BLUE=$'\033[34m'; C_BOLD=$'\033[1m'; C_RESET=$'\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_BOLD=''; C_RESET=''
fi

info() { printf '%s==>%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
ok()   { printf '%s OK%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%sATENTIE:%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
err()  { printf '%sEROARE:%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; }
die()  { err "$*"; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Lipseste comanda '$1'. ${2:-}"
}

require_docker() {
  require_cmd docker "Instaleaza Docker (pe VPS: scripts/setup-vps.sh)."
  docker info >/dev/null 2>&1 || die "Docker nu raspunde. Porneste daemon-ul Docker (sau verifica daca userul e in grupul docker)."
  docker compose version >/dev/null 2>&1 || die "Lipseste pluginul 'docker compose' (v2)."
}

# --- Mediu (dev / prod) -------------------------------------------------------
# use_env dev|prod  -> seteaza STACK_ENV, ENV_FILE, OVERLAY_FILES si verifica
# ca fisierul env exista (altfel opreste scriptul cu instructiuni).
#   dev : base + build + dev (imaginile se construiesc local)
#   prod: base + prod (fara build; IMAGE_TAG vine din RELEASE_FILE)
# Pentru teste locale se pot suprascrie PROD_ENV_FILE si RELEASE_FILE.
use_env() {
  STACK_ENV="$1"
  case "$STACK_ENV" in
    dev)
      ENV_FILE="$ROOT_DIR/.env"
      ENV_EXAMPLE=".env.example"
      OVERLAY_FILES=(docker-compose.build.yml docker-compose.dev.yml)
      RELEASE_FILE=""
      ;;
    prod)
      ENV_FILE="${PROD_ENV_FILE:-$ROOT_DIR/.env.prod}"
      ENV_EXAMPLE=".env.prod.example"
      OVERLAY_FILES=(docker-compose.prod.yml)
      RELEASE_FILE="${RELEASE_FILE:-$ROOT_DIR/.env.release}"
      ;;
    *) die "Mediu necunoscut: $STACK_ENV (dev|prod)" ;;
  esac
  if [[ ! -f "$ENV_FILE" ]]; then
    die "Lipseste $(basename "$ENV_FILE"). Creeaza-l din exemplu si completeaza valorile:
      cp $ENV_EXAMPLE $(basename "$ENV_FILE")"
  fi
}

# Wrapper peste `docker compose` cu fisierele mediului curent.
# In prod adauga RELEASE_FILE (IMAGE_TAG) ca al doilea --env-file, daca exista.
compose() {
  local args=(--project-directory "$ROOT_DIR_HOST" -f "$ROOT_DIR_HOST/docker-compose.yaml") f
  for f in "${OVERLAY_FILES[@]}"; do
    args+=(-f "$ROOT_DIR_HOST/$f")
  done
  args+=(--env-file "$(host_path "$ENV_FILE")")
  if [[ -n "${RELEASE_FILE:-}" && -f "$RELEASE_FILE" ]]; then
    args+=(--env-file "$(host_path "$RELEASE_FILE")")
  fi
  docker compose "${args[@]}" "$@"
}

# Numele proiectului compose (prefixul volumelor/containerelor)
project_name() {
  compose config 2>/dev/null | sed -n 's/^name: *//p' | head -n1
}

# env_get CHEIE [FISIER] -> valoarea din ENV_FILE (sau FISIER), fara a executa
# fisierul (valorile pot contine caractere speciale). Ultima aparitie castiga,
# ca la docker compose. Elimina CR (fisiere editate pe Windows) si ghilimele.
env_get() {
  local key="$1" file="${2:-$ENV_FILE}" line val
  [[ -f "$file" ]] || return 0
  line="$(grep -E "^[[:space:]]*${key}=" "$file" | tail -n1 || true)"
  [[ -z "$line" ]] && return 0
  val="${line#*=}"
  val="${val%$'\r'}"
  if [[ "$val" == \"*\" || "$val" == \'*\' ]]; then
    val="${val:1:${#val}-2}"
  else
    val="${val%%[[:space:]]#*}"
    val="${val%"${val##*[![:space:]]}"}"
  fi
  printf '%s' "$val"
}

# Validari pentru .env.prod (folosite de prod-deploy, init-ssl, release-build)
validate_prod_env() {
  local domain placeholders minio_pass
  domain="$(env_get DOMAIN)"
  [[ -n "$domain" ]] || die "DOMAIN lipseste din .env.prod."
  if [[ "$domain" == "example.com" || "$domain" == *".example.com" ]]; then
    die "DOMAIN este inca '$domain' (placeholder). Seteaza domeniul real in .env.prod."
  fi
  if [[ ! "$domain" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ || "$domain" != *.* ]]; then
    die "DOMAIN invalid: '$domain'. Doar numele (ex. app.domeniu.ro), fara https:// si fara slash."
  fi
  placeholders="$(grep -E '^[A-Za-z0-9_]+=.*CHANGE_ME' "$ENV_FILE" | sed 's/=.*//' | tr '\n' ' ' || true)"
  [[ -z "$placeholders" ]] || die "Valori necompletate (CHANGE_ME) in .env.prod: $placeholders"
  minio_pass="$(env_get MINIO_ROOT_PASSWORD)"
  (( ${#minio_pass} >= 8 )) || die "MINIO_ROOT_PASSWORD trebuie sa aiba minim 8 caractere."
  if [[ "$(uname -s)" == Linux ]]; then
    local perms
    perms="$(stat -c '%a' "$ENV_FILE")"
    [[ "$perms" =~ [0-7][0-7]0$ ]] || warn ".env.prod e lizibil de alti useri (permisiuni $perms). Recomandat: chmod 600 .env.prod"
  fi
}

# --- Imagini proprii / release -------------------------------------------------
# Serviciile cu imagine construita de noi (pe PC); restul se descarca din registry.
# shellcheck disable=SC2034  # folosite de scripturile care includ acest fisier
OWN_SERVICES=(backend frontend python-ai file-api nginx)
# shellcheck disable=SC2034
THIRD_PARTY_SERVICES=(db keycloak rabbitmq minio certbot)

image_prefix() {
  local p
  p="$(env_get IMAGE_PREFIX)"
  printf '%s' "${p:-fbi}"
}

# own_image SERVICIU TAG -> ${IMAGE_PREFIX}/SERVICIU:TAG
own_image() {
  printf '%s/%s:%s' "$(image_prefix)" "$1" "$2"
}

# release_tag_from_git ALLOW_DIRTY -> tag-ul imaginilor pentru commit-ul curent:
# <sha-scurt>, sau <sha-scurt>-dirty daca exista modificari (inclusiv fisiere
# netracked, care pot ajunge in contextul de build) si ALLOW_DIRTY=1.
# Se apeleaza ca TAG="$(release_tag_from_git 0)"; esueaza pe working tree murdar.
# (set -e nu se aplica in $(...), deci erorile se verifica explicit; fara
# `git -C`: cu MSYS_NO_PATHCONV, git pentru Windows nu intelege /e/... )
release_tag_from_git() {
  local sha changes
  sha="$(cd "$ROOT_DIR" && git rev-parse --short=7 HEAD)" && [[ -n "$sha" ]] \
    || { err "Nu pot citi commit-ul curent (git rev-parse)."; return 1; }
  changes="$(cd "$ROOT_DIR" && git status --porcelain)" \
    || { err "git status a esuat."; return 1; }
  if [[ -z "$changes" ]]; then
    printf '%s' "$sha"
  elif [[ "${1:-0}" == 1 ]]; then
    warn "Working tree murdar (--allow-dirty): tag $sha-dirty, NU corespunde unui commit."
    printf '%s-dirty' "$sha"
  else
    err "Working tree-ul nu e curat; tag-ul $sha nu ar corespunde codului din imagini:"
    printf '%s\n' "$changes" | sed 's/^/    /' >&2
    err "Fa commit (sau stash), ori foloseste --allow-dirty doar pentru teste."
    return 1
  fi
}

# Dimensiune in octeti -> text (ex. 412.3 MB)
human_size() {
  awk -v b="$1" 'BEGIN { split("B KB MB GB TB", u); i = 1; while (b >= 1000 && i < 5) { b /= 1000; i++ }; printf (i == 1 ? "%d %s" : "%.1f %s"), b, u[i] }'
}

# Tag-ul curent / anterior din RELEASE_FILE (gol daca nu exista)
release_tag()          { env_get IMAGE_TAG "$RELEASE_FILE"; }
release_previous_tag() { env_get IMAGE_TAG_PREVIOUS "$RELEASE_FILE"; }

# write_release TAG PREVIOUS -> rescrie RELEASE_FILE atomic
write_release() {
  local tmp="$RELEASE_FILE.tmp"
  {
    echo "# Generat de scripts/release-push.sh / rollback.sh. Nu edita manual."
    echo "IMAGE_TAG=$1"
    echo "IMAGE_TAG_PREVIOUS=$2"
  } > "$tmp"
  mv "$tmp" "$RELEASE_FILE"
}

# Platforma docker pentru iesirea lui `uname -m`
platform_for_arch() {
  case "$1" in
    x86_64|amd64) echo linux/amd64 ;;
    aarch64|arm64) echo linux/arm64 ;;
    armv7l) echo linux/arm/v7 ;;
    *) echo "unknown/$1" ;;
  esac
}

# Amprenta continutului unei imagini: layerele necomprimate (diffID) + config-ul
# relevant (Env, Cmd, Entrypoint, Labels - labelul revision contine commit-ul).
# Nu depinde de image store (containerd pe Docker Desktop, overlay2 clasic pe
# VPS), spre deosebire de .Id. Acelasi format se calculeaza si pe VPS (prin ssh).
# shellcheck disable=SC2016
FINGERPRINT_FORMAT='{{json .RootFS.Layers}}{{json .Config.Env}}{{json .Config.Cmd}}{{json .Config.Entrypoint}}{{json .Config.Labels}}'
# Scriptul (bash -s) care afiseaza "imagine amprenta" (sau "imagine -" daca lipseste)
# pentru fiecare argument; $1 = formatul. Ruleaza local sau pe VPS.
# shellcheck disable=SC2016
FINGERPRINT_SCRIPT='fmt="$1"; shift
for i in "$@"; do
  if f="$(docker image inspect -f "$fmt" "$i" 2>/dev/null)"; then
    printf "%s %s\n" "$i" "$(printf "%s" "$f" | tr -d "\r" | sha256sum | cut -c1-16)"
  else
    printf "%s -\n" "$i"
  fi
done'
image_fingerprints() {
  bash -c "$FINGERPRINT_SCRIPT" _ "$FINGERPRINT_FORMAT" "$@"
}

# --- SSH spre VPS (release-push, push-face-index) -------------------------------
# SSH_TARGET (user@host) si SSH_OPTS se seteaza de scripturi.
# ssh_run CMD ARGS... -> ruleaza comanda pe VPS cu argumentele citate corect.
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)
ssh_run() {
  # shellcheck disable=SC2029  # argumentele sunt citate intentionat local (%q)
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "$(printf '%q ' "$@")"
}
# ssh_script SCRIPT ARGS... -> trimite SCRIPT pe stdin la `bash -s` pe VPS
ssh_script() {
  local script="$1"; shift
  # shellcheck disable=SC2029
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "bash -s -- $(printf '%q ' "$@")" <<<"$script"
}
# ssh_in_dir DIR CMD... -> ruleaza o linie de comanda in directorul proiectului
# (CMD e o singura linie shell; folosita pentru scripturile din repo).
ssh_in_dir() {
  local dir="$1"; shift
  # shellcheck disable=SC2029
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "cd $(printf '%q' "$dir") && $*"
}

# --- Starea containerelor -----------------------------------------------------
# service_state SERVICIU -> "status|health|restarts" (ex. running|healthy|0)
# sau "missing" daca nu exista container.
service_state() {
  local cid
  cid="$(compose ps -a -q "$1" 2>/dev/null | head -n1)"
  if [[ -z "$cid" ]]; then
    echo "missing"
    return
  fi
  docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}' "$cid" 2>/dev/null || echo "missing"
}

# wait_healthy TIMEOUT_SEC [SERVICII...]
# Asteapta ca serviciile (implicit toate cele cu container) sa fie
# running + healthy (sau running, daca nu au healthcheck).
# Esueaza la timeout sau daca un container repornieste in bucla.
WAIT_FAILED=()
# shellcheck disable=SC2034  # WAIT_FAILED e citit de scripturile care includ acest fisier
wait_healthy() {
  local timeout="$1"; shift
  local services=("$@")
  if (( ${#services[@]} == 0 )); then
    mapfile -t services < <(compose config --services)
  fi
  local start=$SECONDS last_print=-100
  while :; do
    local pending=() crashed=() s state status health restarts
    for s in "${services[@]}"; do
      state="$(service_state "$s")"
      if [[ "$state" == missing ]]; then
        pending+=("$s(fara container)")
        continue
      fi
      IFS='|' read -r status health restarts <<<"$state"
      if (( restarts >= 3 )); then
        crashed+=("$s(a repornit de ${restarts} ori)")
      elif [[ "$status" == exited || "$status" == dead ]]; then
        crashed+=("$s($status)")
      elif [[ "$status" != running ]]; then
        pending+=("$s($status)")
      elif [[ "$health" == starting || "$health" == unhealthy ]]; then
        pending+=("$s($health)")
      fi
    done
    if (( ${#crashed[@]} > 0 )); then
      WAIT_FAILED=("${crashed[@]%%(*}")
      err "Servicii cazute: ${crashed[*]}"
      return 1
    fi
    if (( ${#pending[@]} == 0 )); then
      ok "Toate serviciile sunt pornite si sanatoase ($((SECONDS - start))s)."
      return 0
    fi
    if (( SECONDS - start >= timeout )); then
      WAIT_FAILED=("${pending[@]%%(*}")
      err "Timeout dupa ${timeout}s. Inca nepregatite: ${pending[*]}"
      return 1
    fi
    if (( SECONDS - last_print >= 15 )); then
      info "Astept ($((SECONDS - start))s): ${pending[*]}"
      last_print=$SECONDS
    fi
    sleep 3
  done
}

# Afiseaza ultimele linii de log pentru serviciile date
show_logs() {
  local s
  for s in "$@"; do
    printf '\n%s----- ultimele loguri: %s -----%s\n' "$C_BOLD" "$s" "$C_RESET" >&2
    compose logs --no-color --tail=60 "$s" >&2 || true
  done
}

# Nginx rezolva numele upstream-urilor doar la (re)incarcare. Dupa ce
# recream backend/frontend/file-api/keycloak/minio, IP-urile se pot schimba,
# asa ca facem reload (fara downtime).
reload_nginx() {
  if [[ "$(service_state nginx)" == running* ]]; then
    compose exec -T nginx nginx -s reload >/dev/null 2>&1 \
      && ok "nginx reincarcat." \
      || warn "Reload nginx a esuat (verifica: compose logs nginx)."
  fi
}

# --- Index facial ---------------------------------------------------------------
# Starea indexului fata de setul asteptat, calculata de python-ai (/index-status,
# aceeasi regula de selectie ca sync-ul: SYNC_MAX_PERSONS). Seteaza:
#   FI_INDEX    vectori in index
#   FI_EXPECTED unitati asteptate (persoane; poze daca SYNC_MAX_PERSONS=0)
#   FI_ORPHANS  vectori in afara setului asteptat
#   FI_MISSING  unitati asteptate fara vector (nu din cauza lipsei fetei)
#   FI_NOFACE   unitati fara nicio poza cu fata detectabila (normal, nu se reincearca)
#   FI_DB       poze in "WantedImages"
#   FI_MAX      SYNC_MAX_PERSONS (0 = fara limita)
#   FI_PERSONS / FI_UNCLASSIFIED  persoane in DB / fara poster_classification
# Intoarce 1 daca python-ai (API-ul) sau DB-ul nu raspund.
face_index_stats() {
  FI_INDEX=""; FI_EXPECTED=0; FI_ORPHANS=0; FI_MISSING=0; FI_NOFACE=0; FI_DB=0; FI_MAX=0
  FI_PERSONS=0; FI_UNCLASSIFIED=0
  read -r FI_INDEX FI_EXPECTED FI_ORPHANS FI_MISSING FI_NOFACE FI_DB FI_MAX FI_PERSONS FI_UNCLASSIFIED < <(
    compose exec -T python-ai python -c 'import json, urllib.request as r
d = json.load(r.urlopen("http://127.0.0.1:8006/index-status", timeout=30))
print(d["indexed"], d["expected"], d["orphans"], d["missing"], d["no_face"], d["db_images"], d["max_persons"],
      d.get("persons_total", 0), d.get("persons_unclassified", 0))' \
      2>/dev/null | tr -d '\r'
  ) || true
  [[ "$FI_INDEX" =~ ^[0-9]+$ ]]
}

# De ce nu exista candidati la indexare (FI_DB == 0), pentru mesaje
face_index_no_candidates() {
  if (( FI_PERSONS == 0 )); then
    printf '"WantedImages" e goala: importul FBI (scraper-ul din backend) nu s-a terminat'
  elif (( FI_UNCLASSIFIED == FI_PERSONS )); then
    printf 'persoanele nu au poster_classification (importate inainte de coloana noua): reporneste backend-ul cu SCRAPER_RUN_AT_STARTUP=always'
  else
    printf 'nicio persoana nu corespunde SYNC_INCLUDE_CLASSIFICATIONS'
  fi
}

# Descrierea setului asteptat, pentru mesaje
face_index_scope() {
  if (( FI_MAX > 0 )); then
    printf '%s persoane asteptate (SYNC_MAX_PERSONS=%s)' "$FI_EXPECTED" "$FI_MAX"
  else
    printf '%s poze asteptate (fara limita)' "$FI_EXPECTED"
  fi
}

# Avertisment (nu blocheaza) daca indexul facial nu corespunde setului asteptat.
# $1 = optiunile de pasat lui sync-faces.sh in mesaj (ex. "--dev")
check_face_index() {
  local sync="scripts/sync-faces.sh${1:+ $1}" noface=""
  if [[ "$(service_state python-ai)" != running* ]]; then
    warn "python-ai nu ruleaza; sar peste verificarea indexului facial."
    return 0
  fi
  if ! face_index_stats; then
    warn "Nu am putut verifica indexul facial (python-ai /index-status sau DB). Verifica mai tarziu: scripts/healthcheck.sh${1:+ $1}"
    return 0
  fi
  (( FI_NOFACE > 0 )) && noface=" ($FI_NOFACE fara fata detectabila)"
  if (( FI_DB == 0 )); then
    warn "Nicio poza de indexat: $(face_index_no_candidates). Apoi ruleaza: $sync --full"
  elif (( FI_INDEX == 0 )); then
    warn "Indexul facial e gol: recunoasterea nu va gasi potriviri. Ruleaza: $sync --full"
  elif (( FI_ORPHANS > 0 || FI_MISSING > 0 )); then
    warn "Indexul facial nu corespunde setului asteptat ($(face_index_scope)): $FI_ORPHANS vectori in afara setului, $FI_MISSING fara vector${noface}. Ruleaza: $sync"
  else
    ok "Index facial: $FI_INDEX vectori, $(face_index_scope)${noface}."
  fi
}

# --- Confirmari ---------------------------------------------------------------
# confirm "mesaj" "cuvant" -> cere utilizatorului sa scrie exact "cuvant".
# ASSUME_YES=1 (optiunea --yes) sare peste intrebare.
confirm() {
  local prompt="$1" expected="${2:-yes}" answer
  [[ "${ASSUME_YES:-0}" == 1 ]] && return 0
  [[ -t 0 ]] || die "E nevoie de confirmare, dar stdin nu e interactiv. Ruleaza cu --yes daca esti sigur."
  printf '%s%s%s\n' "$C_YELLOW" "$prompt" "$C_RESET"
  read -r -p "Scrie '$expected' pentru a continua: " answer
  [[ "$answer" == "$expected" ]] || die "Anulat."
}
