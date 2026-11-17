# Testing face recognition (manual end-to-end)

There are no automated tests. This page walks through the whole flow
(upload → report → RabbitMQ → python-ai → Postgres → SignalR) on the dev stack
and shows where to look at each step. For the design, see
[Architecture](../architecture.md#sighting--face-recognition--signalr).

## Before you start

```bash
scripts/dev-up.sh
scripts/healthcheck.sh --dev     # (Git Bash on Windows)
```

`healthcheck.sh --dev` must show both queues with a consumer:
`face-analysis-queue` (python-ai) and `analysis-finished-queue` (backend). It
also checks that python-ai can reach `FILES_PUBLIC_URL`. You also need a
Keycloak user with the `USER` or `ADMIN` role ([Keycloak (local)](keycloak.md)).

## Test data

Reports reference a wanted person (`WantedId`). The backend's FBI scraper
fills `"WantedPersons"` and `"WantedImages"`. With the default
`SCRAPER_RUN_AT_STARTUP=auto` it runs at startup when the table is empty, so
on a fresh dev stack wait a few minutes until the backend logs show
`Nu mai sunt date. Sincronizare completă.`, then check:

```bash
docker compose -f docker-compose.yaml -f docker-compose.dev.yml --env-file .env exec db \
  psql -U fbi -d fbi -c 'SELECT count(*) FROM "WantedPersons";'
```

To force a new import on an existing database, set
`SCRAPER_RUN_AT_STARTUP=always` in `.env` and run `scripts/dev-up.sh backend`.

For a positive match, the face index must contain someone who looks like the
person in your photo. Build it after the import with
`scripts/sync-faces.sh --dev --full`
([Local setup](local-setup.md#required-after-the-first-start-fbi-import-then-the-face-index)).
Using one of the indexed FBI images (`curl http://localhost:18006/list-faces`
lists their URLs) as the "sighting" photo gives a near-100% match. Any other
face exercises the "no match" path, which still completes the whole flow.

## Through the UI

1. Open http://localhost:8088 and log in.
2. Open a wanted person and report a sighting: pick a photo, choose the
   location on the map and submit.
3. Expected:
   - the sighting appears immediately in the live feed (`ReceiveLocation`);
   - users whose saved location is within 10 km get an activity toast
     (`ReceiveActivity`);
   - a few seconds later the report turns from pending to processed
     (`ReportProcessed`), and an ADMIN sees the matches on the reports page.

## Through the API (curl)

```bash
BASE=http://localhost:8088
# 1. Token (see keycloak.md)
TOKEN=$(curl -s $BASE/api/Auth/login -H 'Content-Type: application/json' \
  -d '{"username":"agent1","password":"Agent1-dev-pass"}' | sed -E 's/.*"access_token":"([^"]+)".*/\1/')

# 2. Pick a wanted person id
curl -s "$BASE/api/FbiWanted?PageNumber=1&PageSize=1" -H "Authorization: Bearer $TOKEN"
#    -> {"data":{"totalCount":..,"items":[{"id":1,...}]},...}

# 3. Upload a photo (X-Api-Key = API_KEY_SHARED from .env)
curl -s $BASE/upload -H "X-Api-Key: dev_shared_upload_key" -F "file=@face.jpg"
#    -> {"url":"http://localhost:8088/files/fbi-evidence/<guid>.jpg"}

# 4. Report the sighting
curl -s $BASE/api/FbiWanted/report-location -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"wantedId":1,"lat":44.4268,"lng":26.1025,"details":"manual test","fileUrl":"<url from step 3>"}'
```

Open the returned photo URL in the browser: it must display inline. Files
under `/files/` that are not images are served as downloads.

## Where to look at each step

| Step | How to check |
|---|---|
| Upload stored | MinIO console http://localhost:19001 → bucket `fbi-evidence`; `scripts/dev-logs.sh file-api` |
| Report saved | `SELECT "Id","Status","FileUrl" FROM "LocationWantedPersons" ORDER BY "Id" DESC LIMIT 5;` (Status 0 = Pending) |
| Command queued | RabbitMQ UI http://localhost:15673 → Queues → `face-analysis-queue` (a message appears briefly, consumer count 1) |
| Analysis | `scripts/dev-logs.sh python-ai`: `Received job`, `load_image_from_url: ...`, `Job <id> finished. Matches found: N`, `notification sent` |
| Results written | `SELECT * FROM "PersonMatchResults" WHERE "LocationWantedPersonId" = <id>;` and Status = 1 |
| Result consumed | `scripts/dev-logs.sh backend`: `[SignalR] Notifying clients about Report #<id>`; `analysis-finished-queue` drained |
| UI updated | `ReportProcessed` in the browser (feed / reports page) |

Run SQL with:

```bash
docker compose -f docker-compose.yaml -f docker-compose.dev.yml --env-file .env exec db psql -U fbi -d fbi
```

## Testing python-ai directly

The service is published on port 18006 in dev:

```bash
curl -s http://localhost:18006/health
curl -s http://localhost:18006/list-faces | head -c 300      # indexed face URLs
curl -s http://localhost:18006/fast-search -H 'Content-Type: application/json' \
  -H 'X-FBI-Key: dev_face_recog_key' \
  -d '{"image_to_verify_url":"<an image URL>"}'
```

`/fast-search` is the synchronous variant. The backend has a client for it
(`FaceRecognitionService`), but the call is commented out, so the app only uses
the RabbitMQ path.

## Rebuilding the face index

```bash
scripts/sync-faces.sh --dev           # align the index with the first SYNC_MAX_PERSONS persons
scripts/sync-faces.sh --dev --full    # start from an empty index
```

This needs data in `"WantedImages"` (from the scraper; the script refuses to
run if the table is empty) and internet access (the images are downloaded
from the FBI site). Only the first `SYNC_MAX_PERSONS` persons (default 100)
are indexed, one image each, so pick the test photo from `/list-faces`.

## Typical failures

| Symptom | Cause |
|---|---|
| Report stays Pending, python-ai logs `Failed to download image` | `FILES_PUBLIC_URL` not reachable from the container (see [Troubleshooting](troubleshooting.md#analysis-never-finishes)) |
| python-ai logs `DB Save Error` | Schema drift between EF migrations and `main.py` ([Migrations](migrations.md#coupling-with-the-python-service)) |
| No consumer on `face-analysis-queue` | python-ai not running or still loading TensorFlow; check `scripts/dev-logs.sh python-ai` |
| Report processed but never in the UI | Backend not consuming `analysis-finished-queue`, or the SignalR connection is down (browser console) |
| Always 0 matches | Empty or unrelated index: `/list-faces` returns `[]`, python-ai logs `Indexul facial e gol` → run `sync-faces --dev --full` |
