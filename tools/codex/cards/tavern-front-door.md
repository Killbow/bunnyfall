---
slug: tavern-front-door
title: "Tavern Front Door: the Boot Main Menu's Face and Its Paperdoll Section"
domain: ui
kind: subcard
parent: ui-arc-overview
files:
  - src/ui/tavernFrontDoor.js
  - src/ui/tavernPaperdoll.js
  - src/ui/enhancedMenu.js
  - public/art/bunnyfall-tavern/tavern.webp
routes: []
tables: []
replacesBible: []
related:
  - launcher-parchment-face
  - ui-arc-front-door-intro-and-brand
invariants:
  - "ui/tavernFrontDoor.js only DRAWS the boot front door; enhancedMenu.js renderTavernHome owns what each door does (the same go() and homeLevel the old two-question door used), so Continue, New Game, Load Game, Online and Test Room keep their panes' laws."
  - "renderHome hands the boot door to renderTavernHome when twoQuestionDoor() holds (not paused); the pause face is unchanged."
  - "Online is the large gold door; Settings, Overhauls and Tutorials follow; Play Offline, Screenshots and About are the minor row. Play Offline opens the offline doors (Continue, New Game, Load Game, Test Room, Back) on the same panel via homeLevel."
  - "tavernPaperdoll.js shows only when storedSession exists. It reads skinsMine/skinsGet and writes skinsWear: no new route."
  - "Colours are the launcher's and the site's parchment, ink, wax red and gold; art is public/art/bunnyfall-decor plus public/art/bunnyfall-tavern/tavern.webp, read through APP_ROOT."
traps:
  - "Door buttons are .td-door.door-<id> inside .td-menu, not .doorbtn inside .px-menu: focusDoor reads both; probes that select .doorbtn on the boot door must use .td-door."
  - "background: url(var(--x)) is invalid CSS; the wood is set as a whole url(...) custom property."
dfu: []
tags:
  - menu
  - tavern
  - paperdoll
---

# Tavern Front Door

The boot main menu: a pixel-art tavern behind a wood rail carrying the real logo and its line, parchment doors on the right and, for a signed-in player, the custom paperdoll on the left.

- **Marks:** profile, support and the owner's update stand in the rail (their own absolute positions are overridden in `.td-marks`). The language offer and the account window behave as before.
- **Rabbit:** `bunny-cheer.png` stands on the hall's floor between the paperdoll and the doors; hidden under 1000px.
- **Responsive:** under 1000px the doors stack above the paperdoll and the shelf and rabbit hide.
