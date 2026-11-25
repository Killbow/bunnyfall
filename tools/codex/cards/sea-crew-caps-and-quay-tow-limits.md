---
slug: "sea-crew-caps-and-quay-tow-limits"
title: "Atomic Crew Sign Caps, Quay Tow Timeouts, and Fishing Boat Engagement"
domain: "naval"
kind: "subcard"
parent: "craft-caps-loot-door-and-hunt-bounds-overview"
files:
  - "src/systems/naval/veilParty.js"
  - "server-account/src/crewSigns.js"
  - "src/net/crewSignLaw.js"
  - "src/systems/naval/navalWire.js"
  - "src/systems/naval/navalDirector.js"
  - "src/systems/naval/passageQuay.js"
  - "src/systems/naval/seaClearance.js"
routes:
  - "/v1/crew/release"
tables: []
replacesBible:
  - "01-Overview/audits/Audit-Horizontal.md"
related:
  - "craft-caps-loot-door-and-hunt-bounds-overview"
  - "captains-sea-overview"
  - "naval-traffic-captain-ai-and-online-sea"
  - "naval-living-crew-companions-and-repairs"
invariants:
  - "The daily crew-signing cap (`CREW_SIGN_DAY_MAX = 24` per account) and the recruit hold execute in one atomic SQL statement (`server-account/src/crewSigns.js`)."
  - "Recruit holds are scoped per character while daily signing caps apply per account."
  - "Quay towing (`src/systems/naval/passageQuay.js`) aborts once foul time reaches `TOW_FOUL_S` (`40` s) or total hold reaches `TOW_WAIT_S` (`120` s)."
  - "In `directorShips` (`src/systems/naval/navalDirector.js`), fleeing fishing boats do not flag pirate vessels as engaged."
traps:
  - "Splitting crew-sign counting and insertion into separate queries lets parallel requests exceed `CREW_SIGN_DAY_MAX`; keep the single atomic statement."
dfu: []
tags:
  - "naval"
  - "crew"
  - "quay"
  - "pirates"
---

# Atomic Crew Sign Caps, Quay Tow Timeouts, and Fishing Boat Engagement

Naval crew signing, veil party transitions, quay towing limits, and open-sea traffic engagement rules coordinate across account and naval modules.

## Crew Signing Caps and Veil Party Isolation

In `server-account/src/crewSigns.js` and `src/net/crewSignLaw.js`, the daily crew-signing limit (`CREW_SIGN_DAY_MAX` at `24` per account) and the character recruit hold execute inside one atomic SQL statement. Recruit holds remain scoped per character while daily signing caps apply across the account, so parallel requests cannot bypass `CREW_SIGN_DAY_MAX`. Calling `/v1/crew/release` releases active character crew holds cleanly. During sea transitions, `src/systems/naval/veilParty.js` and `src/systems/naval/navalWire.js` prevent veil handoffs from dragging unboarded party members out to sea.

## Quay Towing Bounds and Director Traffic

- **Quay towing (`src/systems/naval/passageQuay.js`, `src/systems/naval/seaClearance.js`):** Quay tow maneuvers abort once foul time reaches `TOW_FOUL_S` (`40` seconds) or total hold duration reaches `TOW_WAIT_S` (`120` seconds).
- **Fishing boat traffic (`src/systems/naval/navalDirector.js`):** Within `directorShips`, fleeing fishing boats do not flag nearby pirate vessels as engaged, keeping pirate encounter state available for player ships.
