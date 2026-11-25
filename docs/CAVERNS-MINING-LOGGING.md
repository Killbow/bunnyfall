# Caverns, Mining, and Logging

Design for the expedition pass, written before the build. The owner chose option A for survey notes: they sell to the
Cartographers' Society and are not items players trade.

## Findings (before the change)

- A dungeon holds 1 to 4 independent veins a day (`dungeonVeins`, `src/net/nodeLaw.js`). Each is a flat roll on the
  dungeon's walls. There is no trail between them, no reason to bring a tool other than the Pick-Axe, and no choice about
  how far to go.
- The Cartographers' Society (`src/guilds/bunnyServices.js`) sells place maps and buys "places found" for gold. It has no
  contracts, no cavern notes, and no stake in mining.
- Logging: a map pixel is 819 m across and holds 4 to 12 trees a day. Each tree's law point is random over the whole pixel
  and snaps to the nearest forest flat, so the walk between trees is 250 to 400 m. The server reads only a tree's tier and
  material (`server-account/src/profHarvest.js`), never where it stands, so placement is a client matter.

## What gets built

1. **Groves (logging fix).** A pixel's trees stand in groves of about six: each grove takes the nearest unclaimed forest
   flats to one center. The walk between trees falls from hundreds of meters to tens, and the rank speed is unchanged.
2. **Cavern expeditions (mining).** `src/net/expeditionLaw.js` (pure, shared) reads a dungeon's day veins as a chain:
   the richest is the **seam**, the rest are **traces**. Mining a trace gives a lead (bearing and distance to the seam).
   The seam is not on the compass until a lead is found. Each cavern has a **kind** that decides what reaching the seam
   needs: a plain pick, a light, a grappling hook, or a partner within reach (shoring). A seam carries a **rich** flag in
   about one cavern-day in eight, drawn from the rarer magical ores, so unknown caverns are worth a look.
3. **Haul or push.** The expedition tracks what the delve has taken. Deeper seams are worth more to the Society, and the
   pack's weight is the real limit: the player decides whether to chase the seam or haul out.
4. **Cartographers' Society.** A **survey contract** names a cavern near the hall. Turning in its seam notes pays gold and
   standing, scaled by the seam's ore tier, its kind, and whether it was rich. Route notes are kept on the character (a
   mod save record, like the survey count), and sold at the hall. No new account-service routes, tables, or items.
5. **Timber (logging decisions).** Grove trees carry a **grade** (sound, knotty, prime) from the tree's slot, felling
   cleanly raises it, and the grade rides into the Stores' log label and the saw recipe's yield notes where the recipes
   read it. Outposts and camps are free today by design (`campLaw.js`), so charging timber for them is a follow-up that
   needs the owner's call.

## Non-goals

- No new item kinds, SQL migrations, or account-service routes in this pass.
- No change to the server's harvest checks: every node keeps its existing key, so the service validates seams and
  traces as ordinary dungeon veins.

## Constraints

- Shared law lives in `src/net/`, with no DOM, network, or clock. The client halves stay in `src/professions/` and
  `src/guilds/`, wired by a line or two from the existing hosts.
- English goes through `t('key', 'words')`, and `node tools/l10nExtract.mjs` keeps the catalog in step.
