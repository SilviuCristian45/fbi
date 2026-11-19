# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Educational/portfolio surveillance simulation: users report sightings (photo + map location) of wanted persons scraped from the public FBI API; a Python service runs face recognition asynchronously and the .NET backend pushes real-time alerts over SignalR. Code comments and log messages are largely in Romanian.

Monorepo with four app services plus infrastructure, wired together by Docker Compose (base `docker-compose.yaml` + a dev or prod overlay). Full documentation is in `docs/` (`docs/architecture.md`, `docs/dev/`, `docs/prod/`); keep it in sync when changing behavior it describes.

| Dir | Service | Stack | Port |
|---|---|---|---|
| `fbi-backend/` | Main API (`FbiApi`) | .NET 9, EF Core + Npgsql, MassTransit, SignalR | 7002 |
| `fbi-frontend/` | UI | Next.js 16 (App Router), React 19, Tailwind 4, react-leaflet, recharts | 3000 |
| `face-recog-microservice/` | AI worker | Python, FastAPI, DeepFace (Facenet), pika | 8006 |
| `fbi-media-service/` | File API | .NET minimal API, AWS S3 SDK → MinIO | 7005 |

Nothing is built on the VPS: the five own images are built on the PC (`scripts/release-build.sh`) and sent over SSH (`scripts/release-push.sh`); the face index is also built on the PC and sent with `scripts/push-face-index.sh`.

Infra: PostgreSQL (app DB `DB_NAME` + Keycloak DB `KEYCLOAK_DB_NAME`, the latter created by `postgres-init/script.sh` only on an empty volume), Keycloak (realm auto-imported from `keycloak/realm-export.json`), RabbitMQ, S3 storage (compose service `minio`, image `pgsty/silo`, a MinIO-compatible fork, because official `minio/minio` images are no longer published), Nginx (templates in `nginx/templates/{dev,prod}/`, TLS via certbot in prod; the domain comes only from `DOMAIN` in `.env.prod`).

## Commands

There are no automated test suites in any service.

```bash
# Dev stack (root .env from .env.example; app at http://localhost:8088)
scripts/dev-up.sh [service...]        # build + up + wait for healthchecks (PowerShell: scripts\dev-up.ps1)
scripts/dev-logs.sh [service]         # dev-logs.ps1
scripts/dev-down.sh                   # keeps volumes (dev-down.ps1)
scripts/dev-reset.sh                  # deletes dev volumes, asks for confirmation (dev-reset.ps1)
scripts/healthcheck.sh --dev          # services, RabbitMQ consumers, HTTP; exit 1 on failure

# Release (on the PC, Git Bash; same .env.prod as the VPS, locally)
scripts/release-build.sh              # clean git tree -> fbi/<svc>:<short-sha> for TARGET_PLATFORM (--allow-dirty: <sha>-dirty, --measure: gzip sizes)
scripts/release-push.sh <user@vps> [dir]   # arch + VPS commit check, send only missing/different images, prod-deploy --tag --prune there (--backup, --with-index)
scripts/push-face-index.sh <user@vps> [dir] # local fbi-dev_face_index volume -> prod face_index volume, restart python-ai, /index-status

# Prod (VPS, .env.prod from .env.prod.example; no build tools needed)
scripts/setup-vps.sh                  # once, as root: Docker, git, ufw, deploy user, swap
scripts/init-ssl.sh                   # first Let's Encrypt cert (temporary nginx on :80); --status, --renew
scripts/prod-deploy.sh [--tag T]      # no build: check fbi/*:T exist, write .env.release, pull third-party only, up -d, wait for health
scripts/rollback.sh [tag]             # previous IMAGE_TAG (images only, NOT the DB schema)
scripts/backup.sh / restore.sh <dir>  # both DBs, bucket (mcli), realm export, face index; optional rclone remote
scripts/install-cron.sh               # daily backup (+ --with-healthcheck), logrotate for logs/
scripts/sync-faces.sh                 # sync the face index with "WantedImages" (--full: from empty; required after first FBI import)
scripts/build-docs.sh                 # docs/**/*.md -> docs/html/ (gitignored)
# backup/restore/healthcheck/sync-faces take --dev to target the dev stack. Every script has --help.

# Raw compose (what the scripts wrap)
docker compose -f docker-compose.yaml -f docker-compose.build.yml -f docker-compose.dev.yml --env-file .env up -d --build
docker compose -f docker-compose.yaml -f docker-compose.prod.yml --env-file .env.prod --env-file .env.release up -d

# Backend (fbi-backend/)
dotnet run
dotnet build
dotnet ef migrations add <Name>             # migrations live in fbi-backend/Migrations
dotnet ef migrations remove
dotnet ef database update                   # optional: Program.cs calls Database.Migrate() on startup

# Frontend (fbi-frontend/), env vars in .env.local per example-env.txt
npm run dev
npm run build
npm run lint

# AI service (face-recog-microservice/)
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8006

# Media service (fbi-media-service/)
dotnet run
```

