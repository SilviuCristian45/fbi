#!/usr/bin/env bash
# Obtine primul certificat Let's Encrypt pentru DOMAIN (rezolva problema
# "nginx nu porneste fara certificat") si ofera reinnoire manuala/status.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/init-ssl.sh [optiuni]

Prima data (inainte de scripts/prod-deploy.sh):
  - porneste un nginx TEMPORAR pe portul 80 care serveste doar
    /.well-known/acme-challenge/ (nginx-ul de prod nu poate porni fara
    certificat, deci nu-l putem folosi);
  - ruleaza certbot (webroot) pentru DOMAIN si salveaza certificatul in
    volumul "letsencrypt";
  - opreste nginx-ul temporar.
Daca stack-ul de prod ruleaza deja, se foloseste nginx-ul lui si se face reload.

Reinnoirea e AUTOMATA: containerul certbot din docker-compose.prod.yml
ruleaza `certbot renew` la 12h, iar nginx isi reincarca certificatele la 6h.

Cerinte: DNS-ul (A record) pentru DOMAIN indica IP-ul acestui server,
portul 80 deschis, CERTBOT_EMAIL completat in .env.prod.

Optiuni:
  --staging     foloseste serverul de test Let's Encrypt (fara rate limit;
                certificatul NU e de incredere in browser)
  --with-www    include si www.DOMAIN (necesita DNS si pentru www)
  --force       sterge certificatul existent si emite altul (ex. dupa --staging)
  --renew       ruleaza acum `certbot renew` si reincarca nginx
  --status      afiseaza certificatele existente si expirarea
  -h, --help    acest mesaj
USAGE
}

STAGING=0; WITH_WWW=0; FORCE=0; MODE=issue
while [[ $# -gt 0 ]]; do
  case "$1" in
    --staging) STAGING=1 ;;
    --with-www) WITH_WWW=1 ;;
    --force) FORCE=1 ;;
    --renew) MODE=renew ;;
    --status) MODE=status ;;
    -h|--help) usage; exit 0 ;;
    *) die "Optiune necunoscuta: $1 (vezi --help)" ;;
  esac
  shift
done

require_docker
use_env prod
validate_prod_env
DOMAIN="$(env_get DOMAIN)"
EMAIL="$(env_get CERTBOT_EMAIL)"

certbot_cmd() {
  compose run --rm --no-deps --entrypoint certbot certbot "$@"
}

case "$MODE" in
  status)
    certbot_cmd certificates
    exit 0
    ;;
  renew)
    info "Reinnoire certificate (doar cele care expira in < 30 zile)..."
    certbot_cmd renew --webroot -w /var/www/certbot
    reload_nginx
    exit 0
    ;;
esac

[[ -n "$EMAIL" && "$EMAIL" == *@*.* ]] || die "CERTBOT_EMAIL lipseste sau e invalid in .env.prod."

# Verificare DNS (doar avertisment: serverul poate fi in spatele unui NAT/proxy)
if command -v getent >/dev/null 2>&1; then
  resolved="$(getent ahostsv4 "$DOMAIN" | awk 'NR==1 {print $1}')"
  if [[ -z "$resolved" ]]; then
    die "DOMAIN '$DOMAIN' nu se rezolva in DNS. Creeaza inregistrarea A catre IP-ul serverului si asteapta propagarea."
  fi
  if command -v hostname >/dev/null 2>&1 && ! hostname -I 2>/dev/null | tr ' ' '\n' | grep -qx "$resolved"; then
    warn "$DOMAIN -> $resolved, dar IP-ul nu apare pe interfetele acestui server ($(hostname -I 2>/dev/null)). Continui; certbot va esua daca DNS-ul indica alt server."
  else
    ok "DNS: $DOMAIN -> $resolved"
  fi
fi

# Creeaza volumele (letsencrypt, certbot_webroot) si descarca imaginea certbot
compose run --rm --no-deps --entrypoint true certbot

if compose run --rm --no-deps --entrypoint sh certbot \
     -c "test -s '/etc/letsencrypt/live/$DOMAIN/fullchain.pem'" >/dev/null 2>&1; then
  if (( ! FORCE )); then
    ok "Exista deja certificat pentru $DOMAIN. (Detalii: --status; reemitere: --force)"
    exit 0
  fi
  confirm "Certificatul existent pentru $DOMAIN va fi sters si reemis." "$DOMAIN"
  certbot_cmd delete --cert-name "$DOMAIN" --non-interactive
fi

PROJECT="$(project_name)"
ACME_CONTAINER="${PROJECT}-acme-nginx"
TEMP_NGINX=0
cleanup() {
  if (( TEMP_NGINX )); then
    docker rm -f "$ACME_CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ "$(service_state nginx)" == running* ]]; then
  info "Nginx-ul de prod ruleaza; il folosesc pentru challenge."
else
  info "Pornesc un nginx temporar pe portul 80 pentru challenge-ul ACME..."
  docker rm -f "$ACME_CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$ACME_CONTAINER" -p 80:80 \
    -v "${PROJECT}_certbot_webroot:/usr/share/nginx/html:ro" \
    nginx:1.30.6-alpine >/dev/null \
    || die "Nu pot porni nginx-ul temporar pe portul 80 (e ocupat? verifica: ss -ltnp | grep :80)."
  TEMP_NGINX=1
fi

args=(certonly --webroot -w /var/www/certbot
      --cert-name "$DOMAIN" -d "$DOMAIN"
      --email "$EMAIL" --agree-tos --no-eff-email --non-interactive)
(( WITH_WWW )) && args+=(-d "www.$DOMAIN")
(( STAGING )) && args+=(--staging)

info "Cer certificatul de la Let's Encrypt$( (( STAGING )) && echo ' (STAGING)')..."
certbot_cmd "${args[@]}" || die "certbot a esuat. Cauze uzuale: DNS-ul nu indica acest server, portul 80 blocat de firewall/provider, rate limit (incearca --staging)."

cleanup
TEMP_NGINX=0
reload_nginx
ok "Certificat emis pentru $DOMAIN$( (( WITH_WWW )) && echo " si www.$DOMAIN")."
(( STAGING )) && warn "Certificat de STAGING (nu e de incredere in browser). Pentru cel real: scripts/init-ssl.sh --force"
info "Urmatorul pas: scripts/prod-deploy.sh"
