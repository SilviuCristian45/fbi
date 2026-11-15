#!/usr/bin/env bash
# Sincronizeaza la cerere indexul facial al serviciului AI (run_sync_job),
# fara sa lase RUN_SYNC_AT_STARTUP activ permanent.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/sync-faces.sh [optiuni]

Recreeaza containerul python-ai cu RUN_SYNC_AT_STARTUP=true. La pornire
serviciul sincronizeaza indexul cu "WantedImages":
  - selecteaza primele SYNC_MAX_PERSONS persoane (implicit 100, dupa Id; 0 =
    toate pozele) si indexeaza O poza per persoana: prima cu fata
    detectabila, altfel urmatoarea poza a aceleiasi persoane;
  - scoate din index vectorii din afara acestui set;
  - proceseaza pe loturi de SYNC_BATCH_SIZE, cu SYNC_DELAY_MS intre
    descarcari, si salveaza indexul dupa fiecare lot. Pozele care nu se pot
    descarca sunt numarate ca esuate si reincercate la rularea urmatoare;
    cele fara fata sunt retinute si sarite.
Apoi recreeaza containerul cu valoarea din fisierul env, ca restarturile
ulterioare sa nu mai refaca sincronizarea.

Necesita date in "WantedImages" (importul FBI din backend). Pe o baza noua,
asteapta intai importul (vezi docs/prod/first-deploy.md).

In timpul sincronizarii (la prima rulare zeci de minute) analiza pozelor
raportate e oprita; mesajele raman in coada RabbitMQ si sunt procesate dupa.

Optiuni:
  --dev           foloseste stack-ul de dev (.env) in loc de prod (.env.prod)
  --full          porneste de la un index GOL (reindexeaza tot), in loc de
                  doar pozele noi
  --timeout SEC   cat sa astepte terminarea (implicit 7200)
  -y, --yes       nu mai cere confirmare pentru --full
  -h, --help      acest mesaj
USAGE
}

ENV_NAME=prod; FULL=0; TIMEOUT=7200; DEV_FLAG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev) ENV_NAME=dev; DEV_FLAG=" --dev" ;;
    --full) FULL=1 ;;
    --timeout) TIMEOUT="${2:?--timeout cere o valoare}"; shift ;;
    -y|--yes) export ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Optiune necunoscuta: $1 (vezi --help)" ;;
  esac
  shift
done

require_docker
use_env "$ENV_NAME"
for dep in db rabbitmq; do
  [[ "$(service_state "$dep")" == running* ]] || die "Serviciul $dep nu ruleaza. Porneste stack-ul intai."
done

# --- 1. Exista poze de indexat? ---------------------------------------------------
images="$(compose exec -T db psql -U "$(env_get DB_USER)" -d "$(env_get DB_NAME)" -At \
  -c 'SELECT count(*) FROM "WantedImages";' 2>/dev/null | tr -d '\r' || true)"
[[ "$images" =~ ^[0-9]+$ ]] || die "Nu pot citi tabela \"WantedImages\" (backend-ul a rulat migrarile?)."
if (( images == 0 )); then
  die "\"WantedImages\" e goala: importul FBI nu a rulat inca. Pe o baza noua backend-ul il porneste singur
       (SCRAPER_RUN_AT_STARTUP=auto) si dureaza cateva minute. Urmareste-l cu:
         docker compose ... logs -f backend   (dev: scripts/dev-logs.sh backend)
       si asteapta linia 'Nu mai sunt date. Sincronizare completă.', apoi ruleaza din nou acest script."
fi
info "\"WantedImages\": $images poze."

# Ultimul mesaj al scraper-ului: daca e "Începe"/"Salvat pagina", importul inca ruleaza
last_scraper="$(compose logs --no-color --no-log-prefix backend 2>/dev/null \
  | grep -E "Începe sincronizarea|Salvat pagina|Sincronizare completă|Eroare la apelul FBI|A crăpat Scraper" \
  | tail -n 1 | tr -d '\r' || true)"
