#!/usr/bin/env bash
# Trimite de pe PC pe VPS imaginile construite de release-build.sh (doar pe cele
# care lipsesc sau difera) si ruleaza prod-deploy.sh acolo.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/release-push.sh <user@vps> [cale-proiect-pe-vps] [optiuni]

Ruleaza pe PC (Git Bash / Linux), dupa scripts/release-build.sh.
cale-proiect-pe-vps: checkout-ul git de pe VPS, relativ la home sau absolut
(implicit: fbi, adica ~/fbi).

Pasi:
  1. verifica imaginile locale ${IMAGE_PREFIX}/*:<tag> (tag = commit-ul curent)
  2. verifica arhitectura VPS-ului (uname -m) fata de TARGET_PLATFORM
  3. verifica checkout-ul de pe VPS: daca nu e la acelasi commit, propune
     `git fetch && git checkout <sha>` acolo (commit-ul trebuie sa fie pe remote)
  4. compara imaginile local vs VPS (layere + config) si trimite doar ce
     lipseste/difera: docker save | gzip | ssh 'gunzip | docker load'
  5. optional (--backup): scripts/backup.sh pe VPS, inainte de deploy
  6. pe VPS: scripts/prod-deploy.sh --tag <tag> --prune
     (IMAGE_TAG in .env.release; pastreaza imaginile tag-ului curent si
     anterior, le sterge pe cele mai vechi)
  7. optional (--with-index): scripts/push-face-index.sh

Optiuni:
  --with-index    trimite si indexul facial local (primul deploy)
  --backup        ruleaza scripts/backup.sh pe VPS inainte de deploy
                  (recomandat la orice release cu migrari EF)
  --no-deploy     doar trimite imaginile (fara prod-deploy)
  --allow-dirty   foloseste tag-ul <sha>-dirty (construit cu --allow-dirty)
  --port N        portul SSH (sau configureaza ~/.ssh/config)
  --yes           fara confirmari (inclusiv git checkout pe VPS)
  -h, --help      acest mesaj

Autentificarea SSH trebuie sa fie cu cheie (BatchMode, fara parola).
USAGE
}

SSH_TARGET=""; REMOTE_DIR=""; SSH_PORT=""; WITH_INDEX=0; BACKUP=0; DEPLOY=1; ALLOW_DIRTY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-index) WITH_INDEX=1 ;;
    --backup) BACKUP=1 ;;
    --no-deploy) DEPLOY=0 ;;
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --port) SSH_PORT="${2:?--port cere o valoare}"; SSH_OPTS+=(-p "$SSH_PORT"); shift ;;
    --yes) ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) die "Optiune necunoscuta: $1 (vezi --help)" ;;
    *)
      if [[ -z "$SSH_TARGET" ]]; then SSH_TARGET="$1"
      elif [[ -z "$REMOTE_DIR" ]]; then REMOTE_DIR="$1"
      else die "Prea multe argumente (vezi --help)."
      fi ;;
  esac
  shift
done
[[ -n "$SSH_TARGET" ]] || { usage; exit 1; }
REMOTE_DIR="${REMOTE_DIR:-fbi}"
REMOTE_DIR="${REMOTE_DIR#\~/}"   # ssh porneste din home; "~" nu se expandeaza citat

require_docker
require_cmd git
require_cmd ssh
require_cmd gzip
use_env prod

# --- 1. Imaginile locale ---------------------------------------------------------
cd "$ROOT_DIR"
TAG="$(release_tag_from_git "$ALLOW_DIRTY")"
SHA="$(git rev-parse HEAD)"
PLATFORM="${TARGET_PLATFORM:-$(env_get TARGET_PLATFORM)}"
PLATFORM="${PLATFORM:-linux/amd64}"
IMAGES=()
for s in "${OWN_SERVICES[@]}"; do
  img="$(own_image "$s" "$TAG")"
  docker image inspect "$img" >/dev/null 2>&1 || die "Lipseste local $img. Ruleaza intai: scripts/release-build.sh$( ((ALLOW_DIRTY)) && echo ' --allow-dirty')"
  plat="$(docker image inspect -f '{{.Os}}/{{.Architecture}}' "$img")"
  [[ "$plat" == "$PLATFORM" ]] || die "$img e construita pentru $plat, nu $PLATFORM (TARGET_PLATFORM). Reconstruieste cu release-build.sh."
  IMAGES+=("$img")
done
ok "Imagini locale: $(image_prefix)/*:$TAG ($PLATFORM)"

# --- 2. VPS: conexiune, docker, arhitectura -----------------------------------------
info "Conectare la $SSH_TARGET..."
remote_arch="$(ssh_run uname -m | tr -d '\r')" || die "Nu ma pot conecta prin ssh la $SSH_TARGET (cheie SSH? --port?)."
remote_platform="$(platform_for_arch "$remote_arch")"
[[ "$remote_platform" == "$PLATFORM" ]] || die "VPS-ul e $remote_arch ($remote_platform), imaginile sunt $PLATFORM.
      Seteaza TARGET_PLATFORM=$remote_platform in .env.prod local si ruleaza din nou release-build.sh."
ok "Arhitectura VPS: $remote_arch ($remote_platform)"
ssh_run docker info >/dev/null 2>&1 || die "Docker nu raspunde pe VPS (instalat? userul e in grupul docker? vezi scripts/setup-vps.sh)."

# --- 3. Checkout-ul de pe VPS -------------------------------------------------------
# shellcheck disable=SC2016
remote_state="$(ssh_script '
  cd "$1" 2>/dev/null || { echo "nodir"; exit 0; }
  [ -d .git ] || { echo "nogit"; exit 0; }
  [ -f .env.prod ] || { echo "noenv"; exit 0; }
  printf "%s %s\n" "$(git rev-parse HEAD)" "$(git status --porcelain --untracked-files=no | wc -l)"
' "$REMOTE_DIR" | tr -d '\r')"
case "$remote_state" in
  nodir) die "Pe VPS nu exista directorul $REMOTE_DIR. Cloneaza repo-ul acolo (docs/prod/first-deploy.md)." ;;
  nogit) die "$REMOTE_DIR de pe VPS nu e un checkout git." ;;
  noenv) die "Pe VPS lipseste $REMOTE_DIR/.env.prod (cp .env.prod.example .env.prod)." ;;
esac
read -r remote_sha remote_dirty <<<"$remote_state"
if [[ "$remote_sha" == "$SHA" ]]; then
  ok "Checkout-ul de pe VPS e la commit-ul ${SHA:0:7}."
else
  warn "Checkout-ul de pe VPS e la ${remote_sha:0:7}, imaginile sunt pentru ${SHA:0:7}."
  (( remote_dirty == 0 )) || die "Checkout-ul de pe VPS are $remote_dirty fisiere modificate (git status). Rezolva-le manual inainte."
  if [[ -z "$(git branch -r --contains "$SHA" 2>/dev/null)" ]]; then
    die "Commit-ul ${SHA:0:7} nu e pe niciun branch remote, VPS-ul nu il poate descarca. Fa intai: git push"
  fi
  confirm "Pe VPS: git fetch && git checkout ${SHA:0:7} (compose, nginx/templates si scripturile trebuie sa corespunda imaginilor)." "checkout"
  ssh_in_dir "$REMOTE_DIR" "git fetch --quiet && git checkout --quiet $SHA" || die "git checkout pe VPS a esuat."
  ok "VPS la commit-ul ${SHA:0:7} (detached HEAD)."
fi

# --- 4. Imaginile: doar ce lipseste / difera ---------------------------------------
info "Compar imaginile local vs VPS..."
declare -A LOCAL_FP=() REMOTE_FP=()
while read -r img fp; do LOCAL_FP[$img]="$fp"; done < <(image_fingerprints "${IMAGES[@]}")
while read -r img fp; do REMOTE_FP[$img]="$fp"; done < <(ssh_script "$FINGERPRINT_SCRIPT" "$FINGERPRINT_FORMAT" "${IMAGES[@]}" | tr -d '\r')

TO_SEND=()
for img in "${IMAGES[@]}"; do
  if [[ "${REMOTE_FP[$img]:--}" == "${LOCAL_FP[$img]}" ]]; then
    ok "$img: deja pe VPS"
  else
    [[ "${REMOTE_FP[$img]:--}" == - ]] && printf '    %s: lipseste pe VPS\n' "$img" || printf '    %s: difera pe VPS\n' "$img"
    TO_SEND+=("$img")
  fi
done

HAVE_PV=0
command -v pv >/dev/null 2>&1 && HAVE_PV=1
(( HAVE_PV )) || info "Fara 'pv' nu afisez progresul transferului (doar durata si dimensiunea la final)."
for img in "${TO_SEND[@]}"; do
  size="$(docker image inspect -f '{{.Size}}' "$img")"
  info "Trimit $img (~$(human_size "$size") necomprimat)..."
  start=$SECONDS
  if (( HAVE_PV )); then
    docker save --platform "$PLATFORM" "$img" | pv -N "${img##*/}" -s "$size" | gzip -c \
      | ssh "${SSH_OPTS[@]}" "$SSH_TARGET" 'gunzip | docker load -q'
  else
    docker save --platform "$PLATFORM" "$img" | gzip -c \
      | ssh "${SSH_OPTS[@]}" "$SSH_TARGET" 'gunzip | docker load -q'
  fi
  ok "$img trimisa in $((SECONDS - start))s."
