# Production guide

How to run the stack on a single public VPS with Docker Compose, TLS from
Let's Encrypt and only nginx exposed to the internet.

**Nothing is built on the VPS.** The five own images (backend, frontend,
python-ai, file-api, nginx) are built on your PC with
`scripts/release-build.sh` and sent over SSH with `scripts/release-push.sh`.
The face index is also built on the PC and sent with
`scripts/push-face-index.sh`. The VPS pulls only the third-party images
(postgres, keycloak, silo, rabbitmq, certbot) and keeps a git checkout for the
compose files, nginx templates and scripts.

Throughout these pages, `<your-domain>` is the value of `DOMAIN` in
`.env.prod`, and `deploy` is the non-root user created by `setup-vps.sh`.

## First deployment, in order

| # | Step | Page |
|---|---|---|
| 1 | Pick a server that is big enough | [Server requirements](requirements.md) |
| 2 | Point DNS at it, run `scripts/setup-vps.sh` | [DNS and VPS setup](dns-and-vps.md) |
| 3 | Clone, fill in `.env.prod` (on the VPS **and** on the PC) | [First deploy](first-deploy.md) |
| 4 | Get the certificate with `scripts/init-ssl.sh` (VPS) | [TLS certificates](ssl.md) |
| 5 | Build the face index with the dev stack (PC) | [First deploy](first-deploy.md#3-build-the-face-index-on-the-pc) |
| 6 | `scripts/release-build.sh`, then `scripts/release-push.sh deploy@<server-ip> --with-index` (PC) | [First deploy](first-deploy.md) |
| 7 | Secure Keycloak, create the first admin user | [Keycloak in production](keycloak.md) |
| 8 | Schedule backups with `scripts/install-cron.sh` | [Backup and restore](backup-restore.md) |
| 9 | Review the security checklist | [Security checklist](security-checklist.md) |

## Day-to-day operations

| Task | Command | Page |
|---|---|---|
| Deploy a new version (PC) | `scripts/release-build.sh` + `scripts/release-push.sh <user@vps> --backup` | [Update and rollback](update-and-rollback.md) |
| Go back to the previous images (VPS) | `scripts/rollback.sh` | [Update and rollback](update-and-rollback.md#rollback) |
| Redeploy after editing `.env.prod` (VPS) | `scripts/prod-deploy.sh` | [Update and rollback](update-and-rollback.md) |
| Check health | `scripts/healthcheck.sh` | [Logs and monitoring](logging-monitoring.md) |
| Logs | `docker compose ... logs -f backend` | [Logs and monitoring](logging-monitoring.md) |
| Backup / restore | `scripts/backup.sh`, `scripts/restore.sh` | [Backup and restore](backup-restore.md) |
| Update the face index | PC: `scripts/sync-faces.sh --dev` + `scripts/push-face-index.sh <user@vps>`; or VPS: `scripts/sync-faces.sh` | [Logs and monitoring](logging-monitoring.md#rebuilding-the-face-index) |
| Admin consoles (Keycloak, MinIO, RabbitMQ) | SSH tunnel | [Admin consoles](admin-consoles.md) |
| Certificates | automatic; `scripts/init-ssl.sh --status` / `--renew` | [TLS certificates](ssl.md) |

Every script prints its usage with `--help`. All of them stop if `.env.prod`
is missing, and `prod-deploy` / `init-ssl` / `release-build` also refuse to run
while `DOMAIN` is still `example.com` or any value is still `CHANGE_ME`.

### The compose command

The scripts wrap this command. Use it directly when you need it (for
`logs`, `exec`, `ps`):

```bash
alias dc='docker compose -f docker-compose.yaml -f docker-compose.prod.yml --env-file .env.prod --env-file .env.release'
dc ps
dc logs -f --tail=100 backend
```

The examples in these pages use this `dc` alias. `.env.release` holds
`IMAGE_TAG` (written by `prod-deploy.sh --tag`); it exists after the first
`release-push`.

## What runs where

- Public: nginx on 80 (ACME challenge + redirect) and 443.
- Loopback only (`127.0.0.1` on the server, reachable through SSH tunnels):
  Keycloak 18080, MinIO console 19001, RabbitMQ UI 15673.
- Everything else (Postgres, RabbitMQ AMQP, MinIO API, backend, file API,
  python-ai, frontend) is reachable only on the internal Docker network.

See [Architecture](../architecture.md) for the full picture.
