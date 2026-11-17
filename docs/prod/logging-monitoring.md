# Logs and monitoring

The examples use `alias dc='docker compose -f docker-compose.yaml -f docker-compose.prod.yml --env-file .env.prod --env-file .env.release'`.

## Health

```bash
scripts/healthcheck.sh
```

| Check | Fails when |
|---|---|
| Each service | container missing, not running, healthcheck `unhealthy`. A warning if still starting or restarted 3+ times. |
| RabbitMQ | `face-analysis-queue` or `analysis-finished-queue` missing or with **0 consumers** (python-ai / backend not listening). A warning above 20 waiting messages. |
| HTTP | `http://<your-domain>/nginx-health` or `https://<your-domain>/` not 2xx/3xx |
| Face index | warning only: empty index ("recognition will find no matches"), vectors outside the expected set, or expected persons without a vector (compared with the first `SYNC_MAX_PERSONS` persons via python-ai `/index-status`; persons without a detectable face don't count) |
| Certificate | expires in < 7 days (warning < 20) |
| Disk | ≥ 95% used (warning ≥ 85%) |

Exit code 0 = OK, 1 = at least one failure, which makes it usable from cron or
an external monitor. `scripts/install-cron.sh --with-healthcheck` runs it
hourly into `logs/healthcheck.log`.

For alerts from outside the server, point an uptime monitor (Uptime Kuma,
UptimeRobot, Healthchecks.io, ...) at `https://<your-domain>/`.

Container-level health:

```bash
dc ps                                   # STATUS shows (healthy) / (unhealthy)
docker inspect --format '{{json .State.Health}}' $(dc ps -q backend)
docker stats --no-stream                # CPU / memory per container
```

## Logs

All containers use the `json-file` driver with rotation (`max-size: 10m`,
`max-file: 5`, so at most ~50 MB per container), configured in
`docker-compose.prod.yml`.

```bash
dc logs -f --tail=100 backend            # follow one service
dc logs --since 1h python-ai             # last hour
dc logs -f backend python-ai             # several
dc logs --no-log-prefix nginx | grep ' 502 '
```

| Service | What to look for |
|---|---|
| backend | `Migrarea bazei de date a reușit!` / `eroare la migrare` at start; FBI sync `--- Începe sincronizarea cu FBI API ---`; `[SignalR] Notifying clients about Report #N` |
| python-ai | `Loaded N vectors from disk` / `Index inexistent` / `Indexul facial e gol`, sync `Progress: X/Y` and `SYNC FINISHED`, `Consumer started`, `Received job`, `Job N finished. Matches found: K`, `Failed to download image`, `DB Save Error`, `RabbitMQ Connection Failed` |
| file-api | `Bucket ... creat`, `EROARE MINIO` |
| keycloak | startup errors, `LOGIN_ERROR` (if events are enabled) |
| nginx | access log (each request), `upstream ... could not be resolved` / 502 |
| certbot | renewal attempts every 12 h |

Script logs (cron) live in `~/fbi/logs/` and are rotated weekly by logrotate
([Backup and restore](backup-restore.md#daily-backup-with-cron)).

## Common incidents

| Symptom | Check |
|---|---|
| 502 Bad Gateway | `dc ps`: is the upstream container healthy? nginx re-resolves names every 10 s, so a recreated container is picked up automatically. Otherwise look at that service's logs. |
| Reports stay "pending" | `healthcheck.sh` (consumers), `dc logs python-ai` ([testing guide](../dev/testing-face-recognition.md#typical-failures)) |
| python-ai keeps restarting | OOM: `docker inspect -f '{{.State.OOMKilled}}' $(dc ps -q python-ai)`. Raise `AI_MEMORY_LIMIT` or add RAM/swap. |
| Backend restart loop after an update | migration failure, see the backend logs; restore the pre-update backup if needed ([Update and rollback](update-and-rollback.md)) |
| Login fails for everyone | Keycloak health; `invalid_client` = client secret mismatch ([Keycloak](keycloak.md#rotating-the-client-secret)) |
| Certificate warnings | `scripts/init-ssl.sh --status`, `dc logs certbot` |
| Disk full | `docker system df`, prune build cache/images, check `backups/` and `BACKUP_KEEP` |

## Rebuilding the face index

Preferred: build it on the PC with the dev stack and push it:

```bash
# on the PC
scripts/sync-faces.sh --dev                      # or --dev --full
scripts/push-face-index.sh deploy@<server-ip>    # replaces the prod index (old one kept as .bak)
```

`push-face-index.sh` stops python-ai on the VPS, writes `fbi_vectors.pkl` and
`fbi_vectors.pkl.noface.json` into the prod `face_index` volume through a
temporary container on the python-ai image, starts python-ai again and prints
the `/index-status` check.

Alternative, on the VPS:

```bash
scripts/sync-faces.sh            # align the index with the first SYNC_MAX_PERSONS persons
scripts/sync-faces.sh --full     # start from an empty index
```

The script first checks that `"WantedImages"` is not empty (otherwise it tells
you to wait for the FBI import) and warns if the import still seems to be
running. Then it recreates `python-ai` with `RUN_SYNC_AT_STARTUP=true`, prints
the progress and waits for the `SYNC FINISHED` log line (the API and its
healthcheck come up only after the sync, so the container may show
`unhealthy` meanwhile). Then it prints a summary (added, removed, failed),
copies the per-image report (one line per image tried: indexed, no face, or
download failed with the reason, e.g. `HTTP 403`) to
`logs/sync-faces/<env>-sync-<timestamp>.log`, prints the count per status and
the download failure reasons, and recreates the container with the normal setting. Default timeout: 2 h
(`--timeout`). The
index lives on the `face_index` volume, so it survives restarts and
redeploys. Analysis is paused during the sync, and incoming reports wait in
RabbitMQ.

## Resource usage over time

There is no metrics stack in the project. For a single VPS, `docker stats`, the
provider's graphs and `healthcheck.sh` are usually enough. If you need more,
cAdvisor + Prometheus + Grafana or Netdata can be added as extra services
without exposing them publicly. Use the same loopback-port + SSH tunnel
pattern as the [admin consoles](admin-consoles.md).
