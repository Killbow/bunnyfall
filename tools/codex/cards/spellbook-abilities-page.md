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
  - "src/ui/grimoireDress.js"
  - "src/characters/testRoom.js"
routes: []
tables: []
related:
  - "combat-abilities-overview"
  - "slots-hotbar-status-overview"
invariants:
  - "The page is a px-journal: a px-qrail of every ability folded by group and a px-qdetail for the chosen one. With the illustrated UI off the Spells page has the same shape; with it on, the Spells page is a three-column sb-catalogue."
  - "One click on a hotbar tile assigns the shown entry. A weapon ability binds Follow active weapon (hotbarEntryForWeaponRank) by default, or the specific ability."
  - "A learned rail row drags onto the hotbar ({ kind: 'entry' }, built at pointerdown) and takes a slot key while pointed at through its _hotbarEntry getter, which reads the current binding. Both land through hotbarDropEntry."
  - "A slot key, a drop onto the bar, and a slot dragged to another slot or off the bar call each picker's changed(), so the detail's tiles repaint."
traps:
  - "The grimoire dress strips .act buttons to bare text with important-flagged rules; the page's pressable boxes use :root .sb-shell selectors to keep their frames."
  - "The book's page tabs are a .px-tabs nav with an .on class. The dress treats the journal, the illustrated Spells page, and the No spells yet page as book pages (BOOK_PAGES, BOOK_TABS in grimoireDress.js), so every tab has the same plates and switching tabs plays no open or close sound."
  - "Only the first build after the book opens or the Abilities tab is chosen scrolls the pick into view; later repaints keep the rail where it was."
tags:
  - "spellbook"
  - "abilities"
  - "hotbar"
  - "ui"
---

# Spellbook Abilities Page: Journal Rail, Details, and Hotbar Slots

`buildAbilityCodex` in `src/ui/abilityCodex.js` draws the Abilities page of the spellbook (`enhancedSpellbook.js`).

- **Rail:** the learned count, a Learned filter, and search sit above a scrolling list folded by skill, combinations, racial abilities, and utilities. Rows show the icon (`abilityIcon.js`), name, and rank (the race for racial rows); locked rows are dimmed. Other races' racial abilities read "Only for" the race and are left out of the counts. Folds, the pick, and the filter survive repaints in a module `memory`; opening the book clears the search and the Learned filter (`resetAbilityCodex`).
- **Details:** the icon and name, then chips from `abilityStatChips` (cost, recovery, hits, shield, movement, and damage per hit against a plain swing from `damage.js`, left out for capstones, whose flat bonus damage it would understate), the description, and the binding.
- **Hotbar:** a grid of tiles, five per row for a ten-slot bar, each showing what its slot holds.

The Combat Preview test character (`testRoom.js`) also gets Fireball, Healing Bolt, Resurrection, and eight random spells, so both pages can be tried.
