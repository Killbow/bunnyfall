# Audit map: POI editor, law, runtime and server

Checked against commit `6eb925f142` (newest migration `0193_skin_ban.sql`). Where the spec and the code differ, the code is
right and the difference is listed in section 9. Sections marked "not audited yet" are Stage 1 work that remains.

## 1. Existing editor features

The in-game editor opens at `/play/?editor` (`src/scenes/world.js` `startPoiEditor`, which asks `GET /v1/poi/me` first) and is
refused online (`ONLINE_REFUSED_FLAGS` in `src/systems/online/onlineLane.js`). It is on foot and outdoors only.

| Feature | Files |
|---|---|
| Fly camera, picking, Q/W/E/R tools, world or local space, snapping | `src/scenes/poiEditorHost.js`, `src/poi/poiGizmo.js` |
| Gizmo and box lines | `src/render/poiGizmoPass.js` |
| Undo and redo (200 steps), save, duplicate, delete | `src/poi/poiEdit.js`, `poiEditorHost.js` |
| Place a new POI, library piece or person under the cursor | `poiEditorHost.js` (`placeNew`, `placeAsset`, `placeNpc`) |
| Outliner, inspector, problems list, save, submit, withdraw, retire | `src/ui/poi/poiEditorPanel.js` |
| glTF and GLB import, Daggerfall ARCH3D model import, picture import | `src/poi/gltfImport.js`, `poiImport.js`, `dfModelImport.js`, `pictureImport.js` |
| People (name, lines, look, height) | `src/ui/poi/poiNpcUi.js`, `src/scenes/poiNpcs.js` |
| Library shelf with thumbnails | `src/ui/poi/poiLibraryPanel.js`, `src/poi/poiShelf.js`, `poiThumb.js` |
| Approver queue, diff in words, history, rollback | `src/ui/poi/poiReviewPanel.js`, `poiDiff.js`, `poiText.js` |
| UV editor (select, unwrap on a worker, project, pack) | `src/ui/poi/poiUvPanel.js`, `src/poi/uv/*`, `sparseCholesky.js` |
| Export as GLB, export and import as a zip pack | `src/poi/poiTransfer.js`, `gltfExport.js`, `poiPack.js` |

The spec does not list these files, but the editor uses them: `poiNpcUi.js`, `poiImport.js`, `poiShelf.js`,
`dfModelImport.js`, `pictureImport.js`, `src/scenes/poiNpcs.js` and `src/world/seasonView.js`.

## 2. The document and its validation

`src/poi/poiLaw.js` holds the law. A v1 document has `v, id, name, about, tags, place, parts, lights, npcs, marker`. The law
is one function that pushes `{ path, code, ...numbers }` problems, refuses unknown keys at every level, and imports nothing.
Asset existence and budgets are a second pass, `poiAssetProblems`, with the store's facts passed in.

