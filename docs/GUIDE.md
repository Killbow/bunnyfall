# Bunnyfall guide

The short version of how this repo works. It replaces the bible for day-to-day work: read this first, grep the code
second, and open `bible/` only when a comment points you there.

Bunnyfall is a self-hosted fork of DFO Online (Daggerfall in the browser) for a small group of friends. It is live at
https://dagg.campfirerp.com/play/ and runs on the owner's Linux box.

## The three pieces

| Piece | Where | What it does |
|---|---|---|
| Client | `src/`, `index.html`, `play/` | The game, in the browser. Also wrapped by the desktop app in `app/`. |
| Relay | `server/src/` | Live multiplayer: who is where, chat, shared world events. |
| Account service | `server-account/src/` | Everything kept: accounts, homes, decor, guestbooks, guilds, boards. SQL migrations in `server-account/migrations/`. |

On the box, Caddy (`selfhost/Caddyfile`) sends `/relay` to the relay, `/v1` and `/accounts` to the account service,
`/updater` to the owner's update door and everything else to the built game in `dist/`. Both servers run on
wrangler's local runtime through `selfhost/start.mjs`, configured by `selfhost/relay.toml` and `selfhost/accounts.toml`.
Their data lives in `data/` (not in git). The `wrangler.toml` files in `server/` and `server-account/` are upstream's
originals: do not edit them.

The client finds the servers from the page's own address (`src/net/selfHost.js`), falling back to the domain.

## Working on it

- `npm run dev` runs the game with hot reload. Run `node selfhost/start.mjs` beside it for the servers.
- Game data: `sh tools/fetch-data.sh` puts ARENA2 at `/home/claude/dfdata/arena2`. Set `ARENA2_PATH` to it for
  anything that reads the game's files. It never goes in the repo.
- There is no test suite and no CI gate. Check a change by reading it and, when it matters, trying it in the game.
  `tools/*Probe.mjs` are small browser or node probes if you want one.

## Shipping

Before a push:

1. `npx eslint <changed files>`
2. `npm run build`
3. If a server file changed, a wrangler dry run for each service:
   `node server/node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir <scratch>/relay -c selfhost/relay.toml`
   and the same with `selfhost/accounts.toml`.
4. English text: run `node tools/l10nExtract.mjs` so `locales/en/Port_Strings.csv` matches.

Commit to `main` and push. Every push to `main` also builds and publishes the desktop app
(`.github/workflows/release-desktop.yml`), but a change to `app/` only reaches players with a new desktop release.

A change that touches the relay or account service needs a server update on the box: `./selfhost/update.sh`, or the
↻ button in the main menu when signed in as Killbunny. A client-only change is live after the same update, since it
rebuilds `dist/`. Never edit files on the box itself.

## Rules that matter

- **The hosts do not grow.** `bootWorld` (`src/scenes/world.js`, 35k lines), `createWorldModes`, `buildDungeonContext`,
  `bootExterior` and the relay's `Room` are huge knots. New behaviour goes into its own module, and the host gets a
  line or two to wire it. Do not read these files whole: grep for the name you need.
- **Text:** write English as `t('some.key', 'English words')`, then run `node tools/l10nExtract.mjs`.
- **Network fields:** anything new on the wire passes through the validators in `src/net/wire.js`.
- **Content switched off** (Phase 2) is one list, `src/systems/contentOff.js`, read by the client and the relay. Flip
  a flag to bring a piece back.
- **Credits stay:** `LICENSE`, the authors in `src/ui/credits.js` and `vendor/`.
- **Fork changes are tagged.** `grep -rn BUNNYFALL src server server-account app` finds them. Comments quoting "Mac"
  are the upstream owner, not us.

## How a feature is shaped

Most online features follow the same path. The guestbook is the plainest example:

1. **Law**, pure and shared by both ends, in `src/net/`: `guestbookLaw.js` (line length, how many are kept, the
   signing gap). No DOM, no network, no clock.
