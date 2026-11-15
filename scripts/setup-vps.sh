#!/usr/bin/env bash
# Pregatire VPS (Ubuntu/Debian): Docker + compose plugin, firewall ufw
# (doar SSH/80/443), user non-root in grupul docker, swap daca RAM-ul e mic.
# Idempotent: poate fi rulat de mai multe ori.
set -euo pipefail

if [[ -t 1 ]]; then
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_BLUE=$'\033[34m'; C_RESET=$'\033[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''; C_BLUE=''; C_RESET=''
fi
info() { printf '%s==>%s %s\n' "$C_BLUE" "$C_RESET" "$*"; }
ok()   { printf '%s OK%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%sATENTIE:%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die()  { printf '%sEROARE:%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
Utilizare: sudo scripts/setup-vps.sh [optiuni]

Pregateste un VPS proaspat (Ubuntu 22.04/24.04 sau Debian 12):
  1. pachete de baza (git, curl, ufw, openssl...)
  2. Docker Engine + pluginul compose din repository-ul oficial Docker
  3. user non-root (implicit "deploy") in grupul docker, cu cheile SSH
     copiate de la root (daca exista)
  4. ufw: refuza tot traficul intrant, permite doar SSH, 80, 443
  5. swap (implicit 4G) daca RAM-ul e sub 8 GB si nu exista swap

ATENTIE: porturile publicate de Docker OCOLESC ufw. De aceea in prod doar
nginx publica porturi (vezi docker-compose.prod.yml).

Optiuni:
  --user NUME        userul de deploy (implicit: deploy)
  --ssh-port PORT    portul SSH permis in ufw (implicit: 22)
  --swap-size SIZE   dimensiunea swap-ului (implicit: 4G)
  --no-swap          nu configura swap
  --no-ufw           nu configura firewall-ul
  -h, --help         acest mesaj
USAGE
}

DEPLOY_USER=deploy; SSH_PORT=22; SWAP_SIZE=4G; DO_SWAP=1; DO_UFW=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --user) DEPLOY_USER="${2:?--user cere un nume}"; shift ;;
    --ssh-port) SSH_PORT="${2:?--ssh-port cere un port}"; shift ;;
    --swap-size) SWAP_SIZE="${2:?--swap-size cere o valoare}"; shift ;;
    --no-swap) DO_SWAP=0 ;;
    --no-ufw) DO_UFW=0 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Optiune necunoscuta: $1 (vezi --help)" ;;
  esac
  shift
done

[[ $EUID -eq 0 ]] || die "Ruleaza ca root: sudo $0 $*"
[[ -r /etc/os-release ]] || die "Nu pot detecta distributia (/etc/os-release lipseste)."
# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}" in
  ubuntu|debian) ;;
  *) die "Distributie nesuportata: ${ID:-necunoscuta}. Scriptul suporta Ubuntu si Debian." ;;
esac
[[ "$SSH_PORT" =~ ^[0-9]+$ ]] || die "--ssh-port invalid: $SSH_PORT"

export DEBIAN_FRONTEND=noninteractive

# --- 1. Pachete de baza ---------------------------------------------------------
info "Instalez pachetele de baza..."
apt-get update -q
apt-get install -y -q ca-certificates curl gnupg git ufw openssl
ok "Pachete de baza instalate."

# --- 2. Docker ------------------------------------------------------------------
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ok "Docker deja instalat: $(docker --version)"
else
  info "Instalez Docker Engine + compose plugin (repository oficial ${ID})..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
  ok "Docker instalat: $(docker --version), $(docker compose version)"
fi

# --- 3. User de deploy ------------------------------------------------------------
if id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  ok "Userul $DEPLOY_USER exista."
else
  info "Creez userul $DEPLOY_USER..."
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
ok "$DEPLOY_USER e in grupul docker (echivalent root pentru Docker; protejeaza accesul SSH)."

user_home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
if [[ -s /root/.ssh/authorized_keys && ! -s "$user_home/.ssh/authorized_keys" ]]; then
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$user_home/.ssh"
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" /root/.ssh/authorized_keys "$user_home/.ssh/authorized_keys"
  ok "Cheile SSH ale lui root au fost copiate pentru $DEPLOY_USER."
elif [[ ! -s "$user_home/.ssh/authorized_keys" ]]; then
  warn "$DEPLOY_USER nu are chei SSH. Adauga cheia ta publica in $user_home/.ssh/authorized_keys."
fi

# --- 4. Firewall ------------------------------------------------------------------
if (( DO_UFW )); then
  info "Configurez ufw (SSH $SSH_PORT, 80, 443)..."
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  ufw allow "${SSH_PORT}/tcp" comment 'SSH' >/dev/null
  ufw allow 80/tcp comment 'HTTP (nginx, ACME)' >/dev/null
  ufw allow 443/tcp comment 'HTTPS (nginx)' >/dev/null
  ufw --force enable >/dev/null
  ok "ufw activ:"
  ufw status verbose | sed 's/^/    /'
else
  warn "Am sarit peste configurarea firewall-ului (--no-ufw)."
fi

# --- 5. Swap ----------------------------------------------------------------------
mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
mem_gb=$(( (mem_kb + 1048575) / 1048576 ))
info "RAM detectat: ~${mem_gb} GB (minim recomandat 4 GB, ideal 8 GB)."
(( mem_gb < 4 )) && warn "Sub 4 GB RAM: serviciul AI (TensorFlow) si build-urile pot esua chiar si cu swap."
if (( DO_SWAP )); then
  if [[ -n "$(swapon --show --noheadings 2>/dev/null)" ]]; then
    ok "Swap deja activ: $(swapon --show --noheadings | awk '{print $1" "$3}' | tr '\n' ' ')"
  elif (( mem_kb < 8 * 1024 * 1024 )); then
    info "Creez /swapfile de $SWAP_SIZE..."
    fallocate -l "$SWAP_SIZE" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$(( ${SWAP_SIZE%G} * 1024 )) status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
    swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo 'vm.swappiness=10' > /etc/sysctl.d/99-fbi-swap.conf
    sysctl -q -p /etc/sysctl.d/99-fbi-swap.conf
    ok "Swap $SWAP_SIZE activ (swappiness=10)."
  else
    ok "RAM >= 8 GB, nu e nevoie de swap."
  fi
fi

cat <<NEXT

${C_GREEN}VPS pregatit.${C_RESET} Pasii urmatori (ca $DEPLOY_USER):
  ssh $DEPLOY_USER@<ip-server>
  git clone <url-repo> fbi && cd fbi
  cp .env.prod.example .env.prod && chmod 600 .env.prod && nano .env.prod
  scripts/init-ssl.sh
  scripts/prod-deploy.sh
NEXT
