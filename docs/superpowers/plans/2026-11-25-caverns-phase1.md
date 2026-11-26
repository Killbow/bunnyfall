# Caverns Phase 1 (walkable mine, ore, stability, collapse) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player finds a mine mouth in the wilds, walks into a winding cave made in code and drawn with Daggerfall
cave textures, prospects and mines its veins with the Pick-Axe, shores its sections with planks, and is thrown out when
a shared stability meter hits zero. The mouth then stays sealed for 60 minutes and reopens as a new mine.

**Architecture:** The mine is a made dungeon level, built the way the Sky-Ketch is: a made location with one empty
virtual block (`src/world/ketch/ketchShip.js` is the model), a host module the dungeon arm wires
(`src/systems/ketch/ketchDeckHost.js`), and an `enterMine` beside `enterKetch` in `src/scenes/worldModes.js`. Its relay
room is an ordinary world dungeon room `dungeon:m<mapId>`, so foes work there in later phases. Shared mine state is a pure
brain (`stepMine`) run by a relay part on a new `mn` frame. Cave veins are a new node kind `cvein` that the account
service recomputes from the same layout law.

**Tech Stack:** Plain ES modules with `// @ts-check` JSDoc, WebGL renderer (`renderer.createMesh`), the made-level mesh kit
(`src/world/eliteGates/meshKit.js`), Cloudflare-style relay on wrangler's local runtime, SQLite account service,
`node:test` tests in `tools/*.test.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-25-caverns-mining-design.md`

**Later plans (not in this one):** Phase 2 waves and strays; Phase 3 the drill, hoppers, carts and banking; Phase 4
contracts, Survey Seals, the shop, the title ladder and The Burning Stair; Phase 5 logging's timber grades.

## Global Constraints

- Online only: no mouth stands and no mine opens unless `bunnyGuildsOn()` (`src/guilds/bunnyGuilds.js`) is true.
- Shared laws live in `src/net/mine/`: pure, no DOM, no network, no clock (time is passed in).
- Hosts do not grow: `world.js`, `worldModes.js`, `dungeonContext.js` and the relay `Room` each get at most a few wiring
  lines; run `node tools/worldBudgetCheck.mjs`.
- Every new wire field passes a validator in `src/net/wire.js`; bump `RELAY_VERSION` (`world277` today) to the next.
- English text as `t('mine.<key>', 'English words')`; then `node tools/l10nExtract.mjs`.
- Plain American English, no em-dashes, no exclamation marks, LF line endings (codex cards in `tools/codex/cards/` too).
- Tag every fork change with a `BUNNYFALL (2026-11-25, caverns)` comment.
- Numbers from the spec: 4 to 6 sections, 2 to 4 chambers a section, 1 to 3 holes a chamber, collapse seal 60 minutes,
  weekly reset, wood strength Pine 1, Oak 1.5, Cherry 1.75, Teak 2, Mahogany 2.25, Ironwood 3, Ghostwood 3, warnings
  under 50 (dust), under 30 (creaks and pebbles), under 15 (rumble), weak-wall plank counts double.
- `npm run check` passes before the branch is offered for push.

## Review Focus

1. A player inside the mine when it collapses while a window (inventory, map) is open: the collapse still ends with them
   outside at the mouth, alive, with the window closed. (Task 10 test.)
