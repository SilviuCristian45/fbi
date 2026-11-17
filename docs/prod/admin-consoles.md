# Admin consoles (SSH tunnels)

In production nginx does not expose any admin UI. The Keycloak admin console,
the MinIO (Silo) console and the RabbitMQ management UI are bound to
**`127.0.0.1` on the server only** (`docker-compose.prod.yml`). Reach them by
forwarding a local port over SSH.

| Console | Server port (loopback) | `.env.prod` variable | URL on your computer |
|---|---|---|---|
| Keycloak admin | 18080 | `KC_ADMIN_TUNNEL_PORT` | http://localhost:18080/admin/ |
| MinIO (Silo) console | 19001 | `MINIO_CONSOLE_TUNNEL_PORT` | http://localhost:19001 |
| RabbitMQ management | 15673 | `RABBITMQ_MGMT_TUNNEL_PORT` | http://localhost:15673 |

## Keycloak

```bash
ssh -N -L 18080:127.0.0.1:18080 deploy@<server-ip>
```

Open http://localhost:18080/admin/. Keycloak runs with
`KC_HOSTNAME_ADMIN=http://localhost:18080`, so the console and its login page
are served on the tunnel address. **The local port must be the same as
`KC_ADMIN_TUNNEL_PORT`**: with `-L 9999:127.0.0.1:18080` the console would
redirect you to `localhost:18080`.

Log in with the master-realm admin (`KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`
on the first login, then your permanent admin; see
[Keycloak in production](keycloak.md)).

## MinIO (Silo) console

```bash
ssh -N -L 19001:127.0.0.1:19001 deploy@<server-ip>
```

Open http://localhost:19001 and log in with `MINIO_ROOT_USER` /
`MINIO_ROOT_PASSWORD`. Here you can browse the `MINIO_BUCKET` bucket (uploaded
sighting photos). The S3 API itself (port 9000) is not published at all. To
use `mcli` against it, run it inside Docker:

```bash
dc exec minio sh -c 'mcli alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && mcli ls local/$MINIO_BUCKET | head'
```

## RabbitMQ management

```bash
ssh -N -L 15673:127.0.0.1:15673 deploy@<server-ip>
```

Open http://localhost:15673 and log in with `RABBITMQ_USER` /
`RABBITMQ_PASSWORD`. Check **Queues**: `face-analysis-queue` (consumer:
python-ai) and `analysis-finished-queue` (consumer: backend) should each have
one consumer and no backlog. `scripts/healthcheck.sh` checks the same thing
from the command line.

## All three at once

```bash
ssh -N \
  -L 18080:127.0.0.1:18080 \
  -L 19001:127.0.0.1:19001 \
  -L 15673:127.0.0.1:15673 \
  deploy@<server-ip>
```

Or add it to `~/.ssh/config` on your computer and run `ssh -N fbi-admin`:

```text
Host fbi-admin
    HostName <server-ip>
    User deploy
    LocalForward 18080 127.0.0.1:18080
    LocalForward 19001 127.0.0.1:19001
    LocalForward 15673 127.0.0.1:15673
```

On Windows, OpenSSH (`ssh`) is built into Windows 10/11 and the same commands
work in PowerShell. In PuTTY: Connection → SSH → Tunnels → source port 18080,
destination `127.0.0.1:18080`, Add.

## Postgres

Postgres has no published port, not even on loopback. Use `psql` inside the
container:

```bash
dc exec db psql -U "$(grep ^DB_USER= .env.prod | cut -d= -f2)" -d fbi
```

For a GUI client (DBeaver, pgAdmin), use the client's own "SSH tunnel" feature
with host `<server-ip>`, user `deploy`, and as database host the container IP
(`docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' $(dc ps -q db)`),
port 5432. The container IP changes when the container is recreated.
