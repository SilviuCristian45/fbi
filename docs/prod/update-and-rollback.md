# Update and rollback

## Deploying a new version

```bash
cd ~/fbi
scripts/prod-update.sh --dry-run    # fetch and show what would be rebuilt
scripts/prod-update.sh
```

`prod-update.sh`:

1. Validates `.env.prod`. It refuses to run if tracked files have local
   modifications.
2. Runs `git pull --ff-only`, so the branch never diverges silently.
3. Compares the old and new commits and maps the changed files to services:

   | Changed path | Action |
   |---|---|
   | `fbi-backend/` | rebuild + recreate `backend` (pending migrations run on start) |
   | `fbi-frontend/` | rebuild + recreate `frontend` |
   | `face-recog-microservice/` | rebuild + recreate `python-ai` |
   | `fbi-media-service/` | rebuild + recreate `file-api` |
   | `nginx/` | rebuild + recreate `nginx` |
   | `docker-compose.yaml`, `docker-compose.prod.yml` | `up -d --build` for the whole stack (compose recreates only what changed) |
   | `keycloak/realm-export.json` | warning only: not applied to an existing realm ([Keycloak](keycloak.md#realm-changes-after-the-first-start)) |
   | `postgres-init/` | warning only: runs only on an empty volume |
   | `scripts/`, `docs/`, `*.md` | nothing |

4. Waits for the healthchecks of the rebuilt services and reloads nginx.

Options: `--all` (rebuild and recreate everything), `--no-pull --since <ref>`
(compare with a given commit), `--timeout`.

**`.env.prod` is not in git.** After editing it, run `scripts/prod-deploy.sh`
(or `prod-update.sh --all`). Changes to `DOMAIN` or `API_KEY_SHARED` need a
frontend rebuild, and `prod-deploy` builds everything.

### Before an update that contains migrations

```bash
scripts/backup.sh
```

Down-migrations are not automated. If a release breaks the schema, rolling back
means restoring this backup.

### Downtime

Recreating a service takes it offline for a few seconds (the backend and the
frontend run as a single instance each). nginx resolves service names
dynamically (Docker DNS, 10 s cache), so traffic goes to the new container as
soon as it is up. `prod-update` also reloads nginx as a safety net. Messages
sent to RabbitMQ while `python-ai` restarts wait in the durable queue.

## Rollback

### Code only (no schema change)

```bash
git log --oneline -5                       # find the last good commit
git checkout <good-commit>                 # detached HEAD
scripts/prod-update.sh --no-pull --since <bad-commit>
```

`prod-update` rebuilds the services that differ between the two commits. When
the fix is on the branch, go back with `git checkout main` and
`scripts/prod-update.sh`.

### Code + database

If the bad release ran a migration that the old code can't handle:

```bash
git checkout <good-commit>
scripts/restore.sh backups/<timestamp-before-the-update>
scripts/prod-update.sh --no-pull --since <bad-commit>
```

`restore.sh` replaces both databases, the bucket contents and the face index
([Backup and restore](backup-restore.md)). Data written after that backup is
lost.

### Keycloak or infrastructure image upgrade

Infrastructure versions are pinned in `docker-compose.yaml`. Keycloak and
Postgres migrate their data on upgrade and can't be downgraded in place:
restore the backup taken before the upgrade.

## Housekeeping

```bash
docker image prune -f              # dangling images left by rebuilds
docker builder prune -f --filter until=168h   # build cache older than a week
docker system df                   # what uses the disk
```
