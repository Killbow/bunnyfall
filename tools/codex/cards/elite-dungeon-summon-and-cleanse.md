---
slug: elite-dungeon-summon-and-cleanse
title: "Elite Dungeons: Summon, Kill Tally, and Cleanse Claim"
domain: multiplayer
kind: subcard
parent: sifrit-forbidden-one-overview
files:
  - src/systems/eliteDungeons/edFight.js
  - src/systems/eliteDungeons/edFoes.js
  - src/net/eliteDungeonLaw.js
  - server-account/src/eliteDungeons.js
routes:
  - /v1/elite-dungeons
  - /v1/elite-dungeons/summon
  - /v1/elite-dungeons/clear
invariants:
  - "`eliteDungeonClear` refuses with `ed-not-present` unless the account has called `eliteDungeonSummon` for that key, so the client sends a summon request as soon as it sees a living elite Sifrit."
  - "The kill tally counts every dead `edFoe` in the room whoever killed it, excluding `edSummon` and allied entities, against `edKillsNeeded(total)`."
  - "`edLayoutFoes` seeds `wildHallFoes` from the dungeon's `locationId` (or `mapId`), so every client in a room builds the same enemy list."
traps:
  - "The server names one summoner per dungeon and replaces it only after `ED_RESUMMON_S`; any client whose kill tally is met asks again every `ASK_AGAIN_MS` (60 s) while no Sifrit is alive."
  - "A cleanse claim sent before `ED_FIGHT_MIN_S` after the summon returns `ed-too-soon`. The client retries every `CLAIM_RETRY_MS` (15 s) up to `CLAIM_TRIES` (30), and stops on `ed-unknown` or `ed-not-present`."
  - "`edFoeStood` scales health only on the owner's copy (`puppet` false) and scales `damageScale` on every copy."
tags:
  - elite-dungeons
  - sifrit
  - account
---

# Elite Dungeons: Summon, Kill Tally, and Cleanse Claim

An elite dungeon is a daily site whose hall holds an elite Sifrit and a set of stronger enemies. `src/systems/eliteDungeons/edFoes.js` builds the enemy list and scales it, and `src/systems/eliteDungeons/edFight.js` runs the fight on the client.

The account service in `server-account/src/eliteDungeons.js` records who summoned the Sifrit and when, through `/v1/elite-dungeons/summon`. A cleanse is claimed through `/v1/elite-dungeons/clear` once enough enemies are dead, and `edKillsNeeded` in `src/net/eliteDungeonLaw.js` sets that count from the room's total.

The server checks the summon record and the minimum fight time before it pays a cleanse, so the client keeps the summon request and the claim retries within the limits below.
