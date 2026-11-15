#!/usr/bin/env bash
# Backup complet: ambele baze Postgres (aplicatie + Keycloak), bucket-ul
# MinIO/Silo, export JSON al realm-ului Keycloak si indexul facial, intr-un
# folder cu timestamp. Pastreaza ultimele N backup-uri.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/backup.sh [optiuni]

Creeaza <dir>/<YYYY-MM-DD_HHMMSS>/ cu:
  postgres/app.dump        pg_dump -Fc al bazei aplicatiei (DB_NAME)
  postgres/keycloak.dump   pg_dump -Fc al bazei Keycloak (KEYCLOAK_DB_NAME)
  postgres/globals.sql     roluri Postgres (informativ)
  minio/bucket/            mirror al bucket-ului MINIO_BUCKET (mcli)
  minio/policy.json        politica de acces anonim a bucket-ului
  keycloak/realm-*.json    export realm (inclusiv useri si secrete!)
  face-index/              indexul facial (fbi_vectors.pkl + .noface.json)
  manifest.txt             data, commit git, imagini, nume baze
Backup-ul contine date sensibile: folderul primeste permisiuni 700.

Copie off-site (optional): daca e setat BACKUP_REMOTE in fisierul env (sau
--remote), dupa backup-ul local folderul e urcat cu rclone in
<remote>/<timestamp>/ si se pastreaza acolo ultimele BACKUP_REMOTE_KEEP.
rclone ruleaza din imaginea Docker oficiala, cu configuratia din
RCLONE_CONFIG_DIR (implicit ~/.config/rclone). Configurare initiala:
  docker run --rm -it -v ~/.config/rclone:/config/rclone rclone/rclone:1.75.2 config

Optiuni:
  --dev          backup pentru stack-ul de dev (.env) in loc de prod (.env.prod)
  --dir DIR      folderul radacina pentru backup-uri (implicit: backups/)
  --keep N       cate backup-uri locale sa pastreze (implicit BACKUP_KEEP sau 7; 0 = toate)
  --remote R     urca si in remote-ul rclone R (ex. b2:fbi-backups); suprascrie BACKUP_REMOTE
  --no-remote    nu urca in remote, chiar daca BACKUP_REMOTE e setat
  --skip-minio   fara fisierele din bucket
  --skip-realm   fara exportul JSON Keycloak (baza Keycloak e oricum in pg_dump)
  -h, --help     acest mesaj

Rulare zilnica automata: scripts/install-cron.sh
USAGE
}

ENV_NAME=prod; BACKUP_ROOT=""; KEEP=""; SKIP_MINIO=0; SKIP_REALM=0
REMOTE=""; NO_REMOTE=0
RCLONE_IMAGE="rclone/rclone:1.75.2"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev) ENV_NAME=dev ;;
    --dir) BACKUP_ROOT="${2:?--dir cere o cale}"; shift ;;
    --keep) KEEP="${2:?--keep cere un numar}"; shift ;;
    --skip-minio) SKIP_MINIO=1 ;;
    --skip-realm) SKIP_REALM=1 ;;
    --remote) REMOTE="${2:?--remote cere un remote rclone (ex. b2:fbi-backups)}"; shift ;;
    --no-remote) NO_REMOTE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Optiune necunoscuta: $1 (vezi --help)" ;;
  esac
  shift
done
require_docker
use_env "$ENV_NAME"
KEEP="${KEEP:-$(env_get BACKUP_KEEP)}"; KEEP="${KEEP:-7}"
[[ "$KEEP" =~ ^[0-9]+$ ]] || die "--keep / BACKUP_KEEP trebuie sa fie un numar."
REMOTE="${REMOTE:-$(env_get BACKUP_REMOTE)}"
(( NO_REMOTE )) && REMOTE=""
REMOTE="${REMOTE%/}"
REMOTE_KEEP="$(env_get BACKUP_REMOTE_KEEP)"; REMOTE_KEEP="${REMOTE_KEEP:-$KEEP}"
[[ "$REMOTE_KEEP" =~ ^[0-9]+$ ]] || die "BACKUP_REMOTE_KEEP trebuie sa fie un numar."
RCLONE_CONFIG_DIR="$(env_get RCLONE_CONFIG_DIR)"; RCLONE_CONFIG_DIR="${RCLONE_CONFIG_DIR:-$HOME/.config/rclone}"
RCLONE_CONFIG_DIR="${RCLONE_CONFIG_DIR/#\~/$HOME}"
if [[ -n "$REMOTE" ]]; then
  [[ "$REMOTE" == *:* ]] || die "Remote rclone invalid: '$REMOTE' (format: nume-remote:cale)."
  [[ -f "$RCLONE_CONFIG_DIR/rclone.conf" ]] || die "Lipseste $RCLONE_CONFIG_DIR/rclone.conf (configureaza rclone, vezi --help)."
