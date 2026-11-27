---
slug: fbx-scene-bakes-blender-fill-and-fragment-markers
title: "FBX Scene Bakes: Blender Fill and Hero Fragment Markers"
domain: world
kind: subcard
parent: elite-breach-spire-overview
files:
  - tools/fbxMesh.mjs
  - tools/shipBake.mjs
  - tools/fragBake.mjs
  - src/world/eliteGates/egBandArt.js
routes: []
tables: []
related:
  - elite-breach-spire-overview
  - elite-breach-hall-generator-and-span-solver
  - wagons-kinds-and-hitching-overview
invariants:
  - "`blenderTessellate` (`tools/fbxMesh.mjs`) ports Blender 5.1's `mesh_tessellate.cc` and `polyfill_2d.cc` in float32, rounding after every operation in Blender's order and walking its kd-tree node for node, so a non-planar face cuts as Blender cuts it."
  - "In a hero fragment FBX, an object is a marker when the first dot-separated word of its name is one of `FRAG_MARKERS` (floor, ramp, ceil, open, socket, node, edge, anchor, hazard, course, alcove, light, and collider), and markers are never drawn. Every other object is art, and each of its polygons must use a material named for an `EG_DRESS` record."
traps:
  - "`assertBlenderFill` (`tools/shipBake.mjs`) refuses an FBX from any Blender other than `BLENDER_FILL` (5.1 or 5.1.x). The ship, gate, and wagon bakes always call it, and the fragment bake calls it for every file not written by `FRAG_REF_WRITER`."
dfu: []
tags:
  - bake
  - fbx
  - blender
  - fragments
  - tooling
---

# FBX Scene Bakes: Blender Fill and Hero Fragment Markers

The scene bakes in `tools/` read FBX exports and cut each face into triangles the way Blender does, so a baked mesh matches what the artist saw. `tools/shipBake.mjs` holds the shared scene helpers and the Blender version check, and `tools/fragBake.mjs` uses them to bake hero fragments into a rule record and a mesh.

Marker objects carry the rules of a fragment (floors, ramps, sockets, lights, colliders, and the rest), while art objects carry only geometry textured with the band's `EG_DRESS` records.
