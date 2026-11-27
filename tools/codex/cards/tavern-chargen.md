---
slug: tavern-chargen
title: "Tavern Character Creation: Nyx's Hall Over the Enhanced Wizard"
domain: ui
kind: subcard
parent: ui-arc-overview
files:
  - src/ui/tavernChargen.js
  - src/ui/enhancedChargen.js
  - src/characters/chargenSession.js
routes: []
tables: []
replacesBible: []
related:
  - classic-chargen-order-and-class-data
  - tavern-front-door
invariants:
  - "A VIEW over ChargenFlow: enhancedChargen.js paintTavern draws it when TAVERN_WIZARD is true; every choice goes through flow.applyHit / flow.input, so ui/chargen.js keeps the wizard's order and laws."
  - "The face is picked with the sex (appearanceStage) and the name in the ledger; skipHidden answers the flow's name and face screens for the player (a suggested name, the early face) and walks back through them when the player goes back."
  - "The ledger writes the name as flow.sumName and sets flow.tavernAnswers {firstName, lastName, levelingSystem?, legacyModel?}; the overlay's finish merges it into the result, finishChargen calls setNames, and withLevelingChoice skips an ask the result already answers."
  - "creationAsks() in chargenSession.js is the one gate for the leveling and legacy questions, read by the ledger and the after-wizard screens."
  - "The camera is data-cam on the persistent .tc-hall (right, close, desk, page, left, ledger); only the layer over it is rebuilt each paint."
traps:
  - "Reused stages stand in a .wizard.tc-wiz box so each look's wizard dress reaches them; .tc-root sets ink colour, so .tc-wiz resets colour to var(--bone)."
  - "Class names on the tavern's own pieces must not collide with stage class names (the desk's red book is tc-book, not tc-ledger)."
dfu: []
tags:
  - chargen
  - tavern
  - nyx
---

# Tavern Character Creation

The enhanced character wizard drawn in Nyx's hall (the tavern painting, moved by a CSS camera; the 3D hall comes later).

- **Own stages:** homeland (the patrons, one face per people), the look (sex, face, or your own paperdoll via skinsPanel, with an account window to sign in), the three class pages on the desk, the history method, and the ledger.
- **Reused stages:** class list, the ten questions, custom class, biography, attributes, skills, reflexes and the summary (left page of the ledger).
