---
slug: "standing-reputation-overhaul-overview"
title: "Standing Overhaul: Criminal Threshold, Watch Sight Stops, and Sentence Refunds"
domain: "justice"
kind: "overview"
parent: null
files:
  - "src/justice/standing.js"
  - "src/justice/standingHost.js"
  - "src/justice/legalBands.js"
  - "src/justice/standingOwed.js"
  - "src/justice/court.js"
  - "src/justice/arrestFlow.js"
  - "src/characters/cityGuards.js"
  - "src/world/worldTick.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Standing-Arc.md"
related:
  - "standing-banishment-pardon-and-drift"
  - "stolen-goods-mark-fencing-and-confiscation"
  - "guild-probation-reviews-and-online-repute-overview"
  - "guild-repute-gate-and-standing-pace"
  - "world-arc-towns-talk-and-crime"
  - "theft-law-indoor-watch-and-door-tokens-overview"
invariants:
  - "Regional legal standing below `KNOWN_CRIMINAL_BELOW` (`-10` in `src/justice/standing.js`) marks the player as a known criminal; active legal changes emit HUD notices via `installLegalNotices`, whereas passive drift emits none."
  - "Line-of-sight Town Watch stops (`src/justice/standingHost.js` and `src/characters/cityGuards.js`) replace random Criminal Conspiracy summons, requiring a guard within `GUARD_NPC_SPAWN_RANGE` (`77.5`) facing within `GUARD_SEEN_ANGLE` (`95` degrees), gated by `CHALLENGE_COOLDOWN_MINUTES` (`120`) and post-sentence `CHALLENGE_GRACE_MINUTES` (`1440`)."
  - "Surrender in `src/justice/court.js` is refused only when `watchSlain` is set, and serving a sentence refunds the legal standing penalty (retaining half the loss on grave crimes)."
traps:
  - "`src/justice/arrestFlow.js` must clear `watchSlain` alongside active crime state so future surrenders are not permanently blocked."
  - "Always import threshold constants (`KNOWN_CRIMINAL_BELOW`, `CHALLENGE_COOLDOWN_MINUTES`, `CHALLENGE_GRACE_MINUTES`, `CONTRACT_LEGAL_GAIN = 2`) from `src/justice/standing.js`."
dfu:
  - "Assets/Scripts/Game/Entities/PlayerEntity.cs"
tags:
  - "reputation"
  - "law"
  - "standing"
  - "watch"
  - "court"
---

# Standing Overhaul: Criminal Threshold, Watch Sight Stops, and Sentence Refunds

Regional legal reputation, Town Watch sight challenges, surrender gating, and sentence refunds span `src/justice/standing.js`, `src/justice/standingHost.js`, `src/justice/legalBands.js`, `src/justice/standingOwed.js`, `src/justice/court.js`, `src/justice/arrestFlow.js`, `src/characters/cityGuards.js`, and `src/world/worldTick.js`.

- **Criminal threshold, bands, and bounty contracts (`src/justice/standing.js`, `src/justice/legalBands.js`, `src/justice/standingOwed.js`):** Regional legal standing below `KNOWN_CRIMINAL_BELOW` (`-10`) marks the character as a known criminal. Active legal standing changes emit HUD notices through `installLegalNotices`, while passive time drift in `src/world/worldTick.js` remains silent. Completing bounty contracts grants `+2` regional legal standing (`CONTRACT_LEGAL_GAIN = 2`).
- **Line-of-sight Town Watch stops (`src/justice/standingHost.js`, `src/characters/cityGuards.js`):** Instead of random Criminal Conspiracy summons, known criminals face line-of-sight stops when a guard stands within `GUARD_NPC_SPAWN_RANGE` (`77.5`) and faces the character within `GUARD_SEEN_ANGLE` (`95` degrees). Stops respect `CHALLENGE_COOLDOWN_MINUTES` (`120`) between challenges and `CHALLENGE_GRACE_MINUTES` (`1440`) after a served sentence.
- **Surrender gating and sentence refunds (`src/justice/court.js`, `src/justice/arrestFlow.js`):** Guard surrender is refused only when `watchSlain` is set, and `src/justice/arrestFlow.js` clears `watchSlain` alongside active crime state so future surrenders remain possible. Serving a sentence in `src/justice/court.js` refunds the crime legal standing penalty, retaining half of the loss on grave crimes.
