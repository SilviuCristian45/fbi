# ============================================================================
# Functii comune pentru scripturile PowerShell de dev (Windows PowerShell 5.1+).
# Se include cu:  . (Join-Path $PSScriptRoot 'lib\common.ps1')
# Echivalentul lui lib/common.sh, doar pentru stack-ul de dev.
# ============================================================================

# $PSScriptRoot = scripts\lib (fisierul curent, chiar si cand e dot-sourced)
$script:RootDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$script:EnvFile = Join-Path $script:RootDir '.env'
$script:WaitFailed = @()

function Write-Info([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host " OK $Message" -ForegroundColor Green }
function Write-Attention([string]$Message) { Write-Host "ATENTIE: $Message" -ForegroundColor Yellow }
function Exit-WithError([string]$Message) {
    Write-Host "EROARE: $Message" -ForegroundColor Red
    exit 1
}

function Assert-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Exit-WithError "Lipseste comanda 'docker'. Instaleaza Docker Desktop."
    }
    $null = docker info --format '{{.ServerVersion}}' 2>$null
    if ($LASTEXITCODE -ne 0) { Exit-WithError "Docker nu raspunde. Porneste Docker Desktop si incearca din nou." }
    $null = docker compose version 2>$null
    if ($LASTEXITCODE -ne 0) { Exit-WithError "Lipseste 'docker compose' (v2). Actualizeaza Docker Desktop." }
}

function Assert-EnvFile {
    if (-not (Test-Path $script:EnvFile)) {
        Exit-WithError "Lipseste .env. Creeaza-l din exemplu si verifica valorile:`n      Copy-Item .env.example .env"
    }
}

# Wrapper peste 'docker compose' cu fisierele de dev. Functie simpla (fara
# param) ca argumentele de tip '-d' sa treaca neschimbate in $args.
# Accepta si array-uri ca argumente (Invoke-Compose $upArgs): le aplatizeaza,
# altfel PowerShell ar trimite tot array-ul ca UN singur argument lui docker.
function Invoke-Compose {
    $composeArgs = @(
        'compose',
        '--project-directory', $script:RootDir,
        '-f', (Join-Path $script:RootDir 'docker-compose.yaml'),
        '-f', (Join-Path $script:RootDir 'docker-compose.dev.yml'),
        '--env-file', $script:EnvFile
    )
    foreach ($a in $args) {
        foreach ($item in @($a)) {
            if ($null -ne $item -and "$item" -ne '') { $composeArgs += [string]$item }
        }
    }
    & docker @composeArgs
}

# Valoarea unei chei din .env (ultima aparitie castiga), fara ghilimele.
function Get-EnvValue([string]$Key) {
    $value = ''
    foreach ($line in Get-Content -Path $script:EnvFile) {
        if ($line -match "^\s*$([regex]::Escape($Key))=(.*)$") { $value = $Matches[1] }
    }
    $value = $value.Trim()
    if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
    } elseif ($value -match '^(.*?)\s+#') {
        $value = $Matches[1]
    }
    return $value
}

# "status|health|restarts" pentru un serviciu sau "missing"
function Get-ServiceState([string]$Service) {
    $cid = Invoke-Compose ps -a -q $Service 2>$null | Select-Object -First 1
    if (-not $cid) { return 'missing' }
    $state = docker inspect -f '{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}|{{.RestartCount}}' $cid 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $state) { return 'missing' }
    return $state
}

