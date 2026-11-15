# TLS certificates (Let's Encrypt)

## The chicken-and-egg problem and how it is solved

The prod nginx config references `/etc/letsencrypt/live/<your-domain>/`, so
nginx cannot start without a certificate. But Let's Encrypt needs a web server
on port 80 to validate the domain. `scripts/init-ssl.sh` breaks the loop:

1. It starts a **temporary** plain `nginx:1.30.6-alpine` container on port 80
   that serves only the `certbot_webroot` volume (`/.well-known/acme-challenge/`).
2. It runs `certbot certonly --webroot` in the `certbot` service. The
   certificate is stored in the `letsencrypt` volume, under the lineage name
   `<your-domain>`.
3. It removes the temporary container.

If the prod stack is already running (for example with `--force` to replace a
certificate), the script uses the real nginx, which serves the same webroot on
port 80, and reloads it afterwards.

## First certificate

Prerequisites: DNS points to the server ([DNS and VPS setup](dns-and-vps.md)),
port 80 is open, and `DOMAIN` and `CERTBOT_EMAIL` are set in `.env.prod`.

```bash
scripts/init-ssl.sh --staging    # optional dry run against the staging CA (no rate limits)
scripts/init-ssl.sh --force      # replace the staging cert with a real one
# or directly:
scripts/init-ssl.sh
```

Options:

| Option | Effect |
|---|---|
| `--staging` | Use the Let's Encrypt staging CA. The certificate is not trusted by browsers, but there are no rate limits. |
| `--with-www` | Also include `www.<your-domain>` (needs a DNS record). |
| `--force` | Delete the existing certificate for the domain and issue a new one (asks you to type the domain). |
| `--status` | `certbot certificates`: names, domains, expiry dates. |
| `--renew` | Run `certbot renew` now and reload nginx. |

The script checks that the domain resolves and warns if the IP is not one of
the server's addresses.

## Automatic renewal

Two containers handle renewal, so there is no cron job for it:

| Who | What | When |
|---|---|---|
| `certbot` service (`docker-compose.prod.yml`) | `certbot renew --webroot -w /var/www/certbot` (renews only certificates expiring in < 30 days) | every 12 h, as certbot recommends |
| nginx (`nginx/reload-certs.sh` in the nginx image) | `nginx -s reload` (no downtime) to load renewed files | every 6 h |

A renewed certificate is therefore live at most ~6 h after renewal, well
before expiry. Check with:

```bash
scripts/init-ssl.sh --status
scripts/healthcheck.sh               # warns under 20 days, fails under 7
dc logs --tail=50 certbot
```

Let's Encrypt no longer sends expiry emails, so rely on `healthcheck.sh`
(hourly with `install-cron.sh --with-healthcheck`).

## Changing the domain

1. Point the new DNS record at the server.
2. Update `DOMAIN` in `.env.prod`.
3. `scripts/init-ssl.sh`: issues a certificate for the new name, since the
   lineage is per domain.
4. `scripts/prod-deploy.sh`: rebuilds the frontend, whose URLs are compiled in,
   and recreates nginx, Keycloak and the file API with the new hostname.

Photo URLs already stored in the database still contain the old domain (see
[Backup and restore](backup-restore.md#restoring-onto-a-different-domain) for
the SQL fix).

## Troubleshooting

| Error | Fix |
|---|---|
| `Timeout during connect` / `Connection refused` | Port 80 blocked (ufw, provider firewall) or DNS points elsewhere. |
| `Invalid response from .../.well-known/acme-challenge/...: 404` | Another web server is answering on port 80. Find it with `sudo ss -ltnp 'sport = :80'` and stop it. |
| `too many certificates already issued` | Rate limit: use `--staging` while testing, then wait. |
| `Nu exista certificat pentru <domain>` from `prod-deploy` | Run `scripts/init-ssl.sh` first. |
| nginx doesn't start after changing `DOMAIN` | No certificate for the new name yet: run `init-ssl.sh`. |
