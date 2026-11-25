---
slug: "spellbook-abilities-page"
title: "Spellbook Abilities Page: Journal Rail, Details, and Hotbar Slots"
domain: "ui"
kind: "subcard"
parent: "combat-abilities-overview"
files:
  - "src/ui/abilityCodex.js"
  - "src/ui/abilityIcon.js"
  - "src/ui/enhancedSpellbook.js"
  - "src/ui/enhancedHotbar.js"
  - "src/ui/enhancedStyle.js"
  - "src/characters/testRoom.js"
routes: []
tables: []
related:
  - "combat-abilities-overview"
  - "slots-hotbar-status-overview"
invariants:
  - "The page is a px-journal: a px-qrail of every ability folded by group and a px-qdetail for the chosen one, the same shape as the Spells page, so the grimoire dress draws both as book pages."
  - "One click on a hotbar tile assigns the shown entry. A weapon ability binds Follow active weapon (hotbarEntryForWeaponRank) by default, or the specific ability."
  - "A learned rail row carries _hotbarEntry, so it drags onto the hotbar ({ kind: 'entry' }) or takes a slot key while pointed at (hotbarDropEntry)."
traps:
  - "The grimoire dress strips .act buttons to bare text with important-flagged rules; the page's pressable boxes use :root .sb-shell selectors to keep their frames."
  - "The book's page tabs are a .px-tabs nav with an .on class, so the dress draws its tab plates."
tags:
  - "spellbook"
  - "abilities"
  - "hotbar"
  - "ui"
---

# Spellbook Abilities Page: Journal Rail, Details, and Hotbar Slots

`buildAbilityCodex` in `src/ui/abilityCodex.js` draws the Abilities page of the spellbook (`enhancedSpellbook.js`).

- **Rail:** the learned count, a Learned filter, and search sit above a scrolling list folded by skill, combinations, racial abilities, and utilities. Rows show the icon (`abilityIcon.js`), name, and rank; locked rows are dimmed. Folds, the pick, and the filter survive repaints in a module `memory`.
- **Details:** the icon and name, then chips from `abilityStatChips` (cost, recovery, hits, shield, movement, and damage per hit against a plain swing from `damage.js`), the description, and the binding.
- **Hotbar:** a grid of tiles, five per row for a ten-slot bar, each showing what its slot holds.

The Combat Preview test character (`testRoom.js`) also gets Fireball, Healing Bolt, Resurrection, and eight random spells, so both pages can be tried.
