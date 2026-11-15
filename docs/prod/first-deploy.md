# First deploy

Prerequisites: [DNS and VPS setup](dns-and-vps.md) is done, and you are logged
in as `deploy` in `~/fbi`.

## 1. Fill in `.env.prod`

```bash
cp .env.prod.example .env.prod
chmod 600 .env.prod
nano .env.prod
```

- `DOMAIN`: your domain, without `https://` (for example `fbi.example.org`).
- `CERTBOT_EMAIL`: a real address.
- Replace **every** `CHANGE_ME` with a strong random value:

  ```bash
  openssl rand -base64 32 | tr -d '/+=' | cut -c1-32
  ```

  Avoid `$` and `"` in values (compose interpolates them). `MINIO_ROOT_PASSWORD`
  needs at least 8 characters.
- Leave the rest at their defaults unless you have a reason
  ([Environment variables](../dev/environment.md)).

Write down `KEYCLOAK_ADMIN_PASSWORD`: you need it in step 4.

## 2. TLS certificate

```bash
scripts/init-ssl.sh
```

See [TLS certificates](ssl.md) (`--staging` for a dry run).

## 3. Deploy

```bash
scripts/prod-deploy.sh
```

What it does:

1. Validates `.env.prod`. It refuses to run if `DOMAIN` is missing or still
   `example.com`, if any `CHANGE_ME` is left, or if the MinIO password is too
   short, and it warns if the file is readable by other users.
2. Checks that the certificate exists in the `letsencrypt` volume.
3. `docker compose config`, then `build` (the first build takes 10–20 minutes,
   mostly the AI image), then `up -d`.
4. Waits until every healthcheck is green (default timeout 15 min,
   `--timeout`).
5. Prints `docker compose ps` and the URL.

**Database migrations** run automatically when the backend starts
(`Database.Migrate()` in `Program.cs`). On a fresh database this creates the
whole schema. If a migration fails, the backend exits and keeps restarting,
`prod-deploy` fails, and it prints the backend logs with an explicit
"migration failed" message.

The Keycloak realm is imported from `keycloak/realm-export.json` on this first
start (realm, roles, client with `KEYCLOAK_CLIENT_SECRET`, service account).

## 4. Keycloak: admin and first users

Follow [Keycloak in production](keycloak.md):

1. Open an SSH tunnel and log in to the admin console with the bootstrap admin.
2. Create a permanent master admin and delete the temporary one.
3. In the application realm, create the first application user with the
   `ADMIN` role. Self-registration is off, and `/api/Auth/register` requires an
   ADMIN.

## 5. FBI import and face index (required)

The face index is not in the repository. Until you build it, every report is
analysed with 0 matches. By default it covers the first 100 wanted persons
(`SYNC_MAX_PERSONS`).

1. **Wait for the FBI import.** On a fresh database the backend starts it
   automatically (`SCRAPER_RUN_AT_STARTUP=auto`). It is finished when this
   shows `Nu mai sunt date. Sincronizare completă.`:

   ```bash
   dc logs backend | grep -E "Începe sincronizarea|Salvat pagina|Sincronizare completă|Eroare la apelul FBI|A crăpat"
   ```

   (`alias dc='docker compose -f docker-compose.yaml -f docker-compose.prod.yml --env-file .env.prod'`)
2. **Build the index:**

   ```bash
   scripts/sync-faces.sh --full
   ```

   Run it in `tmux`/`screen` or with `nohup` so an SSH disconnect doesn't stop
   the wait (the sync itself runs inside the container and continues either
   way). While it runs, new reports wait in RabbitMQ and are analysed after.

Sizing, measured on the dev stack in Nov 2026 (FBI list: 1,275 persons,
3,065 images, 1,434 of them fugitive posters; 8 vCPU laptop, slow home
connection):

| Step | Measured | Memory |
|---|---|---|
| FBI import (backend) | 62 s (64 pages) | backend's normal usage |
| `sync-faces --full`, `SYNC_MAX_PERSONS=100` (default, fugitives only) | 18 min 39 s total: 66 persons indexed, 0 without any detectable face (5 images without a face were replaced by the person's next image), 34 failed (fbi.gov timeouts / HTML instead of an image; retried by the next run). Mostly waiting on fbi.gov downloads (10 s timeout), CPU idle most of the time. | python-ai peak **850 MiB** |
| `sync-faces --full`, `SYNC_MAX_PERSONS=0` (all images) | not measured; extrapolated several hours | same order as above |

The FBI import brings in **all** wanted persons (the list, details, PDF
dossiers), but only fugitives are **recognised** in sighting photos
(`SYNC_INCLUDE_CLASSIFICATIONS`: no seeking-information, missing-person,
victim or ViCAP posters), and of those only the first `SYNC_MAX_PERSONS`
(by `Id`, one image each). Set it to `0` (or empty) to index
every image, at the cost of a much longer sync.

**Memory:** the measured peak (850 MiB) fits the default
`AI_MEMORY_LIMIT=2g` on a 4 GB VPS. If python-ai is OOM-killed anyway, the
index saved so far is kept (after every `SYNC_BATCH_SIZE` persons) and the
next run continues from there. Run `scripts/sync-faces.sh` (without `--full`)
again later to pick up the persons whose downloads failed; fbi.gov often
times out or answers with an HTML page instead of the image.

## 6. Verify

```bash
scripts/healthcheck.sh
```

It must report every service healthy, a consumer on both RabbitMQ queues,
the face index in step with `"WantedImages"`, HTTP → HTTPS working, and the
certificate's days left. Then open
`https://<your-domain>` and log in with the ADMIN user.

After the first import the backend refreshes the wanted persons every 24 h.
New FBI images are not indexed automatically: run `scripts/sync-faces.sh`
(without `--full`) from time to time, or when `healthcheck.sh` reports missing
images.

## 7. Backups and cron

```bash
scripts/backup.sh                         # first backup, by hand
scripts/install-cron.sh --with-healthcheck
```

See [Backup and restore](backup-restore.md).

## 8. Security review

Go through the [security checklist](security-checklist.md), especially the
pending items, which are known risks that are not fixed yet.
