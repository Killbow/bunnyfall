---
slug: enemy-expansion-registry-sprites-and-bodies
title: "Enemy Expansion Registry, Careers, Sprites, and Bodies"
domain: characters
kind: subcard
parent: enemy-expansion-overview
files:
  - src/characters/enemyBasics.js
  - src/characters/customEnemies.js
  - src/characters/enemyEntity.js
  - src/mods/enemyExpansion/dexIds.js
  - src/mods/enemyExpansion/dexNames.js
  - src/mods/enemyExpansion/dexSprites.js
  - src/mods/enemyExpansion/dexBodies.js
  - src/render/textureReplacement.js
  - src/world/billboardXml.js
  - src/characters/foeLook.js
  - src/underwater/oceanHolesAbyss.js
  - src/net/professionLaw.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Enemy-Expansion.md"
related:
  - enemy-expansion-overview
  - morrowind-npc-bodies-overview
  - npc-populations-wardrobe-and-creatures
  - market-vendors-and-professions
invariants:
  - "`DEX_ENEMY_IDS` defines `50` custom enemies: custom monsters occupy IDs `256-290` (`35` total) and custom classes occupy IDs `384-398` (`15` total)."
  - "`isClassicEnemyId` matches IDs `0-42` and `128-146`; `isClassEnemyId` tests bit `128` (`DaggerfallEntity.IsClassEnemyId`)."
  - "`enemyCareerIndex` maps class enemy IDs to `id - 128` and keeps custom monster IDs at `id`."
  - "While loaded, the mod rewrites `16` classic monster rows and `2` classic class rows in `ENEMY_BASICS`, preserving the originals and reapplying edits over Meaner Monsters at spawn via `registerMintRowEditor`."
  - "Stand-in sprite archives and their XML billboard scales register unconditionally, and `src/render/textureReplacement.js` frees CPU pixel buffers (`_released`) after GPU upload."
traps:
  - "`processAbyssEnemy` in `src/underwater/oceanHolesAbyss.js` treats only IDs `128-146` as humanoid classes, so custom classes `384-398` follow the monster branch there."
  - "Mounted rider classes listed in `NO_RIDE` (`src/mods/enemyExpansion/dexBodies.js`) always keep their 2D sprites rather than switching to 3D person bodies."
dfu:
  - vendor/daggerfall-enemy-expansion/Scripts/BestiaryMod.cs
  - vendor/daggerfall-enemy-expansion/Scripts/BestiaryTextProvider.cs
tags:
  - enemy-expansion
  - enemy-ids
  - careers
  - sprites
  - morrowind
  - hides
---

# Enemy Expansion Registry, Careers, Sprites, and Bodies

Enemy Expansion registers `50` custom enemy careers, localized names, repainted billboard archives, spectral shaders, Morrowind 3D body mappings, and skinning rules (`src/characters/customEnemies.js`, `src/mods/enemyExpansion/dexSprites.js`, and `src/mods/enemyExpansion/dexBodies.js`).

- **IDs, careers, and classic overrides (`dexIds.js`, `customEnemies.js`, `enemyBasics.js`, `enemyEntity.js`, `dexNames.js`):** `DEX_ENEMY_IDS` spans custom monsters `256-290` and custom classes `384-398`. `isClassicEnemyId` recognizes `0-42` and `128-146`, `isClassEnemyId` checks the `128` bit, and `enemyCareerIndex` shifts class IDs by `id - 128` while keeping custom monster IDs unchanged. `registerCustomCareerTemplate`, `getCustomCareerTemplate`, and `registerEnemyRows` populate `ENEMY_BASICS`, while `registerCustomEnemyNameText` (`src/ui/textManager.js`) binds `dexEnemyNameText` localization keys. While loaded, `16` classic monster rows and `2` classic class rows are patched and reapplied at mint through `registerMintRowEditor`.
- **Sprites, bodies, and hides (`dexSprites.js`, `dexBodies.js`, `textureReplacement.js`, `billboardXml.js`, `foeLook.js`, `professionLaw.js`):** Repainted sprite textures (`774` files under `public/art/daggerfall-enemy-expansion-repainted`) and XML scales register unconditionally and release CPU buffers (`_released`) after GPU upload. `registerFoeGhost` applies the ghost shader to rows flagged `Transparent`. `DEX_CREATURE_MATCH` pairs custom monsters with Morrowind rigs (treating Lizard Men as Argonian people), while `NO_RIDE` keeps mounted riders as sprites. In `src/net/professionLaw.js`, `hideOfFoe` maps the custom Bat, Mountain Lion, and Blood Spider to their family hides.