2. A player who reloads the page or loses the socket inside a sealed or reset mine: on rejoin they are put out at the
   mouth, never stood in the old layout. (Task 9 test: a join to a room whose `reset` differs from the client's.)
3. Two players propping the same wall slot at once: one prop stands, the other's planks are refunded or never spent.
   (Task 8 test: `stepMine` refuses a prop on a slot already propped.)
4. A forged `cvein` key with a future reset count or a slot past the layout's veins: the service refuses it. (Task 4 test.)
5. A mouth on a pixel that also streams a spawned dungeon or a location: the mouth never stands there. (Task 2 test.)

---

## File Structure

| File | Responsibility |
|---|---|
| `src/net/mine/mineSites.js` | Which map pixels hold a mouth, the mine's ids and room key. |
| `src/net/mine/mineLayout.js` | The cave's shape from (mineId, reset): sections, chambers, tunnels, holes, wall slots. |
| `src/net/mine/mineVeins.js` | The veins of a layout, the `cvein` key, and its parse. |
| `src/net/mine/mineBrain.js` | Shared mine state and `stepMine(state, op, nowS)`: stability, props, collapse, reset. |
| `src/net/mine/mineWire.js` | The `mn` frame's shapes, in and out (imported by `wire.js`). |
| `src/world/mine/mineModel.js` | The cave's mesh (mesh kit) and collider triangles from a layout. |
| `src/world/mine/mineLocation.js` | The made location, its empty block (start marker at the mouth), its blocks file. |
| `src/systems/mine/mineHost.js` | Stands the mine into a dungeon context: draws, collider, lights, the frame, the exit. |
| `src/systems/mine/mineClient.js` | The page's mine: the `mn` link, survey, holes, props, warnings, collapse. |
| `src/systems/mine/mineMouths.js` | Stands mouths in streamed pixels, their activation, the sealed word. |
| `server/src/room/mine.js` | The relay part: keeps the brain in room storage, answers `mn` frames, the reset alarm. |
| `server/src/message/frames/mn.js` | The `mn` frame's handler (one line, as `kt.js`). |
| `server-account/src/profHarvest.js` | Accepts `cvein`, with a daily cap. |
| `tools/mine*.test.mjs` | The tests named in each task. |
| `tools/codex/cards/caverns-mines-overview.md` | The subsystem's card (at most 250 words). |

---

### Task 1: Revert the dungeon seam commit

**Files:** Revert `d17866a9c` (touches `src/net/nodeLaw.js`, `src/net/expeditionLaw.js`, `tools/expedition.test.mjs`).

- [ ] **Step 1:** `git revert --no-edit d17866a9c`
- [ ] **Step 2:** `node --test tools/groves.test.mjs` passes and `git grep expeditionLaw` finds nothing.
- [ ] **Step 3:** The revert is its own commit (already made by `git revert`).

### Task 2: Mine sites

**Files:** Create `src/net/mine/mineSites.js`; Test `tools/mineSites.test.mjs`.

**Interfaces:**
- Produces: `MINE_SALT = 7` (a spawned-dungeon salt not used elsewhere; check `git grep "SALT ="` in `src/world`),
  `MINE_CHANCE` (by climate: Mountain 0.04, MountainWoods 0.03, Desert and Desert2 0.03, HauntedWoodlands 0.02, else 0),
  `mineAt({ px, py, climate, occupied }) -> boolean`, `mineMapId(px, py) -> number` (`spawnedMapId(MINE_SALT, px, py)`),
  `mineRoomKey(px, py) -> string` (`dungeon:m<mineMapId>`), `mineIdOf(px, py) -> number` (`py * 1000 + px`).
- Consumes: `hash32`, `spawnedMapId`, `spawnsDungeon`, `WORLD_SALT` from `src/world/spawnedDungeons.js`; `CLIMATES`.

- [ ] **Step 1: Write the failing tests**
  - `mineAt` is false whenever `occupied` is true, and false wherever `spawnsDungeon(WORLD_SALT, px, py)` is true.
  - Over the 500 x 500 pixels with climate Mountain, the share of `mineAt` is within 0.01 of `MINE_CHANCE[Mountain]`
    times the share of pixels free of spawned dungeons.
  - `mineAt` is false for climate Woodlands everywhere.
  - `mineRoomKey(10, 20)` matches `/^dungeon:m[1-9]\d{0,9}$/` and differs from `dungeon:m${spawnedMapId(WORLD_SALT, 10, 20)}`.
- [ ] **Step 2:** `node --test tools/mineSites.test.mjs` fails (module missing).
- [ ] **Step 3:** Implement the exports above. The roll is `hash32(MINE_SALT, px, py, 1) / 4294967296 < MINE_CHANCE[climate]`.
- [ ] **Step 4:** The test passes.
- [ ] **Step 5:** Commit `Caverns: where mine mouths stand in the wilds`.

### Task 3: The layout law

**Files:** Create `src/net/mine/mineLayout.js`; Test `tools/mineLayout.test.mjs`.

**Interfaces:**
- Produces `mineLayout(mineId: number, reset: number) -> MineLayout`, frozen:
  ```
  MineLayout = { mineId, reset, mouth: { at: [x,y,z], facing: number },
    sections: Array<{ i, depth, chambers: Chamber[] }>,
    tunnels: Array<{ from: string, to: string, pts: number[][], r: number }>,   // ids 'mouth', 's<i>c<j>'
    rails: number[][] }                                                         // the main line, mouth to deepest
  Chamber = { id: 's<i>c<j>', c: [x,y,z], rx, rz, h,
    holes: Array<{ k, at: [x,y,z], ore: string, rich: number }>,               // rich 1..3
    walls: Array<{ k, at: [x,y,z], n: [x,0,z], weak: boolean }> }               // 6 to 10 wall slots
  ```
  Constants: `MINE_SECTIONS = [4, 6]`, `MINE_CHAMBERS = [2, 4]`, `MINE_HOLES = [1, 3]`, `MINE_DROP_M = [6, 12]` (each
  section's floor below the last), `MINE_TUNNEL_R = [2.2, 3.2]`, `MINE_CHAMBER_R = [6, 11]`, `MINE_WEAK_SHARE = 0.3`,
  `MINE_ORES_BY_DEPTH` (section 0 to 1: `metal:iron`, `metal:copper`, `metal:tin`; 2 to 3: add `metal:silver`,
  `metal:gold`; 4 and deeper: add `metal:platinum`; a rich mine, one in eight by `hash32(mineId, reset, 9)`, puts one of
  `ore:mithril`, `ore:ebony`, `ore:orichalcum`, `ore:adamantium` in its deepest section's holes).
  Check each ore key exists with `minedMaterial(key)` in `src/net/professionLaw.js`; use the nearest existing keys if a
  name differs.
- Consumes: `hash32` from `src/world/spawnedDungeons.js` (seed every roll with `mineId, reset, k`).

- [ ] **Step 1: Write the failing tests**
  - Same `(mineId, reset)` gives a deep-equal layout; a different `reset` gives a different chamber list.
  - Section count is in `MINE_SECTIONS`, chambers per section in `MINE_CHAMBERS`, holes per chamber in `MINE_HOLES`.
  - Every section's chambers are lower (`c[1]`) than every chamber of the section before, by at least `MINE_DROP_M[0]`.
  - No two chambers' ellipses overlap (centers farther apart than `max(rx, rz)` of both plus 2 m).
  - The tunnel graph connects `mouth` to every chamber (breadth-first search over `tunnels` reaches all ids).
  - No tunnel's slope between consecutive points is steeper than 35 degrees (walkable both ways, spec "slopes").
  - `rails` starts within 3 m of `mouth.at` and ends within the deepest chamber's ellipse.
  - About 30 percent of all wall slots over 200 layouts are weak (within 0.05).
- [ ] **Step 2:** The test fails.
- [ ] **Step 3:** Implement. Lay sections as a meandering descent: each chamber center steps 18 to 30 m from the last on
  a heading that turns at most 70 degrees, sections drop by `MINE_DROP_M`; tunnels are Catmull-Rom points every 2 m with a
  sideways wobble of up to 3 m; a dead-end pocket (a tunnel to a small chamber with no onward link) in half the sections.
- [ ] **Step 4:** The test passes.
- [ ] **Step 5:** Commit `Caverns: the mine layout law`.

### Task 4: Cave veins and the service

**Files:** Create `src/net/mine/mineVeins.js`; Modify `src/net/nodeLaw.js` (`parseNodeKey` and `NODE_KINDS`),
`server-account/src/profHarvest.js` (the kinds table near line 215 and the node branch near line 314); Test
`tools/mineVeins.test.mjs`.

**Interfaces:**
- Produces: `cveinKey({ mine, reset, slot }) -> 'cvein:<mine>:<reset>:<slot>'`, `mineVeins(layout) -> Array<{ slot, chamber,
  at: [x,y,z], n: [x,0,z], tier, material }>` (3 to 5 veins a chamber on wall slots that are not holes, tier from the
  material via `minedMaterial`), `mineVeinOf(mineId, reset, slot) -> vein | null`, `MINE_RESET_MAX = 99999`,
  `MINE_VEINS_PER_DAY = 150`.
- `parseNodeKey('cvein:...')` returns `{ kind: 'cvein', mine, reset, slot }` only in the one spelling `cveinKey` writes, with
  `mine` in `0..999999` and `reset` in `0..MINE_RESET_MAX`. `NODE_KINDS.cvein = 6`.
- The service treats `cvein` as mining ore (`kinds: ['ore']`), recomputes the vein with `mineVeinOf`, refuses a missing
  vein as `no-node`, and refuses past `MINE_VEINS_PER_DAY` cave veins a day per account as `day-full` (count rows in
  `node_harvests` whose node starts with `cvein:` for today).

- [ ] **Step 1: Write the failing tests**
  - `parseNodeKey(cveinKey({ mine: 12, reset: 3, slot: 4 }))` round-trips; `'cvein:012:3:4'` and `'cvein:12:3:999'`
    (a slot past the layout) parse to null or are refused by `mineVeinOf` returning null.
  - Every vein's `at` lies within 1.5 m of a wall slot of its chamber, and no vein sits on a hole's slot.
  - A vein's tier equals `minedMaterial(material).tier`.
  - Using `tools/argentDailyCaps.test.mjs`'s in-memory SQLite pattern: a harvest of the 151st cave vein today is refused
    `day-full`; a forged slot is refused `no-node`.
- [ ] **Step 2:** The tests fail.
- [ ] **Step 3:** Implement as above.
- [ ] **Step 4:** The tests pass, and `node --test tools/groves.test.mjs` still passes.
- [ ] **Step 5:** Commit `Caverns: cave veins the service checks`.

### Task 5: The cave's mesh and collider

**Files:** Create `src/world/mine/mineModel.js`; Test `tools/mineModel.test.mjs`.

**Interfaces:**
- Produces `buildMineModel(layout, tex) -> model` (the mesh kit's `pack(archive)` shape) and
  `mineColliderTris(layout) -> Float32Array` (xyz triples). `tex` is `{ archive, wall, floor, ceiling }` records.
- `mineTextures(worldClimate) -> { archive, wall, floor, ceiling }`: the natural cave set Daggerfall uses for that climate,
  read through `dungeonTextureTable` in `src/world/dungeonTextures.js`. The implementer confirms the records in game
  (rock, not brick); if the table cannot give rock for a climate, fall back to the temperate cave archive.
- Shape: each tunnel swept (`kit.sweep`) with a 10-sided ring whose radius wobbles 15 percent by a seeded noise, its
  floor flattened to a 2 m wide strip; each chamber a dome (ellipse in plan, flat floor, ceiling `h` 5 to 9 m), faces
  wound inward (the kit's `out` set to the chamber center). The mouth tunnel ends in a flat wall with the exit at
  `mouth.at`.

- [ ] **Step 1: Write the failing tests**
  - `mineColliderTris(mineLayout(1, 0))` length is a multiple of 9 and above 3,000 triangles' worth.
  - A downward ray from each chamber's center plus 1 m hits a collider triangle within 1.5 m (the floor is there), and
    from each tunnel's points too.
  - An upward ray from each chamber center hits within its `h` plus 1 m (the ceiling is closed).
  - The packed model has exactly three sub-meshes (wall, floor, ceiling), and no NaN in positions.
- [ ] **Step 2:** The tests fail.
- [ ] **Step 3:** Implement. Ray tests can use a simple ray-triangle test in the test file.
- [ ] **Step 4:** The tests pass.
- [ ] **Step 5:** Commit `Caverns: the cave's mesh and walls`.

### Task 6: The made location and entering a mine

**Files:** Create `src/world/mine/mineLocation.js`, `src/systems/mine/mineHost.js`; Modify `src/scenes/worldModes.js`
(an `enterMine(r)` beside `enterKetch`, and the host constructed beside `createKetchDeckHost`), the dungeon arm's stand and
teardown seams the Ketch host uses.

**Interfaces:**
- `mineLocation({ px, py, reset, regionIndex, regionName, climate }) -> dfLocation` with `mine: { px, py, id, reset, key }`,
  `MINE_LOCATION_ID = 0x7ffff500`, `MINE_BLOCK = 'MINE.RDB'`, `MINE_BLOCK_INDEX = 900500`; its location id and block do
  not collide with the Ketch's (`0x7ffff400`, `900400`), the Spire's, the Hour's, or the court's.
- `isMine(loc) -> boolean`, `mineBlocks(real) -> blocksFile` (the Ketch's shape), the start marker at the layout's
  `mouth.at` facing into the cave.
- `mineHit(r, blocks) -> hit | null` with `group: mineRoomKey(px, py)`, as `ketchShipHit`.
- `createMineHost({ renderer, host, wm }) -> { stand(ctx), frame(dt, eye), down() }`: stands the model into
  `ctx.dynamicDraws` (or the draws the Ketch uses), adds `mineColliderTris` with `ctx.collider.addMesh('mine:cave', ...)`,
  places a lantern light at the mouth and one in each chamber at 20 percent strength (the rest is the player's light), and
  sets the dungeon fog to a close dark brown. A blank automap is acceptable in this phase.
- Leaving: the mouth's exit point is a dungeon exit (the `egFrom`/`returnLanding` pattern the Ketch uses), landing the
  player outside at the mouth's pixel.

- [ ] **Step 1:** Unit test `tools/mineLocation.test.mjs`: `isMine(mineLocation(...))` true; `mineBlocks(null).getBlock(MINE_BLOCK_INDEX)`
  holds one start marker whose position, divided by 40, is within 0.1 m of `mouth.at`; `mineHit` returns null for a
  pixel where `mineAt` is false.
- [ ] **Step 2:** The test fails, then implement until it passes.
- [ ] **Step 3:** Browser check: `npm run dev` with `node selfhost/start.mjs`, sign in as a guest, run
  `__bunny.enterMine({ px, py })` from the console (expose it the way the Ketch's lab hook is exposed) for a pixel
  `mineAt` holds. Walk from the mouth to the deepest chamber and back without falling through or sticking; leave by the
  exit and land outside.
- [ ] **Step 4:** `node tools/worldBudgetCheck.mjs` passes.
- [ ] **Step 5:** Commit `Caverns: walk into a mine made in code`.

### Task 7: Mouths in the world

**Files:** Create `src/systems/mine/mineMouths.js`; Modify `src/scenes/world.js` (construct it beside the Ketch client and
feed it streamed pixels), the held map's marks (`src/ui/heldMap.js`, a found mouth's mark).

**Interfaces:**
- `createMineMouths({ renderer, pixelInfo, occupiedAt, enter, sealedOf }) -> { pixelBuilt(entry), pixelDropped(entry), target(eye), frame(dt) }`.
  `occupiedAt(px, py)` is true where a location or a spawned dungeon stands. `sealedOf(px, py)` answers
  `{ until: number } | null` from the last relay word heard.
- A mouth stands at the pixel's center: a rock outcrop (a Daggerfall nature rock flat set for the climate, three flats)
  and a timber portal (an ARCH3D mine-entrance or door-frame model; the implementer picks one and names its id in a
  comment), a lantern light, and an activation box 3 m wide. Press: `enter({ px, py })`; if sealed, a toast
  `t('mine.sealed', 'The mouth is choked with rubble. It reopens in about {m} minutes.')`.
- A mouth stood is marked found (the discovery book the map reads), so it shows on the map.

- [ ] **Step 1:** Unit test in `tools/mineSites.test.mjs`: `createMineMouths` with a fake `occupiedAt` that is always true
  stands nothing for any pixel.
- [ ] **Step 2:** Implement until the test passes.
- [ ] **Step 3:** Browser check: travel to a pixel `mineAt` holds (find one with a small node script over the climate
  map), see the mouth, enter, leave.
- [ ] **Step 4:** Commit `Caverns: mine mouths in the wilds`.

### Task 8: The mine brain

**Files:** Create `src/net/mine/mineBrain.js`; Test `tools/mineBrain.test.mjs`.

**Interfaces:**
- `createMineState(layout, nowS) -> MineState`:
  `{ reset, stab: number[] (one per section, 100), cap: number[] (100), props: Array<{ s, c, w, wood, by }>, sealedUntil: 0, born: nowS }`.
- `stepMine(state, op, nowS) -> { state, events: string[], error?: string }`, never mutating `state`. Ops:
  - `{ op: 'strike', s, c }`: a pick strike in chamber `c` of section `s`: costs `MINE_COST.strike = 0.6`, multiplied by
    `MINE_COST.weakMult = 1.5` once for each unpropped weak wall in that chamber.
  - `{ op: 'prop', s, c, w, wood, by }`: a plank on wall slot `w`: refused `taken` if that slot is propped; raises the
    section's `cap` by `MINE_PROP.cap * strength(wood)` (cap 4, up to 160) and refills `MINE_PROP.fill * strength(wood)`
    (fill 6), doubled on a weak wall. `strength` is the spec's wood table; an unknown wood is refused `wood`.
  - `{ op: 'tick' }`: past `sealedUntil` with a seal set, a reset: `reset + 1`, fresh `stab`, `cap`, `props`,
    `sealedUntil: 0`, event `reset`. Past `born + 7 * 86400` with no seal, the same weekly reset.
  - Any op but `tick` while sealed is refused `sealed`.
- Events: `warn:dust` (crossing under 50), `warn:creak` (under 30), `warn:rumble` (under 15), `collapse` (reaching 0, which
  sets `sealedUntil = nowS + MINE_SEAL_S` with `MINE_SEAL_S = 3600`).

- [ ] **Step 1: Write the failing tests**
  - 167 strikes in a chamber with no weak walls take a section from 100 to 0 and emit `warn:dust`, `warn:creak`,
    `warn:rumble` once each in that order, then `collapse`.
  - A chamber with two unpropped weak walls costs `0.6 * 1.5 * 1.5` a strike; propping one makes it `0.6 * 1.5`.
  - An Ironwood prop raises `cap` three times as much as a Pine prop; a prop on a weak slot counts double.
  - A second prop on the same slot is refused `taken` and the state is unchanged (Review Focus 3).
  - While sealed, `strike` is refused `sealed`; a `tick` at `sealedUntil + 1` emits `reset` and bumps `reset` by one.
  - `stepMine` never mutates its input (deep-equal before and after).
- [ ] **Step 2:** The tests fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** The tests pass.
- [ ] **Step 5:** Commit `Caverns: the shared mine brain`.

### Task 9: The relay part and the `mn` frame

**Files:** Create `src/net/mine/mineWire.js`, `server/src/room/mine.js`, `server/src/message/frames/mn.js`; Modify
`src/net/wire.js` (validators, `RELAY_VERSION`), `server/src/message/frames/index.js`, the room class's `installParts`
call, `server/src/room/alarm.js` (a mine room's tick).

**Interfaces:**
- Client to relay `{ t: 'mn', k: 'strike'|'prop'|'hi', s, c, w?, wood? }`; relay to clients `{ t: 'mn', k: 'st', st:
  <MineState>, ev?: string[] }` on every change and to a joiner. `validMineIn(m)` and `validMineOut(m)` in `mineWire.js`
  bound every number (sections under 8, chambers under 6, walls under 12) and `wood` to the seven wood ids.
- The part `_mnFrameIn(ws, a, m)`: only in a room whose key `mineRoomKey` could name (a `dungeon:m` key whose map id
  carries `MINE_SALT`), creates the state on first use from `mineLayout(mineIdOf(px, py), 0)` (read `px, py` back from the
  map id), runs `stepMine`, stores the state under room storage key `mine`, fans the result. A strike rate limit of 6 a
  second a socket (`tokenGate`).
- The room's alarm runs a `tick` once a minute while a `mine` key is held, so a sealed mine resets with nobody in it.
- A join (`k: 'hi'`) with the client's `reset` different from the room's is answered with the state; the client then
  leaves to the mouth (Review Focus 2).

- [ ] **Step 1: Write the failing tests** `tools/mineWire.test.mjs`: `validMineIn` accepts each well-formed op and refuses
  `s: 9`, `w: -1`, `wood: 'balsa'`, and extra fields; `validMineOut` accepts a `createMineState` result.
- [ ] **Step 2:** The tests fail, then implement until they pass.
- [ ] **Step 3:** Wrangler dry run:
  `node server/node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir <scratch>/relay -c selfhost/relay.toml`
  succeeds.
- [ ] **Step 4:** Commit `Caverns: the mine's shared state on the relay`.

### Task 10: The mine on this page

**Files:** Create `src/systems/mine/mineClient.js`; Modify `src/professions/mineHost.js` (a `cvein` stand beside
`standDungeonVeins`, its `dungeonNodesOf` answering cave veins when the dungeon is a mine) and `src/professions/gatherHost.js`
only if a new seam is needed (prefer passing the mine's veins through `dungeonNodesOf`'s context).

**Interfaces:**
- `createMineClient({ hud, send, layout, entity, storesSpend, leave }) -> { heard(m), frame(dt, feet), struck(chamber), rows(feet) }`.
  - `heard(m)`: keeps the state; on `warn:*` plays the warning (dust motes and a camera shake of 0.02, 0.05, 0.1 for dust,
    creak, rumble, with Daggerfall's own rumble sound); on `collapse` runs the collapse: a 2.5 s shake rising to 0.3, dust,
    a fade to black, every open window closed, then `leave()` to the mouth with the toast
    `t('mine.collapsed', 'The mine came down behind you. It reopens in about an hour.')` (Review Focus 1).
  - `struck(chamber)`: after a `cvein` harvest the service answered, sends `{ k: 'strike', s, c }`.
  - `rows(feet)`: activation rows near a hole (`Examine the hole`: a toast naming ore and richness, for example
    `t('mine.hole', 'Copper below, a good seam ({rich} of 3).')`) and near a wall slot (`Shore this wall`: picks the best
    plank in the Stores, spends one through `storesSpend('plank:<wood>', 1)`, then sends `prop`; refused words if none).
  - The Survey Rod: an item (a new template beside the Grappling Hook in `src/characters/heavyGearIds.js`, id 566, art
    borrowed from a Daggerfall staff icon) whose Use shows the chamber's section stability and cap and marks weak wall
    slots with a red glint and veins within 20 m with the existing node glow for 30 s. Sold by the Cartographers'
    Society for 150 gold (a row in `src/guilds/bunnyServices.js`).
- `storesSpend` uses the existing Stores withdraw route (`/v1/stores/withdraw`) to take one plank into the pack, then
  removes that plank item from the pack; no new account route.
- The page opens a mine only when the relay's version is the new `RELAY_VERSION` or later (the Ketch's `KT_RELAY_MIN`
  pattern); an older relay gets `t('mine.relayOld', 'The mines open after the next server update.')`.

- [ ] **Step 1: Write the failing test** `tools/mineClient.test.mjs` with fakes: a `collapse` event calls `leave` once and
  closes windows through the passed `closeWindows`; a `prop` row with no planks in the fake Stores sends nothing and
  toasts `t('mine.noPlanks', ...)`.
- [ ] **Step 2:** The test fails, then implement until it passes.
- [ ] **Step 3:** Browser check, two clients (two guest accounts in two tabs), same mine: both see the same props go up;
  one strikes until collapse; both are thrown out with the shake and fade; the mouth says sealed with the minutes left; a
  `tick` forced from the console (or a `MINE_SEAL_S` lowered by a `?mineSeal=30` dev flag read only on localhost) reopens a
  new layout.
- [ ] **Step 4:** Commit `Caverns: survey, holes, shoring, and the collapse in game`.

### Task 11: Cards, changelog, text, and the checks

**Files:** Create `tools/codex/cards/caverns-mines-overview.md` (at most 250 words, LF); Modify
`tools/codex/cards/professions-gathering-nodes-and-motherlodes.md` (the `cvein` kind and `MINE_VEINS_PER_DAY`),
`CHANGELOG.md`, `docs/GUIDE.md` (a row in "Where Bunnyfall's own things live"), `locales/en/Port_Strings.csv` (by the tool).

- [ ] **Step 1:** Write the card with `npm run codex -- card caverns-mines-overview --write <draft.md>`; `files` lists the
  new modules, `invariants` the seal, the weekly reset, the cave vein cap, and the room key.
- [ ] **Step 2:** CHANGELOG lines under `## 2026-11-25`:
  `- New: Mine mouths now stand in the wilds of mountain, desert and haunted country. Walk in, examine the holes, shore the walls with planks from your Stores, and mine the veins, but mine too greedily and the whole mine comes down. A collapsed mine reopens as a new one after about an hour.`
  `- New: The Cartographers' Society sells a Survey Rod that shows a mine's stability, its weak walls and the veins nearby.`
  `- Changed: Trees now stand in small groves, so the walk between trees while logging is much shorter.`
- [ ] **Step 3:** `node tools/l10nExtract.mjs`, then `npm run codex -- diff main HEAD` and read every impacted card.
- [ ] **Step 4:** `npm run check` passes (lint, world budget, routes, codex, types, build) and every `tools/mine*.test.mjs`,
  `tools/groves.test.mjs` passes.
- [ ] **Step 5:** Commit `Caverns: cards, changelog, and text`.
