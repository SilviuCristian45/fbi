<#
.SYNOPSIS
    Opreste stack-ul de dezvoltare. Volumele (datele) raman.
.DESCRIPTION
    Opreste si sterge containerele stack-ului de dev. Datele (Postgres, MinIO,
    RabbitMQ, indexul facial) raman in volume. Pentru a sterge si datele:
    scripts\dev-reset.ps1
#>
param([switch]$Help)

. (Join-Path $PSScriptRoot 'lib\common.ps1')

if ($Help) { Get-Help $PSCommandPath -Detailed; exit 0 }

Assert-Docker
Assert-EnvFile
Write-Info "Opresc stack-ul de dev..."
Invoke-Compose down --remove-orphans
if ($LASTEXITCODE -ne 0) { Exit-WithError "docker compose down a esuat." }
Write-Ok "Stack oprit. Datele au ramas in volume."
