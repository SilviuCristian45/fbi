# Security checklist

Items are marked **done** (handled by the current compose, nginx or script
configuration), **manual** (you must do it on the server) or **pending**
(known risk, not fixed yet: it needs an application change). Review the
pending items before exposing the app to real users.

## Done (configuration)

| Item | Where |
|---|---|
| Only nginx publishes ports (80/443). Postgres, RabbitMQ, MinIO, backend, file-api and python-ai are reachable only on the internal Docker network. | `docker-compose.prod.yml` |
| Admin consoles (Keycloak, MinIO, RabbitMQ) are not proxied by nginx. They are bound to `127.0.0.1` on the VPS and reached through an SSH tunnel. | `docker-compose.prod.yml`, `nginx/templates/prod/` |
| Keycloak `master` realm is not reachable through nginx (`/realms/master` returns 404). | `nginx/templates/prod/default.conf.template` |
| Keycloak runs in production mode (`start`) with a fixed hostname (`KC_HOSTNAME=https://<your-domain>`, strict hostname). | `docker-compose.prod.yml` |
| `/files/` responses carry `X-Content-Type-Options: nosniff` and a sandbox CSP. Non-images and SVGs are served with `Content-Disposition: attachment`. Only `GET`/`HEAD` are allowed. | `nginx/snippets/files-security.conf` |
| Swagger UI is enabled only when `ASPNETCORE_ENVIRONMENT=Development`. | `fbi-backend/Program.cs` |
| All images are pinned to explicit versions (no `latest`). | compose files, `nginx/Dockerfile` |
| Each container receives only the environment variables it needs (no shared `env_file`). | `docker-compose.yaml` |
| The python-ai service no longer logs the API key. | `face-recog-microservice/main.py` |
| Demo credentials were removed from `README.md`. | `README.md` |
| ufw allows only SSH, 80 and 443; swap and a non-root `deploy` user are set up. | `scripts/setup-vps.sh` |
| `.env.prod` is gitignored, and the deploy scripts warn if it is readable by other users. | `.gitignore`, `scripts/lib/common.sh` |
| Backups are written with mode 700 and can be copied off-site. | `scripts/backup.sh` |

> **Docker and ufw:** ports published by Docker bypass ufw rules. That is why
> the prod overlay publishes nothing except nginx and loopback-only tunnel ports.
> Do not add `ports:` entries to other services in prod.

## Manual (on the server)

- [ ] Every `CHANGE_ME` in `.env.prod` replaced with a long random value
      (`prod-deploy` refuses to run otherwise); `chmod 600 .env.prod`.
- [ ] SSH: key-only login (`PasswordAuthentication no`), root login disabled
      or key-only ([DNS and VPS setup](dns-and-vps.md#recommended-hardening-manual)).
- [ ] Automatic security updates (`unattended-upgrades`).
- [ ] The provider-level firewall (if any) matches ufw: 22, 80, 443.
- [ ] Keycloak: permanent master admin created, bootstrap admin deleted, OTP
      for admins ([Keycloak in production](keycloak.md#first-login-and-permanent-admin)).
- [ ] Off-site backups configured (`BACKUP_REMOTE`), preferably encrypted
      (rclone `crypt`), since backups contain password hashes and the client
      secret. Restores tested ([Backup and restore](backup-restore.md#testing-restores)).
- [ ] An external uptime monitor on `https://<your-domain>/`.

## Pending (application changes needed)

### 1. Upload API key is public (`NEXT_PUBLIC_FILE_API_KEY`) — pending
`NEXT_PUBLIC_*` variables are compiled into the browser bundle, so anyone can
read the `X-Api-Key` and upload arbitrary files to the public bucket (free file
hosting, storage exhaustion). The nginx headers on `/files/` mitigate content
injection but do not stop the uploads.

Proposed fix: route uploads through the backend behind JWT auth (or protect
`/upload` with nginx `auth_request` against the backend), whitelist image
extensions/MIME types and enforce a size limit in the file API.

### 2. JWT issuer and audience are not validated — pending
`Program.cs` sets `ValidateIssuer = false` and `ValidateAudience = false`. The
signature is still checked against the realm keys, but a token issued to *any*
client of the realm is accepted.

Proposed fix: with `KC_HOSTNAME` fixed, tokens always carry
`iss = https://<your-domain>/realms/<realm>`. Set `ValidIssuer` to that value
and add an audience mapper to the client so `aud` can be validated.

### 3. CORS allows any origin with credentials — pending
The `AllowAll` policy uses `SetIsOriginAllowed(_ => true)` together with
`AllowCredentials()`.

Proposed fix: allow only `https://<your-domain>` in production (configurable list).

### 4. Tokens and claims in logs — pending
The backend prints `realm_access` and every token claim (`OnTokenValidated`,
`SurveilanceHub.OnConnectedAsync`). The validation error factory prints the
model state.

Proposed fix: remove these `Console.WriteLine` calls, or move them behind
`LogDebug`.

### 5. Committed development secrets — pending
`fbi-backend/appsettings.json`, `fbi-media-service/appsettings.json`,
`fbi-frontend/example-env.txt` and `face-recog-microservice/.env.example` (and
defaults in `main.py`) contain development passwords/keys. Compose overrides
all of them in Docker, but they should be replaced with empty placeholders.
Never reuse those values in `.env.prod`.

### 6. Unauthenticated python-ai endpoints — pending (low)
`/list-faces` and `/docs` have no auth. They are not exposed by nginx (internal
network only), so the risk is low as long as python-ai has no published port.

### 7. Access token lifetime — trade-off
The frontend has no refresh-token logic, so the imported realm sets
`accessTokenLifespan` to 1 hour (Keycloak default: 5 minutes). Shorten it once
token refresh is implemented.
