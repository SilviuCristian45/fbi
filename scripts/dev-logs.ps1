<#
.SYNOPSIS
    Afiseaza logurile stack-ului de dezvoltare.
.DESCRIPTION
    Urmareste logurile (Ctrl+C pentru iesire). Fara servicii = toate.
    Servicii: db keycloak rabbitmq minio backend frontend python-ai file-api nginx
.PARAMETER Services
    Serviciile ale caror loguri le afisezi. Implicit: toate.
.PARAMETER Tail
    Cate linii anterioare sa afiseze (implicit 200).
.PARAMETER NoFollow
    Afiseaza si iese, fara urmarire.
.EXAMPLE
    scripts\dev-logs.ps1 backend python-ai
#>
param(
    [Parameter(Position = 0, ValueFromRemainingArguments = $true)]
    [string[]]$Services = @(),
    [int]$Tail = 200,
    [switch]$NoFollow,
    [switch]$Help
)

. (Join-Path $PSScriptRoot 'lib\common.ps1')

if ($Help -or ($Services -contains '--help') -or ($Services -contains '-h')) {
    Get-Help $PSCommandPath -Detailed
    exit 0
}

Assert-Docker
Assert-EnvFile
$logArgs = @('logs', "--tail=$Tail")
if (-not $NoFollow) { $logArgs += '-f' }
Invoke-Compose @logArgs @Services
