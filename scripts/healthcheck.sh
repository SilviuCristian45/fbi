#!/usr/bin/env bash
# Verifica starea stack-ului si spune clar ce e picat: containere,
# healthcheck-uri, consumatorii RabbitMQ, accesul HTTP(S), certificat, disc.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/healthcheck.sh [optiuni]

Verifica:
  - fiecare serviciu: container pornit, healthcheck "healthy", fara restarturi in bucla
  - RabbitMQ: coada de analiza are consumator (python-ai) si coada de
    rezultate are consumator (backend); mesaje blocate in coada
  - HTTP: nginx raspunde, aplicatia se incarca (prod: si HTTPS)
  - prod: zile ramase pana la expirarea certificatului
  - spatiu pe disc
Cod de iesire 0 = totul OK, 1 = cel putin o problema (util in cron/monitorizare).

Optiuni:
  --dev        verifica stack-ul de dev (.env) in loc de prod (.env.prod)
  -h, --help   acest mesaj
USAGE
}

ENV_NAME=prod
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dev) ENV_NAME=dev ;;
    -h|--help) usage; exit 0 ;;
    *) die "Optiune necunoscuta: $1 (vezi --help)" ;;
  esac
  shift
done

require_docker
use_env "$ENV_NAME"
PROBLEMS=()
WARNS=()
row() { printf '  %-22s %-10s %s\n' "$1" "$2" "$3"; }
pass() { row "$1" "${C_GREEN}OK${C_RESET}" "$2"; }
fail() { row "$1" "${C_RED}PICAT${C_RESET}" "$2"; PROBLEMS+=("$1: $2"); }
attn() { row "$1" "${C_YELLOW}ATENTIE${C_RESET}" "$2"; WARNS+=("$1: $2"); }

# --- Containere ---------------------------------------------------------------------
printf '\n%sServicii (%s)%s\n' "$C_BOLD" "$STACK_ENV" "$C_RESET"
mapfile -t SERVICES < <(compose config --services)
for s in "${SERVICES[@]}"; do
  state="$(service_state "$s")"
  if [[ "$state" == missing ]]; then
    fail "$s" "nu exista container (stack-ul nu e pornit?)"
    continue
  fi
  IFS='|' read -r status health restarts <<<"$state"
  detail="status=$status health=$health restarts=$restarts"
  if [[ "$status" != running ]]; then
    fail "$s" "$detail"
  elif [[ "$health" == unhealthy ]]; then
    fail "$s" "$detail (healthcheck esueaza)"
  elif [[ "$health" == starting ]]; then
    attn "$s" "$detail (inca porneste)"
  elif (( restarts >= 3 )); then
    attn "$s" "$detail (a repornit des: verifica logurile)"
  else
    pass "$s" "$detail"
  fi
done

# --- RabbitMQ: consumatori ------------------------------------------------------------
printf '\n%sRabbitMQ%s\n' "$C_BOLD" "$C_RESET"
Q_ANALYSIS="$(env_get RABBITMQ_QUEUE_ANALYSIS)"
Q_FINISHED="$(env_get RABBITMQ_QUEUE_FINISHED)"
if [[ "$(service_state rabbitmq)" == running* ]] \
   && queues="$(compose exec -T rabbitmq rabbitmqctl -q --no-table-headers list_queues name messages consumers 2>/dev/null)"; then
  check_queue() {
    local q="$1" who="$2" line messages consumers
    line="$(printf '%s\n' "$queues" | awk -v q="$q" '$1 == q {print $2" "$3}')"
    if [[ -z "$line" ]]; then
      fail "coada $q" "nu exista: $who nu s-a conectat niciodata la RabbitMQ"
      return
    fi
    read -r messages consumers <<<"$line"
    if (( consumers == 0 )); then
      fail "coada $q" "0 consumatori ($who nu asculta), $messages mesaje in asteptare"
    elif (( messages > 20 )); then
      attn "coada $q" "$consumers consumator(i), dar $messages mesaje in asteptare (procesare lenta?)"
    else
      pass "coada $q" "$consumers consumator(i), $messages mesaje in asteptare"
    fi
  }
  check_queue "$Q_ANALYSIS" "python-ai"
  check_queue "$Q_FINISHED" "backend"
else
  fail "rabbitmq" "nu pot interoga cozile (serviciul nu ruleaza?)"
fi

# --- Index facial -----------------------------------------------------------------------
printf '\n%sRecunoastere faciala%s\n' "$C_BOLD" "$C_RESET"
SYNC_CMD="scripts/sync-faces.sh"
[[ "$STACK_ENV" == dev ]] && SYNC_CMD+=" --dev"
if [[ "$(service_state python-ai)" != running* ]]; then
  attn "index facial" "python-ai nu ruleaza; nu pot verifica indexul"
elif ! face_index_stats; then
  attn "index facial" "nu pot citi /index-status (python-ai porneste sau sync in curs?)"
