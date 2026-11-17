# Server requirements

## Sizing

Memory per service, measured on the dev stack (Nov 2026, `docker stats`,
idle after a report analysis; prod usage is similar, light load):

| Service | Measured | Notes |
|---|---|---|
| python-ai (TensorFlow 2.20 + DeepFace Facenet) | ~640 MiB idle with the model loaded; **peak 850 MiB** during `sync-faces --full` | Images downsized to 1280 px, `MALLOC_ARENA_MAX=2`. Limited by `AI_MEMORY_LIMIT` (2 GB). Before these changes the sync peaked at 2.4 GiB. |
| Keycloak (JVM) | ~750 MiB | Limited by `KEYCLOAK_MEMORY_LIMIT` (1 GB) |
| backend (.NET 9) | ~160 MiB | |
| RabbitMQ | ~130 MiB | |
| MinIO (Silo) | ~80 MiB | |
| PostgreSQL | ~70 MiB | grows with data and connections |
| frontend (Next.js) | ~55 MiB | |
| file API + nginx + certbot | ~60 MiB | |
| **Total** | **~2 GB** (peak ~2.2 GB during a sync) | plus the OS |

Nothing is built on the server anymore: images are built on the PC and sent
with `scripts/release-push.sh`. The server needs memory only for the runtime
(about 2 GB measured), not for pip/TensorFlow, `next build` or
`dotnet publish`.

| | Minimum | Recommended |
|---|---|---|
| RAM | 4 GB (runtime ~2 GB measured, peak ~2.2 GB during a sync) + 2 GB swap as a safety net | 8 GB (room for growth) |
| CPU | 2 vCPU | 4 vCPU (face analysis is CPU-bound) |
| Disk | 40 GB SSD | 60 GB+ (images ~8 GB, uploads, backups, logs) |
| OS | Ubuntu 22.04/24.04 LTS or Debian 12 (x86_64) | |

`scripts/setup-vps.sh` creates a 4 GB swap file automatically when the server
has less than 8 GB of RAM and no swap. Under 4 GB of RAM, TensorFlow and
Keycloak may still be OOM-killed even with swap.

Disk usage grows with uploads (MinIO), local backups (`BACKUP_KEEP` × backup
size) and own images: `release-push` keeps two tags (current + previous) of
each, so plan for about twice the image sizes below. `docker system prune` reclaims unused images and
cache. `scripts/healthcheck.sh` warns above 85% disk usage.

## Network

- A public IPv4 address. DNS `A` record for `<your-domain>` (and optionally
  `www.<your-domain>`) pointing to it.
- Inbound TCP 22 (SSH), 80 (HTTP, needed for Let's Encrypt and the redirect)
  and 443 (HTTPS). Some providers have their own firewall in the control panel:
  open the same ports there.
- Outbound internet access: Docker Hub / quay.io (third-party images),
  `api.fbi.gov` and FBI image hosts (scraper, optional face index sync),
  Let's Encrypt. npm / PyPI / NuGet are needed only on the PC that builds.
- Inbound upload from your PC over SSH: the first `release-push` sends every
  own image (sizes below).

## Software

Installed by `scripts/setup-vps.sh`: Docker Engine, the compose plugin (v2),
git, ufw, openssl, curl. `install-cron.sh` uses cron and logrotate (both
present by default on Ubuntu/Debian).

## Images

### Own images (built on the PC, sent over SSH)

Sizes as reported by Docker Desktop for the dev images (Nov 2026,
uncompressed; containerd store):

| Image | Uncompressed | gzip (first upload) |
|---|---|---|
| `fbi/python-ai` | 5.12 GB | TODO: measure with `release-build.sh --measure` |
| `fbi/frontend` | 1.03 GB | TODO |
| `fbi/backend` | 507 MB | TODO |
| `fbi/file-api` | 354 MB | TODO |
| `fbi/nginx` | 92.7 MB | TODO |
| **Total** | **~7.1 GB** | TODO |

TODO: estimated first-upload time (gzip total / your upload bandwidth; for
example 2 GB at 20 Mbit/s ≈ 15 min). Later releases resend only the images
whose content changed, but always in full. The python-ai image can shrink to
about 3.9 GB (see `TODO.md`).

### Third-party images

All images are pinned to explicit versions (no `latest`):

| Image | Version |
|---|---|
| `postgres` | 17.12-alpine |
| `quay.io/keycloak/keycloak` | 26.8.2 |
| `rabbitmq` | 3.13.7-management-alpine (MassTransit 8.1 is not validated against RabbitMQ 4.x) |
| `pgsty/silo` (S3 storage) | RELEASE.2026-10-26T00-00-00Z |
| `nginx` | 1.30.6-alpine (base of `nginx/Dockerfile`) |
| `certbot/certbot` | v5.10.0 |
| `rclone/rclone` (backups, optional) | 1.75.2 |
| Build bases | `mcr.microsoft.com/dotnet/sdk` and `aspnet` (9.0 and 10.0), `node:20-alpine`, `python:3.11-slim` |

### Why Silo and not `minio/minio`

MinIO no longer publishes community Docker images; `minio/minio` and
`quay.io/minio/minio` can't be pulled anymore. Silo (`pgsty/silo`, formerly
`pgsty/minio`) is the community fork maintained by Pigsty. It is a drop-in
replacement: same `MINIO_*` variables, same data format, same S3 API. It
includes `mcli`, which `backup.sh` / `restore.sh` use. Override it with
`MINIO_IMAGE` if you want another S3-compatible server.
