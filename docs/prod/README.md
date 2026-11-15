# Production guide

How to run the stack on a single public VPS with Docker Compose, TLS from
Let's Encrypt and only nginx exposed to the internet.

Throughout these pages, `<your-domain>` is the value of `DOMAIN` in
`.env.prod`, and `deploy` is the non-root user created by `setup-vps.sh`.

## First deployment, in order

| # | Step | Page |
|---|---|---|
| 1 | Pick a server that is big enough | [Server requirements](requirements.md) |
| 2 | Point DNS at it, run `scripts/setup-vps.sh` | [DNS and VPS setup](dns-and-vps.md) |
| 3 | Clone, fill in `.env.prod` | [First deploy](first-deploy.md) |
| 4 | Get the certificate with `scripts/init-ssl.sh` | [TLS certificates](ssl.md) |
| 5 | `scripts/prod-deploy.sh` | [First deploy](first-deploy.md) |
| 6 | Secure Keycloak, create the first admin user | [Keycloak in production](keycloak.md) |
| 7 | Schedule backups with `scripts/install-cron.sh` | [Backup and restore](backup-restore.md) |
| 8 | Review the security checklist | [Security checklist](security-checklist.md) |

## Day-to-day operations

| Task | Command | Page |
|---|---|---|
| Deploy a new version | `scripts/prod-update.sh` | [Update and rollback](update-and-rollback.md) |
| Check health | `scripts/healthcheck.sh` | [Logs and monitoring](logging-monitoring.md) |
| Logs | `docker compose ... logs -f backend` | [Logs and monitoring](logging-monitoring.md) |
| Backup / restore | `scripts/backup.sh`, `scripts/restore.sh` | [Backup and restore](backup-restore.md) |
| Rebuild the face index | `scripts/sync-faces.sh` | [Logs and monitoring](logging-monitoring.md#rebuilding-the-face-index) |
| Admin consoles (Keycloak, MinIO, RabbitMQ) | SSH tunnel | [Admin consoles](admin-consoles.md) |
| Certificates | automatic; `scripts/init-ssl.sh --status` / `--renew` | [TLS certificates](ssl.md) |

Every script prints its usage with `--help`. All of them stop if `.env.prod`
is missing, and `prod-deploy` / `init-ssl` / `prod-update` also refuse to run
while `DOMAIN` is still `example.com` or any value is still `CHANGE_ME`.

### The compose command

The scripts wrap this command. Use it directly when you need it (for
`logs`, `exec`, `ps`):

```bash
alias dc='docker compose -f docker-compose.yaml -f docker-compose.prod.yml --env-file .env.prod'
dc ps
dc logs -f --tail=100 backend
```

The examples in these pages use this `dc` alias.

## What runs where

- Public: nginx on 80 (ACME challenge + redirect) and 443.
- Loopback only (`127.0.0.1` on the server, reachable through SSH tunnels):
  Keycloak 18080, MinIO console 19001, RabbitMQ UI 15673.
- Everything else (Postgres, RabbitMQ AMQP, MinIO API, backend, file API,
  python-ai, frontend) is reachable only on the internal Docker network.

See [Architecture](../architecture.md) for the full picture.
