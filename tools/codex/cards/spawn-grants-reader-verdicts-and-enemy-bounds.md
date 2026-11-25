---
slug: spawn-grants-reader-verdicts-and-enemy-bounds
title: "Reader Verdicts, Grant Strip, and Enemy Health Bounds"
domain: multiplayer
kind: subcard
parent: spawn-grants-overview
files:
  - src/net/grantHost.js
  - src/net/foeBounds.js
  - src/net/grantLaw.js
  - server/src/index.js
  - src/net/wire.js
  - src/characters/exteriorFoes.js
routes:
  - /v1/relaykey
tables: []
replacesBible:
  - "11-Multiplayer/Spawn-Grants.md"
related:
  - spawn-grants-overview
  - spawn-grants-signed-grant-and-dice
  - integrity-progression-seats-and-enemy-forge
invariants:
  - "Peer readers verify each grant signature against the Ed25519 public key from `GET /v1/relaykey`, then evaluate `grantRefusal` (sender, cell coverage via `coversCell`, expiry, and member index) and `grantMarksAllow`."
  - "Reader refusal codes come from `GRANT_READER_REFUSALS`; enforcement despawn reasons in `GRANT_STANDDOWN_REASONS` combine case-eligible refusal reasons with `ungranted` and apply only in `enforce` mode."
  - "An enemy whose grant has not yet arrived waits `GRANT_VERDICT_WAIT_MS` (`6` seconds) before being tallied as `ungranted`, never as `unsigned`."
  - "`foeHealthBound` and `foeStatsRefusal` in `src/net/foeBounds.js` compute the legal maximum health from `FOE_BOUND` and reject over-bound enemy records rather than rescaling them."
  - "On the relay, `_grantStripped` drops ungranted and over-bound enemy records when `grantStrip` is enabled, while `_foesBounded` still drops over-bound health records when `grantStrip` is disabled."
traps:
  - "If fetching `/v1/relaykey` fails, `src/net/grantHost.js` suspends grant verdicts and retries after `GRANT_KEY_RETRY_MS` (`5` minutes)."
  - "Encounter-class enemies cannot exceed the owner's signed level by more than `GRANT_LEVEL_SLACK` (`2`)."
  - "Wire parsing in `src/net/wire.js` still enforces hard ceilings `FOE_HEALTH_MAX` (`100000`) and `FOE_LEVEL_MAX` (`100`)."
dfu: []
tags:
  - spawn-grants
  - reader
  - enemy-bounds
  - strip
---

Peer clients and the cell relay validate streamed enemy records by combining grant verification (`src/net/grantHost.js` and `src/net/grantLaw.js`) with statutory health and level ceilings (`src/net/foeBounds.js` and `src/net/wire.js`).

## Reader Key Fetch and Grant Verdicts

Readers fetch the relay's Ed25519 public key from `GET /v1/relaykey`; on failure, verification pauses for `GRANT_KEY_RETRY_MS` (`5` minutes). For each announced grant, the reader checks `verifyGrant`, `grantRefusal` (matching sender peer `o`, cell neighborhood via `coversCell`, expiry window with `GRANT_SKEW_MS`, and member slot `n < m`), and `grantMarksAllow` (including promotion eligibility and `GRANT_LEVEL_SLACK = 2` above the owner's signed level `l` for encounter kinds). If an enemy streams before its grant arrives, the reader waits `GRANT_VERDICT_WAIT_MS` (`6` seconds) before recording `ungranted` in `GRANT_READER_REFUSALS`. While enforcing, any verdict in `GRANT_STANDDOWN_REASONS` blocks or removes the peer puppet in `src/characters/exteriorFoes.js`.

## Statutory Health Bounds and Relay Stripping

Because the owner chooses enemy equipment and health rolls, `foeHealthBound` and `foeStatsRefusal` (`src/net/foeBounds.js`) derive the exact legal health ceiling from `FOE_BOUND` (above the coarse wire caps `FOE_HEALTH_MAX = 100000` and `FOE_LEVEL_MAX = 100` in `src/net/wire.js`). In `server/src/index.js`, `_grantStripped` removes ungranted or over-bound records when `grantStrip` is on, and `_foesBounded` drops over-bound health frames even when `grantStrip` is off.
