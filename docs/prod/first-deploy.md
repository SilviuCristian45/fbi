# First deploy

> **Status (Nov 2026): the `release-build` → `release-push` flow is not tested
> end to end.** Tested so far: the compose split (`compose config` for prod has
> no `build:`), the scripts' error paths, shellcheck, the dev stack built with
> the build overlay, and the sync download retries. Not tested yet:
> `release-build.sh` to completion and its sizes, starting the prod stack only
> from the built images, `push-face-index.sh`, and everything over SSH (no VPS
> yet). Builds started from an agent's background shell hung after the image
> was written (the `docker build` client never exited). The same builds work
> when run from an interactive Git Bash window. Another open risk: images are
> saved from Docker Desktop's containerd image store and loaded into the VPS's
> classic store. That should work for single-platform images
> (`docker save --platform`), but it is unverified. If `docker load` fails on
> the VPS, enabling the containerd image store there is the fallback
> (`"features": {"containerd-snapshotter": true}` in `/etc/docker/daemon.json`,
> then restart Docker; existing images must be reloaded). See `TODO.md`.

Nothing is built on the VPS. You build the images and the face index on your
PC (Windows with Docker Desktop and Git Bash, or Linux) and send them over SSH.
The VPS only runs them.

Prerequisites:

- [DNS and VPS setup](dns-and-vps.md) is done, and the repository is cloned
  as `deploy` in `~/fbi` on the VPS.
- On the PC: Docker Desktop, Git Bash, the same repository at the same commit
  (pushed to the git remote), and an SSH key login to `deploy@<server-ip>`
  that works without a password prompt (`ssh deploy@<server-ip> true`).
- Optional on the PC: `pv`, for a progress bar during uploads.

## 1. Fill in `.env.prod`, in both places

The same file has to exist on the **VPS** (`~/fbi/.env.prod`, used by the
containers) and on the **PC** (repository root, used by `release-build.sh`).
`DOMAIN` and `API_KEY_SHARED` are baked into the frontend image, so they must
be identical in both files. Keep the file out of git (it is in `.gitignore`)
and copy it with `scp`, not through a chat or a shared drive.

