#!/usr/bin/env bash
# Genereaza documentatia HTML (docs/html/) din Markdown-ul din docs/.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

usage() {
  cat <<'USAGE'
Utilizare: scripts/build-docs.sh [optiuni]

Converteste docs/architecture.md, docs/dev/*.md si docs/prod/*.md in pagini
HTML in docs/html/ (cuprins lateral, diagrame Mermaid randate, fara CDN).
Markdown-ul e sursa; docs/html/ e in .gitignore si se regenereaza oricand.
Deschide rezultatul: docs/html/index.html

Foloseste Node.js local daca exista (node + npm), altfel un container
node:20-alpine (nu trebuie instalat nimic in afara de Docker).

Optiuni:
  --docker     foloseste containerul chiar daca exista Node local
  -h, --help   acest mesaj
USAGE
}

FORCE_DOCKER=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --docker) FORCE_DOCKER=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Optiune necunoscuta: $1 (vezi --help)" ;;
  esac
  shift
done

TOOLS="$ROOT_DIR/docs/tools"
if (( ! FORCE_DOCKER )) && command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1; then
  info "Node local: $(node --version)"
  ( cd "$TOOLS" && npm ci --no-audit --no-fund --loglevel=error && node build-docs.mjs )
else
  require_docker
  info "Rulez generatorul intr-un container node:20-alpine..."
  user_args=()
  [[ "$(uname -s)" == Linux ]] && user_args=(--user "$(id -u):$(id -g)")
  docker run --rm "${user_args[@]}" \
    -e npm_config_cache=/tmp/.npm \
    -v "$ROOT_DIR_HOST:/work" -w /work/docs/tools \
    node:20-alpine sh -c "npm ci --no-audit --no-fund --loglevel=error && node build-docs.mjs"
fi
ok "Documentatia HTML: docs/html/index.html"