elif (( FI_INDEX == 0 )); then
  if (( FI_DB == 0 )); then
    attn "index facial" "GOL: recunoasterea nu va gasi potriviri. Nicio poza de indexat: $(face_index_no_candidates); apoi $SYNC_CMD --full"
  else
    attn "index facial" "GOL: recunoasterea nu va gasi potriviri. Ruleaza: $SYNC_CMD --full"
  fi
elif (( FI_ORPHANS > 0 || FI_MISSING > 0 )); then
  attn "index facial" "$FI_INDEX vectori; $(face_index_scope); $FI_ORPHANS in afara setului, $FI_MISSING fara vector ($SYNC_CMD)"
else
  pass "index facial" "$FI_INDEX vectori; $(face_index_scope); $FI_NOFACE fara fata detectabila"
fi

# --- HTTP ---------------------------------------------------------------------------
printf '\n%sHTTP%s\n' "$C_BOLD" "$C_RESET"
http_check() {
  local name="$1" url="$2" code
  code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 "$url" || true)"
  if [[ "$code" =~ ^(2|3)[0-9][0-9]$ ]]; then
    pass "$name" "$url -> $code"
  else
    fail "$name" "$url -> ${code:-fara raspuns}"
  fi
}
if command -v curl >/dev/null 2>&1; then
  if [[ "$STACK_ENV" == prod ]]; then
    DOMAIN="$(env_get DOMAIN)"
    http_check "nginx (http)" "http://$DOMAIN/nginx-health"
    http_check "aplicatia (https)" "https://$DOMAIN/"
  else
    PUBLIC_URL="$(env_get PUBLIC_URL)"
    FILES_URL="$(env_get FILES_PUBLIC_URL)"
    http_check "nginx" "$PUBLIC_URL/nginx-health"
    http_check "aplicatia" "$PUBLIC_URL/"
    # Pozele (FILES_PUBLIC_URL) trebuie sa poata fi descarcate si din python-ai,
    # dupa rescrierea IMAGE_URL_REWRITE (dev: http://localhost:8088 -> http://nginx)
    if [[ "$(service_state python-ai)" == running* ]]; then
      files_host="${FILES_URL%/files*}"
      if target="$(compose exec -T python-ai python -c '
import os, sys, urllib.request
url = sys.argv[1] + "/nginx-health"
rule = os.environ.get("IMAGE_URL_REWRITE", "")
if "=>" in rule:
    src, dst = (p.strip() for p in rule.split("=>", 1))
    if src and url.startswith(src):
        url = dst + url[len(src):]
urllib.request.urlopen(url, timeout=5)
print(url.rsplit("/nginx-health", 1)[0])' "$files_host" 2>/dev/null | tr -d '\r')"; then
        pass "python-ai -> fisiere" "$files_host accesibil din container (prin $target)"
      else
        fail "python-ai -> fisiere" "$files_host NU e accesibil din container (verifica IMAGE_URL_REWRITE; analiza nu poate descarca pozele)"
      fi
    fi
  fi
else
  attn "http" "curl lipseste; sar peste verificarile HTTP"
fi

# --- Certificat (prod) ------------------------------------------------------------------
if [[ "$STACK_ENV" == prod ]] && command -v openssl >/dev/null 2>&1; then
  end="$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2 || true)"
  if [[ -z "$end" ]]; then
    fail "certificat TLS" "nu pot citi certificatul de pe $DOMAIN:443"
  else
    days=$(( ( $(date -d "$end" +%s) - $(date +%s) ) / 86400 ))
    if (( days < 7 )); then
      fail "certificat TLS" "expira in $days zile ($end): verifica containerul certbot"
    elif (( days < 20 )); then
      attn "certificat TLS" "expira in $days zile ($end); reinnoirea automata ar fi trebuit sa ruleze"
    else
      pass "certificat TLS" "valabil inca $days zile"
    fi
  fi
fi

# --- Disc ---------------------------------------------------------------------------
printf '\n%sSistem%s\n' "$C_BOLD" "$C_RESET"
use="$(df -P "$ROOT_DIR" | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [[ "$use" =~ ^[0-9]+$ ]]; then
  if (( use >= 95 )); then fail "disc" "${use}% folosit"
  elif (( use >= 85 )); then attn "disc" "${use}% folosit (curata: docker system prune, backup-uri vechi)"
  else pass "disc" "${use}% folosit"; fi
fi
if command -v free >/dev/null 2>&1; then
  avail="$(free -m | awk '/^Mem:/ {print $7}')"
  [[ -n "$avail" ]] && row "memorie" "info" "${avail} MB disponibili"
fi

# --- Rezumat ------------------------------------------------------------------------
echo
if (( ${#PROBLEMS[@]} > 0 )); then
  err "${#PROBLEMS[@]} problema(e):"
  for p in "${PROBLEMS[@]}"; do printf '  - %s\n' "$p" >&2; done
  printf '\nLoguri: docker compose ... logs <serviciu>  (dev: scripts/dev-logs.sh <serviciu>)\n' >&2
  exit 1
fi
if (( ${#WARNS[@]} > 0 )); then
  warn "${#WARNS[@]} avertisment(e), dar nimic picat."
fi
ok "Totul functioneaza."
