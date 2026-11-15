#!/usr/bin/env bash
# Deploy complet in productie: verifica .env.prod, build, up -d, asteapta
# healthcheck-urile si afiseaza statusul.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/prod-deploy.sh [optiuni]

Pasi:
  1. verifica .env.prod (DOMAIN real, fara CHANGE_ME, parole valide)
  2. verifica certificatul Let's Encrypt (altfel: scripts/init-ssl.sh)
  3. valideaza config-ul compose, construieste imaginile
  4. porneste stack-ul (up -d) si asteapta toate healthcheck-urile
  5. afiseaza statusul

Migratiile EF Core ruleaza automat la pornirea backend-ului
(Database.Migrate()). Daca o migrare esueaza, backend-ul se opreste
(reporneste in bucla) si deploy-ul raporteaza eroare cu logurile lui.

Optiuni:
  --no-build      nu reconstrui imaginile
  --pull          descarca intai versiunile imaginilor de baza (infra)
  --timeout SEC   cat sa astepte healthcheck-urile (implicit 900)
  -h, --help      acest mesaj
USAGE
}

BUILD=1; PULL=0; TIMEOUT=900
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) BUILD=0 ;;
    --pull) PULL=1 ;;
    --timeout) TIMEOUT="${2:?--timeout cere o valoare}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Optiune necunoscuta: $1 (vezi --help)" ;;
  esac
  shift
done

require_docker
use_env prod
info "Verific .env.prod..."
validate_prod_env
DOMAIN="$(env_get DOMAIN)"
ok "DOMAIN=$DOMAIN"

info "Validez configuratia compose..."
compose config -q || die "docker compose config a esuat (vezi eroarea de mai sus)."

info "Verific certificatul TLS pentru $DOMAIN..."
if ! compose run --rm --no-deps --entrypoint sh certbot \
     -c "test -s '/etc/letsencrypt/live/$DOMAIN/fullchain.pem'" >/dev/null 2>&1; then
  die "Nu exista certificat pentru $DOMAIN. Nginx nu poate porni fara el.
      Ruleaza intai: scripts/init-ssl.sh"
fi
ok "Certificat gasit."

if (( PULL )); then
  info "Descarc imaginile de baza..."
  compose pull --ignore-buildable
fi
if (( BUILD )); then
  info "Construiesc imaginile (poate dura cateva minute)..."
  compose build
fi

info "Pornesc stack-ul..."
compose up -d --remove-orphans

if ! wait_healthy "$TIMEOUT"; then
  show_logs "${WAIT_FAILED[@]}"
  for s in "${WAIT_FAILED[@]}"; do
    if [[ "$s" == backend ]] && compose logs --no-color --tail=200 backend 2>/dev/null | grep -qi "eroare la migrare"; then
      err "Migrarea bazei de date a esuat (vezi logul backend). Repara migrarea si redeploy."
    fi
  done
  die "Deploy incomplet. Statusul curent: scripts/healthcheck.sh"
fi
reload_nginx

# Doar avertisment: indexul facial fata de "WantedImages"
check_face_index

echo
compose ps
echo
ok "Deploy reusit: https://$DOMAIN"
info "Verificare completa (inclusiv consumatori RabbitMQ): scripts/healthcheck.sh"