fi
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups}"
DB_NAME="$(env_get DB_NAME)"
KC_DB="$(env_get KEYCLOAK_DB_NAME)"
REALM="$(env_get KEYCLOAK_REALM)"
BUCKET="$(env_get MINIO_BUCKET)"

[[ "$(service_state db)" == running* ]] || die "Serviciul db nu ruleaza. Porneste stack-ul inainte de backup."

STAMP="$(date +%Y-%m-%d_%H%M%S)"
DEST="$BACKUP_ROOT/$STAMP"
mkdir -p "$DEST"/{postgres,minio,keycloak,face-index}
chmod 700 "$BACKUP_ROOT" "$DEST"
info "Backup ($STACK_ENV) in $DEST"
WARNINGS=()

# --- Postgres ---------------------------------------------------------------------
dump_db() {
  local db="$1" out="$2"
  compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$1"' _ "$db" > "$out" \
    || die "pg_dump a esuat pentru baza '$db'."
  [[ -s "$out" ]] || die "Dump gol pentru baza '$db'."
  ok "Postgres: $db -> $(basename "$out") ($(du -h "$out" | cut -f1))"
}
dump_db "$DB_NAME" "$DEST/postgres/app.dump"
dump_db "$KC_DB" "$DEST/postgres/keycloak.dump"
compose exec -T db sh -c 'pg_dumpall -U "$POSTGRES_USER" --globals-only' > "$DEST/postgres/globals.sql" \
  || WARNINGS+=("pg_dumpall --globals-only a esuat")

# --- MinIO / Silo -------------------------------------------------------------------
# Un container temporar din aceeasi imagine (are mcli) copiaza bucket-ul
# direct in folderul de backup, fara a dubla datele in containerul minio.
if (( SKIP_MINIO )); then
  WARNINGS+=("bucket-ul MinIO nu a fost inclus (--skip-minio)")
elif [[ "$(service_state minio)" != running* ]]; then
  WARNINGS+=("serviciul minio nu ruleaza: bucket-ul NU a fost salvat")
else
  chmod 777 "$DEST/minio"
  if compose run --rm --no-deps -T -v "$(host_path "$DEST/minio"):/backup" --entrypoint sh minio -c '
      set -e
      mcli alias set src http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
      if ! mcli ls "src/$MINIO_BUCKET" >/dev/null 2>&1; then
        echo "Bucket-ul $MINIO_BUCKET nu exista inca (niciun upload)."
        exit 3
      fi
      mcli mirror --overwrite --quiet "src/$MINIO_BUCKET" /backup/bucket
      mcli anonymous get-json "src/$MINIO_BUCKET" > /backup/policy.json || true
    '; then
    ok "MinIO: bucket $BUCKET -> minio/bucket ($(du -sh "$DEST/minio" | cut -f1))"
  else
    rc=$?
    if (( rc == 3 )); then
      WARNINGS+=("bucket-ul $BUCKET nu exista inca (nimic de salvat)")
    else
      die "Mirror MinIO a esuat (cod $rc)."
    fi
  fi
  chmod 700 "$DEST/minio"
fi

# --- Keycloak realm (JSON portabil) ------------------------------------------------
# Container temporar Keycloak, conectat la aceeasi baza, cu cache local (nu
# intra in cluster cu instanta care ruleaza). Dureaza ~1 min (re-augmentare).
if (( SKIP_REALM )); then
  WARNINGS+=("exportul realm Keycloak nu a fost inclus (--skip-realm)")
