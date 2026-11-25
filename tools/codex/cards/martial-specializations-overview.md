---
slug: martial-specializations-overview
title: "Martial Specializations: Fifteen Weapon-Pair Paths"
domain: combat
kind: overview
parent: null
files:
  - src/characters/martialPaths.js
  - src/characters/martialPowers.js
  - src/characters/weaponMastery.js
  - src/characters/masterSkills.js
  - src/characters/specReset.js
  - src/characters/skillSwap.js
  - src/characters/arcanePaths.js
  - src/scenes/shared.js
  - src/saves/save.js
  - src/ui/growth/specGuide.js
  - src/ui/charsheet.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Martial-Specialisations.md"
related:
  - martial-weapon-scaling-past-100
  - martial-swing-pace-and-frame-floor
  - martial-passives-signatures-and-riders
  - growth-specialization-guide-and-reset
  - growth-class-skill-swap
  - arcane-specializations-overview
  - weapon-techniques-overview
invariants:
  - "`MARTIAL_SKILLS` holds the six weapon skills (Long Blade, Short Blade, Axe, Blunt Weapon, Archery, Hand-to-Hand). `PATH_ROWS` defines one path per pair, 15 in total."
  - "`martialChoices` requires Master Skills active, no `entity.martialPath` yet, and both skills of the pair mastered. Each character holds at most one martial path."
  - "`martialHeld` returns a path only for the local player entity (`isPlayer`, no `peer`) with Master Skills active and both skills mastered. Mastery is re-read on every call, and the account service runs no judge check."
  - "`martialAwake` is `martialHeld` minus mentoring (`entity._mentor`). `awakeMartialId` also returns null during `sigilDueling()` or while `isInBeastForm` is set."
  - "An arcane path and a martial path can be held together. Both draw on the shared `MASTERY_SLOTS` (3 primary, 2 major, 1 minor)."
  - "The reset costs `SPEC_RESET_GOLD` (200000, defined in arcanePaths.js) per family through specReset.js. Mastered skills are never undone."
traps:
  - "Path ids are save data and never change: `bladedancer` is displayed as Skirmisher and `windrunner` as Strider, so the names do not collide with Firmament nodes."
  - "`nextMartialChoice` returns null once `martialPrompted` is set. The shared.js prompt sets it before asking. With several paths open, it shows `martialOpenRows` and points the player to the skill screen or the Growth tab."
  - "save.js writes `career.martialMirror` ({ path, of: characterId }). On load, the mirror is read back only when the save has no `martialPath` key at all (an older build dropped it), and it also sets `martialPrompted`."
  - "`martialPossible` uses `masterableCount(entity, MARTIAL_SKILLS) >= 2`, which accounts for remaining slots. A class can pay `SKILL_SWAP_GOLD` (100000, in skillSwap.js) to swap a class skill and become eligible."
dfu: []
tags:
  - martial-paths
  - specializations
  - master-skills
  - save-mirror
---

# Martial Specializations: Fifteen Weapon-Pair Paths

`src/characters/martialPaths.js` pairs the six `MARTIAL_SKILLS` (Long Blade, Short Blade, Axe, Blunt Weapon, Archery, and Hand-to-Hand) into 15 martial specialization paths in `PATH_ROWS`. `MARTIAL_NUMBERS` in `src/characters/martialPowers.js` defines all passive and rider values, while `martialWords` resolves localized display names through `t()`.

## Path Pairs and Eligibility

- **Weapon pairs:** `blademaster` (LB+SB), `warblade` (LB+AX), `vanguard` (LB+BL), `ranger` (LB+AR), `bladedancer` (LB+HH, displayed as Skirmisher), `bloodletter` (SB+AX), `cutthroat` (SB+BL), `assassin` (SB+AR), `shadowdancer` (SB+HH), `juggernaut` (AX+BL), `woodsman` (AX+AR), `berserker` (AX+HH), `crusader` (BL+AR), `brawler` (BL+HH), and `windrunner` (AR+HH, displayed as Strider).
- **Claiming and active checks:** `martialChoices` opens a path once Master Skills is active, both pair skills are mastered within the shared `MASTERY_SLOTS` budget (3 primary, 2 major, and 1 minor), and `entity.martialPath` is unset. `martialHeld` verifies the local player (`isPlayer`, no `peer`) and re-reads mastery on every call without an account-service judge. `martialAwake` disables the path while mentoring (`entity._mentor`), and `awakeMartialId` also returns `null` during `sigilDueling()` or while `isInBeastForm` is active.
- **Prompts, swaps, and persistence:** `nextMartialChoice` (`src/scenes/shared.js`) sets `martialPrompted` before prompting and lists `martialOpenRows` when multiple paths are open. Ineligible classes can pay `SKILL_SWAP_GOLD` (`100000` in `src/characters/skillSwap.js`) to reach `masterableCount(entity, MARTIAL_SKILLS) >= 2`. `src/saves/save.js` persists `career.martialMirror` (`{ path, of: characterId }`), restoring `martialPath` only when the key is absent, and `src/characters/specReset.js` resets the family for `SPEC_RESET_GOLD` (`200000`).
