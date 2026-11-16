# Update and rollback

Nothing is built on the VPS. Images are built on your PC, sent to the server
over SSH and started there from the images alone. The VPS keeps a git checkout
only for the compose files, the nginx templates, the Keycloak realm and the
scripts, and that checkout is always moved to the commit the images were
built from.

```
PC (Git Bash)                                   VPS (~/fbi)
scripts/release-build.sh   ── fbi/*:<sha> ──>   docker load
scripts/release-push.sh    ── ssh ──────────>   git checkout <sha>
                                                scripts/prod-deploy.sh --tag <sha> --prune
```

## Deploying a new version

On the PC, from a clean working tree at the commit you want to deploy (pushed
to the git remote, so the VPS can fetch it):

```bash
git status                                   # must be empty
scripts/release-build.sh                     # fbi/<service>:<sha>, sizes at the end
scripts/release-push.sh deploy@<server-ip> --backup
```

### `release-build.sh`

1. Validates the **local** `.env.prod`: `DOMAIN` and `API_KEY_SHARED` are
   baked into the frontend bundle (`NEXT_PUBLIC_*`), so they must match the
   VPS file. It refuses `DOMAIN=example.com` and leftover `CHANGE_ME`.
2. Refuses to run if `git status` is not empty, including untracked files, so
   the tag always matches the code in the images. `--allow-dirty` builds anyway
   with the tag `<sha>-dirty` (only for tests).
3. Builds `backend`, `frontend`, `python-ai`, `file-api` and `nginx` one after
   another (one `compose build <service>` at a time, since a multi-service
   build goes through `buildx bake` in parallel) for `TARGET_PLATFORM` (default
   `linux/amd64`, through buildx/QEMU if it differs from the PC). It uses
   `docker-compose.yaml` + `docker-compose.build.yml` + `docker-compose.prod.yml`.
   Each image carries the label `org.opencontainers.image.revision=<full sha>`.
4. Prints each image's size. With `--measure` it also prints the gzip size,
   which is what the first push uploads.

### `release-push.sh <user@vps> [project-dir]`

`project-dir` defaults to `fbi` (that is, `~/fbi`).

1. Checks that the local images for the current commit exist and were built
   for `TARGET_PLATFORM`.
2. Runs `uname -m` on the VPS and stops if it doesn't match
   (`x86_64` = `linux/amd64`, `aarch64` = `linux/arm64`).
3. Compares the VPS checkout with the local commit. If they differ, it asks
   before running `git fetch && git checkout <sha>` there (detached HEAD). It
   stops if the VPS checkout has local modifications, or if the commit is not
   on any remote branch yet (`git push` first).
4. Compares each image on both sides by content: the uncompressed layer list
   plus `Env`/`Cmd`/`Entrypoint`/`Labels`. `docker image inspect .Id` can't be
   used for this, because Docker Desktop's containerd store and the VPS's
   classic store report different IDs for the same image. Only missing or
   different images are sent, with `docker save | gzip | ssh 'gunzip | docker load'`
   (progress bar if `pv` is installed). After the transfer it checks that the
   VPS images match.
