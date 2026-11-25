---
slug: arcane-specializations-overview
title: "Arcane Specializations: Fifteen School-Pair Paths"
domain: magic
kind: overview
parent: null
files:
  - src/characters/arcanePaths.js
  - src/characters/arcanePowers.js
  - src/magic/signatureSpells.js
  - src/magic/spellPower.js
  - src/magic/spellcost.js
  - server-account/src/judge.js
routes: []
tables: []
replacesBible:
  - "06-Systems/Arcane-Specialisations.md"
related:
  - arcane-path-choice-awake-and-judge
  - arcane-path-passives-and-signature-riders
  - arcane-school-potency-past-100
  - growth-specialization-guide-and-reset
  - balance-arc-reflection-leech-and-arcane-caps
  - magic-bundles-and-reflection-quirks
invariants:
  - "`PATHS` in src/characters/arcanePaths.js holds exactly fifteen paths, one per unordered pair of the six magic schools; `pathOfPair(a, b)` returns null for a == b."
  - "src/characters/arcanePaths.js is a law leaf with no actor imports: spellcost.js, judge.js, signatureSpells.js, save.js, and arcanePowers.js all read it, so it must never import sigil.js or anything that acts."
  - "Every passive and rider number lives once in `PATH_NUMBERS`; the player-facing words and arcanePowers.js both read it, so a balance pass changes one value."
  - "A character holds at most one arcane path (`entity.arcanePath`), independently of any martial path (`martialPath`)."
traps:
  - "Arcane path state has no HTTP route, WebSocket frame, or SQLite table; it travels inside the save (`arcanePath`, `pathPrompted`) and is checked by the account judge at checkpoint."
  - "The signature spell's English name is canonical record name (`nameEn`); localized names are shown through loot.js shownSpellName, never minted into the record."
dfu:
  - EntityEffectManager.cs
tags:
  - arcane-paths
  - specializations
  - magic-schools
  - signature-spells
---

# Arcane Specializations: Fifteen School-Pair Paths

`src/characters/arcanePaths.js` defines the fifteen Arcane Specializations, pairing every unordered combination of the six magic schools so a mage who masters two schools can claim one path (`entity.arcanePath`), independently of any `martialPath`.

- **The fifteen school-pair paths:** `PATHS` maps each unordered school pair (`pathOfPair(a, b)`, returning `null` when `a == b`): `battlemage` (Alt+Des), `trickster` (Alt+Ill), `riftwalker` (Alt+Mys), `warden` (Alt+Res), `wardwright` (Alt+Tha), `shadowcaster` (Des+Ill), `spellbreaker` (Des+Mys), `bloodmage` (Des+Res), `elementalist` (Des+Tha), `seer` (Ill+Mys), `lightbringer` (Ill+Res), `enchanter` (Ill+Tha), `necromancer` (Res+Mys), `soulbinder` (Mys+Tha), and `hierophant` (Res+Tha).
- **Acyclic law leaf and single number table:** `src/characters/arcanePaths.js` stays a pure law leaf without actor imports so `src/magic/spellcost.js`, `server-account/src/judge.js`, `src/magic/signatureSpells.js`, `src/saves/save.js`, and `src/characters/arcanePowers.js` can all import it safely. Every passive and signature rider tuning constant lives once in `PATH_NUMBERS`, driving both UI descriptions and live combat math.
- **Passives, signature spells, and potency:** Each path grants one awake passive (`src/characters/arcanePowers.js`) and one exclusive signature spell (`src/magic/signatureSpells.js`) whose canonical record stores the English `nameEn` (localized at display via `shownSpellName` in `src/items/loot.js`). Mastered schools above 100 also scale online spell output in `src/magic/spellPower.js` (`schoolPotency` and `schoolMult`).
- **Save transport and reset:** Path state uses no HTTP routes, WebSocket frames, or SQLite tables; it travels in save payloads (`arcanePath` and `pathPrompted`), validates at checkpoint in `server-account/src/judge.js`, and resets for `SPEC_RESET_GOLD = 200000` in `src/characters/specReset.js`.
