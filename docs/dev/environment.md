# Environment variables

All configuration lives in one file per environment, at the repository root:

| File | Used by | Template |
|---|---|---|
| `.env` | dev stack (`docker-compose.build.yml` + `docker-compose.dev.yml`, `scripts/dev-*`) | `.env.example` |
| `.env.prod` | prod stack on the VPS (`docker-compose.prod.yml`, `prod-deploy`, `init-ssl`, `backup`, ...) **and** `release-build` / `release-push` on the PC | `.env.prod.example` |
| `.env.release` | VPS only: `IMAGE_TAG` / `IMAGE_TAG_PREVIOUS`, written by `prod-deploy.sh --tag` (from `release-push`) and `rollback.sh`. Don't edit it by hand. | – |

Both are gitignored. Compose reads them only for **interpolation**: each
container receives an explicit list of variables in `docker-compose.yaml`, so
a container never sees secrets it doesn't need. Variables written as
`${VAR:?}` in compose are required: compose refuses to start if they are
missing.

The services themselves read .NET configuration keys (`Section__Key` env vars
override `appsettings.json`), `process.env.NEXT_PUBLIC_*` at build time
(frontend), and `os.getenv` (Python). The tables below show how the root
variables map to them.

## Values that must match

| Must be equal | Why |
|---|---|
| `API_KEY_SHARED` = frontend `NEXT_PUBLIC_FILE_API_KEY` = file API `ApiKey` | Compose derives the frontend build argument from `API_KEY_SHARED`, so it can't drift in Docker. When running the frontend natively, copy it into `.env.local`. |
| `KEYCLOAK_CLIENT_SECRET` = secret of the client in Keycloak | Imported into Keycloak on first start. If you change it later, also change it in the Keycloak console (Clients → *client* → Credentials). |
| Port in `PUBLIC_URL` and `FILES_PUBLIC_URL` = `DEV_HTTP_PORT` (dev) | nginx is published on that port. |
| `RABBITMQ_QUEUE_ANALYSIS` / `RABBITMQ_QUEUE_FINISHED` on backend and python-ai | Compose passes the same variable to both. |
| `DB_NAME` / `KEYCLOAK_DB_NAME` vs. existing volume | Postgres creates the databases only on an **empty** volume. Renaming later requires `dev-reset` (or a manual `CREATE DATABASE`). |

## Variable reference

### URLs and domain

| Variable | Dev default | Prod | Used by | Notes |
|---|---|---|---|---|
| `PUBLIC_URL` | `http://localhost:8088` | – | frontend build args (dev) | Browser-facing base URL; `NEXT_PUBLIC_API_URL` = `PUBLIC_URL/api`, etc. Rebuild the frontend after changing it. |
| `FILES_PUBLIC_URL` | `http://localhost:8088/files` | – | file-api `Minio__PublicUrl` (dev) | Base of the stored photo URLs, shown by the browser. python-ai downloads them through `IMAGE_URL_REWRITE` (set by the dev overlay). |
| `DOMAIN` | – | `example.com` (placeholder) | nginx, keycloak `KC_HOSTNAME`, frontend build args, file-api, init-ssl | Bare host name, no scheme or slash. Prod scripts refuse to run with `example.com`. |
| `CERTBOT_EMAIL` | – | required | init-ssl | Let's Encrypt account / expiry notices. |
| `COMPOSE_PROJECT_NAME` | `fbi-dev` | `fbi` | compose | Prefix of containers, volumes, network. Keeps dev and prod apart. |

### PostgreSQL

| Variable | Default | Used by | Maps to |
|---|---|---|---|
| `DB_USER`, `DB_PASSWORD` | `fbi` / dev password | db, keycloak, backend, python-ai | `POSTGRES_USER/PASSWORD`, `KC_DB_USERNAME/PASSWORD`, connection string, `DB_USER`/`DB_PASS` |
| `DB_NAME` | `fbi` | db, backend, python-ai | `POSTGRES_DB`, `Database=` in `ConnectionStrings__DefaultConnection`, `DB_NAME` |
| `KEYCLOAK_DB_NAME` | `keycloak` | db (init script), keycloak | `CREATE DATABASE` in `postgres-init/script.sh`, `KC_DB_URL` |

Inside Docker everything uses `db:5432`. On the host, the dev Postgres is
`localhost:${DEV_DB_PORT}` (15433). The Python service's default `DB_PORT`
(5433) only matters when it runs natively with no env vars set.

### RabbitMQ

