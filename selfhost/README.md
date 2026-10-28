# Bunnyfall self-host

Runs the whole game on your own machine: the game client, the relay (multiplayer) and the account service.
No Cloudflare account. The two servers run on wrangler's local runtime (workerd), with all state on disk in `data/`.

Players open **https://dagg.campfirerp.com/play/**, pick their own Daggerfall folder as usual, and they are on your server.
Nothing to configure on their side.

## Linux server (Docker)

Before the first start:

1. DNS: an **A record** for `dagg.campfirerp.com` pointing at your public IP.
2. Router: forward **TCP 80** and **TCP+UDP 443** to the Linux box. Port 80 is needed for the certificate.

Then, in the repo folder:

```sh
docker compose up -d --build
```

Caddy gets the HTTPS certificate by itself on first start. Check it with `docker compose logs -f web`.

Useful commands:

```sh
docker compose logs -f server      # relay and account service output
docker compose down                # stop
```

## Behind nginx (a box with a game panel)

If something else already holds ports 80 and 443 (`ss -tlnp | grep -E ':(80|443) '` shows nginx, as on a box with the
AMP panel), the game runs on a private port and that nginx passes `dagg.campfirerp.com` to it:

```
cd /opt/bunnyfall
printf 'WEB_HTTP=127.0.0.1:8480\nWEB_HTTPS=127.0.0.1:8443\nDOMAIN=:80\n' > .env
docker compose up -d --build
cp selfhost/nginx-bunnyfall.conf /etc/nginx/conf.d/bunnyfall.conf
nginx -t && systemctl reload nginx
apt install -y certbot python3-certbot-nginx
certbot --nginx -d dagg.campfirerp.com
```

nginx then holds the HTTPS certificate (certbot renews it on its own); the panel's own sites are untouched.

## Updating from GitHub

Changes go to GitHub first (edit with Claude, it pushes to `main`), then the box pulls them:

```sh
sh selfhost/update.sh
```

It pulls `main`, and only if something changed it rebuilds and restarts. The old server keeps running during the
build, so players only see a short reconnect. Your `data/` folder is never touched.

**The in-game button**: signed in as `Killbunny`, the main menu shows a small **↻** button top-left (nobody else
sees it). Pressing it asks the server to update. For it to work, add this line once with `crontab -e`, as the user
that owns the repo folder (fix the path):

```
* * * * * cd /path/to/bunnyfall && sh selfhost/update.sh --if-requested
```

Cron checks every minute, and runs the update only after you pressed the button. The button shows the progress,
and the full log is in `updates/update.log`. The game server never gets Docker or GitHub access: it only leaves a
request file in `updates/`.

**Fully automatic updates** (optional, instead of the button): this line pulls every 5 minutes on its own:

```
*/5 * * * * cd /path/to/bunnyfall && sh selfhost/update.sh >> updates/update.log 2>&1
```

**Do not edit files directly on the box.** The script refuses to pull while there are local edits, so it never
overwrites your work. Make changes on GitHub instead (or run `git checkout -- .` on the box to throw local edits away).

On Windows, `selfhost\windows-update.cmd` pulls the latest version for the local test.

## Windows local test

Needs [Node.js 22](https://nodejs.org) or newer. Double-click `selfhost\windows-test.cmd`.
It installs what it needs the first time, starts both servers, starts the game and opens
**http://localhost:5173/play/** in your browser. Close the two console windows to stop.

The local test only works on the same PC (`localhost`). The game refuses unencrypted connections to anything else.

## Your data

Everything lives in `data/` next to the repo:

- `keys.json`: the signing keys, made on first start. **Keep it private.** Losing it only forces everyone to reconnect.
- The rest is the account database, saves and relay state. Back up the whole folder to back up the server.

## Staff titles

In `selfhost/accounts.toml`, the `*_HANDLES` lines say who holds which title (comma separated, case does not matter).
Owner, developer and moderator rights are set to `Killbunny`. **Register that name first**, before a friend can.
Rebuild after a change (`docker compose up -d --build`).

## What was changed from the original

- Client points at your domain: `src/net/selfHost.js`. On a page served from a web address it uses that address, so the
  same build works for the Windows test and the server.
- Server configs: `selfhost/relay.toml` and `selfhost/accounts.toml`. The originals in `server/` and `server-account/`
  are kept unchanged.
- Off: Discord bot, Patreon, the AI moderation assist, Cloudflare analytics, the original GitHub deploy and CI workflows.
- The Terms and Privacy pages (`terms/`, `privacy/`) still carry the original project's text. Edit them if you care.
