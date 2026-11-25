---
slug: weapon-glow-classic-sprite-and-morrowind-rings
title: "Weapon Glow Drawing: Classic Sprite Fields and Morrowind Instanced Rings"
domain: rendering
kind: subcard
parent: weapon-glow-overview
files:
  - src/render/weaponGlowGlsl.js
  - src/render/renderer.js
  - src/combat/weaponRig.js
  - src/combat/fpsWeapon.js
  - src/combat/fpArm.js
  - src/combat/twoHands/twoHands.js
  - src/render/characterSprite.js
routes: []
tables: []
replacesBible:
  - "05-Combat/Weapon-Glow.md"
related:
  - weapon-glow-overview
  - weapon-glow-look-wire-and-peer-bodies
  - two-hands-morrowind-mirror-rig-and-spread
  - two-hands-sprite-lane-mirror-guard-and-running
  - mw-gpu-skinning-and-sprite-batch
invariants:
  - "The glow clock (glowSeconds) wraps at GLOW_CLOCK_PERIOD 240 s, and every noise and pulse rate completes a whole number of cycles in that period, so the wrap never jumps."
  - "Classic hand: while spriteGlow is non-null, heldType swings plainWeaponType instead of the *_Magic sheet. drawScreenQuadGlow draws the outline over the whole frame silhouette, hand included."
  - "Classic distance fields (GLOW_FIELD_FS) are baked per frame and cached LRU up to GLOW_FIELDS_MAX 128. Reach is clamped by GLOW_REACH_MAX, and the search uses GLOW_SPRITE_WINDOW."
  - "Morrowind rings are drawn before the body: GLOW_RINGS [4.75, 3.25, 2, 1] glow units, shifted in GLOW_DIRS 12 directions, at depth GLOW_RING_FAR 0.999 plus ring times GLOW_RING_STEP 1e-4. All rings and embers go in one drawArraysInstanced call (glowRingDraws, at most GLOW_DRAWS_MAX 64)."
  - "Morrowind charge is drawn after the body: additive ONE/ONE blending, LEQUAL depth, nudged toward the eye by GLOW_CHARGE_PULL -1e-5."
  - "Glow draws only through glowShown/offGlowShown: the spec's key must match the worn weapon, the weapon must be in hand, and the player must not be climbing."
traps:
  - "On a D16 sprite target, rings closer than GLOW_DEPTH_STEPS 2 depth steps collapse into each other. GLOW_RING_STEP keeps them apart."
  - "Third-person texels at or past GLOW_DEPTH_FLOOR take the quad's own depth so outer rings do not cut into walls or floors."
  - "glowPad pads the drawRigSpriteBox window (glowLook) so a blade at the box edge does not get a flat-cut outline."
dfu:
  - "Assets/Scripts/Game/WeaponManager.cs"
tags:
  - weapon-glow
  - rendering
  - shader
  - sprite
  - morrowind
  - dual-wield
---

# Weapon Glow Drawing: Classic Sprite Fields and Morrowind Instanced Rings

`src/render/weaponGlowGlsl.js` and `src/render/renderer.js` render weapon glow across classic 2D weapon sprites (`src/combat/fpsWeapon.js`) and Morrowind 3D rigs (`src/combat/fpArm.js`, `src/combat/weaponRig.js`, and `src/combat/twoHands/twoHands.js`).

## Clock, Scaling, and Visibility

- `glowSeconds` wraps at `GLOW_CLOCK_PERIOD` (`240` s), with every noise and pulse rate completing integer cycles inside that period.
- `glowUnit` divides pass rows by `GLOW_UNIT_ROWS` (`200`), clamped to `[0.5, 8]`, scaling with the Weapon Widget.
- `glowShown` and `offGlowShown` verify that the spec key matches the worn item, the weapon is drawn, and the player is not climbing. Sheathed weapons, nocked arrows, classic billboard peers (`src/render/characterSprite.js`), enemy weapons, and paperdolls draw no glow.

## Classic Fields and Morrowind Rings

- With `spriteGlow` active on classic sprites, `heldType` picks `plainWeaponType` instead of the `*_Magic` sheet. `GLOW_FIELD_FS` bakes per-frame distance fields cached LRU up to `GLOW_FIELDS_MAX` (`128`), bounded by `GLOW_REACH_MAX` and `GLOW_SPRITE_WINDOW`. `drawScreenQuadGlow` outlines the full silhouette, `glowPad` pads `drawRigSpriteBox` (`glowLook`), and `GLOW_EMBER_RISE` (`[6, 7.5, 9]`) plus `GLOW_EMBER_SLACK` (`3`) extend fire embers.
- On Morrowind meshes (`mesh.weaponGlow` and `mesh.offWeaponGlow` via `_drawWeaponGlow` and `_drawWeaponGlows`), instanced rings (`GLOW_RINGS` `[4.75, 3.25, 2, 1]` across `GLOW_DIRS` `12` directions at depth `GLOW_RING_FAR` `0.999` + ring * `GLOW_RING_STEP` `1e-4`, spaced by `GLOW_DEPTH_STEPS` `2` and guarded by `GLOW_DEPTH_FLOOR`, up to `GLOW_DRAWS_MAX` `64` in `glowRingDraws`) draw before the body, followed by an additive `ONE`/`ONE` `LEQUAL` charge pass at `GLOW_CHARGE_PULL` (`-1e-5`).
