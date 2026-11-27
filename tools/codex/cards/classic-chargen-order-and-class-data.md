---
slug: "classic-chargen-order-and-class-data"
title: "Character Creation Order, Class Questions, and Biography Rules"
domain: "characters"
kind: "subcard"
parent: "stock-classes-revised"
files:
  - "src/characters/chargenSession.js"
  - "src/characters/chargen.js"
  - "src/characters/customClass.js"
  - "src/characters/classQuestions.js"
  - "src/characters/biography.js"
  - "src/characters/startingGear.js"
  - "src/characters/passiveSpecials.js"
routes: []
tables: []
replacesBible: []
related:
  - "stock-classes-revised"
  - "stock-class-description-rewrite"
invariants:
  - "`applyCreationExtras` applies biography effects before `assignStartingEquipment`, and after the social group reputations are seeded. Bag order and starting gold arithmetic match classic only in this order."
  - "`attachFactionRep` runs right after the biography effects, which park `rf` reputation deltas on the entity, and before the region bootstrap that walks the faction store. Later placement leaves the bootstrap with no store."
  - "`finishChargen` sets `currentLevelUpSkillSum` and `startingLevelUpSkillSum` after `applyCreationExtras`, so skill lines from biography answers count as starting skills. Anchoring earlier grants a level at the first raise."
  - "The classic chargen overlay guards `onDone` with `_fired`. Without it, every key after the flow reaches done re-runs `applyCharacter` and re-rolls the starting kit."
  - "The enhanced chargen overlay unmounts its DOM view before it reports done. Hosts drop the overlay once it is done, and a DOM node outlives the object that reports it."
  - "`finishChargen` and the hosts' fallback both go through `applyCreationExtras`. A hand-rolled copy in a host fallback has already dropped fields the flow later grew, such as the spellbook, biography, and faction store."
  - "`passiveSpecialsMagicRound` takes two clocks. `nowMinutes` is the round count for the `%` gates, and `clockMinutes` is world time. Every day, night, and sunlight check must read `clockMinutes`."
  - "`assignStartingGear` adds the spellbook before the clothes, because collection order is draw order and classic lists the spellbook first. Later seeders, such as the test room, must run after it."
traps:
  - "Renown and Spire health are added on top of the stored maximum after the `maxHealthLimiter` cap, never inside it. Capping the sum would remove the whole layer whenever a limiter applies."
  - "The gold minus command subtracts and clamps at zero, unlike DFU, which double-negates the signed value and adds. The difference is deliberate, so do not restore parity."
  - "`IMPERIAL_NAMES` is DFU's own literal table for the `%imp` macro, not the `emperorSonNames` list that `%imp` reads elsewhere. Do not merge the two."
  - "The `%q` block of backstory macros is local to this game. A question with fewer than three tokens expands `%q1b` to nothing where DFU prints `[nullMCP]`."
  - "A reputation bar click exactly on the middle line sets the group to 0, as in DFU. DFU leaves its bar stale there, but this port redraws the bar from the value."
  - "The `|| 0` after the negated sum removes JS negative zero. DFU's short has no -0, and -0 can break `deepEqual` comparisons and `Object.is` checks."
  - "`parseQuestionLibrary` splits each line on a digit-and-dot pattern and keeps the second part, so a number followed by a dot anywhere in a line drops everything before it. The quirk is DFU's and is preserved."
dfu: []
tags:
  - "chargen"
  - "biography"
  - "classes"
---

# Character Creation Order, Class Questions, and Biography Rules

Character creation runs through `src/characters/chargenSession.js`. `finishChargen` and the host fallback end in `applyCreationExtras`, which applies the biography, faction reputations, and the starting kit in a fixed order so bag order and starting gold match classic.

- **Class data:** `src/characters/classQuestions.js` reads the classic question library and answer table, and `src/characters/customClass.js` holds the custom-class and reputation window rules.
- **Biography:** `src/characters/biography.js` runs the backstory commands and macros, with a few deliberate differences from DFU.
- **Starting gear:** `src/characters/startingGear.js` ports `AssignStartingGear`.
- **Passive specials:** `src/characters/passiveSpecials.js` runs the special advantage and disadvantage effects each round.
