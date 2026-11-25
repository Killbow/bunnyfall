---
slug: spawn-grants-signed-grant-and-dice
title: "Grant Record, Signature, Promotions, and Seeded Dice"
domain: multiplayer
kind: subcard
parent: spawn-grants-overview
files:
  - src/net/grantLaw.js
  - src/net/identityToken.js
  - src/net/cellTree.js
routes: []
tables: []
replacesBible:
  - "11-Multiplayer/Spawn-Grants.md"
related:
  - spawn-grants-overview
  - spawn-grants-reader-verdicts-and-enemy-bounds
  - identity-tokens-and-relay-seam
invariants:
  - "A signed grant record contains fields `g`, `o`, `q`, `a`, `k`, `p`, `m`, `l`, `r`, `n`, `s`, `e`, `c`, `h`, and `x` plus signature `sg`; `validGrant` parses the full record or returns `null`."
  - "`grantBytes` prefixes `GRANT_SIG_V` (`spawn-grant1`) and a newline before serializing; `signGrant` and `verifyGrant` use Ed25519 with `GATE_SIGNING_KEY`, returning an empty signature string when the relay has no signing key."
  - "Promotions (`e` elite modifier bitmask and `c` champion trait index or `-1`) derive deterministically from the seed in `grantMarks`; an enemy is never both elite and champion."
  - "Kinds listed in `GRANT_MARKLESS` (`quest`, `ally`, `rev`, `watch`, and `kept`) never receive elite or champion promotions."
  - "`grantDice` derives one deterministic PRNG stream per entry in `GRANT_DICE` (`species`, `level`, `weapon`, and `health`)."
traps:
  - "Elite rolls require signed owner Renown at or above `GRANT_ELITE_MIN_RENOWN` (`5`) from `src/net/identityToken.js`; guests without a signed token receive `r = 0` and cannot roll elites."
  - "Mirrored constants `GRANT_ELITE_CHANCE` (`0.05`), `GRANT_CHAMPION_PER_MILLE` (`70`), and `GRANT_CHAMPION_TRAITS` (`5`) in `src/net/grantLaw.js` must stay synchronized with their home combat definitions."
dfu: []
tags:
  - spawn-grants
  - signature
  - seed
  - elite
  - champion
---

Each spawn grant in `src/net/grantLaw.js` binds an owner and cell to a signed, deterministic spawn record validated by `validGrant`.

## Record Fields and Ed25519 Signing

A grant carries cell counter `g`, owner peer ID `o`, request ID `q`, account ID `a`, spawn kind `k`, cell key `p` (`src/net/cellTree.js`), member count `m`, signed owner level `l` and renown `r` (extracted from `src/net/identityToken.js`, or `0` for guests), member index `n`, 32-bit seed `s`, elite bitmask `e`, champion trait `c`, original issue timestamp `h`, expiry timestamp `x`, and signature `sg`. Per-cell counter `g` starts at `rand32() >>> 1` in `_grantNext` and wraps at `0x7fffffff`. Grants expire after `GRANT_TTL_MS` (`10` minutes), with `GRANT_SKEW_MS` (`60` seconds) of reader clock tolerance. `grantBytes` prepends `GRANT_SIG_V` (`spawn-grant1\n`) for `signGrant` and `verifyGrant` under `GATE_SIGNING_KEY`.

## Promotions and Seeded Dice

For kinds outside `GRANT_MARKLESS` (`quest`, `ally`, `rev`, `watch`, and `kept`), `grantMarks` rolls promotions from `s` alone: elites require `r >= GRANT_ELITE_MIN_RENOWN` (`5`) and roll at `GRANT_ELITE_CHANCE` (`0.05`), while non-elites roll a champion trait (`0` through `GRANT_CHAMPION_TRAITS - 1`, where `GRANT_CHAMPION_TRAITS = 5`) at `GRANT_CHAMPION_PER_MILLE` (`70`) per thousand or stay at `c = -1`. `grantDice` provides seeded streams for each die in `GRANT_DICE` (`species`, `level`, `weapon`, and `health`).
