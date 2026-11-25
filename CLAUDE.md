# CLAUDE.md

Bunnyfall: a self-hosted fork of DFO Online (Daggerfall in the browser) for a small group of friends.
Live at https://dagg.campfirerp.com, served from the owner's Linux box with Docker (`selfhost/`).

- **Servers run without Cloudflare.** The relay (`server/`) and the account service (`server-account/`) run on
  wrangler's local runtime through `selfhost/start.mjs`, configured by `selfhost/relay.toml` and
  `selfhost/accounts.toml`. The `wrangler.toml` files in `server/` and `server-account/` are the upstream originals,
  kept as reference: change the `selfhost/` ones.
- **The client finds its servers** through `src/net/selfHost.js`: from the page's own address, else the domain.
- **Start with `docs/GUIDE.md`**: the short, Bunnyfall-only map of the repo, the rules and where each feature lives.
- **Query `codex` before grepping large files.** The `codex` MCP server (`.mcp.json`) and `npm run codex -- <cmd>`
  index modules, HTTP routes, WebSocket frames, save hooks, and SQLite migrations live and serve 798 reference cards in
  `tools/codex/cards/` (pass any older `bible/...` comment path to `npm run codex -- bible <path>`). Run
  `npm run codex -- diff main HEAD` before finishing a branch, update or add a `<= 250`-word card when changing rules or
  adding a subsystem, and verify with `npm run codex:check`.
- **ARENA2 is freeware**: `sh tools/fetch-data.sh` puts it at `/home/claude/dfdata/arena2` (never in the repo). Set
  `ARENA2_PATH` to it before work that reads the game's files.
- **Keep host files small**: put new subsystems into dedicated modules wired by `bootWorld`, `createWorldModes`,
  `buildDungeonContext`, `bootExterior`, or `Room`, and check `node tools/worldBudgetCheck.mjs`.
- **New account-service route**: add it to `ROUTES` in `server-account/src/service.js` as well as the handler in
  `index.js`, or the service answers `not-found`. Check with `node tools/routesCheck.mjs` (see `docs/GUIDE.md`).
- **Changelog**: a change players will notice gets a plain-words line in `CHANGELOG.md` (newest day first). Each desktop
  release's patch notes are the lines added since the previous release (`scripts/changelogNotes.mjs`).
- **Before a push**: run `npm run check` (lint, `worldBudgetCheck.mjs`, `routesCheck.mjs`, `codex:check`, type checks,
  and `vite build`), and test gameplay changes in the browser.
- **Content switched off** (Phase 2) lives in `src/mods/contentOff.js`: one list the client and the relay both read.
  Flip a flag to bring a piece back.
- **Adding a DFU mod** (`.dfmod`): `node tools/importDfmod.mjs <file.dfmod>` unpacks it into `vendor/<mod>/` (manifest,
  settings, text and DLLs, textures as PNG, sounds as OGG, `inventory.json`, a README). Asset-only mods are mostly done
  there; a mod's C# (.dll) is ported by hand into `src/`, wired the way the other vendored mods are. Add its licence and
  its authors to `src/ui/credits.js`.
- **Names** (Phase 3): `src/characters/names.js`. Strangers say title + last name, NPCs who like you your first name;
  `src/ui/namePicker.js` asks a character without them once, in the world.
- **Credits stay.** Keep `LICENSE` (AGPLv3 license for Bunnyfall changes) and `LICENSE.VENDORS` (MIT notices for
  original DFO Online repo and Daggerfall Unity) and the authors in `src/ui/credits.js` and `vendor/`.