Compose is split: `docker-compose.yaml` (shared base, no ports, no `build:`; own services use `image: ${IMAGE_PREFIX:-fbi}/<svc>:${IMAGE_TAG:-dev}`) + `docker-compose.build.yml` (all `build:` sections; frontend `NEXT_PUBLIC_*` args from `PUBLIC_URL`, which `release-build.sh` exports as `https://$DOMAIN`) + `docker-compose.dev.yml` or `docker-compose.prod.yml`, with `.env` (dev, from `.env.example`) or `.env.prod` (from `.env.prod.example`). Dev = base + build + dev; prod on the VPS = base + prod only (`compose config` must contain no `build:`), with `pull_policy: never` on own images and `IMAGE_TAG`/`IMAGE_TAG_PREVIOUS` in the gitignored `.env.release` (second `--env-file`, written by `prod-deploy.sh --tag`). `release-push` compares images by layer diffIDs + config (not `.Id`, which differs between Docker Desktop's containerd store and the VPS's classic store) and moves the VPS git checkout to the image commit (compose files, nginx templates and scripts come from there). `scripts/lib/common.sh` `compose()` uses `OVERLAY_FILES` and `RELEASE_FILE` (`PROD_ENV_FILE`/`RELEASE_FILE` can be overridden for local tests; prod nginx ports are `HTTP_PORT`/`HTTPS_PORT`, default 80/443). Each container gets only the variables it needs (explicit `environment:` lists, no shared `env_file`). Dev publishes debug ports (`DEV_*_PORT`: Postgres 15433, Keycloak 18080, RabbitMQ 15674/15673, MinIO 19000/19001, backend 17002, ...); prod publishes only nginx 80/443, plus admin consoles on `127.0.0.1` for SSH tunnels. In dev, `PUBLIC_URL` (browser) and `FILES_PUBLIC_URL` both use `http://localhost:8088`; python-ai downloads photos by their stored public URL, so the dev overlay sets `IMAGE_URL_REWRITE="${PUBLIC_URL}=>http://nginx"` and `load_image_from_url` rewrites that prefix to the internal nginx (inside a container `localhost` is the container itself). In prod `IMAGE_URL_REWRITE` is empty: nginx has a network alias equal to `DOMAIN`. `docker-compose.legacy.yaml` + `nginx/default.conf` are the old single-file setup, kept temporarily until the new flow is verified. Shell scripts must keep LF line endings (`.gitattributes`), and `scripts/lib/common.sh` / `common.ps1` hold the shared helpers.

Running a .NET service outside Docker uses `appsettings.json` defaults (localhost Keycloak realm `myrealm`/client `myclient`, Postgres on 5432); compose overrides everything via `Section__Key` env vars, and in compose the realm/client are `dotnet`/`dotnet` (`KEYCLOAK_REALM`/`KEYCLOAK_CLIENT_ID`). Note `appsettings.json` has `RabbitMq:ReceiveQueue` with a `queue:` prefix, which creates the wrong queue name when running locally; override it. The dev stack exposes Postgres on host port `DEV_DB_PORT` (15433); the Python service's default `DB_PORT` is 5433.

## Architecture

