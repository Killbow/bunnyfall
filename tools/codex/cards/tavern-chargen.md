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
  - src/scenes/chargenHall.js
  - src/characters/hallBorn.js
  - src/main.js
  - src/world/testPresetWorld.js
routes: []
tables: []
replacesBible: []
related:
  - classic-chargen-order-and-class-data
  - tavern-front-door
invariants:
  - "New Game and a new online character (no legacy birth) run Nyx's 3D hall (scenes/chargenHall.js runChargenHall) in main.js before bootWorld, under the enhanced skin and without ?nohall; the signed result waits in characters/hallBorn.js and the world's chargen arm (testPresetWorld.js) takes it with takeHallBorn instead of mounting the wizard. A hall that fails returns null and the world mounts its wizard as before; Leave reloads to the front door."
  - "The hall is grandestTavern(blocks) after the mods' world data is bound (TVRNAM04.RMB:0 with the shipped data), built by buildInteriorContext with the keeper drawn as Nyx (guildClerkArt). Shots (desk, right, left, page, ledger; close per patron) come from the keeper and the Enter marker in the hall's snapped axis."
  - "Patrons are DOM .tc-in3d figures (composePaperDollPixels, dressed by assignStartingGear) placed each frame by projecting their spots; the wizard calls hall.place after every repaint. Patrons compose one at a time; the chosen look composes at once."
  - "A VIEW over ChargenFlow: enhancedChargen.js paintTavern draws it when TAVERN_WIZARD is true; every choice goes through flow.applyHit / flow.input, so ui/chargen.js keeps the wizard's order and laws."
  - "The face is picked with the sex (appearanceStage) and the name in the ledger; skipHidden answers the flow's name and face screens for the player (a suggested name, the early face) and walks back through them when the player goes back."
  - "The ledger writes the name as flow.sumName and sets flow.tavernAnswers {firstName, lastName, levelingSystem?, legacyModel?}; the overlay's finish merges it into the result, finishChargen calls setNames, and withLevelingChoice skips an ask the result already answers."
  - "creationAsks() in chargenSession.js is the one gate for the leveling and legacy questions, read by the ledger and the after-wizard screens."
  - "The camera is data-cam on the persistent .tc-hall (right, close, desk, page, left, ledger); only the layer over it is rebuilt each paint."
traps:
  - "The paperdoll compose needs getTexture for worn items; without it clothes are skipped silently."
  - "The glide advances on the clock's time, not the capped frame dt, so a slow machine still arrives in 1.1 s."
  - "Reused stages stand in a .wizard.tc-wiz box so each look's wizard dress reaches them; .tc-root sets ink colour, so .tc-wiz resets colour to var(--bone)."
  - "Class names on the tavern's own pieces must not collide with stage class names (the desk's red book is tc-book, not tc-ledger)."
dfu: []
tags:
  - chargen
  - tavern
  - nyx
---

# Tavern Character Creation

The enhanced character wizard drawn in Nyx's hall: the 3D magic-tavern hall before the world boots (scenes/chargenHall.js), or the tavern painting moved by a CSS camera where the wizard runs inside a world.

- **Own stages:** homeland (the patrons, one face per people), the look (sex, face, or your own paperdoll via skinsPanel, with an account window to sign in), the three class pages on the desk, the history method, and the ledger.
- **Reused stages:** class list, the ten questions, custom class, biography, attributes, skills, reflexes and the summary (left page of the ledger).
