---
slug: boss-traits-striker-and-owner-halves
title: "Boss Traits: Striker Half vs Owner Half"
domain: combat
kind: subcard
parent: boss-traits-overview
files:
  - src/characters/bossTraits.js
  - src/characters/foeTraitsHost.js
  - src/characters/exteriorFoes.js
  - src/scenes/dungeonContext.js
  - src/worldEvents/standInSpell.js
  - src/ui/hitNumbers.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Boss-Traits.md"
related:
  - boss-traits-overview
  - boss-traits-carriers-wire-and-hud
  - online-coop-cell-enemies-halo-and-hits
invariants:
  - "The striker machine runs bossStrike (element and weapon resistances, thorns) before a blow is sent to a puppet's owner."
  - "The owner machine runs bossTake (curb, then ward, then the wrath clock) where the enemy's health lives."
  - "Only the player's own blows (mine) start or extend the wrath clock. Curb and ward apply to any blow (when `fromPlayer` is true, `striker` is set, or `kind` is not `melee`), and non-blows such as falls are exempt."
  - "Spells keep their element through to the owner (peer spell sinks pass o.element). Stand-in spell rounds resist per tick by element. Open Hand's owed blow is resisted like the swing it follows."
traps:
  - "Wrath is permanent once it triggers. markBossWrath scales damageScale by WRATH_X once, and only a fight that has not turned yet cools after WRATH_COOL_S."
  - "A resisted blow's floating number is redrawn with retellHit and tagged 'Resisted' (bossTraits.tag.resisted)."
dfu: []
tags:
  - boss-traits
  - damage-pipeline
  - authority
  - multiplayer
---

# Boss Traits: Striker Half vs Owner Half

The boss-trait damage pipeline splits across the striking client and the authority owner so resistances, thorns, damage caps, wards, and wrath work cleanly in single-player and cooperative rooms.

- **Striker Half (`src/characters/bossTraits.js`, `src/characters/foeTraitsHost.js`, `src/worldEvents/standInSpell.js`, `src/ui/hitNumbers.js`):** Before sending a hit to a puppet owner, the striker runs `bossStrike` via `bossStrikeAt` and `strikeTraits`. Resisted spells deal `0.25` damage and resisted weapons deal `0.5` (`bladeturning` halves blades and arrows; `stoneskin` halves `SKILLS.BluntWeapon` and unarmed fists), rounded with a floor of `1`. Resisted hits redraw their floating number via `retellHit` with `'Resisted'` (`bossTraits.tag.resisted`). `thorned` reflects `max(1, round(landed * 0.2))` on melee or arrow blows. Peer spell sinks preserve `o.element`, stand-in spell rounds resist per tick by element, and Open Hand follow-up blows inherit the swing resistance.
- **Owner Half (`src/characters/bossTraits.js`, `src/characters/foeTraitsHost.js`, `src/characters/exteriorFoes.js`, `src/scenes/dungeonContext.js`):** Where the enemy health resides, `damageFoe` invokes `bossTake` through `bossTakeAt`. For any blow (`fromPlayer`, `striker` set, or `kind` not `melee`, excluding non-blows like falls), `curbing` caps incoming damage at `max(1, round(maxHealth * 0.05))`, and `warded` absorbs damage first, regrowing `10` s after the last ward hit and refilling over `4` s.
- **Wrath Lifecycle (`src/characters/bossTraits.js`, `src/characters/foeTraitsHost.js`):** Only the player's own blows (`mine`) start or extend the wrath clock. `traitsFrame` ticks the clock each frame and triggers due wrath on the authority client. Once triggered, `markBossWrath` multiplies `damageScale` by `WRATH_X` permanently; only an unturned fight cools after `WRATH_COOL_S`.
