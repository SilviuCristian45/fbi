# Development guide

Everything needed to run and change the project on your own machine. The
primary workflow is the **dev Docker stack**: all services in containers, with
debug ports exposed. You can also run a single service natively against the
containerized infrastructure.

| Page | What it covers |
|---|---|
| [Local setup](local-setup.md) | Prerequisites, starting the dev stack (Windows and Linux/macOS), running a service without Docker |
| [Environment variables](environment.md) | Every variable, who reads it, defaults, values that must match |
| [Keycloak (local)](keycloak.md) | Realm import, test users, the ADMIN role, resetting |
| [EF Core migrations](migrations.md) | Adding/removing migrations, how they are applied, the Python coupling |
| [Testing face recognition](testing-face-recognition.md) | Manual end-to-end test of upload → report → analysis → SignalR |
| [Troubleshooting](troubleshooting.md) | Common errors and fixes |

## Quick reference

```bash
cp .env.example .env              # once (PowerShell: Copy-Item .env.example .env)
scripts/dev-up.sh                 # build + start + wait for healthchecks
scripts/dev-logs.sh backend       # follow logs of one service
scripts/healthcheck.sh --dev      # check services, RabbitMQ consumers, HTTP
scripts/dev-down.sh               # stop (data is kept)
scripts/dev-reset.sh              # stop and DELETE all dev data
```

On Windows, use the PowerShell equivalents: `scripts\dev-up.ps1`,
`dev-down.ps1`, `dev-logs.ps1`, `dev-reset.ps1`. The other bash scripts
(`healthcheck.sh`, `backup.sh`, `sync-faces.sh`, ...) also run on Windows from
**Git Bash**, with `--dev`.

| What | URL |
|---|---|
| Application | http://localhost:8088 |
| Swagger (backend) | http://localhost:17002/swagger |
| Keycloak admin console | http://localhost:18080/admin/ |
| MinIO (Silo) console | http://localhost:19001 |
| RabbitMQ management | http://localhost:15673 |
| Postgres | `localhost:15433` |

See also the [architecture overview](../architecture.md).