### Sighting / face-recognition flow (spans all services)
1. Frontend uploads the photo directly to the File API `POST /upload` with header `X-Api-Key` (`NEXT_PUBLIC_FILE_API_KEY` must equal the media service's `ApiKey` / `API_KEY_SHARED`). It returns a public MinIO URL (served via Nginx `/files/`).
2. Frontend calls `POST /api/FbiWanted/report-location` with that URL. `WantedPersonsService` saves a `LocationWantedPerson`, broadcasts `ReceiveLocation` to all SignalR clients, sends `ReceiveActivity` to every connected user in the local `Users` table whose saved location is within 10 km (Haversine `CalculateDistance`; connections looked up via `ConnectionMapping`; despite the "admin" naming, it doesn't filter by role), then, only if the report has a photo, sends an `AnalyzeFaceCommand { ReportId, ImageUrl }` via MassTransit to the queue in `RabbitMq:Queue`. Reports without a photo are stored with `FileUrl = ""` (the old `"no image"` placeholder is normalized, and migration `ClearNoImageFileUrl` fixed existing rows) and are excluded from `GET /reports`.
3. Python consumes that queue with pika. It reads the MassTransit envelope (`json["message"]`), embeds the image with DeepFace Facenet, cosine-matches against the in-memory `vector_db` (threshold 0.40, top 5), and **writes directly to Postgres**: inserts into `"PersonMatchResults"` and sets `"LocationWantedPersons"."Status" = 1`.
4. Python publishes raw JSON `{reportId, success}` to the queue in `RABBIT_QUEUE_PUBLISH` (default `analysis-finished-queue`, = `RABBITMQ_QUEUE_FINISHED`).
5. Backend `AnalysisFinishedConsumer` (receive endpoint uses `UseRawJsonSerializer`) broadcasts `ReportProcessed` over SignalR.

Because Python writes EF-managed tables with raw SQL, renaming entities/columns or changing the `ReportStatus` enum values in the backend breaks the AI worker. Keep `face-recog-microservice/main.py` in sync with schema changes.

The face vector index lives at `FACE_INDEX_PATH` (Docker: named volume `face_index`). It is not committed (`fbi_vectors.pkl` is gitignored); a missing file is a valid empty index (every analysis then returns 0 matches). Entries are `{url, embedding}` keyed by the FBI image URL, not a DB ID. The scraper imports all wanted persons (and stores `poster_classification` / `person_classification`), but only fugitives are recognised: `SYNC_INCLUDE_CLASSIFICATIONS` (empty = default list in `main.py`: `default,ten,terrorist,fraudster,crimes-against-children,kidnapping,law-enforcement-assistance,ecap`; `*` = no filter) selects posters, and with a list victims and ViCAP posters (subject `ViCAP%`) are excluded too. Of those, only `SYNC_MAX_PERSONS` (default 100; 0/empty = no limit, every image) are indexed: `run_sync_job` indexes one image per person (the first, by `WantedImages.Id`, with a detectable face, `enforce_detection=True`) for the first N persons by `WantedPersons.Id`, prunes everything outside that set, waits `SYNC_DELAY_MS` between downloads, retries failed downloads (network error, 429, 5xx) after `SYNC_RETRY_DELAYS` (default `5,15` s; empty = no retries), saves atomically every `SYNC_BATCH_SIZE` persons, remembers no-face URLs in `<index>.noface.json`, downsizes images to `IMAGE_MAX_SIDE` (1280) before detection (also for report photos), and logs `Progress: X/Y` and a final `SYNC FINISHED`/`SYNC FAILED` line (which `scripts/sync-faces.sh` waits for). `GET /index-status` applies the same selection rule and is what the scripts' consistency checks call; keep it in sync with `select_sync_units`. It only runs at startup when `RUN_SYNC_AT_STARTUP` is `true`/`1`/`yes`. After the first FBI import, `scripts/sync-faces.sh --full` is a required setup step (for prod normally run on the PC with `--dev` and pushed with `push-face-index.sh` / `release-push.sh --with-index`). `dev-up`, `prod-deploy` and `healthcheck.sh` warn (without failing) when the index is empty or differs from the expected set (`check_face_index` in `scripts/lib/common.sh`, `Test-FaceIndex` in `common.ps1`, both via `/index-status`). The cron scheduler is commented out. There is also a synchronous `POST /fast-search` (header `X-FBI-Key`); `FaceRecognitionService` wraps it, but its call in `WantedPersonsService` is commented out, so it is currently unused. Each service exposes `GET /health` for Docker healthchecks (frontend: `/health`). The python-ai image bakes in the Facenet weights at build time (no GitHub download at runtime) and sets `PYTHONUNBUFFERED=1` / `MALLOC_ARENA_MAX=2`.

### Backend (`fbi-backend/`)
- Layering: `controllers/` → `services/` (interface + impl, registered scoped in `Program.cs`) → `Data/AppDbContext`. Services return `ServiceResult<T>` / `OperationStatus`. Controllers wrap results in `ApiResponse<T>.Success(...)` / `.Error(...)` (`utils/ApiResponse.cs`). Validation errors are also reshaped into `ApiResponse` through `InvalidModelStateResponseFactory`. The frontend expects this envelope (`src/types/api.ts`).
- FluentValidation validators in `validators/` run automatically. AutoMapper profiles live in `Mappers/`.
- `FbiScraperService` (hosted `BackgroundService`) pages through `https://api.fbi.gov/wanted/v1/list` every 24h and upserts `WantedPerson` with its images, files, aliases and subjects. Whether it also runs at startup is set by `Scraper:RunAtStartup` (env `SCRAPER_RUN_AT_STARTUP`): `auto` (default) only when `WantedPersons` is empty, `always`, or `never`.
- `PdfGenerator` (QuestPDF) builds the `/{id}/dossier` download.
- `Program.cs` runs `Database.Migrate()` on startup and rethrows on failure (the container exits). Swagger is enabled only when `ASPNETCORE_ENVIRONMENT=Development` (the dev compose overlay sets it).
- Stripe, Supabase, and MailKit are wired in `Program.cs`/csproj but unused by the current features. The Supabase client is still initialized at startup.

### Auth
- Keycloak is the identity provider. `AuthService.Login` performs a password-grant against `Keycloak:TokenUrl` server-side, and the frontend stores the returned JWT in `localStorage["token"]`. User listing and registration go through the Keycloak admin REST client using the client's service account (`ClientCredentialsFlow`), which needs `realm-management` roles `view-users`, `manage-users`, `view-realm` (set in `keycloak/realm-export.json`). `Keycloak:Admin`/`AdminPassword` are only read by the unused `GetAdminToken()`.
- JWT validation skips issuer/audience checks (Docker vs. localhost hostnames). `OnTokenValidated` copies Keycloak `realm_access.roles` into .NET role claims. Use `[Authorize(Roles = nameof(Role.ADMIN))]` with the `utils/Roles.cs` enum (`USER`, `ADMIN`).
- SignalR hub `/hubs/surveillance` receives the token via the `access_token` query string. On connect, `SurveilanceHub` maps the user's `sub` to connection IDs (`ConnectionMapping`, an in-memory singleton) and adds the connection to the `Users` or `Admins` group.

### Frontend (`fbi-frontend/`)
- Pages live in `app/`. Shared code lives in `src/` (imported as `@/src/...`): components (`AuthGuard.tsx` builds the single SignalR hub connection and shows toast + sound on `ReceiveActivity`), `context/SignalRContext.tsx` (exposes the connection), `lib/api-client.ts` (`authFetch` adds the bearer token and redirects to `/auth/login` on 401), and `types/`.
- All config comes from `NEXT_PUBLIC_*` vars, which are baked in at build time. `docker-compose.build.yml` passes them as Docker build `args` (URLs derived from `PUBLIC_URL`: from `.env` in dev, `https://$DOMAIN` from the PC's `.env.prod` in `release-build.sh`; `NEXT_PUBLIC_FILE_API_KEY` = `API_KEY_SHARED`), so changing them requires rebuilding the frontend image (prod: `release-build` + `release-push`).
- Leaflet map components (`MapInner`, `RouteMapInner`) are client-only inner components wrapped by modal components.

### Nginx routing (prod)
`/api/` and `/hubs/` go to the backend, `/upload` to the file API, `/files/` to the MinIO bucket objects (with `nosniff`, sandbox CSP, and `Content-Disposition: attachment` for non-images), `/realms/` (except `/realms/master`) and `/resources/` to Keycloak, and `/` to the frontend. The Keycloak admin console, MinIO console and RabbitMQ UI are not proxied; in prod they are bound to `127.0.0.1` on the VPS for SSH tunnels. Dev nginx (HTTP, `DEV_HTTP_PORT`) has the same app routes; consoles use the dev debug ports. All `proxy_pass` targets are variables resolved through Docker DNS (`resolver 127.0.0.11 valid=10s`, `nginx/snippets/upstreams.conf` + `upstream-vars.conf`), so recreated containers don't cause 502s. With variables, a URI in `proxy_pass` replaces the whole request URI, so path changes use `rewrite ... break` (as `/files/` does). Validate template changes with `nginx -t`.
