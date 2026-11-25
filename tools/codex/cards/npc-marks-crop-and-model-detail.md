---
slug: npc-marks-crop-and-model-detail
title: "Overhead NPC Marks, Body Crop, and Model Detail"
domain: rendering
kind: subcard
parent: morrowind-npc-bodies-overview
files:
  - src/render/npcMarkPass.js
  - src/characters/npcMarksHost.js
  - src/render/characterSprite.js
  - src/guilds/guildServiceFlow.js
  - src/scenes/worldModes.js
  - src/mods/features.js
routes: []
tables: []
replacesBible:
  - "04-Characters/Morrowind-NPCs.md"
related:
  - morrowind-npc-bodies-overview
  - quests-macros-and-main-spine
  - mw-gpu-skinning-and-sprite-batch
invariants:
  - "`NPC_MARK_KINDS`: `quest` `0`, `merchant` `1`, `service` `2`; drawn by `NpcMarkRenderer` as a yellow quest exclamation glyph, amber coin, or blue gem."
  - "Marks hover `MARK_OVER_HEAD_M = 0.2` m over the head and bob `MARK_BOB_M = 0.06` m at `MARK_BOB_HZ = 1`, with a per-holder phase; reduced motion removes the bob."
  - "A mark is chosen by `staticNpcRouteIn`/`staticNpcRoute`, the same routing `openStaticNpc` uses for a click."
  - "Close bodies use `cropPicture`/`cropQuad` and `pictureDepth` so the camera near plane crops the mesh instead of distorting the quad."
  - "`mwModelPixel()` is `1` when `mwModelDetail` is `'sharp'`, else `MW_ARM_PIXEL = 3` screen pixels per texel."
traps:
  - "Computing mark kinds apart from `staticNpcRoute` lets the icon disagree with what a click does after a mod toggles a service."
dfu: []
tags:
  - npc-marks
  - ui
  - camera
  - pixel-art
  - settings
---

# Overhead NPC Marks, Body Crop, and Model Detail

Overhead interaction icons, close-range sprite cropping, billboard projection modes, and pixel-density scaling control how 3D bodies integrate into the classic viewport (`src/render/npcMarkPass.js`, `src/characters/npcMarksHost.js`, and `src/render/characterSprite.js`).

- **Overhead interaction marks (`npcMarkPass.js`, `npcMarksHost.js`, `guildServiceFlow.js`):** When `npcMarks` is enabled, `createNpcMarks` and `NpcMarkRenderer` draw floating icons above interactive NPCs for the three `NPC_MARK_KINDS`: a yellow quest exclamation glyph for `quest` (`0`), an amber coin for `merchant` (`1`), and a blue gem for `service` (`2`). Each icon hovers `MARK_OVER_HEAD_M` (`0.2` meters) above the actor's head and bobs `MARK_BOB_M` (`0.06` meters) at `MARK_BOB_HZ` (`1` Hz) using a per-holder phase offset unless reduced motion is active. Icon selection delegates directly to `staticNpcRouteIn` and `staticNpcRoute` so the displayed symbol always matches what `openStaticNpc` opens on click.
- **Close-up near-plane cropping (`characterSprite.js`):** When the camera approaches an actor, `drawBodyPicture` switches to `cropPicture`, `cropQuad`, and `pictureDepth` so the camera near plane clips the 3D mesh naturally rather than squashing or distorting the composite sprite quad.
- **Model detail and billboard look (`characterSprite.js`, `worldModes.js`, `features.js`):** `mwModelPixel()` returns `1` screen pixel per texel when `mwModelDetail` is `'sharp'`, or `MW_ARM_PIXEL` (`3`) on `'pixel'`. Enabling `mwBillboardLook` renders bodies and horses as flat upright pictures without double foreshortening.
