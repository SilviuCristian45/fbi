# Backup and restore

## What a backup contains

`scripts/backup.sh` writes `backups/<YYYY-MM-DD_HHMMSS>/` (gitignored, mode
700):

| Path | Content | How |
|---|---|---|
| `postgres/app.dump` | application database (`DB_NAME`) | `pg_dump -Fc` |
| `postgres/keycloak.dump` | Keycloak database (`KEYCLOAK_DB_NAME`): realms, users, credentials, clients | `pg_dump -Fc` |
| `postgres/globals.sql` | Postgres roles (informational) | `pg_dumpall --globals-only` |
| `minio/bucket/` | every object in `MINIO_BUCKET` (sighting photos) | `mcli mirror` from a temporary container of the Silo image |
| `minio/policy.json` | the bucket's anonymous-access policy | `mcli anonymous get-json` |
| `keycloak/realm-<realm>.json` | portable realm export **including users and secrets** | `kc.sh export` in a temporary Keycloak container (`--cache=local`, ~1 min) |
| `face-index/fbi_vectors.pkl` (+ `.noface.json`) | the face index, and the images known to have no detectable face | copied from the `face_index` volume |
| `manifest.txt` | date, git commit, image versions, DB/bucket names, warnings | |

The backup contains password hashes, the client secret and personal data.
Keep it private.

The services keep running during the backup. `pg_dump` takes a consistent
snapshot per database. Uploads that happen during the bucket mirror may or may
not be included.

## Running backups

```bash
scripts/backup.sh                    # prod (.env.prod)
scripts/backup.sh --keep 14          # keep 14 local backups (default BACKUP_KEEP=7)
scripts/backup.sh --skip-realm       # faster: skip the JSON export (the Keycloak DB dump is still there)
scripts/backup.sh --dev              # dev stack (.env)
```

After a successful run, local backups older than the newest `BACKUP_KEEP` are
deleted.

### Daily backup with cron

```bash
scripts/install-cron.sh                       # daily at 03:30 (server time)
scripts/install-cron.sh --backup-time 02:15 --with-healthcheck
scripts/install-cron.sh --dry-run             # show the crontab without installing
scripts/install-cron.sh --remove
```

This installs a managed block in the crontab of the current user (run it as
`deploy`, not root):

- `scripts/backup.sh` daily → `logs/backup.log`
- optionally `scripts/healthcheck.sh` hourly → `logs/healthcheck.log`
- `logrotate` with its own state file → rotates `logs/*.log` weekly, keeps 8
  compressed weeks (no root needed)

Check the first run with `tail -n 50 logs/backup.log`. A failed backup exits
non-zero and the reason is in the log.

## Off-site copies (rclone)

A backup on the same server doesn't survive losing the server. To also upload
every backup to object storage or another machine, use any
[rclone](https://rclone.org/overview/) remote (S3, Backblaze B2, Google Drive,
SFTP, ...).

1. Configure a remote once, as `deploy`. rclone runs from its Docker image, so
   nothing needs to be installed:

   ```bash
   mkdir -p ~/.config/rclone
   docker run --rm -it -v ~/.config/rclone:/config/rclone rclone/rclone:1.75.2 config
   # e.g. create a remote named "b2" of type Backblaze B2 / S3 / sftp ...
   docker run --rm -v ~/.config/rclone:/config/rclone rclone/rclone:1.75.2 lsd b2:
   ```

2. In `.env.prod`:

   ```ini
   BACKUP_REMOTE=b2:my-bucket/fbi-backups
   BACKUP_REMOTE_KEEP=30        # empty = same as BACKUP_KEEP
   # RCLONE_CONFIG_DIR=         # default ~/.config/rclone
   ```

