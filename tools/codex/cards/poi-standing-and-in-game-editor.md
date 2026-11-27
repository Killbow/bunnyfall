---
slug: poi-standing-and-in-game-editor
title: POI World Host, Ground Snap, and In-Game Editor
domain: poi
kind: subcard
parent: poi-editor-and-approvals-overview
files:
  - src/poi/poiHost.js
  - src/poi/poiRuntime.js
  - src/render/meshAlpha.js
  - src/poi/poiEdit.js
  - src/poi/poiGizmo.js
  - src/poi/poiEditorMount.js
  - src/poi/poiEditorHost.js
  - src/ui/poi/poiEditorPanel.js
  - src/ui/poi/poiMapMark.js
  - src/poi/poiImageDecode.js
  - src/poi/poiGizmoLook.js
routes: []
tables: []
replacesBible:
  - "06-Systems/POI-Editor-Arc.md"
related:
  - poi-editor-and-approvals-overview
  - poi-runtime-and-world-builder
  - pixel-streaming-and-origin-shift
invariants:
  - "`createPoiHost` limits per-frame instantiation work to `POI_STAND_BUDGET_MS` (`4` ms) and decodes meshes incrementally through `decodePoiMeshSteps`."
  - "A `'snap'` POI has height `NaN` while the terrain beneath it is unknown, neither rendering nor colliding until terrain resolves, and re-samples terrain every `POI_GROUND_EVERY` (`30`) frames."
  - "A part collider stays disabled while the player feet sit inside its bounding box (`carry`), preventing a newly loaded POI from trapping a character."
  - "The outer view ring is pushed before the axis rings so the axis rings draw over it where they overlap."
  - "`POI_TEXTURE_ARCHIVE` (600000) must stay clear of every archive number the game draws; each archive has one owner, registered in `src/world/eliteGates/pseudoArchives.js`."
traps:
  - "Mirrored parts with a negative determinant flip triangle winding in `src/poi/poiRuntime.js`."
  - "Gizmo handles nearly parallel to the view ray enter `hidden` state (`END_ON` or `EDGE_ON` in `src/poi/poiGizmo.js`) and cannot be picked."
  - "POI pictures are read back through a WebGL2 texture with `premultipliedAlpha: false`, never a 2D canvas, because a 2D canvas premultiplies and returns black or quantized colors for clear texels, which darkens filtered cutout edges."
  - "A gizmo drag measures its rays in the scene frame captured at drag start from the POI's pixel translation, because a floating-origin recenter mid-drag would otherwise mix two frames and throw the POI about 819 m."
  - "`lineMeasure` mutates and returns one shared `MEASURE` object, so a caller must read its fields before calling `lineMeasure` again."
  - "`poiPartModels` bakes the part's own scale into positions and normals, because the mesh shader lights through the model matrix and a stretched matrix tilts normals; a two-sided blended submesh lays its back faces down first."
dfu: []
tags:
  - poi
  - editor
  - gizmo
  - collision
  - streaming
  - undo
---

# POI World Host, Ground Snap, and In-Game Editor

`createPoiHost` (`src/poi/poiHost.js`) streams and instantiates POIs in the world, while `startPoiEditor` (`src/poi/poiEditorMount.js`) mounts the in-game `?editor` mode over the shared `createPoiEdit` state machine (`src/poi/poiEdit.js`).

- **Frame-budgeted world host (`src/poi/poiHost.js`, `src/poi/poiRuntime.js`):** `createPoiHost` caps per-frame setup at `POI_STAND_BUDGET_MS` (`4` ms), stepping through `decodePoiMeshSteps` and retrying failed asset loads after `POI_RETRY_MS` (`60,000` ms). Ground-snapped POIs wait at `NaN` height without rendering or colliding until terrain resolves, re-checking ground height every `POI_GROUND_EVERY` (`30`) frames (`POI_Y_EPS = 1e-4`). Part colliders remain suppressed under `carry` while the player feet overlap their bounds. Rendering binds `MESH_ALPHA_GLSL` (`uMeshAlpha` in `src/render/meshAlpha.js`), derives WebGL sampler parameters via `samplerParams` and `samplerKey`, caches textures in `POI_TEXTURE_ARCHIVE` (`600000`), and caps map markers at `POI_MARKS_MAX` (`256` in `src/ui/poi/poiMapMark.js`).
- **In-game editor mount (`src/poi/poiEditorMount.js`, `src/poi/poiEditorHost.js`):** Loaded only under `?editor`, `startPoiEditor` verifies the session and builder role via `poiMe`. `mountPoiEditor` freezes the player body, suppresses incoming damage through `registerPlayerDamageMod`, and drives the world `cam` directly so floating-origin shifts continue tracking the camera.
- **Undo, inspector, and gizmos (`src/poi/poiEdit.js`, `src/poi/poiGizmo.js`, `src/ui/poi/poiEditorPanel.js`):** `createPoiEdit` retains `POI_UNDO_DEPTH` (`200`) undo steps, converts rotations with `eulerOfQuat` and `quatOfEuler` (`POLE_COS = 1e-5`), and mints part keys via `uniqueKey`. `gizmoSize` maintains constant screen-pixel handle scale, hiding `END_ON` and `EDGE_ON` handles, while `PRESS_HOLD_MS` (`1500` ms) guards destructive panel buttons.
