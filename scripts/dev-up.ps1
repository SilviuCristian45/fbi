<#
.SYNOPSIS
    Porneste stack-ul de dezvoltare (docker-compose.yaml + docker-compose.dev.yml).
.DESCRIPTION
    Construieste imaginile si porneste stack-ul de dev in fundal, apoi asteapta
    healthcheck-urile si afiseaza adresele utile. Fara servicii = tot stack-ul.
    Prima rulare dureaza (imaginea AI cu TensorFlow are cativa GB).
    NEXT_PUBLIC_* sunt coapte la build: dupa ce schimbi PUBLIC_URL sau
    API_KEY_SHARED in .env, ruleaza: scripts\dev-up.ps1 frontend
.PARAMETER Services
    Serviciile de pornit (ex. backend frontend). Implicit: toate.
.PARAMETER NoBuild
    Nu reconstrui imaginile.
.PARAMETER NoWait
    Nu astepta healthcheck-urile.
.PARAMETER Timeout
    Secunde de asteptare pentru healthcheck-uri (implicit 900).
.EXAMPLE
    scripts\dev-up.ps1
.EXAMPLE
    scripts\dev-up.ps1 backend
#>
param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$Services = @(),
    [switch]$NoBuild,
    [switch]$NoWait,
    [int]$Timeout = 900,
    [switch]$Help
)

. (Join-Path $PSScriptRoot 'lib\common.ps1')

if ($Help -or ($Services -contains '--help') -or ($Services -contains '-h')) {
    Get-Help $PSCommandPath -Detailed
    exit 0
}

Assert-Docker
Assert-EnvFile

$upArgs = @('up', '-d', '--remove-orphans')
if (-not $NoBuild) { $upArgs += '--build' }
Write-Info "Pornesc stack-ul de dev (proiect: $(Get-EnvValue 'COMPOSE_PROJECT_NAME'))..."
Invoke-Compose @upArgs @Services
if ($LASTEXITCODE -ne 0) { Exit-WithError "docker compose up a esuat (vezi mesajele de mai sus)." }

if (-not $NoWait) {
    if (-not (Wait-Healthy -TimeoutSec $Timeout -Services $Services)) {
        Show-ServiceLogs $script:WaitFailed
        Exit-WithError "Stack-ul nu a pornit complet. Vezi logurile de mai sus sau: scripts\dev-logs.ps1 <serviciu>"
    }
}
if ($Services.Count -gt 0 -and (Get-ServiceState 'nginx') -like 'running*') {
    # nginx rezolva upstream-urile doar la (re)incarcare
    Invoke-Compose exec -T nginx nginx -s reload 2>$null | Out-Null
}

# Doar avertisment: indexul facial fata de "WantedImages"
if (-not $NoWait -and ($Services.Count -eq 0 -or $Services -contains 'python-ai')) {
    Test-FaceIndex
}

Write-Host ""
Write-Host "Adrese dev:" -ForegroundColor White
Write-Host "  Aplicatia            $(Get-EnvValue 'PUBLIC_URL')"
Write-Host "  Swagger (backend)    http://localhost:$(Get-EnvValue 'DEV_BACKEND_PORT')/swagger"
Write-Host "  Keycloak (admin)     http://localhost:$(Get-EnvValue 'DEV_KEYCLOAK_PORT')/admin/   (user: $(Get-EnvValue 'KEYCLOAK_ADMIN'))"
Write-Host "  MinIO/Silo consola   http://localhost:$(Get-EnvValue 'DEV_MINIO_CONSOLE_PORT')"
Write-Host "  RabbitMQ management  http://localhost:$(Get-EnvValue 'DEV_RABBITMQ_MGMT_PORT')"
Write-Host "  Postgres             localhost:$(Get-EnvValue 'DEV_DB_PORT')  (db: $(Get-EnvValue 'DB_NAME'), user: $(Get-EnvValue 'DB_USER'))"
Write-Host ""
Write-Host "Loguri: scripts\dev-logs.ps1 [serviciu]   Oprire: scripts\dev-down.ps1"