| Variable | Default | Used by | Maps to |
|---|---|---|---|
| `RABBITMQ_USER`, `RABBITMQ_PASSWORD` | `fbi` / dev password | rabbitmq, backend, python-ai | `RABBITMQ_DEFAULT_USER/PASS`, `RabbitMq__Username/Password`, `RABBIT_USER/PASS` |
| `RABBITMQ_QUEUE_ANALYSIS` | `face-analysis-queue` | backend, python-ai | `RabbitMq__Queue` (backend adds the `queue:` prefix), `RABBIT_QUEUE` |
| `RABBITMQ_QUEUE_FINISHED` | `analysis-finished-queue` | backend, python-ai | `RabbitMq__ReceiveQueue`, `RABBIT_QUEUE_PUBLISH` |

### MinIO (Silo)

| Variable | Default | Used by | Maps to |
|---|---|---|---|
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` | `fbi_minio` / dev password (≥ 8 chars) | minio, file-api | `Minio__AccessKey`, `Minio__SecretKey` |
| `MINIO_BUCKET` | `fbi-evidence` | minio (backup scripts), file-api | `Minio__Bucketname`. Created with public read on first upload. |
| `MINIO_IMAGE` | `docker.io/pgsty/silo:RELEASE.2026-10-26T00-00-00Z` | compose | Optional override (see [why Silo](../architecture.md#why-silo-instead-of-miniominio)). |

### Keycloak

| Variable | Default | Used by | Maps to |
|---|---|---|---|
| `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD` | `admin` / dev password | keycloak | `KC_BOOTSTRAP_ADMIN_USERNAME/PASSWORD`: temporary master-realm admin, created on first start only. |
| `KEYCLOAK_REALM` | `dotnet` | keycloak (import), backend | realm name in `realm-export.json`, `Keycloak__Realm`, `Authority`, `TokenUrl` |
| `KEYCLOAK_CLIENT_ID` | `dotnet` | keycloak (import), backend | `Keycloak__ClientId` |
| `KEYCLOAK_CLIENT_SECRET` | dev secret | keycloak (import), backend | `Keycloak__ClientSecret` |

`Keycloak__Admin` / `Keycloak__AdminPassword` from `appsettings.json` are only
read by an unused method (`GetAdminToken`), so compose doesn't pass them.

### Keys between services

| Variable | Used by | Maps to |
|---|---|---|
| `API_KEY_SHARED` | file-api, frontend (build) | `ApiKey`, `NEXT_PUBLIC_FILE_API_KEY`. **Visible in the browser bundle.** |
| `FACE_RECOG_API_KEY` | backend, python-ai | `FaceRecognition__ApiKey`, `API_KEY` (header `X-FBI-Key` on `/fast-search`) |

### FBI import (backend)

| Variable | Default | Notes |
|---|---|---|
| `SCRAPER_RUN_AT_STARTUP` | `auto` | `Scraper__RunAtStartup`. `auto` = import at startup only if `"WantedPersons"` is empty; `always` = on every backend start; `never` = first import 24 h after start. |

### AI service

| Variable | Default | Notes |
|---|---|---|
| `RUN_SYNC_AT_STARTUP` | `false` | `true`/`1`/`yes` syncs the face index with `"WantedImages"` at startup (slow; the API starts only after it). Prefer `scripts/sync-faces.sh`. |
| `SYNC_MAX_PERSONS` | `100` | How many wanted persons are recognised: the sync indexes one image per person (first with a detectable face) for the first N persons by `Id`. `0` or empty = no limit (every image). The scraper still imports all persons. |
| `SYNC_INCLUDE_CLASSIFICATIONS` | empty | FBI `poster_classification` values that are indexed. Empty = `default,ten,terrorist,fraudster,crimes-against-children,kidnapping,law-enforcement-assistance,ecap`; with a list, victims and ViCAP posters are excluded as well. `*` = every poster, no filter. |
| `IMAGE_MAX_SIDE` | `1280` | Longest side (px) of an image before face detection, for index and report photos. `0` = no downsizing. |
| `IMAGE_URL_REWRITE` | dev overlay: `${PUBLIC_URL}=>http://nginx`; prod: empty | `public=>internal` prefix rewrite applied when python-ai downloads a report photo. Not in `.env`. |
| `SYNC_DELAY_MS` | `200` | Pause before each image download during a sync. |
| `SYNC_RETRY_DELAYS` | `5,15` | Seconds between retries of a failed sync download (network error, HTTP 429 or 5xx; a 404 is not retried). `5,15` = 3 attempts; empty = no retries. |
| `SYNC_BATCH_SIZE` | `50` | Persons (or images, without a limit) processed between two index saves. |
| `AI_MEMORY_LIMIT` | `2g` (prod) | Container memory limit. |
| `KEYCLOAK_MEMORY_LIMIT` | `1g` (prod) | Keycloak container memory limit. The JVM heap is about 70% of it. |
| `FACE_INDEX_PATH` | set in compose | Index on the `face_index` volume (`/data/face-index/fbi_vectors.pkl`); missing = empty index. Not in `.env`. |

