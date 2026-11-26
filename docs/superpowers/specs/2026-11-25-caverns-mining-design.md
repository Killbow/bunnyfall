# Caverns, Mining, and Logging: design

Owner: Killbunny. Written 2026-11-25 from a design conversation. Plain American English throughout.

## Intent

Overworld mining is one player, one vein, one swing game. The owner wants caverns to feel like **a big-scale mining
operation**, closer to Deep Rock Galactic than to Daggerfall's gathering: a crew walks into a mine with dedicated tools,
surveys which parts are safe, plants lights, examines the holes, sets up a drill or works with a pickaxe, and pulls ore
out while the noise brings enemies. The mine is worked piece by piece and has to be played smart: mine too greedily and
it collapses. The Cartographers' Society drives it with large ore contracts that pay points toward rare rewards.

Logging feeds it: shoring a mine costs planks, so where timber comes from matters. Logging's leveling walk is fixed.

## Goals

- Mines are places in the wilds you find and enter, built in code, drawn with Daggerfall's own art.
- One shared mine per mouth: everyone inside works the same stability, sees the same gear, fights the same waves.
- The loop: survey, light, examine holes, shore, drill or pick, defend, haul, push deeper or get out.
- Collapse is the risk: everyone is thrown out and keeps only what they carry. The mine reopens, reset, after about an hour.
- The Cartographers' Society gives large ore contracts, pays points, and runs a shop with tools, a ladder of grindable
  titles, and an aura whose source is switched off today.
- Logging matters: planks shore mines, better woods shore better. Trees stand in groves (done).

## Non-goals

- No digging through rock or destructible terrain. The cave's shape is fixed until it resets.
- No new art pipeline: textures are Daggerfall's (TEXTURE archives), creatures are Daggerfall's foes.
- No changes to overworld veins or their rates.
- No offline mines: mines are online only, like the guild halls.

## Anti-goals (failure even if it works)

- A mine that is just "more veins in a tunnel": if drilling, stability, and waves do not force choices, it failed.
- Strangers able to steal: nobody but the owner's party takes from a drill's hopper or pushes its cart. A stranger CAN
  collapse the mine on everyone: the owner chose that shared danger on purpose.
- Points or titles a client can fake: the currency and its spending live on the account service.

## Decisions made with the owner

| Topic | Decision |
|---|---|
| Build | A cave made in code, drawn with Daggerfall textures (not Daggerfall blocks, not new pixel art). |
| Where | Mouths in the wilds. |
| Hosting | **Approach A**: the mine is its own dungeon with no Daggerfall blocks. |
| Stability | Each level (section) has durability. Mining wears it; planks shore it. |
| Collapse | Everyone inside is thrown out with a short animation and keeps only what they carry. |
| Reset | A collapsed mine reopens, reset, after about an hour. |
| Sharing | One shared mine per mouth, for everyone. |
| Enemies | The cave's typical creatures in waves when drilling, and occasional strays. |
| Collapse by strangers | Allowed: stability is one shared meter, and one crew's greed can bury another's haul. |
| Aura | The Burning Stair. |
| Society | Large ore contracts (outside or inside ore both count), paid in points, spent in a shop on rewards, grindable titles, and an unused aura. |

## Approaches considered

- **A. The mine is its own dungeon (chosen).** A mouth is a wild location with a normal dungeon door. Inside, the whole
  space is the made cave: no RDB blocks. Foes run through the dungeon foe system (a host client simulates, the relay fans
  the `foes` frame). New: a `mine` relay frame for shared state, a cave-vein node kind on the harvest check, and the
  Society's server-side points. Clean single space, ours to shape; the risk is that no blockless dungeon exists yet.
- **B. The mine hangs off a real cave block.** Entering is proven, but every trip starts in a Daggerfall room and the two
  spaces meet at a seam. Rejected for that seam.
- **Daggerfall dungeon blocks stitched into a long cave.** Least code, but reads as Daggerfall's rooms with rock
  textures, not a winding mine. Rejected by the owner.
- **Fully procedural pixel art like the Shattered Hour.** Rejected: too much art code for the gain.

## The design

### 1. Mouths

- A mouth stands on a map pixel chosen by a seeded roll (the spawned-dungeon law, its own salt and lane), weighted toward
  Mountain, Mountain Woods, Desert, and Haunted Woodlands, never on a pixel holding a location or a spawned dungeon.
  Target density: about one mouth per 25 to 40 pixels of mining country. Shown on the map once found or charted.
- A mouth is a rock face with a timbered portal and a lantern, built from Daggerfall's exterior models or flats (the
  builder picks a fitting ARCH3D model or a flat set; a small rock outcrop plus a door is enough). Activating it enters.