# Asteapta ca serviciile (implicit toate) sa fie running + healthy.
# Intoarce $true/$false; serviciile cu probleme ajung in $script:WaitFailed.
function Wait-Healthy([int]$TimeoutSec, [string[]]$Services) {
    if (-not $Services -or $Services.Count -eq 0) {
        $Services = @(Invoke-Compose config --services)
    }
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $lastPrint = -100
    while ($true) {
        $pending = @(); $crashed = @()
        foreach ($s in $Services) {
            $state = Get-ServiceState $s
            if ($state -eq 'missing') { $pending += "$s(fara container)"; continue }
            $status, $health, $restarts = $state -split '\|'
            if ([int]$restarts -ge 3) { $crashed += "$s(a repornit de $restarts ori)" }
            elseif ($status -eq 'exited' -or $status -eq 'dead') { $crashed += "$s($status)" }
            elseif ($status -ne 'running') { $pending += "$s($status)" }
            elseif ($health -eq 'starting' -or $health -eq 'unhealthy') { $pending += "$s($health)" }
        }
        $elapsed = [int]$sw.Elapsed.TotalSeconds
        if ($crashed.Count -gt 0) {
            $script:WaitFailed = @($crashed | ForEach-Object { ($_ -split '\(')[0] })
            Write-Host "EROARE: Servicii cazute: $($crashed -join ', ')" -ForegroundColor Red
            return $false
        }
        if ($pending.Count -eq 0) {
            Write-Ok "Toate serviciile sunt pornite si sanatoase (${elapsed}s)."
            return $true
        }
        if ($elapsed -ge $TimeoutSec) {
            $script:WaitFailed = @($pending | ForEach-Object { ($_ -split '\(')[0] })
            Write-Host "EROARE: Timeout dupa ${TimeoutSec}s. Inca nepregatite: $($pending -join ', ')" -ForegroundColor Red
            return $false
        }
        if ($elapsed - $lastPrint -ge 15) {
            Write-Info "Astept (${elapsed}s): $($pending -join ', ')"
            $lastPrint = $elapsed
        }
        Start-Sleep -Seconds 3
    }
}

function Show-ServiceLogs([string[]]$Services) {
    foreach ($s in $Services) {
        Write-Host "`n----- ultimele loguri: $s -----" -ForegroundColor White
        Invoke-Compose logs --no-color --tail=60 $s
    }
}

# Avertisment (nu blocheaza) daca indexul facial nu corespunde setului asteptat
# (python-ai /index-status, regula SYNC_MAX_PERSONS). Echivalentul check_face_index din common.sh.
function Test-FaceIndex {
    if ((Get-ServiceState 'python-ai') -notlike 'running*') {
        Write-Attention "python-ai nu ruleaza; sar peste verificarea indexului facial."
        return
    }
    # Fara ghilimele duble in argumente (PowerShell 5.1 le strica la exe-uri native)
    $py = "import json,urllib.request as r;d=json.load(r.urlopen('http://127.0.0.1:8006/index-status',timeout=30));print(d['indexed'],d['expected'],d['orphans'],d['missing'],d['no_face'],d['db_images'],d['max_persons'],d.get('persons_total',0),d.get('persons_unclassified',0))"
    $out = "$(Invoke-Compose exec -T python-ai python -c $py 2>$null)".Trim()
    if ($LASTEXITCODE -ne 0 -or $out -notmatch '^\d+( \d+){8}$') {
        Write-Attention "Nu am putut verifica indexul facial (python-ai /index-status sau DB). Verifica mai tarziu: scripts/healthcheck.sh --dev"
        return
    }
    $indexed, $expected, $orphans, $missing, $noFace, $dbImages, $maxPersons, $persons, $unclassified = $out -split ' ' | ForEach-Object { [int]$_ }
    if ($maxPersons -gt 0) { $scope = "$expected persoane asteptate (SYNC_MAX_PERSONS=$maxPersons)" }
    else { $scope = "$expected poze asteptate (fara limita)" }
    $noFaceText = ''
    if ($noFace -gt 0) { $noFaceText = " ($noFace fara fata detectabila)" }

    if ($dbImages -eq 0) {
        if ($persons -eq 0) { $why = '"WantedImages" e goala: importul FBI (scraper-ul din backend) nu s-a terminat' }
        elseif ($unclassified -eq $persons) { $why = 'persoanele nu au poster_classification: reporneste backend-ul cu SCRAPER_RUN_AT_STARTUP=always' }
        else { $why = 'nicio persoana nu corespunde SYNC_INCLUDE_CLASSIFICATIONS' }
        Write-Attention "Nicio poza de indexat: $why. Apoi ruleaza (Git Bash): scripts/sync-faces.sh --dev --full"
    } elseif ($indexed -eq 0) {
        Write-Attention "Indexul facial e gol: recunoasterea nu va gasi potriviri. Ruleaza (Git Bash): scripts/sync-faces.sh --dev --full"
    } elseif ($orphans -gt 0 -or $missing -gt 0) {
        Write-Attention "Indexul facial nu corespunde setului asteptat (${scope}): $orphans vectori in afara setului, $missing fara vector$noFaceText. Ruleaza (Git Bash): scripts/sync-faces.sh --dev"
    } else {
        Write-Ok "Index facial: $indexed vectori, $scope$noFaceText."
    }
}
