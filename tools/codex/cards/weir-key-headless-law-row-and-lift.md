---
slug: weir-key-headless-law-row-and-lift
title: "Weir Key Zero-Import Law Row and Migration 0125 Hold Lift"
domain: integrity
kind: subcard
parent: reforge-essence-press-layout-overview
files:
  - src/systems/eliteGates/weirKeyRow.js
  - src/systems/eliteGates/weirKey.js
  - src/items/itemLaw.js
  - server-account/src/judge.js
  - server-account/src/verdict.js
  - server-account/src/service.js
  - server-account/migrations/0125_key_law.sql
  - src/net/eliteGates/egLaw.js
  - src/world/eliteGates/egKeyArt.js
routes: []
tables:
  - realm_findings
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-17.md"
related:
  - reforge-essence-press-layout-overview
  - weir-key-hold-lift-and-ground-gate-overview
  - elite-breach-weir-key-and-stakes
  - integrity-item-law-holds-and-wealth-budget
invariants:
  - "`src/systems/eliteGates/weirKeyRow.js` has zero imports and defines `WEIR_KEY_TEMPLATE = 575` (`WEIR_KEY_LAW_ROW`)."
  - "`LAW_ONLY` in `src/items/itemLaw.js` includes `WEIR_KEY_LAW_ROW` so `lawTemplate` resolves template `575` inside the headless account judge (`server-account/src/judge.js`), while `weirKey.js` overlays UI name and art as `WEIR_KEY_ROW`."
  - "Migration `0125_key_law.sql` writes a staff clear act (`by = 'key-law'`) on `realm_findings` while leaving `law_sig` unchanged."
traps:
  - "Any law-checked custom item row that imports browser UI or Spire art (`egLaw.js`, `egKeyArt.js`) fails to register in the headless account Worker and triggers false `template` findings."
  - "Migration `0125_key_law.sql` skips staff accounts and characters carrying non-key findings or truncated past `FINDINGS_KEPT`."
dfu: []
tags:
  - item-law
  - weir-key
  - account-service
  - migration
---

# Weir Key Zero-Import Law Row and Migration 0125 Hold Lift

Weir Key template registration for the headless account judge and its initial hold remediation span `src/systems/eliteGates/weirKeyRow.js`, `src/systems/eliteGates/weirKey.js`, `src/items/itemLaw.js`, `server-account/src/judge.js`, `server-account/src/verdict.js`, `server-account/src/service.js`, and `server-account/migrations/0125_key_law.sql`.

## Zero-Import Law Row Registration

- **Headless Worker boundary:** Any law-checked custom item row that imports browser UI or Spire art modules such as `src/net/eliteGates/egLaw.js` or `src/world/eliteGates/egKeyArt.js` fails to register inside the headless account Worker and triggers false `template` findings.
- **Split row definitions:** `src/systems/eliteGates/weirKeyRow.js` maintains zero imports and defines `WEIR_KEY_TEMPLATE = 575` (`WEIR_KEY_LAW_ROW`). In `src/items/itemLaw.js`, `LAW_ONLY` includes `WEIR_KEY_LAW_ROW` so `lawTemplate` resolves template `575` inside `server-account/src/judge.js`, while `src/systems/eliteGates/weirKey.js` overlays browser UI naming and art as `WEIR_KEY_ROW`. Callers should read `ITEM_LAW_VERSION` and `ACCOUNT_VERSION` from live source rather than hardcoding historical bump values.

## Migration 0125 Hold Lift (`0125_key_law.sql`)

Migration `0125_key_law.sql` records a staff clear act (`by = 'key-law'`) on `realm_findings` while leaving `law_sig` unchanged, skipping staff accounts and any characters carrying non-key findings or histories truncated past `FINDINGS_KEPT`.
