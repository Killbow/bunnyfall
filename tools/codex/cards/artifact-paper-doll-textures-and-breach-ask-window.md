---
slug: "artifact-paper-doll-textures-and-breach-ask-window"
title: "Artifact Paper Doll Layer Archives and Elite Breach 30-Second Ask Window"
domain: "ui"
kind: "overview"
parent: null
files:
  - "src/ui/paperDoll.js"
  - "src/items/itemTemplates.js"
  - "src/items/loot.js"
  - "src/net/eliteGates/egRun.js"
  - "src/net/eliteGates/egLaw.js"
  - "src/net/wire.js"
routes: []
tables: []
replacesBible:
  - "01-Overview/bugs/Field-Bugs-2026-10-25.md"
related:
  - "characters-paperdoll-and-bodies"
  - "elite-breach-clock-and-hall-rhythm"
  - "peer-word-letters-and-worn-offers-overview"
invariants:
  - "In `paperdollItemImage` (`src/ui/paperDoll.js`), artifact armor and weapons carrying a finite `playerTextureRecord` render undyed from the wearer gender archive (`ARTIFACT_MALE_TEXTURE_ARCHIVE = 432` or `ARTIFACT_FEMALE_TEXTURE_ARCHIVE = 433` in `src/items/loot.js`), adding `+1` to the record for `Either`-hand weapons equipped in `RightHand`."
  - "In `src/net/eliteGates/egRun.js`, `EG_ASK_MS = 30_000` (`30` s inside `EG_REST_S = 90` s in `egLaw.js`) governs decrees, Dagon Bargains, respite, and Ready votes via `until = now + EG_ASK_MS`."
traps:
  - "Remote peer paper dolls still display base item templates because `LOOK_ITEM_FIELDS` (`src/net/wire.js`) omits `playerTextureRecord`."
  - "When an `EG_ASK_MS` decree timer expires unanswered, the relay auto-selects the first displayed decree option."
dfu:
  - "Assets/Scripts/Game/Items/ItemHelper.cs"
  - "Assets/Scripts/Game/Items/DaggerfallUnityItem.cs"
tags:
  - "paper-doll"
  - "artifacts"
  - "elite-breach"
  - "timers"
---

# Artifact Paper Doll Layer Archives and Elite Breach 30-Second Ask Window

Paper doll rendering resolves artifact layer archives from wearer gender across `src/ui/paperDoll.js`, `src/items/itemTemplates.js`, and `src/items/loot.js`, while Elite Breach inter-floor choices run on a 30-second countdown in `src/net/eliteGates/egRun.js` and `src/net/eliteGates/egLaw.js`.

- **Wearer-gender artifact archives and right-hand offset (`src/ui/paperDoll.js`, `src/items/itemTemplates.js`, `src/items/loot.js`, `src/net/wire.js`):** In `paperdollItemImage`, equipped artifact armor and weapons carrying a finite `playerTextureRecord` bypass base material dye and draw undyed from the gender archive of the current wearer (`ARTIFACT_MALE_TEXTURE_ARCHIVE = 432` or `ARTIFACT_FEMALE_TEXTURE_ARCHIVE = 433`). Weapons with `Either`-hand equip slots add `+1` to `playerTextureRecord` when equipped in `RightHand`, whereas two-handed artifacts such as Chrysamere never trigger the right-hand `+1` offset. Remote peer paper dolls still render base item templates because `LOOK_ITEM_FIELDS` omits `playerTextureRecord`.
- **Elite Breach 30-second ask window (`src/net/eliteGates/egRun.js`, `src/net/eliteGates/egLaw.js`):** During the `EG_REST_S = 90` s inter-floor rest window, `EG_ASK_MS = 30_000` (`30` s) sets `until = now + EG_ASK_MS` for decrees, Dagon Bargains, respite prompts, and Ready votes. If an `EG_ASK_MS` decree timer expires unanswered, the relay auto-selects the first displayed decree option.
