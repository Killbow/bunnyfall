---
slug: characters-paperdoll-and-bodies
title: Characters, Paperdoll, and 3D Bodies
domain: characters
kind: overview
files:
  - src/ui/paperDoll.js
  - src/ui/paperDollBack.js
  - src/characters/customSkins.js
  - src/characters/npcBodies.js
  - src/characters/foeBodies.js
  - src/ui/chargen.js
invariants:
  - "src/ui/paperDoll.js composites 110x184 indexed layers CPU-side in PaperDollRenderer order while preserving reverse layer hit-testing for GetEquipIndex."
  - "paperdollItemImage selects male or female artifact texture archives from the gender of the current wearer rather than the original minter."
  - "src/characters/npcBodies.js and src/characters/foeBodies.js enforce shared distance and per-frame skinning budgets before falling back to billboards."
traps:
  - "ChargenFlow sets this.isCustom = true upon opening the custom class builder and leaves it set on cancel, routing later standard class selections through custom starting gear and spells."
  - "Synthesizing rear sprites without per-pixel layer ownership from src/ui/paperDollBack.js misdraws rear equipment on peer bodies."
dfu:
  - Assets/Scripts/Game/UserInterface/PaperDoll.cs
  - Assets/Scripts/Game/Utility/PaperDollRenderer.cs
  - Assets/Scripts/Game/UserInterfaceWindows/CreateCharClassSelect.cs
tags:
  - paperdoll
  - characters
  - nif-rigs
  - chargen
  - artifacts
---

# Characters, Paperdoll, and 3D Bodies

Character visuals combine classic indexed-bitmap paperdolls, custom online skins, and budgeted 3D NIF rigs.

- **Layered and custom paperdolls:** `src/ui/paperDoll.js` composites `110x184` indexed layers CPU-side in `PaperDollRenderer` order: cloak linings, nude body, nudity censor welds, head, and `paperdollOrder` equipment, retaining reverse layer hit-testing for `GetEquipIndex`. `dollBackPixels` (`src/ui/paperDollBack.js`) synthesizes rear sprites from per-pixel layer ownership, and `skinArtOf` (`src/characters/customSkins.js`) loads approved front/back RGBA custom skins.
- **Wearer-gender artifact lookup:** `paperdollItemImage` (`src/ui/paperDoll.js`) selects `ARTIFACT_FEMALE_TEXTURE_ARCHIVE` or `ARTIFACT_MALE_TEXTURE_ARCHIVE` from the gender of the current wearer rather than the original minter so traded armor and weapon artifacts display the right silhouette.
- **3D NIF rigs:** `src/characters/npcBodies.js` (`NPC_BODY_TIERS`, `NPC_FRAME_TIERS`, `createFrameBudget`) and `src/characters/foeBodies.js` (`foeSeed`) assemble GPU-skinned 3D NIF rigs within shared distance and per-frame skinning budgets, falling back to classic billboards outside the cut.
- **Sticky `isCustom` wizard flag:** `ChargenFlow` (`src/ui/chargen.js`) matches `CreateCharClassSelect.cs` by setting `this.isCustom = true` when opening the custom class builder and never clearing it on cancel, routing a subsequently chosen standard class through custom starting gear and spell sets.
