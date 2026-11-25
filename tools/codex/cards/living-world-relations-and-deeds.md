---
slug: living-world-relations-and-deeds
title: "Character Relations, Witnessed Deeds, and Talk Regard"
domain: world
kind: subcard
parent: living-world-overview
files:
  - src/systems/livingWorld/relations.js
  - src/systems/livingWorld/regardClock.js
  - src/systems/livingWorld/people.js
  - src/systems/livingWorld/quarry.js
  - src/systems/livingWorld/livingTown.js
  - src/talk/talkTopics.js
  - src/talk/townTalk.js
  - src/justice/arrestFlow.js
  - src/scenes/world.js
  - src/ui/enhancedChronicle.js
  - src/ui/enhancedTalk.js
dfu:
  - Assets/Scripts/Game/TalkManager.cs
replacesBible:
  - "06-Systems/Living-World.md"
related:
  - living-world-overview
  - living-world-census-schedules-and-watch
  - realm-saves-and-mod-save-hooks
  - quests-macros-and-main-spine
invariants:
  - "Personal regard spans `REGARD_MIN` (`-100`) to `REGARD_MAX` (`100`) around `0` (stranger), decaying toward zero by `EASE_PER_DAY` (`0.5`) per elapsed character day without crossing zero."
  - "Each character save stores at most `RELATIONS_MAX` (`600`) resident entries under save vendor key `LIVING_WORLD_VENDOR` (`LivingWorld`), isolated per character."
  - "Deeds register as witnessed only when a resident within `WITNESS_M` (`LINE_RANGE = 24` m) holds an unobstructed line of sight (`o.sees`), spreading to the rest of the town after `DEED_KNOWN_MIN` (`60` min)."
  - "`toneTaste` returns the sign of classic etiquette or streetwise preference for a resident's social class so matching dialogue tone raises both regard and courtship."
traps:
  - "`characterRelations` (`regardClock.js`) measures elapsed days on the character's personal clock; passing the shared online sky clock causes offline time gaps to decay regard erroneously."
  - "`LivingWorld` is a save vendor key (`LIVING_WORLD_VENDOR`), not a SQLite table; the relations system defines no D1 tables or HTTP routes."
tags:
  - relations
  - regard
  - witness
  - crime
  - talk
  - chronicle
---

Every character save tracks personal standing with individual residents, witnessed crimes and rescues, dialogue tone reactions, and chronicle entries.

## The Regard Ledger and Decay Clock

`createRelations` (`src/systems/livingWorld/relations.js`) persists up to `RELATIONS_MAX` (`600`) per-resident records under the character save vendor key `LIVING_WORLD_VENDOR` (`LivingWorld`). A resident's regard ranges from `REGARD_MIN` (`-100`) to `REGARD_MAX` (`100`), starting at `0` for strangers. When the player leaves someone unseen, `characterRelations` (`src/systems/livingWorld/regardClock.js`) decays positive or negative regard toward `0` at `EASE_PER_DAY` (`0.5`) per day on the character's own elapsed clock without crossing zero. `peoplePage` and `regardBadge` (`src/systems/livingWorld/people.js`) format known residents for `enhancedChronicle.js` and `enhancedTalk.js`.

## Witnessed Deeds, Combat Quarry, and Dialogue Tone

In conversation (`src/talk/talkTopics.js`, `src/talk/townTalk.js`), `toneTaste` maps classic Etiquette and Streetwise checks to the resident's social group so preferred polite or blunt approaches raise regard and courtship while disliked tones lower both.

In the streets (`src/scenes/world.js`), `makeQuarry` (`src/systems/livingWorld/quarry.js`) lets an aggressive player strike a civilian. Slaying or robbing a resident counts as witnessed only when an observer within `WITNESS_M` (`LINE_RANGE = 24` m) has clear line of sight (`o.sees`); after `DEED_KNOWN_MIN` (`60` min), word reaches the whole settlement and turns the victim's household and witnesses hostile. If a player in good local standing commits a first minor offense, the town watch issues a verbal caution and clears the alert before escalating to an arrest (`src/justice/arrestFlow.js`).
