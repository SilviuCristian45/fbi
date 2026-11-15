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

Building the images **on the server** needs another ~1.5 GB on top: installing
TensorFlow with pip, `next build` and `dotnet publish`.

| | Minimum | Recommended |
|---|---|---|
| RAM | 4 GB + 2–4 GB swap (runtime ~2 GB measured; the swap is for building images on the server) | 8 GB (comfortable builds, room for growth) |
| CPU | 2 vCPU | 4 vCPU (face analysis is CPU-bound) |
| Disk | 40 GB SSD | 60 GB+ (images ~8 GB, uploads, backups, logs) |
| OS | Ubuntu 22.04/24.04 LTS or Debian 12 (x86_64) | |

`scripts/setup-vps.sh` creates a 4 GB swap file automatically when the server
has less than 8 GB of RAM and no swap. Under 4 GB of RAM, builds and
TensorFlow may still fail even with swap.

Disk usage grows with uploads (MinIO), local backups (`BACKUP_KEEP` × backup
size) and Docker build cache. `docker system prune` reclaims unused images and
cache. `scripts/healthcheck.sh` warns above 85% disk usage.

## Network

- A public IPv4 address. DNS `A` record for `<your-domain>` (and optionally
  `www.<your-domain>`) pointing to it.
- Inbound TCP 22 (SSH), 80 (HTTP, needed for Let's Encrypt and the redirect)
  and 443 (HTTPS). Some providers have their own firewall in the control panel:
  open the same ports there.
- Outbound internet access: Docker Hub / quay.io (images), npm / PyPI / NuGet
  (builds), `api.fbi.gov` and FBI image hosts (scraper and face index sync),
  Let's Encrypt.

## Software

Installed by `scripts/setup-vps.sh`: Docker Engine, the compose plugin (v2),
git, ufw, openssl, curl. `install-cron.sh` uses cron and logrotate (both
present by default on Ubuntu/Debian).

## Images

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
