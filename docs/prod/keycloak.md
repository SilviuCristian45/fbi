# Keycloak in production

## How it runs

| Setting | Value | Why |
|---|---|---|
| Command | `start --import-realm` | Production mode, plus a realm import on first start |
| `KC_HOSTNAME` | `https://<your-domain>` | Fixed public URL; tokens carry `iss = https://<your-domain>/realms/<realm>` |
| `KC_HOSTNAME_STRICT` | default (`true`) | Doesn't trust the request's Host header |
| `KC_HOSTNAME_BACKCHANNEL_DYNAMIC` | `true` | The backend talks to `http://keycloak:8080` (token endpoint, JWKS) over the internal network |
| `KC_HOSTNAME_ADMIN` | `http://localhost:${KC_ADMIN_TUNNEL_PORT}` | The admin console is used only through an SSH tunnel |
| `KC_HTTP_ENABLED` + `KC_PROXY_HEADERS=xforwarded` | | TLS terminates in nginx |
| `KC_HEALTH_ENABLED` | `true` | `/health/ready` on management port 9000, used by the healthcheck |
| Memory | `KEYCLOAK_MEMORY_LIMIT` (1 GB) | |
| Data | in the `KEYCLOAK_DB_NAME` database in Postgres | Included in `backup.sh` |

Through nginx only `/realms/` (except `/realms/master`) and `/resources/` are
public. Users never need them for the app (login is done server-side by the
backend), but they are left available for OIDC discovery and the account
console. `/admin/` and the whole master realm are not reachable from the
internet.

## First login and permanent admin

`KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD` create a **temporary** bootstrap
admin in the master realm on the very first start (`KC_BOOTSTRAP_ADMIN_*`).
Changing these variables later has no effect.

1. Open the tunnel and the console ([Admin consoles](admin-consoles.md#keycloak)):
   `ssh -N -L 18080:127.0.0.1:18080 deploy@<server-ip>`, then
   http://localhost:18080/admin/.
2. Log in with the bootstrap admin. Keycloak shows a warning that it is
   temporary.
3. Realm **master** → Users → **Create new user** (for example your own name),
   then Credentials → set a strong password (Temporary off), then Role mapping →
   Assign role → Filter by realm roles → `admin`.
4. Log out, log in with the new admin, and **delete** the bootstrap user.
5. Optional: Realm master → Authentication → enable OTP for the admin user.

## Application realm

The realm `KEYCLOAK_REALM` (default `dotnet`) is imported from
`keycloak/realm-export.json`. See [Keycloak (local)](../dev/keycloak.md) for
the full list: roles `USER`/`ADMIN`, the confidential client with direct access
grants and a service account, and a 1 h access token.

### First application admin

Self-registration is off, and `POST /api/Auth/register` already requires the
`ADMIN` role, so the first application user must be created in the console:

1. Switch to the application realm (top-left selector).
2. Users → Create new user → username and email, **Email verified** on →
   Create.
3. Credentials → Set password (Temporary **off**).
4. Role mapping → Assign role → Filter by realm roles → `ADMIN`.

That user can then create others from the app (`POST /api/Auth/register` with
`role` `USER` or `ADMIN`) or you create them in the console the same way.

### Realm changes after the first start

The import runs only if the realm does not exist. Later changes to
`realm-export.json` or to `KEYCLOAK_REALM` / `KEYCLOAK_CLIENT_ID` in
`.env.prod` are **not** applied automatically, even after a `release-push`
moves the VPS checkout. Apply such changes in the console.

### Rotating the client secret

1. Console → application realm → Clients → `<client>` → Credentials →
   **Regenerate** and copy the value. Or paste your own value into
   `KEYCLOAK_CLIENT_SECRET` and set it there.
2. Put the same value in `KEYCLOAK_CLIENT_SECRET` in `.env.prod`.
3. `scripts/prod-deploy.sh` (recreates the backend with the new secret).

Until both sides match, logins fail with `invalid_client`.

## Recommended settings to review

- **Realm settings → Sessions / Tokens**: the access token lasts 1 h because
  the frontend has no refresh logic. Shorten it once refresh is implemented.
- **Realm settings → Security defenses → Brute force detection**: on by
  default in the import. Tune the lockout policy.
- **Realm settings → Email**: configure SMTP if you want password reset by
  email (`resetPasswordAllowed` is off in the import).
- **Events**: enable login events (Realm settings → Events) to audit logins.

## Upgrading Keycloak

The image is pinned (`quay.io/keycloak/keycloak:26.8.2`). To upgrade:

1. Read the release notes and the upgrade guide for every version in between.
2. Take a backup: `scripts/backup.sh` (includes the Keycloak database and a
   realm JSON export).
3. Change the tag in `docker-compose.yaml`, commit and push, then run
   `scripts/release-push.sh <user@vps>` from the PC (it moves the VPS checkout;
   unchanged own images are not resent). `prod-deploy` pulls the new Keycloak
   image, and Keycloak migrates its database on start.
4. Downgrading after a schema migration is not supported: restore the backup
   instead.
