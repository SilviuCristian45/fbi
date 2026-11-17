# Troubleshooting

Start with:

```bash
scripts/healthcheck.sh --dev        # what is down, and why
scripts/dev-logs.sh <service>       # logs (PowerShell: scripts\dev-logs.ps1 <service>)
```

## Startup

### `Lipseste .env` / `Missing .env`
Create it: `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`).

### `required variable X is missing a value`
A variable declared as `${X:?}` in `docker-compose.yaml` is missing from your
`.env`. Compare with `.env.example`, which may have gained new variables.

### Port is already allocated
Another process or container uses one of the dev ports. Change the matching
`DEV_*_PORT` in `.env`. For `DEV_HTTP_PORT`, also change `PUBLIC_URL` /
`FILES_PUBLIC_URL` and rebuild the frontend.

### A service never becomes healthy
`dev-up` prints the last logs of the failing service. Typical causes:

| Service | Cause |
|---|---|
| `backend` | Migration failed (log: `eroare la migrare`); Keycloak/RabbitMQ credentials wrong; restart loop |
| `keycloak` | Database not created: the `KEYCLOAK_DB_NAME` database is created only on an empty Postgres volume. After renaming it, run `dev-reset` or create it by hand. |
| `python-ai` | Still importing TensorFlow (start period 3 min); out of memory (give Docker more RAM); `RUN_SYNC_AT_STARTUP=true` makes startup take minutes |
| `minio` | `MINIO_ROOT_PASSWORD` shorter than 8 characters |
| `nginx` | Waits for backend, frontend and file-api to be healthy first |

### Frontend build fails on Windows with native module errors
The `.dockerignore` keeps the local `node_modules` (Windows binaries) out of the
image. Make sure `fbi-frontend/.dockerignore` exists, then rebuild:
`scripts/dev-up.sh frontend`.

### Shell scripts fail with `$'\r': command not found`
The file was checked out with CRLF line endings. `.gitattributes` forces LF for
`*.sh`. Re-checkout the file (`git rm --cached -r . && git reset --hard`, on a
clean tree) or convert it (`dos2unix`).

### PowerShell: "running scripts is disabled on this system"
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, or
`powershell -ExecutionPolicy Bypass -File .\scripts\dev-up.ps1`.

## Login and auth

### Login fails with 400
- The user doesn't exist in the `dotnet` realm (users are not imported), or the
  password is wrong.
- "Account is not fully set up": the user has a required action (temporary
  password, verify email...). Edit the user, clear the required actions and set
  a non-temporary password.
- Backend log `unauthorized_client` / `invalid_client`:
  `KEYCLOAK_CLIENT_SECRET` in `.env` differs from the client secret in Keycloak
  (for example, `.env` changed after the realm was imported). Align them in the
  console, or run `dev-reset`.

### 403 on every call
The user has no `USER`/`ADMIN` realm role. Roles are case-sensitive.

### Swagger 404 on `/swagger`
Swagger is only enabled with `ASPNETCORE_ENVIRONMENT=Development`. The dev
overlay sets it. Use the direct backend port (`http://localhost:17002/swagger`):
nginx doesn't route `/swagger`.

## Uploads and photos

### Upload returns 401/403
`X-Api-Key` missing or different from `API_KEY_SHARED`. The frontend bakes the
key in at build time: after changing `API_KEY_SHARED`, run
`scripts/dev-up.sh frontend`.

### Upload fails with 413
The photo is bigger than `UPLOAD_MAX_SIZE` (nginx, default 20m) or 30 MB
(Kestrel default in the file API).

### Photo URL doesn't load in the browser
URLs look like `http://localhost:8088/files/<bucket>/<file>` and must match
`PUBLIC_URL` / `DEV_HTTP_PORT`. Reports created before the switch from
`host.docker.internal` keep their old URL; recreate them (or rewrite the URLs,
see [Backup and restore](../prod/backup-restore.md#restoring-onto-a-different-domain)).

## Face recognition

### Analysis never finishes
The report stays Pending.

1. `scripts/healthcheck.sh --dev`: are there consumers on both queues? Can
   python-ai reach the files URL?
2. `scripts/dev-logs.sh python-ai`:
   - `Failed to download image`: the stored photo URL is not reachable from
     the container. The log line shows `(via http://nginx/...)` when the
     rewrite applies; if it doesn't, `FILES_PUBLIC_URL` and `PUBLIC_URL` have
     different prefixes (the overlay rewrites `${PUBLIC_URL}`).
     `scripts/healthcheck.sh --dev` checks this (`python-ai -> fisiere`).
   - `DB Save Error`: schema drift with EF migrations ([Migrations](migrations.md#coupling-with-the-python-service)).
   - `Job N finished. Matches found: 0` for every report, and at startup
     `Indexul facial e gol`: the index was never built →
     `scripts/sync-faces.sh --dev --full`. (`Database is empty` on
     `/fast-search` means the same.)
3. Backend log: does `AnalysisFinishedConsumer` receive the message?

### `RabbitMQ Connection Failed. Retrying in 5s`
Normal for a few seconds at startup. If it persists, the RabbitMQ credentials
differ. Note that the RabbitMQ user is created only on an **empty**
`rabbitmq_data` volume: changing `RABBITMQ_USER`/`RABBITMQ_PASSWORD` later
requires `dev-reset` or `rabbitmqctl add_user`.

## Data

### Start over
`scripts/dev-reset.sh` (or `.ps1`) deletes all dev volumes of this project
(database, Keycloak, uploads, queues, face index). Containers of other
projects are not affected.

### Wanted-persons list is empty
On a fresh database the FBI scraper runs at backend startup and needs a few
minutes (`scripts/dev-logs.sh backend`). On an existing database it runs every
24 h; `SCRAPER_RUN_AT_STARTUP=always` forces a run at startup. If the logs show
`Eroare la apelul FBI` or `A crăpat Scraper-ul FBI!`, check outbound internet
access to `api.fbi.gov`. See [Test data](testing-face-recognition.md#test-data).
