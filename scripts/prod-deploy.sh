#!/usr/bin/env bash
# Deploy in productie, pe VPS, FARA build: verifica .env.prod si imaginile
# proprii ${IMAGE_PREFIX}/*:${IMAGE_TAG} (trimise de pe PC cu release-push.sh),
# descarca doar imaginile terte, up -d, asteapta healthcheck-urile.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/prod-deploy.sh [optiuni]

De obicei e rulat de scripts/release-push.sh (de pe PC), cu --tag.

Pasi:
  1. verifica .env.prod (DOMAIN real, fara CHANGE_ME, parole valide)
  2. verifica imaginile proprii pentru tag (backend, frontend, python-ai,
     file-api, nginx); daca lipsesc: ruleaza release-push de pe PC
  3. cu --tag: scrie tag-ul in .env.release (cel vechi devine IMAGE_TAG_PREVIOUS)
  4. verifica certificatul Let's Encrypt (altfel: scripts/init-ssl.sh)
  5. descarca imaginile terte (postgres, keycloak, silo, rabbitmq, certbot)
  6. porneste stack-ul (up -d) si asteapta toate healthcheck-urile

Fara --tag foloseste IMAGE_TAG din .env.release (redeploy, ex. dupa ce ai
editat .env.prod).

Migratiile EF Core ruleaza automat la pornirea backend-ului
(Database.Migrate()). Daca o migrare esueaza, backend-ul se opreste
(reporneste in bucla) si deploy-ul raporteaza eroare cu logurile lui.
Un rollback de imagine (scripts/rollback.sh) NU readuce schema DB.

Optiuni:
  --tag TAG       deployeaza imaginile cu acest tag si il retine in .env.release
  --prune         dupa un deploy reusit, sterge imaginile proprii vechi
                  (pastreaza doar tag-ul curent si cel anterior)
  --no-pull       nu descarca imaginile terte (le foloseste pe cele locale)
  --timeout SEC   cat sa astepte healthcheck-urile (implicit 900)
  -h, --help      acest mesaj
USAGE
}

NEW_TAG=""; PRUNE=0; PULL=1; TIMEOUT=900
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) NEW_TAG="${2:?--tag cere o valoare}"; shift ;;
    --prune) PRUNE=1 ;;
    --no-pull) PULL=0 ;;
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

CURRENT_TAG="$(release_tag)"
TAG="${NEW_TAG:-$CURRENT_TAG}"
[[ -n "$TAG" ]] || die "Nu exista niciun release ($(basename "$RELEASE_FILE") lipseste sau nu are IMAGE_TAG).
      Imaginile se construiesc pe PC. Ruleaza de pe PC:
        scripts/release-build.sh && scripts/release-push.sh <user@vps>"

info "Verific imaginile pentru tag-ul $TAG..."
missing=()
for s in "${OWN_SERVICES[@]}"; do
  docker image inspect "$(own_image "$s" "$TAG")" >/dev/null 2>&1 || missing+=("$(own_image "$s" "$TAG")")
done
if (( ${#missing[@]} > 0 )); then
  die "Lipsesc imaginile: ${missing[*]}
      Pe VPS nu se construieste nimic. Ruleaza de pe PC:
        scripts/release-push.sh <user@vps>   (dupa scripts/release-build.sh)"
fi
ok "Imaginile $(image_prefix)/*:$TAG exista."

if [[ -n "$NEW_TAG" && "$NEW_TAG" != "$CURRENT_TAG" ]]; then
  write_release "$NEW_TAG" "${CURRENT_TAG:-$(release_previous_tag)}"
  ok "$(basename "$RELEASE_FILE"): IMAGE_TAG=$NEW_TAG (anterior: ${CURRENT_TAG:-niciunul})"
fi

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
  info "Descarc imaginile terte (${THIRD_PARTY_SERVICES[*]})..."
  compose pull --quiet "${THIRD_PARTY_SERVICES[@]}"
fi

info "Pornesc stack-ul..."
compose up -d --remove-orphans --pull never

if ! wait_healthy "$TIMEOUT"; then
  show_logs "${WAIT_FAILED[@]}"
  for s in "${WAIT_FAILED[@]}"; do
    if [[ "$s" == backend ]] && compose logs --no-color --tail=200 backend 2>/dev/null | grep -qi "eroare la migrare"; then
      err "Migrarea bazei de date a esuat (vezi logul backend). Repara migrarea si fa un release nou."
    fi
  done
  previous="$(release_previous_tag)"
  [[ -n "$previous" ]] && err "Revenire la imaginile anterioare: scripts/rollback.sh   (tag $previous; schema DB NU revine)"
  die "Deploy incomplet. Statusul curent: scripts/healthcheck.sh"
fi
reload_nginx

if (( PRUNE )); then
  keep_previous="$(release_previous_tag)"
  info "Sterg imaginile proprii vechi (pastrez $TAG${keep_previous:+ si $keep_previous})..."
  for s in "${OWN_SERVICES[@]}"; do
    while IFS= read -r t; do
      [[ -z "$t" || "$t" == "$TAG" || "$t" == "$keep_previous" ]] && continue
      if docker image rm "$(own_image "$s" "$t")" >/dev/null 2>&1; then
        ok "sters $(own_image "$s" "$t")"
      else
        warn "nu am putut sterge $(own_image "$s" "$t") (folosita de un container?)"
      fi
    done < <(docker image ls "$(image_prefix)/$s" --format '{{.Tag}}')
  done
fi

# Doar avertisment: indexul facial fata de "WantedImages"
check_face_index

echo
compose ps
echo
ok "Deploy reusit: https://$DOMAIN  (imagini $(image_prefix)/*:$TAG)"
info "Verificare completa (inclusiv consumatori RabbitMQ): scripts/healthcheck.sh"
