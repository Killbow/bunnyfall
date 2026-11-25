---
slug: sea-serpent-schedule-site-and-herald
title: "Serpent Schedule, Lane Site Selection, Omens, and Discord Herald"
domain: multiplayer
kind: subcard
parent: sea-serpent-world-boss
files:
  - src/net/serpentLaw.js
  - src/worldEvents/serpentSite.js
  - src/worldEvents/serpentOmen.js
  - src/systems/naval/seaLanes.js
  - src/ui/serpentMapMark.js
  - src/worldEvents/eventTimers.js
  - src/net/serpentHerald.js
  - src/net/gateHerald.js
  - src/net/herald/heraldCard.js
  - server/src/index.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Sea-Serpent.md"
related:
  - sea-serpent-world-boss
  - sea-serpent-relay-fight-and-trust-bounds
  - world-events-and-signed-receipts
  - breach-schedule-site-and-omens
invariants:
  - "Game-clock milestones run during the dawn watch: omen at `SERPENT_OMEN_MINUTE` (`02:00`), rise at `SERPENT_RISE_MINUTE` (`05:00`), storm at `SERPENT_SEAL_MINUTE` (`08:00`), and dive at `SERPENT_SOUND_MINUTE` (`10:00`), never overlapping the `17:00` to midnight gate window."
  - "The `rising` phase lasts `SERPENT_SURFACE_MS` (`12000` ms), while death throes and the final dive each last `SERPENT_DIVE_MS` (`15000` ms)."
  - "`serpentAdmits` admits ships from the `05:00` rise until the `10:00` dive; the `08:00` storm marker closes nothing."
  - "Site selection hashes `SERPENT_SALT` with the day via `gateHash` and tests up to `SERPENT_LANE_TRIES` (`24`) packet lanes from `laneNetwork` at `SERPENT_ALONG` (`[0.3, 0.7]`), skipping lanes below `SITE_LANE_MIN_M` (`6` map pixels) and requiring open water across `SITE_CLEAR_PX` and `SITE_SLIDE`."
  - "If all candidate lane rolls fail the open-sea check, no serpent spawns on that day."
traps:
  - "The relay never reads map data; clients compute the site locally and the relay keys fights by `serpentSiteKey`, while honest clients ignore kills from mismatched coordinates via `sameSerpentSite`."
  - "The Discord herald posts via `GATE_DISCORD_WEBHOOK` (mentioning `SERPENT_DISCORD_ROLE` or `GATE_DISCORD_ROLE`), skips silently when unconfigured, abandons non-`429` `4xx` responses, and retries other failures after `HERALD_RETRY_MS` (`30000` ms)."
dfu: []
tags:
  - schedule
  - event-clock
  - site-selection
  - sea-lanes
  - discord
  - herald
---

# Serpent Schedule, Lane Site Selection, Omens, and Discord Herald

Serpent scheduling, deterministic sea-lane placement, map markers, and webhook announcements span `src/net/serpentLaw.js`, `src/worldEvents/serpentSite.js`, and `src/net/serpentHerald.js`.

- **Dawn watch timeline:** On serpent days, `SERPENT_OMEN_MINUTE` begins at `02:00`, `SERPENT_RISE_MINUTE` surfaces the boss at `05:00` for `SERPENT_SURFACE_MS` (`12000` ms), `SERPENT_SEAL_MINUTE` marks `08:00`, and `SERPENT_SOUND_MINUTE` begins the dive at `10:00`. `serpentAdmits` allows entry from rise until dive, while death throes and the final dive each take `SERPENT_DIVE_MS` (`15000` ms). `serpentCountdownWords` (`src/worldEvents/eventTimers.js`) labels timers with `"rises in"` during the omen and `"dives in"` while active.
- **Lane site selection and map ring:** `src/worldEvents/serpentSite.js` hashes `SERPENT_SALT` with the day (`gateHash`) to sample up to `SERPENT_LANE_TRIES` (`24`) packet lanes from `laneNetwork` (`src/systems/naval/seaLanes.js`) between `SERPENT_ALONG` (`[0.3, 0.7]`). It skips lanes shorter than `SITE_LANE_MIN_M` (`6` map pixels) and checks open water using `SITE_CLEAR_PX` and `SITE_SLIDE`, retrying pending lookups every `SITE_RETRY_MS` (`5000` ms). `src/worldEvents/serpentOmen.js` settles weather over `SERPENT_OMEN_SETTLE_MS` (`1500` ms), and `src/ui/serpentMapMark.js` draws a `#3fd6c6` (`SERPENT_RING_MAP_CSS`) ring of radius `SERPENT_RING_PIXELS` (`3` pixels, about `2.5` km) shifted up to `SERPENT_RING_SHIFT_PIXELS` (`1.2` pixels).
- **Kill propagation and Discord herald:** Because the relay lacks map files, it keys fights by `serpentSiteKey` (`server/src/index.js`), and clients verify kill broadcasts with `sameSerpentSite`. The hub relays kills to `/internal/serpent/fell` every `SERPENT_TELL_RETRY_MS` (`5000` ms) and posts cards (`src/net/herald/heraldCard.js`, `src/net/gateHerald.js`) to `GATE_DISCORD_WEBHOOK`, retrying transient errors after `HERALD_RETRY_MS` (`30000` ms).
