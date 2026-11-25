---
slug: breach-portents-sundering-split
title: "The Sundering: Blade and Flame Halves"
domain: multiplayer
kind: subcard
parent: breach-portents-overview
files:
  - src/net/gateBrain.js
  - src/net/gateLink.js
  - src/world/gateBoss.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Breach-Portents.md"
related:
  - breach-portents-overview
  - breach-boss-brain-and-courts
  - breach-portents-vanguard-waves
invariants:
  - "On a Sundering night, reaching `PHASE_AT[0]` (`0.66`) triggers `SUNDER_TURN` (a leap to the center followed by `sunder`) rather than the standard court crossing."
  - "When `SUNDER_SPLIT_MIN` (`4`) or more living challengers are present, the Blade leaps to court two and the Flame leaps to court three; with fewer fighters, both halves fight in court two spaced `SUNDER_SIDE_M` (`5` m) apart."
  - "A defeated half kneels for `SUNDER_PAIR_MS` (`20` s); if the second half falls within that window, they rejoin (`rj`) and Valkynaz Ruhn reforms whole at `SUNDER_LAST` (`0.26`) health."
  - "If the timer expires first, the kneeling half rises (`kr`) to match the other half's health fraction, clamped between `SUNDER_RISE_MIN` (`0.05`) and `SUNDER_RISE` (`0.3`)."
traps:
  - "In the split two-court layout, an active half left with no challengers in its court for `SUNDER_LONE_MS` (`10` s) heals `SUNDER_MEND` (`1%`) of its pool per second."
  - "Attack tables divide by `SUNDER_KITS` (Blade uses cleave, slam, charge, leap, and chains; Flame uses hellfire, meteor, nova, and brand), styled by `HALF_NAMES` and `FLAME_LOOKS`."
dfu: []
tags:
  - portents
  - sundering
  - boss
  - split
---

The Sundering portent replaces Valkynaz Ruhn's second phase with a twin-body split tracked via `f.sd` in `src/net/gateBrain.js`, `src/net/gateLink.js`, and `src/world/gateBoss.js`.

## Split Layout, Kits, and Lone Mending

At `PHASE_AT[0]` (`0.66`), `SUNDER_TURN` makes Ruhn leap to the court center and split (`sunder`) into two bodies scaled by `SUNDER_SIZE` (`[0.85, 0.75]`), named via `HALF_NAMES`, and tinted on the Flame side by `FLAME_LOOKS`. `SUNDER_KITS` assigns physical attacks (`cleave`, `slam`, `charge`, `leap`, and `chains`) to the Blade and fire telegraphs (`hellfire`, `meteor`, `nova`, and `brand`) to the Flame.

With `SUNDER_SPLIT_MIN` (`4`) or more living challengers, the Blade bounds to court two and the Flame bounds to court three; with fewer fighters, both fight in court two spaced `SUNDER_SIDE_M` (`5` meters) apart. In the two-court split layout, an active half left without challengers for `SUNDER_LONE_MS` (`10` seconds) regenerates `SUNDER_MEND` (`1%`) of its health pool per second.

## Kneel Window, Rise, and Rejoin

The relay syncs half health via `sdh` sub-words. Depleting one half puts it in a kneel state (`kn`) for `SUNDER_PAIR_MS` (`20` seconds). If the other half survives that window, the kneeling half rises (`kr`) to match the survivor's health fraction, clamped between `SUNDER_RISE_MIN` (`0.05`) and `SUNDER_RISE` (`0.3`). Defeating both halves within `SUNDER_PAIR_MS` triggers a rejoin (`rj`), reforming Ruhn whole at `SUNDER_LAST` (`0.26`) health.
