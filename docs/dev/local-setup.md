# Local setup

## Prerequisites

- **Docker Desktop** (Windows/macOS) or Docker Engine with the compose plugin
  (Linux), at least 6 GB of RAM assigned to Docker (TensorFlow + Keycloak +
  builds).
- **Git**. On Windows, Git for Windows also provides **Git Bash**, which runs
  the bash scripts.
- About 15 GB of free disk for images and build cache. The AI image alone is
  several GB.
- Optional, only for running services without Docker: .NET SDK 9 and 10,
  Node.js 20, Python 3.11.

## Start the dev stack (Docker)

```bash
git clone <repo-url> fbi && cd fbi
cp .env.example .env
scripts/dev-up.sh
```

Windows PowerShell:

```powershell
git clone <repo-url> fbi; cd fbi
Copy-Item .env.example .env
.\scripts\dev-up.ps1
```

If PowerShell refuses to run scripts ("running scripts is disabled on this
system"), allow local scripts once for your user:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

or run a script with
`powershell -ExecutionPolicy Bypass -File .\scripts\dev-up.ps1`.

`dev-up` builds the images, starts everything in the background, waits until
every healthcheck is green and prints the URLs. The first build takes a while
(Python dependencies including TensorFlow, the .NET SDK images, `next build`).
Later runs use the Docker cache.

Then:

1. Create a user in Keycloak ([Keycloak (local)](keycloak.md)). The realm is
   imported automatically, but it contains no users.
2. Open http://localhost:8088 and log in.
3. The wanted-persons list fills when the backend's FBI scraper runs. On a
   fresh database it runs at startup (`SCRAPER_RUN_AT_STARTUP=auto`).

### Required after the first start: FBI import, then the face index

The face index is not in the repository, so face recognition finds nothing
until you build it from the imported FBI images. The scraper imports every
wanted person, but only fugitives are recognised (`SYNC_INCLUDE_CLASSIFICATIONS`:
no seeking-information, missing-person, victim or ViCAP posters), and of those
only the first `SYNC_MAX_PERSONS` (default 100, one image each):

1. **Wait for the FBI import to finish.** Follow the backend log:

   ```bash
   scripts/dev-logs.sh backend          # PowerShell: .\scripts\dev-logs.ps1 backend
   ```

   It is finished when the log shows `Nu mai sunt date. Sincronizare completă.`
   (pages are logged as `Salvat pagina N`). If it stops with
   `Eroare la apelul FBI` or `A crăpat Scraper-ul FBI!`, see
   [Troubleshooting](troubleshooting.md#wanted-persons-list-is-empty).
2. **Build the face index** (Git Bash on Windows):

   ```bash
   scripts/sync-faces.sh --dev --full
   ```

   The script refuses to run while `"WantedImages"` is empty, warns if the
   import still seems to be running, prints the progress and a summary.
3. Check: `scripts/healthcheck.sh --dev` shows `index facial ... OK`.

Sizing, measured on the dev stack in Nov 2026 (FBI list: 1,275 persons,
3,065 images, 1,434 of them fugitive posters; 8 vCPU laptop, slow home
connection):

| Step | Measured | Memory |
|---|---|---|
| FBI import (backend) | 62 s (64 pages) | backend's normal usage |
| `sync-faces --full`, `SYNC_MAX_PERSONS=100` (default, fugitives only) | 18 min 39 s total: 66 persons indexed, 0 without any detectable face (5 images without a face were replaced by the person's next image), 34 failed (fbi.gov timeouts / HTML instead of an image; retried by the next run). Mostly waiting on fbi.gov downloads (10 s timeout), CPU idle most of the time. | python-ai peak **850 MiB** |
| `sync-faces --full`, `SYNC_MAX_PERSONS=0` (all images) | not measured; extrapolated several hours | same order as above |

See [Testing face recognition](testing-face-recognition.md#test-data).

### How the dev URLs work

- The browser uses `PUBLIC_URL=http://localhost:8088`. `localhost` is a secure
  context, so the browser Geolocation API ("use my location") works over plain
  HTTP.
- Uploaded photos get URLs based on
  `FILES_PUBLIC_URL=http://localhost:8088/files`. That URL is stored in the
  database and shown by the browser. The `python-ai` container also downloads
  it for analysis, but inside a container `localhost` is the container itself,
  so the dev overlay sets `IMAGE_URL_REWRITE="${PUBLIC_URL}=>http://nginx"`:
  python-ai replaces the prefix and downloads through the internal nginx. No
  hosts-file entries are needed.

### Ports

The dev overlay publishes debug ports with defaults that do not clash with
standalone containers on the standard ports (5432, 8080, 5672, 9000, ...). All
of them can be changed in `.env` (`DEV_*_PORT`). If you change
`DEV_HTTP_PORT`, change the port in `PUBLIC_URL` and `FILES_PUBLIC_URL` too,
then rebuild the frontend (`scripts/dev-up.sh frontend`).

### Rebuilding a single service

```bash
scripts/dev-up.sh backend            # rebuild + recreate backend only
scripts/dev-up.sh frontend           # needed after changing PUBLIC_URL / API_KEY_SHARED
```

`NEXT_PUBLIC_*` values are compiled into the frontend bundle at **build**
time. Restarting the container is not enough: the image must be rebuilt.

## Running a service without Docker

Start the infrastructure in Docker and run the service you are working on
natively. Stop that service's container first, so two copies don't consume the
same queue:

```bash
scripts/dev-up.sh db keycloak rabbitmq minio
```

> **RabbitMQ port:** the backend (MassTransit) and `python-ai` (pika) always
> connect to port **5672**: their config has a host but no port setting. The
> dev stack publishes AMQP on `15674` by default. To run the backend or
> `python-ai` natively, set `DEV_RABBITMQ_AMQP_PORT=5672` in `.env` (and stop
> any other broker on 5672), then `scripts/dev-up.sh rabbitmq`.

The examples below use the default `.env.example` values. Replace secrets with
the ones in your `.env`.

### Backend (`fbi-backend/`)

`appsettings.json` defaults point to a different local setup (realm
`myrealm`, database `myshopdb` on 5432). Override them with environment
variables (`Section__Key`):

```powershell
# PowerShell
$env:ASPNETCORE_ENVIRONMENT = "Development"
$env:ConnectionStrings__DefaultConnection = "Host=localhost;Port=15433;Database=fbi;Username=fbi;Password=dev_db_password"
$env:Keycloak__Url = "http://localhost:18080"
$env:Keycloak__Realm = "dotnet"
$env:Keycloak__ClientId = "dotnet"
$env:Keycloak__ClientSecret = "dev_client_secret_change_me"
$env:Keycloak__Authority = "http://localhost:18080/realms/dotnet"
$env:Keycloak__TokenUrl = "http://localhost:18080/realms/dotnet/protocol/openid-connect/token"
$env:RabbitMq__Host = "localhost"
$env:RabbitMq__Username = "fbi"
$env:RabbitMq__Password = "dev_rabbit_password"
$env:RabbitMq__Queue = "face-analysis-queue"
# appsettings.json has "queue:analysis-finished-queue", which creates a wrong queue name
$env:RabbitMq__ReceiveQueue = "analysis-finished-queue"
$env:FaceRecognition__Url = "http://localhost:18006"
$env:FaceRecognition__ApiKey = "dev_face_recog_key"
cd fbi-backend; dotnet run          # http://localhost:7002, Swagger at /swagger
```

Bash: use the same names with `export NAME=value`.

With a native backend on port 7002, the dev nginx still points at the
container. Either browse the API directly (`http://localhost:7002/swagger`) or
run the frontend natively with URLs pointing at port 7002 (below).

### Frontend (`fbi-frontend/`)

Create `fbi-frontend/.env.local` (ignored by git):

```ini
# Through the dev nginx (backend/file-api in Docker):
NEXT_PUBLIC_API_URL=http://localhost:8088/api
NEXT_PUBLIC_WEBSOCKETS_URL=http://localhost:8088/hubs/surveillance
NEXT_PUBLIC_FILE_API=http://localhost:8088/upload
# Must equal API_KEY_SHARED in the root .env
NEXT_PUBLIC_FILE_API_KEY=dev_shared_upload_key
# Or against a native backend: http://localhost:7002/api, http://localhost:7002/hubs/surveillance,
# and the file API container directly: http://localhost:17005/upload
```

```bash
cd fbi-frontend
npm ci
npm run dev      # http://localhost:3000
npm run lint
```

The backend's CORS policy allows any origin, so `localhost:3000` → `:8088`
works.

### File API (`fbi-media-service/`)

```powershell
$env:Minio__Url = "http://localhost:19000"
$env:Minio__AccessKey = "fbi_minio"
$env:Minio__SecretKey = "dev_minio_password"
$env:Minio__Bucketname = "fbi-evidence"
$env:Minio__PublicUrl = "http://localhost:8088/files"
$env:ApiKey = "dev_shared_upload_key"
$env:AppPort = "7005"
cd fbi-media-service; dotnet run   # requires the .NET 10 SDK
```

### Face recognition service (`face-recog-microservice/`)

TensorFlow is easiest on Linux or **WSL**. The service's own `readme`
recommends WSL on Windows.

```bash
cd face-recog-microservice
python3.11 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export DB_HOST=localhost DB_PORT=15433 DB_NAME=fbi DB_USER=fbi DB_PASS=dev_db_password
export RABBIT_HOST=localhost RABBIT_USER=fbi RABBIT_PASS=dev_rabbit_password
export RABBIT_QUEUE=face-analysis-queue RABBIT_QUEUE_PUBLISH=analysis-finished-queue
export API_KEY=dev_face_recog_key
# Optional: index file location (default: ./fbi_vectors.pkl, gitignored;
# missing = empty index). Build it with RUN_SYNC_AT_STARTUP=true once.
# export FACE_INDEX_PATH=/tmp/fbi_vectors.pkl
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8006
```

Remember the RabbitMQ port note above. Photo URLs are
`http://localhost:8088/files/...`, which work as-is when python-ai runs on the
host. (Facenet weights are downloaded to `~/.deepface` on the first run.)

## Next steps

- [Environment variables](environment.md)
- [Testing face recognition](testing-face-recognition.md)
- [Troubleshooting](troubleshooting.md)