v2 is added by `poiLawV2.js` (shapes and references), `poiTradeLaw.js` (items against the game's item law) and
`POI_DOC_VERSIONS = [1, 2]`. See `SCHEMA-V2.md`.

Formats: `POIM` v1 meshes (`poiMesh.js`), PNG, JPEG and WebP header checks (`poiImage.js`), pictures decoded in the browser
only (`poiImageDecode.js`).

## 3. Roles, revisions and publishing

`poiRolesOf(player, env)` in `server-account/src/poi.js` reads `APPROVER_HANDLES`, `BUILDER_HANDLES` and the developer
handles. An approver is a builder. Routes are matched in `poiPathOf` (`server-account/src/service.js`), not in `ROUTES`:
`live, me, list, queue, draft, submit, withdraw, retire, review, rollback, shelf, unshelve`, `asset/<sha>`, `doc/<id>` and
`shelf/<id>`. `CLAUDE.md`'s `ROUTES` rule applies to routes outside `/v1/poi/`. Draft bodies are read to
`POI_DRAFT_BODY_MAX`, which now follows the larger version bound.

Not audited yet: the revision tables, the rollback flow and cron pruning in detail.

## 4. Coordinates and terrain

A map pixel is 819.2 m (`TERRAIN_SIZE`, `src/world/terrain/terrainSampler.js`). The map is 1000 by 500 pixels. A pixel's origin
is its south-west corner, `+x` runs east and `+z` north, so a row further down the map has a smaller `z`
(`src/world/streamingWorld.js` `pixelTranslation`). Rotations are unit quaternions `[x, y, z, w]`, edited as Unity Euler
angles turned Z, then X, then Y (`src/poi/poiEdit.js`).

Not audited yet: how terrain height is sampled and whether the sampler runs outside the game.

## 5. Runtime

The game re-checks every live document with `poiDocProblems` (`src/poi/poiFeed.js`) and stands it through
`src/scenes/poiHost.js` within `POI_STAND_BUDGET_MS = 4`. People come from `npcsOf` in `src/poi/poiRuntime.js` and are drawn by
`src/scenes/poiNpcs.js`. A v2 reader would hook in here.

| Capability the spec needs | State in the code |
|---|---|
| People at a spot, saying lines | Exists, billboard only. `yaw` is stored and ignored. |
| People walking a route | None for POI people. Town walkers use grid A* inside a town (`src/systems/livingWorld/townPaths.js`). |
| Paperdoll people | None. `src/characters/paperdoll/` is the player's inventory doll. |
| Dialogue windows, quests, factions | None found in the NPC runtime. A press of Talk says one line as a notice. |
| Placed creatures | World of Daggerfall markers and covens use `spawnFoe` with `placed: true`. No encounter record exists. |
| Server-settled trades | Not for POIs. The pattern exists in `server-account/src/realmTrade.js` and `staffGive.js`. |
| Persistent world variables | None. |

Creatures: monsters 0 to 42 (39 is the horse), classes 128 to 146, Enemy Expansion 256 to 290 and 384 to 398. There is no
"bandit" id. Human foes are classes, for example Rogue 136, Archer 141 and Barbarian 143. There is no per-foe custom name and
no level range: classes take the level they are handed. `src/net/foeBounds.js` bounds foe health. Spawn limits live in
`src/net/grantLaw.js`.

Combat deaths and loot are client-side. The relay signs spawn grants. No server record of an encounter exists.

## 6. Reusable modules

Pure and ready: `poiEdit.js`, `poiGizmo.js`, `sparseCholesky.js`, `uv/uvMesh.js`, `uv/uvEdit.js`, `poiLaw*.js`, `poiMesh.js`,
`poiImage.js`. They load in plain Node.

Not self-contained: `gltfImport.js` and `gltfExport.js` pull the sky system for a three-line colour function. `poiThumb.js`,
`poiPack.js` and `poiTransfer.js` pull the save system and the account client (850 or more files). Extract before a lean
standalone bundle:

- `crc32`, `zipStore`, `bytesToBase64` from `src/systems/save/saveTransfer.js` into a module with no imports.
- `poiSha256` from `poiService.js` into its own module.
- `srgbToLinear` and `linearToSrgb` from `dynamicSkies.js` into a colour module.
- `telegraphLineW` from `src/render/gate/gateTelegraph.js`, used by `poiGizmoPass.js`.

Item and trade law: `itemLaw.js`, `itemTemplates.js` and `enchantmentCatalogue.js` all load in Node, so `poiTradeLaw.js`
imports them from `src/`. `mintGift` lives in `server-account/src/staffGive.js` and is the settlement step, not shared.

## 7. Verification tools that exist

`npm run check` is lint, types and build. There is no test suite and no CI. Existing checks: `tools/plainText.mjs`,
`tools/routesCheck.mjs`, `tools/l10nExtract.mjs` and many `tools/*Probe.mjs` Playwright probes. The `node:test` runner is used
here for the first time: `node --test tools/poiLaw.test.mjs`. `npm run types` has 25 errors that were there before this work.
Worker bundling: `npm --prefix server ci`, then `node server/node_modules/wrangler/bin/wrangler.js deploy --dry-run -c
selfhost/accounts.toml` (and `relay.toml`).

## 8. To retire in Stage 8

`src/scenes/poiEditorHost.js`, `src/ui/poi/poiEditorPanel.js`, `poiLibraryPanel.js`, `poiReviewPanel.js`, `poiUvPanel.js`,
`src/render/poiGizmoPass.js` (after the viewport takes its line renderer), the `?editor` hooks in `src/scenes/world.js` and
`src/systems/online/onlineLane.js`. References to `poiEdit.js`, `poiTransfer.js`, `poiImport.js` and the UV modules remain
until the standalone editor owns them. Keep `poiLaw*.js`, `poiMesh.js`, `poiImage.js`, `poiFeed.js`, `poiRuntime.js`,
`poiHost.js`, `poiNpcs.js` and `poiMapMark.js`.

## 9. Where the spec differs from the code

1. v1 already has `npcs` (key, name, t, yaw, h, look, lines). The spec's v2 `npcs` is a different shape. v2 keeps the v1
   fields and adds optional ones.
2. v1 is `POI_DOC_VERSION = 1` with a strict equality gate. It had to become a list of versions or every live POI would fail.
3. The spec's `npcs[].appearance: paperdoll` has no runtime counterpart. v2 does not offer it.
4. The spec's `factionId` and quest prerequisites have no runtime. v2 leaves them out.
5. There is no level range. v2 takes an optional exact `level` per spawn.
6. `foeBounds.js` bounds foe health. It is not a spawn limit.
7. Item `group` is a name such as `'Weapons'` in the item law and `mintGift`, and a number in a decor item.
8. `mintGift` makes an empty bottle for template 83. A mixed potion cannot be given as a reward today.
9. `poiAssetProblems` never looked at a person's picture. It does now.
10. `poiDiff` never showed people. It does now.
11. The spec's `POI_DRAFT_BODY_MAX` is derived from `POI_LIMITS.docBytes`, so it needed an explicit larger bound.

## Not audited yet

The asset inventory (Deliverable 1.2), the house decoration and paperdoll pipelines in detail, the revision tables and cron,
and terrain height sampling. `buildAssetCatalogue.mjs` and `ASSET-AUDIT.md` are not written.