5. `--backup`: runs `scripts/backup.sh` on the VPS before deploying (skipped
   on the very first deploy, when the database isn't running yet).
6. Runs `scripts/prod-deploy.sh --tag <sha> --prune` on the VPS.
7. `--with-index`: runs `scripts/push-face-index.sh` at the end.

Other options: `--no-deploy` (send only), `--port N` (SSH port), `--yes`
(no prompts). SSH must use a key: the script runs ssh in `BatchMode`.

### `prod-deploy.sh` (on the VPS)

1. Validates `.env.prod`.
2. Checks that `${IMAGE_PREFIX}/<service>:<tag>` exists for all five services.
   If any is missing, it says so and tells you to run `release-push` from the
   PC. It never builds.
3. With `--tag`, writes the tag to `.env.release` (gitignored). The previous
   tag becomes `IMAGE_TAG_PREVIOUS`.
4. Checks the certificate, pulls **only the third-party images** (postgres,
   keycloak, silo, rabbitmq, certbot), runs `up -d --pull never`, waits for
   every healthcheck, then reloads nginx.
5. With `--prune`, deletes own images whose tag is neither the current nor the
   previous one.

Without `--tag` it redeploys the tag already in `.env.release`. Use it after
editing `.env.prod`.

The compose files in prod set `pull_policy: never` on the own services. Compose
never tries to download `fbi/backend` from Docker Hub, where that name could
belong to someone else.

### What a change needs

| Changed | What to do |
|---|---|
| Application code (`fbi-*`, `face-recog-microservice/`, `nginx/Dockerfile`, `nginx/snippets/`) | commit, `release-build`, `release-push` |
| `docker-compose*.yml`, `nginx/templates/prod/`, `keycloak/realm-export.json`, `scripts/` | commit + push; `release-push` moves the VPS checkout. Images with unchanged content are not resent. |
| `.env.prod` on the VPS (secrets, limits) | `scripts/prod-deploy.sh` on the VPS |
| `DOMAIN` or `API_KEY_SHARED` | change **both** `.env.prod` files (PC and VPS), then `release-build` + `release-push`: the frontend bundle contains them |
| `keycloak/realm-export.json` | not applied to an existing realm ([Keycloak](keycloak.md#realm-changes-after-the-first-start)) |
| `postgres-init/` | runs only on an empty volume |

### Before an update that contains migrations

Use `release-push.sh --backup` (or run `scripts/backup.sh` on the VPS). EF Core
migrations run when the new backend starts. Down-migrations are not automated,
so a backup is the only way back for the schema.

### Downtime

Recreating a service takes it offline for a few seconds (the backend and the
frontend run as a single instance each). nginx resolves service names
dynamically (Docker DNS, 10 s cache), so traffic goes to the new container as
soon as it is up, and `prod-deploy` reloads nginx as a safety net. Messages
sent to RabbitMQ while `python-ai` restarts wait in the durable queue. The
upload itself happens before any container is touched.

## Rollback

```bash
# on the VPS
scripts/rollback.sh           # back to IMAGE_TAG_PREVIOUS
scripts/rollback.sh <tag>     # a specific tag that still exists on the VPS
```

`rollback.sh` asks for confirmation, then runs `prod-deploy.sh --tag <tag>`.
The current tag becomes the previous one, so running it again goes forward
again. The VPS keeps only the current and the previous tag (`--prune`). For an
older version, rebuild it on the PC (`git checkout <tag>`, `release-build`,
`release-push`).

**Rolling back the images does not roll back the database schema.**
Migrations applied by the newer backend stay applied:

- Added tables or columns are usually harmless for the old code.
- Renamed or dropped columns break the old backend, and python-ai too, since
  it writes `"PersonMatchResults"` and `"LocationWantedPersons"` with raw SQL.
  Then restore the backup taken before the release:

  ```bash
  scripts/rollback.sh <good-tag> --yes
  scripts/restore.sh backups/<timestamp-before-the-release>
  ```

  `restore.sh` replaces both databases, the bucket contents and the face index
  ([Backup and restore](backup-restore.md)). Data written after that backup is
  lost.

`rollback.sh` changes only the images, not the git checkout. If the bad release
also changed compose files or nginx templates, move the checkout back too
(`git checkout <good-tag>`; the tag is the commit) and run
`scripts/prod-deploy.sh`.

### Keycloak or infrastructure image upgrade

Infrastructure versions are pinned in `docker-compose.yaml`. Keycloak and
Postgres migrate their data on upgrade and can't be downgraded in place:
restore the backup taken before the upgrade.

## Future improvement: a private registry

`docker save | ssh | docker load` sends whole images. A changed image is
re-uploaded in full, even when only its top layer changed (for python-ai that
means the full TensorFlow image for a one-line fix in `main.py`). A private
registry such as GitHub Container Registry (GHCR) would only transfer the
changed layers in both directions: `docker push` from the PC, `docker pull` on
the VPS. That would need registry credentials on both sides and image names
like `ghcr.io/<owner>/fbi-backend`, with `IMAGE_PREFIX` pointing there and
`pull_policy` changed. It is not implemented.

## Housekeeping

```bash
docker image ls 'fbi/*'            # own images: current + previous tag
docker image prune -f              # dangling layers
docker system df                   # what uses the disk
```
