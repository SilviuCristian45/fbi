#!/usr/bin/env bash
# Trimite indexul facial construit LOCAL (volumul face_index al stack-ului de
# dev) in volumul face_index de productie, pe VPS. Evita sync-ul pe VPS
# (sute de descarcari de la fbi.gov + TensorFlow pe un VPS mic).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/push-face-index.sh <user@vps> [cale-proiect-pe-vps] [optiuni]

Ruleaza pe PC. Construieste intai indexul local: scripts/sync-faces.sh --dev --full

Pasi:
  1. citeste fbi_vectors.pkl (+ .noface.json) din volumul local
     <COMPOSE_PROJECT_NAME din .env>_face_index (implicit fbi-dev_face_index)
     si afiseaza cati vectori contine; cere confirmare
  2. pe VPS: opreste python-ai, pastreaza indexul vechi ca fbi_vectors.pkl.bak,
     scrie fisierele in volumul face_index de prod (container temporar pe
     imaginea python-ai, deci fara imagini suplimentare)
  3. reporneste doar python-ai si verifica /index-status

Setul de persoane al indexului depinde de SYNC_MAX_PERSONS si
SYNC_INCLUDE_CLASSIFICATIONS: foloseste aceleasi valori in .env si in
.env.prod. Diferentele fata de DB-ul de prod (alte persoane importate) apar
ca avertisment la final; le repara un sync incremental pe VPS
(scripts/sync-faces.sh, descarca doar ce lipseste).

Optiuni:
  --volume NUME   volumul local sursa (implicit <proiect-dev>_face_index)
  --port N        portul SSH
  --yes           fara confirmare
  -h, --help      acest mesaj
USAGE
}

SSH_TARGET=""; REMOTE_DIR=""; VOLUME=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --volume) VOLUME="${2:?--volume cere un nume}"; shift ;;
    --port) SSH_OPTS+=(-p "${2:?--port cere o valoare}"); shift ;;
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
REMOTE_DIR="${REMOTE_DIR#\~/}"

require_docker
require_cmd ssh
require_cmd gzip

# --- 1. Indexul local ----------------------------------------------------------------
ENV_FILE="$ROOT_DIR/.env"   # dev, optional (doar pentru numele proiectului)
if [[ -z "$VOLUME" ]]; then
  dev_project="$(env_get COMPOSE_PROJECT_NAME)"
  VOLUME="${dev_project:-fbi-dev}_face_index"
fi
docker volume inspect "$VOLUME" >/dev/null 2>&1 \
  || die "Volumul local $VOLUME nu exista. Construieste indexul cu stack-ul de dev: scripts/sync-faces.sh --dev --full (sau --volume NUME)."

# Orice imagine python-ai locala are python + numpy + tar
LOCAL_IMG="$(docker image ls "$(image_prefix)/python-ai" --format '{{.Repository}}:{{.Tag}}' | head -n1)"
[[ -n "$LOCAL_IMG" ]] || die "Nu exista local nicio imagine $(image_prefix)/python-ai (ruleaza scripts/dev-up.sh sau release-build.sh)."

stats="$(docker run --rm --network none -v "$VOLUME:/data:ro" --entrypoint python "$LOCAL_IMG" -c '
import json, os, pickle
p = "/data/fbi_vectors.pkl"
if not os.path.exists(p) or os.path.getsize(p) == 0:
    print("missing"); raise SystemExit
db = pickle.load(open(p, "rb"))
nf = p + ".noface.json"
noface = len(json.load(open(nf))) if os.path.exists(nf) else 0
print(len(db), len({e["url"] for e in db}), noface, os.path.getsize(p))
' | tr -d '\r')" || die "Nu pot citi indexul din volumul $VOLUME."
[[ "$stats" != missing ]] || die "Volumul $VOLUME nu contine fbi_vectors.pkl. Ruleaza: scripts/sync-faces.sh --dev --full"
read -r vectors urls noface bytes <<<"$stats"
(( vectors > 0 )) || die "Indexul din $VOLUME e gol (0 vectori). Ruleaza: scripts/sync-faces.sh --dev --full"

