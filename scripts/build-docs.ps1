<#
.SYNOPSIS
    Genereaza documentatia HTML (docs/html/) din Markdown-ul din docs/.
.DESCRIPTION
    Converteste docs/architecture.md, docs/dev/*.md si docs/prod/*.md in pagini
    HTML (cuprins lateral, diagrame Mermaid randate, fara CDN). Foloseste Node.js
    local daca exista, altfel un container node:20-alpine.
    Rezultatul: docs\html\index.html
.PARAMETER Docker
    Foloseste containerul chiar daca exista Node local.
#>
param([switch]$Docker, [switch]$Help)

. (Join-Path $PSScriptRoot 'lib\common.ps1')

if ($Help) { Get-Help $PSCommandPath -Detailed; exit 0 }

$tools = Join-Path $script:RootDir 'docs\tools'
$hasNode = (Get-Command node -ErrorAction SilentlyContinue) -and (Get-Command npm -ErrorAction SilentlyContinue)
if ($hasNode -and -not $Docker) {
    Write-Info "Node local: $(node --version)"
    Push-Location $tools
    try {
        npm ci --no-audit --no-fund --loglevel=error
        if ($LASTEXITCODE -ne 0) { Exit-WithError "npm ci a esuat." }
        node build-docs.mjs
        if ($LASTEXITCODE -ne 0) { Exit-WithError "Generarea documentatiei a esuat." }
    } finally { Pop-Location }
} else {
    Assert-Docker
    Write-Info "Rulez generatorul intr-un container node:20-alpine..."
    docker run --rm -e npm_config_cache=/tmp/.npm -v "$($script:RootDir):/work" -w /work/docs/tools node:20-alpine sh -c "npm ci --no-audit --no-fund --loglevel=error && node build-docs.mjs"
    if ($LASTEXITCODE -ne 0) { Exit-WithError "Generarea documentatiei a esuat." }
}
Write-Ok "Documentatia HTML: docs\html\index.html"
