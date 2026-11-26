---
slug: npc-populations-wardrobe-and-creatures
title: "Enemy, Folk, Roster and Creature Bodies, Wardrobe, and Spectral Veils"
domain: characters
kind: subcard
parent: morrowind-npc-bodies-overview
files:
  - src/characters/foeBodies.js
  - src/characters/folkBodies.js
  - src/characters/wardrobe.js
  - src/characters/dyes.js
  - src/characters/peopleBodies.js
  - src/characters/rosterBodies.js
  - src/characters/creatureBodies.js
  - src/characters/ownClothingModels.js
  - src/formats/mwFirstPerson.js
  - src/formats/mwCharacter.js
  - src/homes/decorRoom.js
  - src/world/npcFlatArchives.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Morrowind-NPCs.md"
related:
  - morrowind-npc-bodies-overview
  - living-world-census-schedules-and-watch
  - characters-paperdoll-and-bodies
invariants:
  - "Enemy looks come from `foeActor`/`rosterLook` with Bay race weights Breton `30`, Redguard `25`, Nord `10`, WoodElf `9`, DarkElf `8`, HighElf `8`, Khajiit `5`, and Argonian `5`."
  - "`ORC_MOBILES`, `VAMPIRE_MOBILES`, and `WOLF_MOBILE` enemies render as people; vampires and werewolves carry no blade."
  - "`WARDROBE_ROLES`: `commoner`, `tradesman`, `traveller`, `scholar`, `merchant`, `noble`, `priest`, `mage`, `rogue`, `fighter`, and `knight`; `ARMOR_KITS`: `knight`, `fighter`, and `rogue`; `WARDROBE_DYES` picks role dyes from `DYE_COLORS`."
  - "`CREATURE_MATCH` maps Daggerfall mobiles to Morrowind creature models or a declared miss; a flyer renders only in a record that flies (`CREA_FLAG.Flies` `0x20`)."
  - "Spectral actors render under `SPECTRAL_VEIL` (mode `3`, alpha `SPECTRAL_ALPHA/255`); Lysandus (archive `473`) keeps his own sprite."
  - "Decor figures use `figureLook` with `FIGURE_ROLE_WORDS` over `FLATS.CFG` captions; `offerDecorFigures` places them; `isNpcFlat` filters flat sprites."
  - "Enemy look seeds sync on the wire as `ls` and worn kits as `lw`, validated by `validFoeRecord`, minted once at spawn."
traps:
  - "Re-deriving an enemy seed on each wire update changes its appearance mid-fight."
  - "`drawBodiesUnderWindow` must mark corpse flats `castOnly` while loot is open or dead enemies revert to sprites."
  - "`offerDecorFigures` rebuilds the feet position of each placed figure from the entry origin `o` plus `piece.pos` every frame, because the origin of a figure batch is not its base: a room batch carries its base in its vertices, and `restand()` writes only the recenter step into `batch.origin`."
dfu: []
tags:
  - wardrobe
  - enemies
  - creatures
  - ghosts
  - decor
---

# Enemy, Folk, Roster and Creature Bodies, Wardrobe, and Spectral Veils

Humanoids, creatures, townsfolk, and interior figures assemble deterministic outfits, dye palettes, and creature rigs from seeded appearance records (`src/characters/foeBodies.js`, `src/characters/wardrobe.js`, and `src/characters/creatureBodies.js`).

- **Humanoid enemies and wire sync (`foeBodies.js`, `wire.js`):** `foeActor` and `rosterLook` roll human enemy looks using Iliac Bay race weights (`Breton 30`, `Redguard 25`, `Nord 10`, `WoodElf 9`, `DarkElf 8`, `HighElf 8`, `Khajiit 5`, and `Argonian 5`). `ORC_MOBILES`, `VAMPIRE_MOBILES`, and `WOLF_MOBILE` enemies also build humanoid rigs, though vampires and werewolves omit drawn blades. At spawn, the authority mints the look seed (`ls`) and worn kit (`lw`) validated by `validFoeRecord` so peer updates never reshuffle an enemy mid-fight. While a corpse loot window is open, `drawBodiesUnderWindow` keeps corpse flats marked `castOnly`.
- **Wardrobe, folk, and decor (`wardrobe.js`, `dyes.js`, `folkBodies.js`, `rosterBodies.js`, `peopleBodies.js`, `decorRoom.js`):** `WARDROBE_ROLES`, `ARMOR_KITS`, `TOWNSFOLK_OUTFITS` (`ownClothingModels.js`), and `WARDROBE_DYES` (over `DYE_COLORS`) dress NPCs by role. `FOLK_DRESS` and `folkLookOf` clothe ambient walkers, `residentLook` and `residentWalkerActor` clothe living-world residents, `personActor` drives static people filtered by `isNpcFlat` (`npcFlatArchives.js`), and `offerDecorFigures` places room figures matched from `FLATS.CFG` via `figureLook` and `FIGURE_ROLE_WORDS`.
- **Creatures and ghosts (`creatureBodies.js`, `mwFirstPerson.js`, `mwCharacter.js`):** `CREATURE_MATCH` pairs monsters with NIF rigs built by `assembleCreature` and `bindCreatureModel`, requiring `CREA_FLAG.Flies` (`0x20`) for flyers. Ghosts use `SPECTRAL_VEIL` (`SPECTRAL_ALPHA/255`), while King Lysandus (archive `473`) retains his classic sprite.
