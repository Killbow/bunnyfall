---
slug: "ambient-text-mod-instance-and-rolls"
title: "Ambient Text Mod Instance and Roll Order"
domain: "mods"
kind: "subcard"
parent: "features-arc-registry-overview"
files:
  - "src/mods/ambientText.js"
routes: []
tables: []
replacesBible: []
related:
  - "features-arc-registry-overview"
invariants:
  - "The ambient text mod is one module-level instance that a host claims through `setAmbientTextHost`; a per-host instance would reset `lastIndex` and `lastTickTime` at every door and speak on the first frame of each transition."
traps: []
dfu: []
tags:
  - "ambient-text"
  - "mods"
---

# Ambient Text Mod Instance and Roll Order

The Ambient Text mod in `src/mods/ambientText.js` shows short lines of prose chosen from where and when the player is. A real-time clock sets the interval, and a percentage roll decides whether a line appears.

- **Instance:** one module-level instance serves every host, so its clock and last line survive door transitions.
- **Rolls:** the roll order and the no-repeat rule copy the original mod, so a seeded stream draws the same count.