else
  chmod 777 "$DEST/keycloak"
  info "Export realm Keycloak '$REALM' (dureaza ~1 minut)..."
  if compose run --rm --no-deps -T -v "$(host_path "$DEST/keycloak"):/backup" \
       --entrypoint /opt/keycloak/bin/kc.sh keycloak \
       export --realm "$REALM" --file "/backup/realm-$REALM.json" --users same_file --cache=local \
       > "$DEST/keycloak/export.log" 2>&1 && [[ -s "$DEST/keycloak/realm-$REALM.json" ]]; then
    ok "Keycloak: realm $REALM -> keycloak/realm-$REALM.json"
  else
    WARNINGS+=("exportul realm Keycloak a esuat (vezi keycloak/export.log); baza Keycloak e totusi in postgres/keycloak.dump")
  fi
  chmod 700 "$DEST/keycloak"
fi

# --- Indexul facial -----------------------------------------------------------------
if [[ "$(service_state python-ai)" == running* ]] \
   && compose cp python-ai:/data/face-index/fbi_vectors.pkl "$(host_path "$DEST/face-index/fbi_vectors.pkl")" >/dev/null 2>&1; then
  ok "Index facial -> face-index/fbi_vectors.pkl"
  # Pozele fara fata detectabila (optional; lipsa = se reincearca la urmatorul sync)
  compose cp python-ai:/data/face-index/fbi_vectors.pkl.noface.json \
    "$(host_path "$DEST/face-index/fbi_vectors.pkl.noface.json")" >/dev/null 2>&1 || true
else
  WARNINGS+=("indexul facial nu a fost copiat (python-ai nu ruleaza sau indexul lipseste)")
fi

# --- Manifest -----------------------------------------------------------------------
{
  echo "date:              $(date -Iseconds)"
  echo "stack:             $STACK_ENV ($(project_name))"
  echo "git commit:        $(git -C "$(host_path "$ROOT_DIR")" rev-parse HEAD 2>/dev/null || echo n/a)"
  echo "app db:            $DB_NAME"
  echo "keycloak db:       $KC_DB"
  echo "keycloak realm:    $REALM"
  echo "minio bucket:      $BUCKET"
  [[ "$STACK_ENV" == prod ]] && echo "domain:            $(env_get DOMAIN)"
  echo "warnings:          ${#WARNINGS[@]}"
  for w in "${WARNINGS[@]}"; do echo "  - $w"; done
  echo
  echo "images:"
  compose images 2>/dev/null | sed 's/^/  /'
} > "$DEST/manifest.txt"

# --- Rotatie ------------------------------------------------------------------------
if (( KEEP > 0 )); then
  mapfile -t old < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??_??????' | sort | head -n "-$KEEP")
  for d in "${old[@]}"; do
    rm -rf "$d" && info "Sters backup vechi: $(basename "$d")"
  done
fi

for w in "${WARNINGS[@]}"; do warn "$w"; done
ok "Backup local complet: $DEST ($(du -sh "$DEST" | cut -f1))"

# --- Copie off-site (rclone) ------------------------------------------------------
if [[ -n "$REMOTE" ]]; then
  rclone() {
    docker run --rm       -v "$(host_path "$RCLONE_CONFIG_DIR"):/config/rclone"       -v "$(host_path "$BACKUP_ROOT"):/data:ro"       "$RCLONE_IMAGE" "$@"
  }
  info "Urc backup-ul in $REMOTE/$STAMP ..."
  if ! rclone copy "/data/$STAMP" "$REMOTE/$STAMP" --transfers 4 --stats-one-line --stats 0; then
    die "Upload-ul in $REMOTE a esuat. Backup-ul local a ramas in $DEST."
  fi
  ok "Urcat in $REMOTE/$STAMP"
  if (( REMOTE_KEEP > 0 )); then
    mapfile -t remote_old < <(rclone lsf --dirs-only "$REMOTE" 2>/dev/null       | sed 's:/$::' | grep -E '^20[0-9]{2}-[0-9]{2}-[0-9]{2}_[0-9]{6}$' | sort | head -n "-$REMOTE_KEEP")
    for d in "${remote_old[@]}"; do
      rclone purge "$REMOTE/$d" && info "Sters din remote: $d"
    done
  fi
fi
