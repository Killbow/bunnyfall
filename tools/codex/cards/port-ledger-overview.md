---
slug: "port-ledger-overview"
title: "Port Ledger: Departures, Quirks, and Routed Gaps"
domain: "overview"
kind: "overview"
parent: null
files:
  - "src/formats/netRuntime.js"
  - "src/formats/umRandom.js"
  - "src/world/perlin.js"
  - "src/world/roadsCache.js"
  - "src/platform/settings.js"
  - "src/platform/onlineLane.js"
  - "eslint.config.js"
  - "tools/ledgerSweep.mjs"
  - "src/characters/passiveSpecials.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/Port-Ledger.md"
related:
  - "port-ledger-settings-layers-and-tiers"
  - "port-ledger-url-flags-and-browser-tab-guards"
  - "port-doctrine-scope-and-departures"
  - "verification-tooling-mutation-cites-ledger"
  - "world-arc-classic-port-overview"
invariants:
  - "Any line that is not a plain 1:1 port of DFU is recorded as a Ledger entry: an approved departure (A), a verbatim real-data quirk (B), a routed unported feature (C), or a Board item (D). An unrecorded departure is treated as a defect."
  - "Closing a C or D row strikes it and names the slice that closed it; rows are never silently deleted."
  - "New Ledger A rows are appended at the end so existing line citations do not renumber."
  - "Seeded C# randomness (string.GetHashCode, System.Random) is DATA and is ported byte-exact in src/formats/netRuntime.js; UnityEngine.Random is an engine roll that can be injected."
traps:
  - "Do not add a second home for stringHash or NetRandom; shared.js and betterAmbience.js re-export from netRuntime.js."
  - "Bump GENERATOR_VERSION in src/world/roadsCache.js by hand whenever road generator logic changes, or cached roads go stale."
dfu:
  - "Assets/Scripts/Game/DaggerfallBillboard.cs"
  - "Assets/Scripts/Game/Utility/NameGen.cs"
tags:
  - "ledger"
  - "departures"
  - "quirks"
  - "parity"
  - "prng"
---

# Port Ledger: Departures, Quirks, and Routed Gaps

The Port Ledger tracks every difference from Daggerfall Unity across four classifications: approved departures (Section A), verbatim real-data quirks (Section B), routed unported features (Section C), and Board items (Section D). Any unrecorded departure counts as a defect. New Section A entries append at the tail so existing citations stay stable, while closing a Section C or D entry strikes the row and records the closing slice without deleting the entry.

## Deterministic Randomness and Cache Keys

- **Byte-exact C# PRNGs (`src/formats/netRuntime.js`, `src/formats/umRandom.js`, `src/world/perlin.js`):** Seeded C# randomness is data rather than an injectable `UnityEngine.Random` roll. `stringHash` ports `string.GetHashCode` (`h = (h << 5) - h + c` in 32-bit integer arithmetic), and `NetRandom` ports Knuth subtractive `System.Random` (`MBIG = 2147483647`, `MSEED = 161803398`), re-exported by `shared.js` and `betterAmbience.js`. `UMRandom` lives in `src/formats/umRandom.js`.
- **Parity citations, caches, and audits (`src/world/roadsCache.js`, `src/characters/passiveSpecials.js`, `tools/ledgerSweep.mjs`, `eslint.config.js`):** `GENERATOR_VERSION = 20` keys road caches (`roads:v20:...`) and requires a manual bump whenever road generation changes. Passive character specials cite ledger rows directly, `tools/ledgerSweep.mjs` audits citations, and `eslint.config.js` enforces `no-unused-vars` on `server/src` and `server-account/src`.