done

if (( ${#TO_SEND[@]} > 0 )); then
  while read -r img fp; do
    [[ "$fp" == "${LOCAL_FP[$img]}" ]] || die "Dupa transfer, $img de pe VPS difera de cea locala ($fp vs ${LOCAL_FP[$img]})."
  done < <(ssh_script "$FINGERPRINT_SCRIPT" "$FINGERPRINT_FORMAT" "${TO_SEND[@]}" | tr -d '\r')
  ok "Imaginile de pe VPS corespund celor locale."
fi

if (( ! DEPLOY )); then
  ok "Imagini trimise (--no-deploy). Pe VPS: cd $REMOTE_DIR && scripts/prod-deploy.sh --tag $TAG --prune"
  exit 0
fi

# --- 5. Backup inainte de deploy -------------------------------------------------
if (( BACKUP )); then
  if [[ "$(ssh_in_dir "$REMOTE_DIR" 'source scripts/lib/common.sh && use_env prod && service_state db' | tr -d '\r')" == running* ]]; then
    info "Backup pe VPS inainte de deploy..."
    ssh_in_dir "$REMOTE_DIR" "scripts/backup.sh" || die "Backup-ul a esuat; nu fac deploy."
  else
    warn "Baza de date nu ruleaza pe VPS (primul deploy?): sar peste backup."
  fi
fi

# --- 6. Deploy ----------------------------------------------------------------------
info "Deploy pe VPS (scripts/prod-deploy.sh --tag $TAG --prune)..."
ssh_in_dir "$REMOTE_DIR" "scripts/prod-deploy.sh --tag $TAG --prune" \
  || die "Deploy-ul pe VPS a esuat (vezi mesajele de mai sus). Revenire: ssh $SSH_TARGET 'cd $REMOTE_DIR && scripts/rollback.sh --yes'"

# --- 7. Index facial ----------------------------------------------------------------
if (( WITH_INDEX )); then
  push_args=("$SSH_TARGET" "$REMOTE_DIR")
  [[ "${ASSUME_YES:-0}" == 1 ]] && push_args+=(--yes)
  [[ -n "$SSH_PORT" ]] && push_args+=(--port "$SSH_PORT")
  "$ROOT_DIR/scripts/push-face-index.sh" "${push_args[@]}"
fi

ok "Release $TAG publicat pe $SSH_TARGET."