case "$last_scraper" in
  *"Începe sincronizarea"*|*"Salvat pagina"*)
    warn "Importul FBI pare inca in desfasurare (ultimul mesaj: '${last_scraper#"${last_scraper%%[![:space:]]*}"}').
         Indexul va contine doar pozele importate pana acum; ruleaza din nou scriptul dupa import." ;;
  *"Eroare la apelul FBI"*|*"A crăpat Scraper"*)
    warn "Ultimul import FBI s-a oprit cu eroare (vezi logul backend); indexul va fi partial." ;;
esac

# --- 2. --full: golim indexul -------------------------------------------------------
if (( FULL )); then
  confirm "Indexul facial existent va fi golit si reconstruit de la zero (backup recomandat: scripts/backup.sh$DEV_FLAG)." "full"
  [[ "$(service_state python-ai)" == running* ]] || compose up -d --no-deps python-ai
  compose exec -T python-ai python -c \
    "import os, pickle; p = os.environ['FACE_INDEX_PATH']; os.makedirs(os.path.dirname(p), exist_ok=True); pickle.dump([], open(p, 'wb')); nf = p + '.noface.json'; os.path.exists(nf) and os.remove(nf)" \
    || die "Nu pot goli indexul."
  ok "Index golit."
fi

# --- 3. Sincronizarea ---------------------------------------------------------------
since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
info "Pornesc python-ai cu RUN_SYNC_AT_STARTUP=true..."
RUN_SYNC_AT_STARTUP=true compose up -d --no-deps --force-recreate python-ai

# Sync-ul ruleaza inainte ca API-ul sa porneasca (healthcheck-ul poate fi
# "unhealthy" intre timp), asa ca asteptam linia finala din log.
start=$SECONDS; last_progress=""; result=""
while :; do
  logs="$(compose logs --no-color --no-log-prefix --since "$since" python-ai 2>/dev/null | tr -d '\r' || true)"
  result="$(grep -E "SYNC (FINISHED|FAILED)" <<<"$logs" | tail -n 1 || true)"
  [[ -n "$result" ]] && break
  state="$(service_state python-ai)"
  if [[ "$state" != running* ]]; then
    show_logs python-ai
    die "python-ai s-a oprit in timpul sincronizarii ($state). OOM? Vezi AI_MEMORY_LIMIT / SYNC_BATCH_SIZE."
  fi
  if (( SECONDS - start >= TIMEOUT )); then
    show_logs python-ai
    die "Sincronizarea nu s-a terminat in ${TIMEOUT}s (continua in container; urmareste: logs -f python-ai)."
  fi
  progress="$(grep -E "Progress:|Indexing|Removed" <<<"$logs" | tail -n 1 || true)"
  if [[ -n "$progress" && "$progress" != "$last_progress" ]]; then
    info "($((SECONDS - start))s) ${progress#* }"
    last_progress="$progress"
  fi
  sleep 10
done

echo
info "Rezumat sincronizare ($((SECONDS - start))s):"
grep -E "SYNC|Indexing|Nothing new|No URLs|Removed|Loaded|Index inexistent|DB Connection Error" <<<"$logs" \
  | sed 's/^/    /' || true
failed_lines="$(grep -cE "Download failed|AI Failed" <<<"$logs" || true)"
noface_lines="$(grep -c "No face" <<<"$logs" || true)"
(( failed_lines > 0 )) && info "Poze esuate (reincercate la rularea urmatoare): $failed_lines; detalii: logs python-ai | grep -E 'Download failed|AI Failed'"
(( noface_lines > 0 )) && info "Poze fara fata detectabila (sarite): $noface_lines"

# --- 4. Revenim la setarile normale ---------------------------------------------------
info "Repornesc python-ai cu setarile normale (indexul se incarca de pe volum)..."
compose up -d --no-deps --force-recreate python-ai
if ! wait_healthy 600 python-ai; then
  show_logs python-ai
  die "python-ai nu a pornit dupa sincronizare."
fi

[[ "$result" == *"SYNC FAILED"* ]] && die "Sincronizarea a esuat (vezi rezumatul de mai sus)."
check_face_index "${DEV_FLAG# }"
ok "Index facial actualizat."