```bash
# on the VPS
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
- `TARGET_PLATFORM`: `linux/amd64` for an x86_64 VPS (default), `linux/arm64`
  for ARM (for example Ampere/Graviton). `release-push` checks it against
  `uname -m` on the VPS.
- Leave the rest at their defaults unless you have a reason
  ([Environment variables](../dev/environment.md)).

Then copy it to the PC (from Git Bash, in the repository root):

```bash
scp deploy@<server-ip>:fbi/.env.prod .env.prod
```

Write down `KEYCLOAK_ADMIN_PASSWORD`: you need it in step 6.

## 2. TLS certificate (on the VPS)

```bash
scripts/init-ssl.sh
```

See [TLS certificates](ssl.md) (`--staging` for a dry run). It uses only
third-party images (certbot, a temporary `nginx:alpine`), so it works before
any own image is on the server.

## 3. Build the face index (on the PC)

The face index is not in the repository. Without it every report is analysed
with 0 matches. Build it with the dev stack on the PC instead of on the VPS:
the PC is faster, and the sync downloads hundreds of images from fbi.gov.

1. Use the same `SYNC_MAX_PERSONS` and `SYNC_INCLUDE_CLASSIFICATIONS` in
   `.env` (dev) as in `.env.prod`. The index covers the first
   `SYNC_MAX_PERSONS` fugitives by `Id` (default 100, one image each).
2. Start the dev stack and wait for the FBI import:

   ```bash
   scripts/dev-up.sh
   scripts/dev-logs.sh backend      # until "Nu mai sunt date. Sincronizare completă."
   ```

3. Build the index:

   ```bash
   scripts/sync-faces.sh --dev --full
   ```

The index lives in the `fbi-dev_face_index` volume. Failed downloads are
retried in the same run (`SYNC_RETRY_DELAYS`, default 5 s then 15 s), and a
second `scripts/sync-faces.sh --dev` (without `--full`) picks up whatever
still failed.

## 4. Build the images (on the PC)

```bash
git status                       # must be empty
scripts/release-build.sh --measure
```

This builds `fbi/backend`, `fbi/frontend`, `fbi/python-ai`, `fbi/file-api` and
`fbi/nginx`, tagged with the short commit hash, and prints their sizes
(`--measure` adds the gzip size you are about to upload). See
[Update and rollback](update-and-rollback.md#release-buildsh) for the details.

## 5. Send and deploy (from the PC)

```bash
scripts/release-push.sh deploy@<server-ip> --with-index
```

On a first deploy this:

1. checks the VPS architecture and moves its checkout to the same commit
   (asks first);
2. uploads all five images, since none are there yet (see
   [Server requirements](requirements.md#images) for the size and the time
   this takes);
3. runs `scripts/prod-deploy.sh --tag <sha>` on the VPS. That validates
   `.env.prod`, pulls the third-party images, starts everything and waits for
   the healthchecks (default timeout 15 min);
4. `--with-index`: shows how many vectors the local index contains, asks for
   confirmation, writes it into the production `face_index` volume, restarts
   python-ai alone and prints the `/index-status` check.

**Database migrations** run automatically when the backend starts
(`Database.Migrate()` in `Program.cs`). On a fresh database this creates the
whole schema. If a migration fails, the backend exits and keeps restarting,
`prod-deploy` fails, and it prints the backend logs with an explicit
"migration failed" message.

The Keycloak realm is imported from `keycloak/realm-export.json` on this first
start (realm, roles, client with `KEYCLOAK_CLIENT_SECRET`, service account).

### The index check right after the first deploy

The index check compares the index with the production database. Two warnings
are normal at this point:

- **"Nicio poza de indexat" / empty `WantedImages`**: the production FBI import
  (`SCRAPER_RUN_AT_STARTUP=auto`, about a minute) hasn't finished yet. Check
  again later with `scripts/healthcheck.sh` on the VPS.
- **Orphans or missing persons**: the set is "the first N fugitives by `Id`".
  IDs come from the import order, and the FBI list changes daily, so the
  production set can differ slightly from the dev one. Then run
  `scripts/sync-faces.sh` (without `--full`) **on the VPS**. It is
  incremental: it downloads only the missing persons and prunes the rest.

### Alternative: build the index on the VPS

If you can't build it on the PC, wait for the production FBI import, then run
`scripts/sync-faces.sh --full` on the VPS (in `tmux`/`screen`: it takes about
20 minutes for 100 persons, mostly waiting on fbi.gov). Python-ai peaks at
about 850 MiB during the sync, within the default `AI_MEMORY_LIMIT=2g`.

## 6. Keycloak: admin and first users

Follow [Keycloak in production](keycloak.md):

1. Open an SSH tunnel and log in to the admin console with the bootstrap admin.
2. Create a permanent master admin and delete the temporary one.
3. In the application realm, create the first application user with the
   `ADMIN` role. Self-registration is off, and `/api/Auth/register` requires an
   ADMIN.

## 7. Verify (on the VPS)

```bash
scripts/healthcheck.sh
```

It must report every service healthy, a consumer on both RabbitMQ queues,
the face index in step with `"WantedImages"`, HTTP → HTTPS working, and the
certificate's days left. Then open `https://<your-domain>` and log in with the
ADMIN user.

After the first import the backend refreshes the wanted persons every 24 h.
New FBI images are not indexed automatically: rebuild the index on the PC and
push it with `scripts/push-face-index.sh deploy@<server-ip>`, or run
`scripts/sync-faces.sh` on the VPS when `healthcheck.sh` reports missing
images.

## 8. Backups and cron (on the VPS)

```bash
scripts/backup.sh                         # first backup, by hand
scripts/install-cron.sh --with-healthcheck
```

See [Backup and restore](backup-restore.md).

## 9. Security review

Go through the [security checklist](security-checklist.md), especially the
pending items, which are known risks that are not fixed yet.

## Next releases

See [Update and rollback](update-and-rollback.md): `release-build`, then
`release-push --backup`.
