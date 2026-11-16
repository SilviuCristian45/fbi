<#
.SYNOPSIS
    Sterge complet stack-ul de dezvoltare, INCLUSIV datele (volumele).
.DESCRIPTION
    Opreste stack-ul de dev si STERGE volumele lui: baza de date (inclusiv
    Keycloak), fisierele urcate, cozile RabbitMQ, indexul facial. La urmatorul
    dev-up totul porneste de la zero (realm-ul Keycloak se reimporta).
    Afecteaza doar proiectul compose din .env (COMPOSE_PROJECT_NAME), nu alte
    containere de pe masina.
.PARAMETER Images
    Sterge si imaginile construite local (rebuild complet).
.PARAMETER Yes
    Nu mai cere confirmare.
#>
param(
    [switch]$Images,
    [switch]$Yes,
    [switch]$Help
)

. (Join-Path $PSScriptRoot 'lib\common.ps1')

if ($Help) { Get-Help $PSCommandPath -Detailed; exit 0 }

Assert-Docker
Assert-EnvFile

$project = (Invoke-Compose config 2>$null | Select-String -Pattern '^name:\s*(.+)$' | Select-Object -First 1).Matches.Groups[1].Value
if (-not $project) { Exit-WithError "Nu pot determina numele proiectului compose." }
$volumes = @(docker volume ls -q --filter "label=com.docker.compose.project=$project")

Write-Info "Proiect: $project"
if ($volumes.Count -gt 0) { Write-Info "Volume care vor fi sterse: $($volumes -join ' ')" }
else { Write-Info "Volume care vor fi sterse: (niciunul)" }

if (-not $Yes) {
    Write-Host "Toate datele de dev ale proiectului '$project' vor fi sterse definitiv." -ForegroundColor Yellow
    $answer = Read-Host "Scrie 'reset' pentru a continua"
    if ($answer -ne 'reset') { Exit-WithError "Anulat." }
}

Invoke-Compose down -v --remove-orphans
if ($LASTEXITCODE -ne 0) { Exit-WithError "docker compose down a esuat." }
if ($Images) {
    # Imaginile proprii au nume explicit (<IMAGE_PREFIX>/<serviciu>:dev), deci
    # 'down --rmi local' nu le-ar sterge; le stergem doar pe ale noastre.
    $prefix = (Get-Content $script:EnvFile | Where-Object { $_ -match '^\s*IMAGE_PREFIX=' } | Select-Object -Last 1) -replace '^\s*IMAGE_PREFIX=', ''
    if (-not $prefix) { $prefix = 'fbi' }
    foreach ($s in 'backend', 'frontend', 'python-ai', 'file-api', 'nginx') {
        docker image rm "${prefix}/${s}:dev" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { Write-Ok "sters ${prefix}/${s}:dev" }
    }
}
Write-Ok "Reset complet. Porneste din nou cu: scripts\dev-up.ps1"