### Nginx

| Variable | Default | Notes |
|---|---|---|
| `UPLOAD_MAX_SIZE` | `20m` | `client_max_body_size` for `/upload`. The file API (Kestrel) accepts up to 30 MB. |

### Dev-only ports

`DEV_HTTP_PORT` (8088), `DEV_DB_PORT` (15433), `DEV_KEYCLOAK_PORT` (18080),
`DEV_RABBITMQ_AMQP_PORT` (15674), `DEV_RABBITMQ_MGMT_PORT` (15673),
`DEV_MINIO_API_PORT` (19000), `DEV_MINIO_CONSOLE_PORT` (19001),
`DEV_BACKEND_PORT` (17002), `DEV_FILE_API_PORT` (17005), `DEV_AI_PORT` (18006),
`DEV_FRONTEND_PORT` (13000). All of them are bound to `127.0.0.1` only (not
reachable from the local network).

### Prod-only

| Variable | Default | Notes |
|---|---|---|
| `IMAGE_PREFIX` | `fbi` | Own images are named `${IMAGE_PREFIX}/<service>:<tag>`. A local name, not a registry: prod sets `pull_policy: never`. Must be the same on the PC and the VPS. |
| `TARGET_PLATFORM` | `linux/amd64` | Platform `release-build.sh` builds for; `release-push.sh` checks it against `uname -m` on the VPS. |
| `IMAGE_TAG` | – | Not in `.env.prod`: in `.env.release` on the VPS, or exported by `release-build.sh` (short git hash). Dev images use `dev`. |
| `HTTP_PORT`, `HTTPS_PORT` | 80, 443 | Host ports of nginx. Change them only to test the prod stack locally next to something else on 80/443; Let's Encrypt needs the real port 80. |
| `KC_ADMIN_TUNNEL_PORT`, `MINIO_CONSOLE_TUNNEL_PORT`, `RABBITMQ_MGMT_TUNNEL_PORT` | 18080, 19001, 15673 | Bound to `127.0.0.1` on the server, for [SSH tunnels](../prod/admin-consoles.md). |
| `BACKUP_KEEP` | 7 | Local backups kept by `scripts/backup.sh`. |
| `BACKUP_REMOTE` | empty | rclone remote (`name:path`) for off-site copies. |
| `BACKUP_REMOTE_KEEP` | = `BACKUP_KEEP` | Backups kept in the remote. |
| `RCLONE_CONFIG_DIR` | `~/.config/rclone` | Folder with `rclone.conf`. |

### Unused integrations

`STRIPE_PUB_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK`, `SMTP_SERVER`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SUPABASE_URL`, `SUPABASE_KEY`. These are
wired in the backend (`Program.cs`, csproj) but not used by current features,
and can stay empty. The Supabase client is still initialized at startup.

## Variables per service (non-Docker runs)

When a service runs natively, set its own keys directly:

| Service | Keys |
|---|---|
| backend | `ConnectionStrings__DefaultConnection`, `Keycloak__{Url,Realm,ClientId,ClientSecret,Authority,TokenUrl}`, `RabbitMq__{Host,Username,Password,Queue,ReceiveQueue}`, `FaceRecognition__{Url,ApiKey}`, `Scraper__RunAtStartup`, `ASPNETCORE_ENVIRONMENT` |
| file-api | `Minio__{Url,AccessKey,SecretKey,Bucketname,PublicUrl}`, `ApiKey`, `AppPort` |
| python-ai | `DB_{HOST,PORT,NAME,USER,PASS}`, `RABBIT_{HOST,USER,PASS,QUEUE,QUEUE_PUBLISH}`, `API_KEY`, `RUN_SYNC_AT_STARTUP`, `SYNC_{MAX_PERSONS,DELAY_MS,BATCH_SIZE,INCLUDE_CLASSIFICATIONS}`, `IMAGE_MAX_SIDE`, `IMAGE_URL_REWRITE`, `FACE_INDEX_PATH` |
| frontend | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEBSOCKETS_URL`, `NEXT_PUBLIC_FILE_API`, `NEXT_PUBLIC_FILE_API_KEY` (in `fbi-frontend/.env.local`; template: `example-env.txt`) |

Examples: [Local setup](local-setup.md#running-a-service-without-docker).
