---
slug: starfall-encounter-ledger-and-waves
title: "Starfall Encounter Ledger, Waves, Light, and Master"
domain: multiplayer
kind: subcard
parent: starfall-overview
files:
  - src/net/starfall/starfallLaw.js
  - src/systems/starfall/starfallHost.js
  - src/net/foeBounds.js
  - src/characters/eliteFoes.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Starfall.md"
related:
  - starfall-overview
  - starfall-relay-cells-and-version-floors
  - starfall-sites-crater-and-client-host
invariants:
  - "`STAR_PHASES` progresses through `fallen`, `gather`, `wave`, `breath`, `master`, `held`, and `lost`; the first `near` word transitions `fallen` to `gather`."
  - "The encounter clock (`ec`) advances only while at least one defender has reported near the star within `STAR_PRESENT_MS` (15 s), pausing when the site is deserted."
  - "Phase durations are `STAR_GATHER_MS` (10 s), wave limit `STAR_WAVE_MAX_MS` (100 s), and breath `STAR_BREATH_MS` (5 s, restoring `STAR_BREATH_LIGHT` 15 up to `STAR_LIGHT` 100), with a final breath after wave `STAR_WAVES` (4) before `master`."
  - "A wave cannot clear early before `starClearFloorMs(wz, nd)` (`ceil(wz / nd) * STAR_KILL_MIN_MS`, where `STAR_KILL_MIN_MS` is 2.5 s)."
  - "A star reaches `held` only when the master falls at least `STAR_MASTER_MIN_MS` (45 s) into `master`; it turns `lost` at 0 light (`STAR_LOST_DARK`) or at deadline plus `STAR_GRACE_MS` (2 s, `STAR_LOST_DAWN`)."
traps:
  - "Only words from the current encounter owner advance kill counts, wave clears, star light drains, and master defeat, and kills apply only to the wave index (`kw`) named in the word."
  - "Defender hit credit is rate-limited by a token bucket (`STAR_BLOWS_HZ` 9/s, `STAR_BLOWS_BURST` 6) rather than rejected, and cumulative blow counts (`hb`) never reset during the life of the star."
dfu: []
tags:
  - starfall
  - state-machine
  - waves
  - boss
  - ledger
---

# Starfall Encounter Ledger, Waves, Light, and Master

`stepStar` in `src/net/starfall/starfallLaw.js` drives the deterministic state machine across `STAR_PHASES` (`fallen`, `gather`, `wave`, `breath`, `master`, `held`, and `lost`). When the first defender reports within range, the star enters `gather` for `STAR_GATHER_MS` (`10` s). Its encounter clock (`ec`) ticks only while a defender has been present within `STAR_PRESENT_MS` (`15` s); leaving the crater pauses the clock without resetting progress, though the absolute wall-clock deadline plus `STAR_GRACE_MS` (`2` s) still ends the star as `STAR_LOST_DAWN`.

## Waves, Circle Mitigation, and Owner Authority

- **Wave sizing and pacing (`src/net/starfall/starfallLaw.js`, `src/systems/starfall/starfallHost.js`):** Each of the `STAR_WAVES` (`4`) waves spawns `starWaveSize(k, n) = min(24, 4 + 2 * (n - 1) + (k - 1))` enemies and lasts up to `STAR_WAVE_MAX_MS` (`100` s), bounded below by `starClearFloorMs(wz, nd)` at `2.5` seconds (`STAR_KILL_MIN_MS`) per defender share. Each wave ends with a `5`-second breath (`STAR_BREATH_MS`) that restores `15` light (`STAR_BREATH_LIGHT`) up to `STAR_LIGHT` (`100`).
- **Enemy scaling and the master (`src/net/foeBounds.js`, `src/characters/eliteFoes.js`):** Median defender level locks the band against `STAR_BAND_TOPS` (`[8, 15]`) at the start of each wave or master phase. Wave and circle enemies use `STAR_FOE_HEALTH` (`2x` health), while the coven master uses `FOE_BOUND.elite` (`5x` health) and cannot fall before `STAR_MASTER_MIN_MS` (`45` s).
- **Ritual circle:** At `2/3` and `1/3` master health (`STAR_CIRCLE_AT`), the master summons `clamp(1 + ceil(n / 2), 2, 5)` circle enemies (doubled on the Heart-Star). While any circle enemy lives, the master takes only `STAR_CIRCLE_SHARE` (`0.25`) of each blow.