3. From now on, after each local backup, `backup.sh` uploads the folder to
   `<BACKUP_REMOTE>/<timestamp>/` and deletes the oldest remote backups beyond
   `BACKUP_REMOTE_KEEP`. If the upload fails, the script exits with an error
   (visible in the cron log) and the local copy stays. One-off override:
   `--remote other:path`; disable with `--no-remote`.

For sensitive data, use a remote with server-side encryption, or wrap it in an
rclone `crypt` remote.

## Downloading a backup to your computer

From your computer (Linux, macOS, or Windows 10/11 with built-in OpenSSH):

```bash
# list
ssh deploy@<server-ip> 'ls -1 ~/fbi/backups'

# one backup, with rsync (resumable; Linux/macOS/WSL)
rsync -avz --progress deploy@<server-ip>:fbi/backups/2026-11-15_033000 ./fbi-backups/

# with scp (also in Windows PowerShell)
scp -r deploy@<server-ip>:fbi/backups/2026-11-15_033000 ./fbi-backups/

# everything, incrementally
rsync -avz deploy@<server-ip>:fbi/backups/ ./fbi-backups/
```

Uploading a backup to a server, for example to restore on a new VPS, works the
same way in reverse: `rsync -avz ./fbi-backups/<timestamp> deploy@<new-server>:fbi/backups/`.

## Restore

```bash
scripts/restore.sh backups/2026-11-15_033000
```

The script prints the backup's manifest and asks you to type the domain (prod)
or `restore` (dev). Then it:

1. starts `db` and `minio`, and stops `nginx`, `backend`, `python-ai`,
   `file-api` and `keycloak`. **The site is offline during the restore.**
2. drops and recreates `DB_NAME` and `KEYCLOAK_DB_NAME`, and restores them with
   `pg_restore --no-owner`. That restores users, roles and the client secret as
   they were at backup time.
3. creates the bucket if needed, mirrors the objects back, and re-applies the
   saved anonymous-access policy (`minio/policy.json`), or, if missing, a
   read-only `s3:GetObject` policy like the file API's (needed for `/files/`;
   bucket listing stays denied).
4. copies the face index back into the `face_index` volume.
5. starts the whole stack and waits for the healthchecks.

Partial restores: `--skip-db`, `--skip-minio`, `--skip-face-index`.
Non-interactive: `--yes`. Dev stack: `--dev`.

The realm JSON export is **not** imported: the restored Keycloak database
already contains the realm. Use the JSON to recreate the realm on a different
Keycloak by hand (admin console → Create realm → import the file), or to
inspect it.

The restored client secret is the one from backup time. If `.env.prod`'s
`KEYCLOAK_CLIENT_SECRET` has changed since, align them
([rotating the client secret](keycloak.md#rotating-the-client-secret)).

### Restoring onto a different domain

Photo URLs are stored in full in the database
(`https://<old-domain>/files/<bucket>/<file>`). After restoring onto a new
domain, rewrite them:

```bash
dc exec db psql -U fbi -d fbi -c "UPDATE \"LocationWantedPersons\" SET \"FileUrl\" = replace(\"FileUrl\", 'https://old.example.org/', 'https://new.example.org/');"
```

`"PersonMatchResults"."ImageUrl"` holds FBI image URLs (external), so it needs
no change.

### Moving to a new server

1. New server: [DNS and VPS setup](dns-and-vps.md), clone, copy `.env.prod`
   from the old server (same secrets), then `scripts/init-ssl.sh` once DNS
   points to the new IP.
2. `scripts/prod-deploy.sh`: this creates empty volumes, imports the realm and
   runs the migrations.
3. Copy the backup over (rsync, above), then
   `scripts/restore.sh backups/<timestamp>`.

## Testing restores

A backup you've never restored isn't proven. Periodically restore the latest
backup into the dev stack on your computer:

```bash
scripts/restore.sh --dev ./fbi-backups/<timestamp>
```

Prod photo URLs point to the prod domain, so photos display from prod, not
from the restored dev bucket. Everything else (reports, users, matches) can be
checked locally.
