#!/usr/bin/env bash
# Revenire la imaginile unui release anterior (pe VPS): schimba IMAGE_TAG in
# .env.release si redeployeaza. NU face rollback la schema bazei de date.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/rollback.sh [tag] [optiuni]

Ruleaza pe VPS. Fara tag revine la IMAGE_TAG_PREVIOUS din .env.release.
Imaginile tag-ului trebuie sa existe local (release-push pastreaza tag-ul
curent si pe cel anterior). Tag-ul curent devine "anterior", deci un al
doilea rollback.sh fara argumente revine la release-ul de dinainte.

ATENTIE - schema DB: migratiile EF Core aplicate de release-ul nou RAMAN
aplicate. Daca release-ul nou a adaugat o migrare, backend-ul vechi poate
functiona (coloane/tabele in plus sunt de obicei ignorate) sau poate esua
(coloane redenumite/sterse, python-ai scrie direct in tabele). In al doilea
caz restaureaza backup-ul facut inainte de release:
  scripts/restore.sh backups/<data>     (vezi docs/prod/backup-restore.md)
De aceea: release-push.sh --backup inainte de fiecare release cu migrari.

Codul din checkout-ul git (compose, nginx/templates, scripturi) NU se schimba.
Tag-ul este commit-ul imaginilor; daca release-ul nou a modificat si compose
sau template-urile nginx, revino si cu codul: git checkout <tag>.

Optiuni:
  --yes           fara confirmare
  --timeout SEC   cat sa astepte healthcheck-urile (implicit 900)
  -h, --help      acest mesaj
USAGE
}

TARGET=""; TIMEOUT=900
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes) ASSUME_YES=1 ;;
    --timeout) TIMEOUT="${2:?--timeout cere o valoare}"; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) die "Optiune necunoscuta: $1 (vezi --help)" ;;
    *) [[ -z "$TARGET" ]] || die "Un singur tag."; TARGET="$1" ;;
  esac
  shift
done

require_docker
use_env prod
CURRENT="$(release_tag)"
TARGET="${TARGET:-$(release_previous_tag)}"
[[ -n "$TARGET" ]] || die "Nu exista un release anterior in $(basename "$RELEASE_FILE"). Specifica tag-ul: scripts/rollback.sh <tag>"
[[ "$TARGET" != "$CURRENT" ]] || die "Tag-ul $TARGET este deja cel curent."

for s in "${OWN_SERVICES[@]}"; do
  docker image inspect "$(own_image "$s" "$TARGET")" >/dev/null 2>&1 \
    || die "Lipseste $(own_image "$s" "$TARGET") pe VPS. Disponibile:
$(docker image ls "$(image_prefix)/backend" --format '        {{.Tag}}  ({{.CreatedSince}})')
      Sau retrimite-l de pe PC: git checkout $TARGET && scripts/release-build.sh && scripts/release-push.sh <user@vps>"
done

confirm "Rollback imagini: ${CURRENT:-?} -> $TARGET.
Schema bazei de date NU revine (migratiile aplicate raman). Ai un backup recent?" "rollback"

exec "$ROOT_DIR/scripts/prod-deploy.sh" --tag "$TARGET" --timeout "$TIMEOUT"
