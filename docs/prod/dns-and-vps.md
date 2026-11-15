# DNS and VPS setup

## 1. DNS

At your DNS provider, create:

| Type | Name | Value |
|---|---|---|
| `A` | `<your-domain>` (e.g. `@` or a subdomain) | the VPS public IPv4 |
| `A` (optional) | `www` | the same IP, only if you will use `init-ssl.sh --with-www` |

Avoid an `AAAA` record unless the server really serves IPv6: Let's Encrypt
prefers IPv6 when an `AAAA` record exists. If you use Cloudflare, set the
record to **DNS only** (grey cloud) at least for the first certificate.

Check propagation from your computer:

```bash
dig +short <your-domain>        # or: nslookup <your-domain>
```

## 2. Prepare the server (`setup-vps.sh`)

Log in as root, or as a sudo user, on a fresh Ubuntu 22.04/24.04 or Debian 12
server:

```bash
ssh root@<server-ip>
apt-get update && apt-get install -y git
git clone <repo-url> /root/fbi-setup && cd /root/fbi-setup
sudo scripts/setup-vps.sh            # or: sudo bash scripts/setup-vps.sh
```

The script is idempotent and prints what it does:

1. Installs base packages (git, curl, ufw, openssl, ...).
2. Installs **Docker Engine + compose plugin** from Docker's official apt
   repository (skipped if already installed).
3. Creates the user **`deploy`** (`--user` to change), adds it to the `docker`
   group, and copies root's `authorized_keys` so you can SSH in as `deploy`.
4. Configures **ufw**: deny all inbound except SSH (`--ssh-port`, default 22),
   80 and 443.
5. Creates a **4 GB swap file** (`--swap-size`) if the server has less than
   8 GB of RAM and no swap; sets `vm.swappiness=10`.

Options: `--user NAME`, `--ssh-port PORT`, `--swap-size 4G`, `--no-swap`,
`--no-ufw`. See `--help`.

> **Docker bypasses ufw.** Ports published by Docker (`ports:`) are opened in
> iptables before ufw's rules, so ufw does not protect them. That is why the
> prod overlay publishes only nginx, plus admin consoles bound to `127.0.0.1`.
> Never add `ports:` to other services in production.

> Members of the `docker` group are effectively root on the host. Protect SSH
> access to `deploy` accordingly (keys only).

### Recommended hardening (manual)

- Disable SSH password login and root login in `/etc/ssh/sshd_config`:
  `PasswordAuthentication no`, `PermitRootLogin prohibit-password` (or `no`),
  then `systemctl reload ssh`. Test a key login as `deploy` in a second session
  first.
- Enable automatic security updates:
  `apt-get install -y unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades`.
- Optional: `fail2ban` for SSH.

## 3. Clone the project as `deploy`

```bash
ssh deploy@<server-ip>
git clone <repo-url> ~/fbi && cd ~/fbi
```

The temporary clone in `/root/fbi-setup` can be removed. Continue with
[First deploy](first-deploy.md).
