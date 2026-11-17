#!/usr/bin/env bash
# Restaureaza un backup creat de scripts/backup.sh (cu confirmare).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/restore.sh [optiuni] <folder-backup>

Exemplu: scripts/restore.sh backups/2026-11-15_033000

Pasi:
  1. porneste db si minio, opreste serviciile care scriu date
     (backend, python-ai, file-api, keycloak, nginx). Site-ul e indisponibil.
  2. Postgres: sterge si recreeaza bazele DB_NAME si KEYCLOAK_DB_NAME din
     mediul curent, apoi pg_restore din app.dump / keycloak.dump
  3. MinIO: recreeaza bucket-ul MINIO_BUCKET (daca lipseste), copiaza
     obiectele din backup, seteaza acces anonim de citire
  4. indexul facial: copiat inapoi in volumul face_index
  5. porneste tot stack-ul si asteapta healthcheck-urile

Exportul JSON al realm-ului NU se importa (baza Keycloak restaurata il
contine deja); e o copie portabila pentru import manual.

Atentie: URL-urile pozelor din baza includ domeniul (ex. https://DOMAIN/files/...).
La restaurare pe alt domeniu pozele vechi nu se mai incarca (vezi docs/prod).

Optiuni:
  --dev               restaureaza in stack-ul de dev (.env) in loc de prod
  --skip-db           fara Postgres
  --skip-minio        fara fisierele din bucket
  --skip-face-index   fara indexul facial
  -y, --yes           nu mai cere confirmare
  --timeout SEC       cat sa astepte healthcheck-urile (implicit 900)
  -h, --help          acest mesaj
USAGE
}

ENV_NAME=prod; SRC=""; SKIP_DB=0; SKIP_MINIO=0; SKIP_FACE=0; TIMEOUT=900
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev) ENV_NAME=dev ;;
    --skip-db) SKIP_DB=1 ;;
    --skip-minio) SKIP_MINIO=1 ;;
    --skip-face-index) SKIP_FACE=1 ;;
    -y|--yes) export ASSUME_YES=1 ;;
    --timeout) TIMEOUT="${2:?--timeout cere o valoare}"; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) die "Optiune necunoscuta: $1 (vezi --help)" ;;
    *) [[ -z "$SRC" ]] || die "Un singur folder de backup."; SRC="$1" ;;
  esac
  shift
done
[[ -n "$SRC" ]] || { usage; die "Lipseste folderul de backup."; }
[[ -d "$SRC" ]] || die "Folderul nu exista: $SRC"
SRC="$(cd "$SRC" && pwd)"
[[ -f "$SRC/manifest.txt" ]] || die "$SRC nu pare un backup (lipseste manifest.txt)."

require_docker
use_env "$ENV_NAME"
DB_NAME="$(env_get DB_NAME)"
KC_DB="$(env_get KEYCLOAK_DB_NAME)"

echo
sed 's/^/    /' "$SRC/manifest.txt" | head -n 12
echo
if [[ "$STACK_ENV" == prod ]]; then
  confirm "Datele CURENTE din PRODUCTIE ($(env_get DOMAIN)) vor fi inlocuite cu backup-ul de mai sus." "$(env_get DOMAIN)"
else
  confirm "Datele curente din stack-ul de dev vor fi inlocuite cu backup-ul de mai sus." "restore"
fi

info "Pornesc db si minio, opresc serviciile care scriu date..."
compose up -d db minio
wait_healthy 180 db minio || { show_logs "${WAIT_FAILED[@]}"; die "db/minio nu au pornit."; }
compose stop nginx backend python-ai file-api keycloak

# --- Postgres -------------------------------------------------------------------------
restore_db() {
  local db="$1" dump="$2"
  [[ -s "$dump" ]] || { warn "Lipseste $(basename "$dump"); sar peste baza $db."; return 0; }
  info "Postgres: restaurez $db din $(basename "$dump")..."
  compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists --force "$1" && createdb -U "$POSTGRES_USER" "$1"' _ "$db" \
    || die "Nu pot recrea baza $db."
  compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$1" --no-owner --role="$POSTGRES_USER" --exit-on-error' _ "$db" < "$dump" \
    || die "pg_restore a esuat pentru $db."
  ok "Postgres: $db restaurata."
}
if (( ! SKIP_DB )); then
  restore_db "$DB_NAME" "$SRC/postgres/app.dump"
  restore_db "$KC_DB" "$SRC/postgres/keycloak.dump"
fi

# --- MinIO / Silo -------------------------------------------------------------------
if (( ! SKIP_MINIO )); then
  if [[ -d "$SRC/minio/bucket" ]]; then
    info "MinIO: restaurez bucket-ul $(env_get MINIO_BUCKET)..."
    compose run --rm --no-deps -T -v "$(host_path "$SRC/minio"):/backup:ro" --entrypoint sh minio -c '
        set -e
        mcli alias set dst http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
        mcli mb --ignore-existing "dst/$MINIO_BUCKET" >/dev/null
        mcli mirror --overwrite --quiet /backup/bucket "dst/$MINIO_BUCKET"
        # Politica salvata la backup; altfel doar s3:GetObject, ca file-api
        # ("anonymous set download" ar permite si listarea bucket-ului).
        if grep -q "s3:" /backup/policy.json 2>/dev/null; then
          mcli anonymous set-json /backup/policy.json "dst/$MINIO_BUCKET" >/dev/null
        else
          printf "%s" "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"AWS\":[\"*\"]},\"Action\":[\"s3:GetObject\"],\"Resource\":[\"arn:aws:s3:::$MINIO_BUCKET/*\"]}]}" > /tmp/policy.json
          mcli anonymous set-json /tmp/policy.json "dst/$MINIO_BUCKET" >/dev/null
        fi
      ' || die "Restaurarea bucket-ului a esuat."
    ok "MinIO: bucket restaurat (politica de acces anonim: doar citire fisiere)."
  else
    warn "Backup-ul nu contine minio/bucket; sar peste fisiere."
  fi
fi

# --- Index facial ----------------------------------------------------------------------
if (( ! SKIP_FACE )); then
  if [[ -s "$SRC/face-index/fbi_vectors.pkl" ]]; then
    compose run --rm --no-deps -T -v "$(host_path "$SRC/face-index"):/restore:ro" --entrypoint sh python-ai \
      -c 'cp /restore/fbi_vectors.pkl "$FACE_INDEX_PATH" && rm -f "$FACE_INDEX_PATH.noface.json" && if [ -f /restore/fbi_vectors.pkl.noface.json ]; then cp /restore/fbi_vectors.pkl.noface.json "$FACE_INDEX_PATH.noface.json"; fi' \
      || die "Nu pot copia indexul facial."
    ok "Index facial restaurat."
  else
    warn "Backup-ul nu contine indexul facial; ramane cel existent. Daca nu corespunde DB-ului: scripts/sync-faces.sh$([[ $ENV_NAME == dev ]] && echo " --dev") --full"
  fi
fi

info "Pornesc tot stack-ul..."
compose up -d
if ! wait_healthy "$TIMEOUT"; then
  show_logs "${WAIT_FAILED[@]}"
  die "Restaurarea s-a terminat, dar unele servicii nu au pornit."
fi
ok "Restaurare completa din $(basename "$SRC")."
