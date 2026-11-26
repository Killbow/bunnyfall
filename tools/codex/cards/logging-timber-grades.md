---
slug: logging-timber-grades
title: "Logging: Timber Grades and Sawing"
domain: economy
kind: subcard
parent: professions-arc-overview
files:
  - src/net/timberLaw.js
  - server-account/src/profHarvest.js
  - server-account/src/profCraft.js
  - src/professions/treeHost.js
tables:
  - prof_log_grades
related:
  - professions-gathering-nodes-and-motherlodes
  - caverns-mines-overview
invariants:
  - "A felling's logs all take its grade (`timberGrade`): every chop clean is prime (+1 plank a log), at least half clean sound, fewer knotty (-1)."
  - "The Stores keep no unit's grade: `prof_log_grades` (migration 0223) counts a character's prime and knotty logs of each wood, read no higher than the own logs held."
traps:
  - "A carried felling (BAG1) keeps no grade: the saw reads the Stores, and a carried log is sound when it gets there."
  - "A saw spends loose and bought logs first (sound), then its own: prime first, knotty last (`sawGrades`); the counts are spent only where the saw's own row was written."
tags:
  - logging
  - timber
  - sawing
---

The Wood-Axe's act (`cutsOf`: clean chops of the finish) grades a felling in `harvestNode`; a prime or knotty one adds its logs to `prof_log_grades` in the harvest's own batch, and the answer says `grade`, which `treeHost` speaks.

The workbench's saw (`smeltAtForge`, `saw:<wood>`) reads the wood's grades and Stores before its batch, adds `sawGrades(...).extra` to the planks it makes (own origin), and takes the spent prime and knotty logs off their counts, guarded by its row.

`tools/timber.test.mjs` runs both on the full schema (every migration over node's SQLite).