- A collapsed mouth shows rubble and dust, refuses entry, and names the minutes left.
- Each mine has a stable id from its pixel (the spawned law's id form, its own salt) so it gets its own relay room
  (`dungeon:m<id>`).

### 2. The cave (made in code)

- **Layout law (pure, `src/net/mine/`):** seeded by mine id and its **reset count**. A mine is 4 to 6 **sections** in a
  chain going down, each 2 to 4 chambers joined by winding tunnels, with dead-end pockets and drops between sections.
  The deepest section holds the richest ore. The same seed gives every client the same mine.
- **Mesh:** each tunnel is a spline swept with irregular rings (noise on the radius, a flattened floor). Chambers are
  lumpy domes. Walls, floors, and ceilings use one Daggerfall cave texture set by the region's climate (the natural-cave
  dungeon texture table). Built with the existing mesh kits (see `src/world/eliteGates/meshKit.js`, `egRoomModel.js`).
- **Collision:** the mesh's triangles go to the collider (`collider.addMesh`), as the Elite Gates halls do.
- **Lighting:** dark by default, lit by the player's light and placed lamps (the dungeon lights system).
- **Automap:** the builder checks how the dungeon automap behaves with no blocks. A blank automap is acceptable for the
  first step. A drawn one is a follow-up.

### 3. Tools (bought from the Society, with gold or points)

