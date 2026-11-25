---
slug: enemy-expansion-mudex-and-network-bounds
title: "MUDEX Compatibility and Enemy Expansion Wire Bounds"
domain: multiplayer
kind: subcard
parent: enemy-expansion-overview
files:
  - src/mods/enemyExpansion/dexSwitches.js
  - src/mods/enemyExpansion/mudexTableText.js
  - src/characters/meanerMonsters.js
  - src/combat/pcaaoMeanerMonsters.js
  - src/net/foeBounds.js
  - src/net/wire.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Enemy-Expansion.md"
related:
  - enemy-expansion-overview
  - spawn-grants-reader-verdicts-and-enemy-bounds
  - enemy-expansion-troll-corpse-lifecycle
invariants:
  - "MUDEX activates automatically at game load whenever both Daggerfall Enemy Expansion and Meaner Monsters are enabled (`installEnemyExpansion`), with no warning prompt."
  - "While Enemy Expansion is loaded, standalone Meaner Monsters row edits, XML scale overrides, and PCAAO adjustments yield (`meanerMonstersAlone` and `meanerMonstersOn`)."
  - "MUDEX CSV tables (`src/mods/enemyExpansion/mudexTableText.js`) apply after the base Enemy Expansion tables, modifying existing enemy rows without adding new enemy IDs."
  - "`FOE_TYPE_MAX` and `SPELL_INDEX_MAX` in `src/net/wire.js` are both `0xffff` (`u16`), supporting custom enemy IDs above `255` and custom spell indices `500-503`."
traps:
  - "`FOE_BOUND_ROWS` in `src/net/foeBounds.js` stores the maximum level and health of each classic monster across seven mod profiles; `dexClassicRow` (including `mudex: true`) must never exceed those ceilings."
  - "Custom enemy kinds `256` and above carry no statutory health ceiling in `FOE_BOUND_ROWS` (`UNVERIFIED`) because the relay does not hold custom career tables."
  - "A stale changelog comment in `src/net/wire.js` mentions six profiles, whereas `src/net/foeBounds.js` defines seven."
dfu: []
tags:
  - enemy-expansion
  - mudex
  - meaner-monsters
  - pcaao
  - wire
  - enemy-bounds
  - relay
---

# MUDEX Compatibility and Enemy Expansion Wire Bounds

When Daggerfall Enemy Expansion and Meaner Monsters run together, the MUDEX compatibility patch merges their balance tables while multiplayer wire codecs and statutory enemy bounds widen to cover the combined stat ceilings (`src/mods/enemyExpansion/dexSwitches.js`, `src/net/foeBounds.js`, and `src/net/wire.js`).

- **MUDEX latching and precedence (`dexSwitches.js`, `mudexTableText.js`, `meanerMonsters.js`, `pcaaoMeanerMonsters.js`):** `installEnemyExpansion` latches MUDEX automatically whenever both Enemy Expansion and Meaner Monsters are enabled at load. While Enemy Expansion is active, `meanerMonstersAlone` and `meanerMonstersOn` step aside so standalone Meaner Monsters row edits, XML billboard scales, and PCAAO adjustments do not double-apply. Instead, `MUDEX_TABLE_TEXT` layers over the Enemy Expansion tables to raise classic and custom stats without registering additional enemy IDs.
- **16-bit wire fields and seven-profile bounds (`wire.js`, `foeBounds.js`):** To carry custom enemy IDs `256-398` and custom spell indices `500-503`, `src/net/wire.js` widens `FOE_TYPE_MAX` and `SPELL_INDEX_MAX` from `u8` (`255`) to `0xffff` (`u16`). For classic monsters, `FOE_BOUND_ROWS` in `src/net/foeBounds.js` records the highest legal level and health across seven mod profiles (vanilla, Meaner Monsters, Meaner Monsters with PCAAO, each paired with Enemy Expansion classic overrides, plus the combined MUDEX profile, such as Dragonling health `146` and Werewolf level `9` under base Enemy Expansion, or Flesh Atronach health `300` and Ice Atronach level `21` under MUDEX). A stale changelog comment in `src/net/wire.js` mentions six profiles, whereas `src/net/foeBounds.js` defines seven. Custom IDs `256` and above remain `UNVERIFIED` on the relay.
