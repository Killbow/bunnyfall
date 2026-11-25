---
slug: stores-beds-grog-mending-and-wild-escrow-overview
title: "Stores, Inn Beds, Grog, Mending, Fines, Leech, and Wild Escrow"
domain: maintenance
kind: overview
parent: null
files:
  - src/ui/profPages.js
  - src/scenes/interiorContext.js
  - src/systems/naval/navalYard.js
  - src/systems/naval/shipCrew.js
  - src/ui/navalYardWindow.js
  - src/magic/enchantments.js
  - src/justice/standing.js
  - src/justice/standingHost.js
  - src/items/lootPowers.js
  - src/net/wildLaw.js
  - src/net/wildRef.js
  - src/net/wire.js
  - src/world/wild/wildEscrowHost.js
  - server/src/world/wild.js
  - server-account/src/wild.js
  - server-account/src/routeStatus.js
  - server-account/migrations/0118_wild_escrow.sql
routes:
  - /v1/wild/fall
  - /v1/wild/collect
  - /v1/wild/reclaim
  - /v1/wild/escrows
tables:
  - wild_escrow
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-14.md"
related:
  - daedra-summon-offer-and-realm-repair
  - quest-sites-and-homed-reseating
  - wild-zone-pvp-death-drops-and-remains
  - integrity-pvp-duel-and-wild-referees
  - naval-living-crew-companions-and-repairs
invariants:
  - "`holdsHead` (src/ui/profPages.js) walks `node.children` with `for...of` and never calls array methods on an HTMLCollection (STORES-CRASH)."
  - "Bed models 41000-41002 are always added to `beds` in `buildInteriorContext`, whatever their ObjectType, and activate under `bedSleeping` (INN-BEDS)."
  - "The shipwright yard offers at most one grog round per port day (`grogToday`), and only while crew spirits are below the top. The price is `grogPrice` = max(`GROG_MIN` 10, crew x `GROG_PER_HAND` 1)."
  - "A fine paid on the spot raises standing by up to `PENANCE_POINTS` (5), and never above `KNOWN_CRIMINAL_BELOW` (-10). `CHALLENGE_GRACE_MINUTES` is 1440."
  - "Life leech procs only on the blow of the weapon in the striking hand (LEECH-HAND)."
  - "In the wild zone, guildmates count as kin (`wildKin({ guilds })` in server/src/world/wild.js)."
  - "A designated worn piece (`remainsNamedFor`, `rec.wk`) can be collected only by its named killer, and only through two-phase escrow (`wild_escrow`)."
traps:
  - "The MEND-STARVE ordering was replaced by MEND-TIERS. A worn self-degrading piece now mends after other worn pieces but before the pack."
  - "Wild collect is gated by `relaySupportsWildCollect`, which requires relay version >= `WILD_COLLECT_RELAY_MIN` (205). Never hardcode the relay version string."
  - "Escrow refusals (`no-escrow`, `escrow-moved`, `escrow-collected`, `escrow-returned`, `escrow-late`, `escrow-wait`) map to HTTP codes in `WILD_STATUS` (server-account/src/routeStatus.js)."
dfu:
  - vendor/roleplay-realism/Scripts/RoleplayRealism.cs
  - Assets/Scripts/Game/MagicAndEffects/Effects/Enchanting/CastWhenHeld.cs
  - Assets/Scripts/Game/MagicAndEffects/Effects/Enchanting/ItemDeteriorates.cs
  - Assets/Scripts/Game/Entities/PlayerEntity.cs
tags:
  - ui
  - interior
  - naval
  - enchantments
  - justice
  - pvp
  - wild-zone
---

# Stores, Inn Beds, Grog, Mending, Fines, Leech, and Wild Escrow

This overview covers maintenance fixes across UI traversal, inn beds, shipyard grog rounds, self-degrading enchantment mending, court fine standing, weapon life leech, and wild-zone PvP loot escrow.

- **UI, beds, and shipyard grog:** In `src/ui/profPages.js`, `holdsHead` iterates `node.children` with `for...of` because `HTMLCollection` has no `.some` method. In `src/scenes/interiorContext.js`, `buildInteriorContext` registers bed models `41000-41002` into `beds` before checking `ObjectType` so scenery-typed inn beds activate under `bedSleeping`. In `src/systems/naval/navalYard.js`, `src/systems/naval/shipCrew.js`, and `src/ui/navalYardWindow.js`, `provisionOffer` and `yardText` report crew spirits (`spiritsOf`) and offer at most one grog round per port day (`grogToday`) while spirits are below maximum, priced at `grogPrice = max(GROG_MIN 10, crew * GROG_PER_HAND 1)`.
- **Mending, fines, and life leech:** In `src/magic/enchantments.js`, `wearsItself` identifies worn `Cast When Held` and `Item Deteriorates` gear so `repairsObjectsTarget` and `mendOrder` mend normal equipped items first, self-degrading worn items second, and pack items last. In `src/justice/standing.js` and `src/justice/standingHost.js`, paying a fine on the spot raises standing by up to `PENANCE_POINTS` (5), capped at `KNOWN_CRIMINAL_BELOW` (-10), with `CHALLENGE_GRACE_MINUTES` set to 1440. In `src/items/lootPowers.js`, life leech triggers only when the striking hand swings the leech weapon.
- **Wild kin and two-phase escrow:** In `server/src/world/wild.js`, `wildKin({ guilds })` treats guildmates as kin. Worn PvP drops (`remainsNamedFor`, `rec.wk`) enter `wild_escrow` (`0118_wild_escrow.sql`) via `/v1/wild/fall`, `/v1/wild/collect`, `/v1/wild/reclaim`, and `/v1/wild/escrows` (`src/net/wildLaw.js`, `src/net/wildRef.js`, `src/net/wire.js`, `src/world/wild/wildEscrowHost.js`, `server-account/src/wild.js`, and `WILD_STATUS` in `server-account/src/routeStatus.js`), gated by `relaySupportsWildCollect` (`WILD_COLLECT_RELAY_MIN`, 205).
