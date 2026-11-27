---
slug: "climates-calories-needs-clock-and-boons"
title: "Hunger, Thirst, Sleep, Catch-up, Loans, and Boons"
domain: "systems"
kind: "subcard"
parent: "climates-calories-survival-overview"
files:
  - "src/systems/survival/needs.js"
  - "src/systems/survival/status.js"
  - "src/characters/statMods.js"
  - "src/player/rest.js"
  - "src/scenes/dungeonContext.js"
  - "src/ui/hudStatus.js"
routes: []
tables: []
replacesBible:
  - "06-Systems/Climates-Calories.md"
related:
  - "climates-calories-survival-overview"
  - "climates-calories-felt-temperature-and-wetness"
  - "rest-arc-rest-act-channel-and-yield"
  - "slots-hotbar-status-overview"
invariants:
  - "NEED: Peckish 240, Hungry 720, Starving 1440 minutes; Thirsty 50, Parched 80, Dehydrated 100, THIRST_MAX 150."
  - "Thirst at or past NEED.THIRST_HARM (120) wounds in any climate (SURV-THIRST1), every HARM_EVERY_MINUTES (10), leaving HEALTH_FLOOR (5) on replayed minutes."
  - "runSurvivalMinutes caps catch-up at MAX_CATCHUP_MINUTES (two days); jumps over ROAD_MINUTES (60) that are not rests replay under a fair sky."
  - "AUTO_EAT_STAGES is ['hungry', 'starving'] (RATIONS-HUNGRY)."
  - "Casual borrows stamina into s.borrowed; settleLoan runs only when the pool rose since loanPool."
  - "In `runSurvivalMinutes`, replayed minutes and the landing minute of a jump wound only down to `HEALTH_FLOOR` and leave at least one fatigue point (`FATIGUE_MULTIPLIER`), so neither death nor a collapse fires inside a replay; the next minute lived is the first that may."
traps:
  - "Collapse damage goes through hurtPlayer with bypassShield so the death screen fires (AUDIT-DEATH1); never assign health = 0."
  - "Exhaustion in water or near enemies costs EXHAUSTED_SPENT_SHARE (0.1) of max health, not instant death (SWIM-SPENT, SPENT-ASHORE)."
  - "`pauseSurvival` carries the hunger, wake, and meal markers forward over spans walked with survival Off, while drunkenness, wetness, and exposure still decay; `survivalMinute` carries the hunger marker (and a vampire's wake marker) forward for vampires and beasts."
  - "Stage lines repeat no sooner than STAGE_REPEAT_MINUTES (30) and persist via savedNotes."
  - "A tavern meal holds Fed and Quenched for HEARTY_MEAL_MINUTES (6 h) via s.mealUntil (HEARTY-MEAL, post-arc)."
dfu:
  - "Assets/Scripts/Game/Entities/PlayerEntity.cs"
tags:
  - "needs"
  - "hunger"
  - "thirst"
  - "sleep"
  - "boons"
  - "stamina"
---

# Hunger, Thirst, Sleep, Catch-up, Loans, and Boons

`src/systems/survival/needs.js` and `src/systems/survival/status.js` advance hunger, thirst, sleep, and boons each minute across `src/characters/statMods.js`, `src/player/rest.js`, `src/scenes/dungeonContext.js`, and `src/ui/hudStatus.js`.

## Thresholds, Catch-Up, and Loans

`NEED` stages start at `Peckish` `240`, `Hungry` `720`, and `Starving` `1440` minutes (`AUTO_EAT_STAGES = ['hungry', 'starving']`), and `Thirsty` `50`, `Parched` `80`, `Dehydrated` `100`, `THIRST_HARM` `120`, and `THIRST_MAX` `150`. `runSurvivalMinutes` caps catch-up at `MAX_CATCHUP_MINUTES` (two days), replaying non-rest jumps over `ROAD_MINUTES` (`60`) under fair skies. With survival Off, `pauseSurvival` carries the hunger, wake, and meal markers forward; stage notes throttle to `STAGE_REPEAT_MINUTES` (`30`) via `savedNotes`.

Minute `DRAIN` rates (`heatPer20` `6`, `starving` `4`, `parched` `6`, `dehydrated` `12`, `exhausted` `8`) clamp via `clampFatigue`. Casual borrows stamina into `s.borrowed`, calling `settleLoan` only when the pool exceeds `loanPool`.

## Harm and Boons

Thirst at `THIRST_HARM` wounds in any climate every `HARM_EVERY_MINUTES` (`10`, replay floor `HEALTH_FLOOR = 5`). Collapse calls `hurtPlayer` with `bypassShield`; exhaustion in water or near enemies costs `EXHAUSTED_SPENT_SHARE` (`0.1`) of max health. `BOON` adds `+5` `Str`/`End` (`fed`), `Agi`/`Spd` (`quenched`), `Int`/`Wil` (`rested`, banked at `WELL_RESTED_PER_SLEEP_MINUTE = 1.5` to `WELL_RESTED_MAX_MINUTES = 720`), and `Luck` (`thriving`), plus `HEARTH_FATIGUE` (`1`) per waking hearth minute and `HEARTY_MEAL_MINUTES` (`6` h) on `s.mealUntil`.
