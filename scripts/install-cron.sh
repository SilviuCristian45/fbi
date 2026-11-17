#!/usr/bin/env bash
# Instaleaza (sau actualizeaza / sterge) job-urile cron ale proiectului in
# crontab-ul userului curent: backup zilnic, healthcheck optional, rotatia
# logurilor. Blocul din crontab e delimitat si rescris la fiecare rulare.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/install-cron.sh [optiuni]

Adauga in crontab-ul userului curent (ruleaza-l ca userul de deploy, nu root):
  - backup zilnic (scripts/backup.sh)          -> logs/backup.log
  - optional: healthcheck orar                 -> logs/healthcheck.log
  - rotatia saptamanala a logurilor din logs/ (logrotate cu stare proprie,
    fara root: 8 saptamani, comprimate)
Ruland din nou scriptul se inlocuieste blocul existent (idempotent).

Reinnoirea certificatelor NU e in cron: o face containerul certbot din
docker-compose.prod.yml (certbot renew la 12h), iar nginx isi reincarca
certificatele la 6h. Manual: scripts/init-ssl.sh --renew

Optiuni:
  --backup-time HH:MM   ora backup-ului zilnic (implicit 03:30, ora serverului)
  --with-healthcheck    adauga healthcheck la fiecare ora (problemele apar in log)
  --remove              sterge blocul proiectului din crontab
  --dry-run             afiseaza crontab-ul rezultat, fara sa-l instaleze
  -h, --help            acest mesaj
USAGE
}

BACKUP_TIME="03:30"; WITH_HEALTH=0; REMOVE=0; DRY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --backup-time) BACKUP_TIME="${2:?--backup-time cere HH:MM}"; shift ;;
    --with-healthcheck) WITH_HEALTH=1 ;;
    --remove) REMOVE=1 ;;
    --dry-run) DRY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Optiune necunoscuta: $1 (vezi --help)" ;;
  esac
  shift
done

require_cmd crontab "Instaleaza cron (Debian/Ubuntu: apt-get install cron)."
[[ "$BACKUP_TIME" =~ ^([01][0-9]|2[0-3]):([0-5][0-9])$ ]] || die "--backup-time invalid: $BACKUP_TIME (format HH:MM)"
HOUR=$((10#${BASH_REMATCH[1]})); MINUTE=$((10#${BASH_REMATCH[2]}))
[[ $EUID -eq 0 ]] && warn "Rulezi ca root: job-urile vor rula ca root si backup-urile vor fi ale lui root. Recomandat: userul de deploy."

BEGIN_MARK="# BEGIN fbi-cron ($ROOT_DIR) - gestionat de scripts/install-cron.sh, nu edita manual"
END_MARK="# END fbi-cron ($ROOT_DIR)"
current="$(crontab -l 2>/dev/null || true)"
# Scoate blocul vechi (daca exista)
stripped="$(printf '%s\n' "$current" | awk -v b="$BEGIN_MARK" -v e="$END_MARK" '
  $0 == b {skip=1; next}
  $0 == e {skip=0; next}
  !skip' | sed '/^$/N;/^\n$/D')"

if (( REMOVE )); then
  new="$stripped"
else
  use_env prod
  LOG_DIR="$ROOT_DIR/logs"
  LOGROTATE_BIN="$(command -v logrotate || echo /usr/sbin/logrotate)"
  [[ -x "$LOGROTATE_BIN" ]] || die "Lipseste logrotate (apt-get install logrotate)."

  if (( ! DRY )); then
    mkdir -p "$LOG_DIR"
    chmod 750 "$LOG_DIR"
    # logrotate refuza configurari/foldere scriibile de altii
    cat > "$LOG_DIR/logrotate.conf" <<CONF
# Generat de scripts/install-cron.sh
$LOG_DIR/*.log {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
CONF
    chmod 640 "$LOG_DIR/logrotate.conf"
  fi

  block="$BEGIN_MARK
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
$MINUTE $HOUR * * * cd '$ROOT_DIR' && bash scripts/backup.sh >> '$LOG_DIR/backup.log' 2>&1"
  if (( WITH_HEALTH )); then
    block+="
5 * * * * cd '$ROOT_DIR' && { date -Iseconds; bash scripts/healthcheck.sh; } >> '$LOG_DIR/healthcheck.log' 2>&1"
  fi
  block+="
45 4 * * * '$LOGROTATE_BIN' -s '$LOG_DIR/.logrotate.state' '$LOG_DIR/logrotate.conf'
$END_MARK"
  if [[ -n "$stripped" ]]; then
    new="$stripped
$block"
  else
    new="$block"
  fi
fi

if (( DRY )); then
  info "Crontab rezultat (dry run, neinstalat):"
  printf '%s\n' "$new"
  exit 0
fi

printf '%s\n' "$new" | crontab -
if (( REMOVE )); then
  ok "Blocul fbi-cron a fost sters din crontab."
else
  ok "Cron instalat pentru userul $(id -un):"
  crontab -l | awk -v b="$BEGIN_MARK" -v e="$END_MARK" '$0 == b {p=1} p {print "    " $0} $0 == e {p=0}'
  info "Loguri: $LOG_DIR/  (verifica dupa prima rulare: tail $LOG_DIR/backup.log)"
fi