info "Index local ($VOLUME): $vectors vectori ($urls poze distincte; ~o persoana per vector cu SYNC_MAX_PERSONS>0), $noface poze fara fata, $(human_size "$bytes")."
# Daca stack-ul de dev ruleaza, si comparatia cu DB-ul local
dev_ai="$(docker ps -q --filter "label=com.docker.compose.project=${VOLUME%_face_index}" --filter label=com.docker.compose.service=python-ai | head -n1)"
if [[ -n "$dev_ai" ]]; then
  docker exec "$dev_ai" python -c 'import json, urllib.request as r
d = json.load(r.urlopen("http://127.0.0.1:8006/index-status", timeout=30))
print("    DB local: %(expected)s unitati asteptate, %(missing)s fara vector, %(orphans)s in afara setului, SYNC_MAX_PERSONS=%(max_persons)s" % d)' 2>/dev/null || true
fi

# --- 2. VPS ----------------------------------------------------------------------------
info "Verific proiectul de pe $SSH_TARGET:$REMOTE_DIR..."
# shellcheck disable=SC2016
remote_info="$(ssh_in_dir "$REMOTE_DIR" 'source scripts/lib/common.sh && use_env prod && t="$(release_tag)" && printf "%s %s\n" "${t:--}" "$(project_name)"' | tr -d '\r')" \
  || die "Nu pot citi proiectul de pe VPS ($REMOTE_DIR exista? .env.prod?)."
read -r remote_tag remote_project <<<"$remote_info"
[[ "$remote_tag" != - ]] || die "Pe VPS nu exista inca un release (.env.release). Ruleaza intai scripts/release-push.sh."
ok "VPS: proiect $remote_project, release $remote_tag"

confirm "Indexul facial de PRODUCTIE (${remote_project}_face_index pe $SSH_TARGET) va fi inlocuit cu cel local ($vectors vectori).
Cel vechi se pastreaza in volum ca fbi_vectors.pkl.bak." "index"

info "Opresc python-ai pe VPS..."
ssh_in_dir "$REMOTE_DIR" 'source scripts/lib/common.sh && use_env prod && compose stop python-ai' >/dev/null

info "Trimit indexul..."
files=(fbi_vectors.pkl)
docker run --rm --network none -v "$VOLUME:/data:ro" --entrypoint sh "$LOCAL_IMG" -c 'test -f /data/fbi_vectors.pkl.noface.json' \
  && files+=(fbi_vectors.pkl.noface.json)
# shellcheck disable=SC2016
docker run --rm --network none -v "$VOLUME:/data:ro" --entrypoint tar "$LOCAL_IMG" -C /data -cf - "${files[@]}" \
  | gzip -c \
  | ssh_in_dir "$REMOTE_DIR" 'source scripts/lib/common.sh && use_env prod && compose run --rm --no-deps -T --entrypoint sh python-ai -c '"'"'
      d="$(dirname "$FACE_INDEX_PATH")"; mkdir -p "$d" && cd "$d" \
      && if [ -f fbi_vectors.pkl ]; then cp -f fbi_vectors.pkl fbi_vectors.pkl.bak; fi \
      && rm -f fbi_vectors.pkl.noface.json fbi_vectors.pkl.tmp \
      && tar -xzf - -C "$d" && ls -l "$d"'"'"'' \
  || die "Transferul indexului a esuat. python-ai e oprit pe VPS; porneste-l: scripts/prod-deploy.sh"
ok "Index scris in volumul de productie."

# --- 3. Repornire + verificare ------------------------------------------------------
info "Pornesc python-ai pe VPS si verific /index-status..."
ssh_in_dir "$REMOTE_DIR" 'source scripts/lib/common.sh && use_env prod && compose up -d --no-deps python-ai && wait_healthy 600 python-ai && check_face_index' \
  || die "python-ai nu a pornit pe VPS (vezi: compose logs python-ai)."
ok "Index facial publicat pe $SSH_TARGET."