- **Survey Rod:** read a chamber's stability and which walls are weak; reveals vein glints in a radius.
- **Mine Lamp:** placed, lights a chamber, reduces strays there. Consumed on placing; collected back if not collapsed.
- **Drill:** placed against a vein face. Runs on **Drill Fuel**. Fills a hopper with ore while it runs.
- **Pick-Axe:** the existing tool and its swing game, quiet and slow.
- **Shoring:** planks from the Stores (any `plank:*`), placed as props on a chamber's walls.
- **Ore Cart:** pushed on rails (rails come with the mine's main tunnel), carries a large load.

The builder decides whether these are new item templates (in the `heavyGearIds.js` style, an id range of their own) or
Stores-only kit. The owner did not specify; new items are the default because players hold them.

### 4. Holes

- Each chamber has 1 to 3 **holes** (fissures and old boreholes). Examining one names the ore below, its richness, and its
  depth band. It is the prospecting step that tells the crew where the drill goes.

### 5. Ore

- **Veins** stand on chamber walls (a new node kind, `cvein`, validated by the account service from the mine's layout
  law: mine id, reset count, slot). The pickaxe works them through the existing act.
- **Drill faces** are larger seams found through holes. A drill placed on one produces ore on a timer into its hopper:
  the longer it runs, the more ore. Its yield is reported and paid by the account service (the relay signs the run, as
  other made levels sign receipts), so a client cannot invent drill ore.
- Ore tables by depth: shallow sections hold the region's common ores, deep sections silver, gold, and platinum, and the
  deepest can hold a **rich seam** of mithril, ebony, orichalcum, or adamantium (about one mine in eight).

### 6. Stability and collapse

- Each **section** has stability 0 to 100 and a ceiling. A pick strike costs a little, a drill second more, a fight in
  the section a little. Placed planks raise the ceiling and refill a share; better wood raises it more (Pine 1x, Oak
  1.5x, Cherry 1.75x, Teak 2x, Mahogany 2.25x, Ironwood and Ghostwood 3x).
- Warnings get stronger as it falls: dust under 50, creaks and pebbles under 30, a rumble under 15.
- At 0 the **whole mine** collapses: the relay tells everyone inside; each sees dust, a shake, and a fade, and stands at
  the mouth outside. They keep their pack. The hoppers, unbanked carts, and placed gear are lost.
- The mouth is sealed for **60 minutes** (a relay room key that survives restarts), then the mine resets: the reset count
  rises, giving a new layout, full stability, and fresh ore.
- A mine nobody collapses resets weekly.

### 7. Hauling

- Pick-axe ore goes to the Stores as today (Stores are the safe bank), so the pick is the safe, slow way.
- **Drill ore** sits in the hopper until someone in the drill owner's party takes it into a pack (weight-limited) or a
  cart. A cart reaching the mouth's dock banks its load into the pusher's Stores. This is where the risk lives.

### 8. Enemies

- **Waves:** a drill running raises the section's **alarm**. Waves spawn in the dark past the section, toward the drill,
  bigger and more often the longer it runs; stopping the drill ends them after the current one.
- **Strays:** single creatures or pairs on a slow timer, fewer in lit chambers.
- Creatures are Daggerfall's cave foes by depth band: rats, giant bats, and spiders shallow; scorpions, orcs, and spriggans
  middle; trolls and skeletons deep. They use the existing foe system and its host-client simulation.
- **Pathing:** the builder must confirm foes can walk the made cave. Either the navmesh bakes from the collider's
  triangles, or a walk graph from the layout law (like `egWalkGraph.js`) drives them.

### 9. The Cartographers' Society

- **Contracts:** one at a time per character. Each names a large amount of one ore (for example 400 Iron Ore, 150 Silver
  Ore, 40 Mithril Ore) to deliver from the Stores. Size and pay grow with the ore's tier. Ore from anywhere counts.
- **Points (Survey Seals):** an account-service currency. A contract turned in pays seals and Society reputation.
- **Shop** (like the Bards' Favor shop, opened from the hall): tools and kit, then a ladder of titles (Prospector,
  Delver, Deepwarden, Master of the Seam) each costing more, then **The Burning Stair** (falling embers; its Elite Breach
  source is switched off) at a very high price. Players who already earned it keep it; the shop only adds a second way. Titles and the aura go through the existing insignia and titles path, so other
  players see them.

### 10. Logging (follow-on)

- Groves (done): the day's trees stand in groups of six.
- Shoring makes wood type matter. A later step adds timber grades from felling (sound, knotty, prime), which change how
  many planks a log saws to.

## Settled after the builder check (my calls, for the owner to check)

- **When drill ore is real:** taking ore from a hopper into a pack credits it then, as carried units (the way a carried
  harvest is today), signed by the relay. A pack's ore survives a collapse and a death like any carried goods. Ore still
  in a hopper or in a cart is not credited until a cart reaches the dock.
- **A mine with nobody in it:** a drill runs only while its owner is inside the mine; leaving stops it. Stability,
  lamps, props, drills, and hopper contents persist in the relay room (saved keys) until a collapse or the weekly reset.
- **Getting back up:** drops between sections are walkable slopes, not one-way falls. Rails run along every section's
  main tunnel, from the deepest chamber to the dock at the mouth.
- **Weak walls:** the layout law gives each chamber wall slots, some marked weak. A weak wall left unshored costs the
  section stability faster while anyone mines in that chamber; a plank on a weak wall counts double. The Survey Rod shows
  which slots are weak.
- **Holes and drill faces:** examining a hole reveals the drill face it leads to, in the same chamber. Drill faces exist
  only behind holes, so prospecting always comes before drilling.
- **What counts for contracts:** units the character gathered (`own`) and found (`loose`), as writs count them today.
  Market-bought and gold-bought ore does not, so Survey Seals cannot be bought with gold. Anyone can take a contract;
  Society members earn more seals by rank, and contracts raise the Society's existing guild standing.

## Constraints

- Shared laws in `src/net/mine/`, pure. Client modules in their own files, wired from `bootWorld`,
  `buildDungeonContext`, or `createWorldModes` with a line or two (`node tools/worldBudgetCheck.mjs`).
- New account-service routes go in `ROUTES` (`server-account/src/service.js`) and `index.js`; migrations follow the
  current numbering (after `0220`). Relay frames go through `src/net/wire.js` validators.
- English through `t('key', 'words')` and `node tools/l10nExtract.mjs`. LF line endings. Codex cards for each new
  subsystem (at most 250 words each). A CHANGELOG.md line per playable step.
- `npm run check` passes before any push. Multiplayer is tested with two clients against `selfhost/start.mjs`.

## Build order (each step playable and committed)

1. Mouths and an empty walkable cave (layout law, mesh, collider, lighting, entering and leaving).
2. Veins and the pickaxe in the mine; holes and the Survey Rod.
3. Stability, shoring with planks, collapse, the 60-minute seal, and reset.
4. Waves and strays.
5. The drill, hoppers, carts, and banking.
6. Contracts, Survey Seals, the shop, the titles, and The Burning Stair.
7. Logging's timber grades.

## The builder's calls

- Exact numbers (section count, wave sizes, stability costs, contract sizes, prices) are first guesses for tuning.
- Item ids, texture records, and model choices for the mouth.
- How the mesh is chunked for the renderer and the collider.

## Earlier work on this branch

- `156d0d95c`: logging groves. Kept.
- `d17866a9c`: the dungeon-vein seam chain in Daggerfall's own dungeons. **Reverted** (my call): the mine now owns
  seams and rich ore, and the expedition helpers that still fit (`leadOf`, `compassWord`) move into `src/net/mine/`.
