# Keycloak (local)

## What is configured automatically

On first start, Keycloak imports `keycloak/realm-export.json` (`--import-realm`).
`${KEYCLOAK_REALM}`, `${KEYCLOAK_CLIENT_ID}` and `${KEYCLOAK_CLIENT_SECRET}`
placeholders in the file are replaced from the container environment, so the
secret never lives in git. The import creates:

| Item | Value |
|---|---|
| Realm | `KEYCLOAK_REALM` (default `dotnet`), brute-force protection on, self-registration off |
| Realm roles | `USER`, `ADMIN` (exact upper case: the backend checks `[Authorize(Roles = "USER,ADMIN")]`) |
| Client | `KEYCLOAK_CLIENT_ID` (default `dotnet`): confidential, secret = `KEYCLOAK_CLIENT_SECRET`, **direct access grants** on (password login done by the backend), standard/implicit flows off |
| Service account | `service-account-<client>` with `realm-management` roles `view-users`, `manage-users`, `view-realm`. Used by `GET /api/Auth/users` and `POST /api/Auth/register`. |
| Token lifetime | access token 1 h, SSO idle 1 h, SSO max 10 h. The frontend has no refresh logic. |

The import contains **no users**. The import is skipped when the realm already
exists, so later edits to `realm-export.json` (or to `.env`) do not reach an
existing realm. Apply them in the console, or reset the dev data (below).

The master-realm admin comes from `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`
(`KC_BOOTSTRAP_ADMIN_*`) and is created only on the very first start.

## Admin console

http://localhost:18080/admin/ → log in with `KEYCLOAK_ADMIN` /
`KEYCLOAK_ADMIN_PASSWORD` → switch to the `dotnet` realm (top-left realm
selector).

## Create test users

### In the console

1. **Users → Create new user**: username (e.g. `agent`), email, toggle
   **Email verified** on, then **Create**.
2. **Credentials → Set password**: enter a password and turn **Temporary**
   **off**. A temporary password adds a required action, and the backend's
   password grant then fails with "Account is not fully set up".
3. **Role mapping → Assign role → Filter by realm roles** → select `USER`
   (or `ADMIN`) → **Assign**.

Create at least one `ADMIN` (statistics, reports, user management) and one
`USER`.

### With the CLI (`kcadm.sh`)

```bash
KC="docker compose -f docker-compose.yaml -f docker-compose.dev.yml --env-file .env exec keycloak /opt/keycloak/bin/kcadm.sh"
$KC config credentials --server http://localhost:8080 --realm master --user admin --password dev_admin_password

$KC create users -r dotnet -s username=admin1 -s email=admin1@example.test -s emailVerified=true -s enabled=true
$KC set-password -r dotnet --username admin1 --new-password 'Admin1-dev-pass'
$KC add-roles -r dotnet --uusername admin1 --rolename ADMIN

$KC create users -r dotnet -s username=agent1 -s email=agent1@example.test -s emailVerified=true -s enabled=true
$KC set-password -r dotnet --username agent1 --new-password 'Agent1-dev-pass'
$KC add-roles -r dotnet --uusername agent1 --rolename USER
```

In PowerShell, run the commands one by one with the full
`docker compose ... exec keycloak /opt/keycloak/bin/kcadm.sh` prefix.

### Through the API

Once an ADMIN exists, more users can be created with
`POST /api/Auth/register` (Swagger at http://localhost:17002/swagger, with the
ADMIN's token):

```json
{ "username": "agent2", "password": "Agent2-dev-pass", "email": "agent2@example.test", "role": "USER" }
```

## Logging in

The frontend posts to `POST /api/Auth/login` (`{ "username", "password" }`),
and the backend performs the password grant against
`http://keycloak:8080/realms/<realm>/protocol/openid-connect/token`. To get a
token for curl:

```bash
TOKEN=$(curl -s http://localhost:8088/api/Auth/login -H 'Content-Type: application/json' \
  -d '{"username":"agent1","password":"Agent1-dev-pass"}' | sed -E 's/.*"access_token":"([^"]+)".*/\1/')
```

## Reset Keycloak

`scripts/dev-reset.sh` (or `dev-reset.ps1`) deletes all dev volumes, including
the Keycloak database. The next `dev-up` re-imports the realm from
`realm-export.json` with the current `.env` values. You will have to recreate
the users.

To re-import only the realm without losing other data, delete the realm in the
console (Realm settings → Action → Delete) and restart Keycloak:
`scripts/dev-up.sh keycloak`.

## Exporting realm changes back to the repository

If you change realm settings in the console and want them in
`realm-export.json`, export the realm (Realm settings → Action → Partial
export, without users and clients' secrets). Merge only the relevant settings
into the file by hand, and keep the `${...}` placeholders and the
`service-account-...` entry.