2. **Server**, in `server-account/src/`: `guestbook.js` holds the rules, a route in `index.js`
   (`/v1/homes/guestbook/sign` and `/read`), and a migration (`0186_guestbook.sql`).
3. **Client API**, in `src/net/accountClient.js`: one method per route, plus the words for each refusal.
4. **Client module**, in `src/systems/online/guestbook.js`: the door rows and what pressing them does.
5. **Wiring**: a line in `world.js` (passes the api) and in `worldModes.js` (adds the door rows). Nothing more.

Features with no server part skip steps 2 and 3. The tavern is `tavernLaw.js` (in `src/systems/tavern/`) plus
`src/scenes/tavernSocial.js`, with its pose fields added to the wire.

Adding a DFU mod: `node tools/importDfmod.mjs <file.dfmod>` unpacks it into `vendor/<mod>/`. Asset-only mods are mostly
done by that. A mod's C# is ported by hand into `src/` and wired like the other vendored mods. Add its licence and
authors to `src/ui/credits.js`.

## Where Bunnyfall's own things live

| Feature | Files |
|---|---|
| Seven new guilds and their halls (online only) | `src/net/bunnyGuildLaw.js`, `src/systems/guild/bunny*.js`, `src/scenes/bunnyHallBanners.js`, `src/ui/town/hallAutomap.js` |
| Names (first and last, how NPCs address you) | `src/systems/names.js`, `src/ui/namePicker.js` |
| Content switched off | `src/systems/contentOff.js` |
| Homes: buying, votes, who may enter | `src/net/homeLaw.js`, `server-account/src/homes.js`, `homeVotes.js`, `src/systems/online/onlineHomes.js` |
| Decor: caps, placing, nudging, panel | `src/net/decorLaw.js`, `server-account/src/decor.js`, `src/systems/decor/`, `src/scenes/decor/`, `src/ui/decorPanel.js` |
| Yards and their edges | `src/scenes/homeYards.js` |
| Hiding another home's decor (only you) | `src/systems/online/homeDecorHide.js` |
| Guestbook | see the list above |
| Tavern rounds, busking, tips | `src/systems/tavern/tavernLaw.js`, `src/scenes/tavernSocial.js`, `src/systems/guild/bunnyServices.js` |
| Other players' paperdolls, seen from behind | `src/ui/paperDollBack.js`, `src/ui/paperDoll.js`, `src/net/remotePlayers.js` |
| Crafting rework (salvage, upgrades) | `src/net/salvageLaw.js`, `src/net/upgradeLaw.js`, `src/ui/professions/` |
| Server switches for a small server | `server-account/src/bunnyfall.js`, `selfhost/accounts.toml` |
| Self-host, updates, the ↻ button | `selfhost/`, `src/ui/ownerUpdate.js` |
| Desktop app | `app/`, `.github/workflows/release-desktop.yml` |
| Logo and brand mark | `src/assets/branding/`, `src/ui/brandMark.js`, `public/icons/` |

## Folders in `src/`

`formats/` reads Daggerfall's files. `world/` builds towns, blocks and dungeons from them. `scenes/` holds the hosts and
their modules. `systems/` is game rules and state. `net/` is the wire, the client for the servers and the laws both
ends share. `ui/` is every window. `render/` is the WebGL renderer. `combat/`, `characters/`, `player/`, `ai/` and
`poi/` are what their names say.

## Facts about the game's files

Checked against the real data, so worth trusting:

- Every town with a palace and at least 40 houses keeps all seven Bunnyfall guilds. Smaller towns hold fewer.
- Guild halls are converted houses (House1 to House4), so they read as houses until a banner and the map colour mark them.
- Lantern flame heights on chain lights are measured per texture in `src/systems/decor/decorFlame.js`.

## Open work

- Player-hosted festivals: custom name and description, costs gold, shown on the map and in chat, a small buff for
  attendees, hosted from an innkeeper. Designed, not built. Note that `src/net/festivalLaw.js` and
  `server-account/src/festival.js` are upstream's own festival, a different thing.
- Small leftovers in the paperdoll back view: a stray skin block beside a loincloth, blocky hair, shields drawn flat.
