# CLAUDE.md

Bunnyfall: a self-hosted fork of DFO Online (Daggerfall in the browser) for a small group of friends.
Live at https://dagg.campfirerp.com, served from the owner's Linux box with Docker (`selfhost/`).

- **Servers run without Cloudflare.** The relay (`server/`) and the account service (`server-account/`) run on
  wrangler's local runtime through `selfhost/start.mjs`, configured by `selfhost/relay.toml` and
  `selfhost/accounts.toml`. The `wrangler.toml` files in `server/` and `server-account/` are the upstream originals,
  kept as reference: change the `selfhost/` ones.
- **The client finds its servers** through `src/net/selfHost.js`: from the page's own address, else the domain.
- **The bible is upstream reference.** `bible/` describes DFO Online and keeps its name. Read it to understand a
  system, but it does not bind this fork's process (no patch notes, no STE, no upstream CI).
- **ARENA2 is freeware**: `sh tools/fetch-data.sh` puts it at `/home/claude/dfdata/arena2` (never in the repo). Set
  `ARENA2_PATH` to it before work that reads the game's files.
- **The hosts do not grow** (`bible/01-Overview/Host-Split.md`): new behaviour goes into a module the host wires, never
  into `bootWorld`, `createWorldModes`, `buildDungeonContext`, `bootExterior` and the other hosts listed there.
- **Before a push**: `npm run lint` and the test files the change touches. There is no CI.
- **Credits stay.** Keep `LICENSE` (MIT notices for DFO Online and Daggerfall Unity) and the authors in
  `src/ui/credits.js` and `vendor/`.
