# The Farm Expansion

Status: **Phase 1 built** (2026-11-19): the farmyard, the fixtures, sacks and the wagon, lanterns, and the field graphics pass (`docs/FARMING.md`). The wind (4.0) waits on a billboard-shader change. **Phase 2a built** the same day: farm work, the three titles with First Light, and the climate crops with the seasons. **Phase 2b built** too: care and the four grades, weeds, birds and the field games (sowing, weeding, scything, chasing birds). Strains (2c) are next; phases 3 to 7 are designed here. It extends the Company farms
(`docs/FARMING.md`, `src/net/farmLaw.js`) and Farming Mode (`src/scenes/farmingMode.js`).

## Decisions taken

- **Design first.** This document is reviewed before any code.
- **Art is ARENA2 and the vendored DFU mods only.** No new hand-made sprites and no new meshes beyond the ones already
  vendored (the windmill, the carts, the tent). Every record named here was **checked by eye** against the owner's
  ARENA2 files (TEXTURE 201, 205, 211-214, 254, 301, 302 with ART_PAL.COL) on 2026-11-19: Appendix A is the register.
  What the data lacks is left out: there are **no chickens, sheep, goats or beehives** in ARENA2 or the mods, so eggs,
  shearing and the apiary are dropped.
- **Four content pillars:** hands-on farm work, market days and contests, crafting chains, farm events and threats.
- **Revenants:** only **sworn** revenants of a **beast** kind can be stationed at a farm, each doing the work its kind
  suits.
- **It lives on the farm, not in menus** (the owner, mid-design: "avoid making this all menus, I want this to live on
  the farm diegetically"). This is the first rule below and it overrides convenience everywhere.
- **Rewards:** three titles earned by grinding the farm (Furrowhand, Harvestwarden, Sovereign of the Sheaf) at
  3,000 / 15,000 / 45,000 farm work, and the Elite Breach's **First Light** aura with the last one (section 10).
- **Work in Farming Mode only.** The farm is *seen* by everyone in the normal view; its stations are *used* from the
  Farming Mode camera.
- **Raids strike only while a Company member is at the farm.** Nobody loses goods while everyone is away.
- **Animals belong to the Company,** like the beds: every member feeds, waters and milks them, and their goods go to the
  Company Stores. Nobody owns a personal animal. (Sworn beasts stay their owner's: a revenant is a character's.)
- **Online only,** as the farms are today. Nothing here works offline.
- **A weekly market day on every farm,** not a seasonal fair on one (section 9).
- **Carrying sacks stays,** a central loop (3.3).
- **It must look good** (the owner: "make sure to make the farming expansion be cool also graphically"). Section 4.0
  sets the visual bar, and every phase is judged against it.

---

## 1. The rules of the expansion

1. **Diegetic first.** Every feature is a *thing on the farm* you walk up to and use: a post, a crate, a pen, a wagon, a
   pen. There are no new panels, pages, sidebars or lists. What a screen may still show:
   - the **tool belt** (it is your hands: what you hold);
   - a **hover line** in the world-tooltips style ("Grushnak the Scarred, ploughing. Content.");
   - **short spoken lines and notices** in the HUD's normal message line;
   - DFU's own **Y/N question** for one thing only: spending Company gold or Argents (an officer's confirmation), because
     money must never move on a stray click;
   - a minigame's **in-world gauge** (drawn on or above the object, like a meter on the churn), never a modal window.
   The current **Progress & orders** sidebar (`src/ui/farmProgressHud.js`) is replaced by things on the farm (section 3).
2. **Seen in the normal view, worked in Farming Mode.** Fixtures, animals, sworn beasts, weeds, crows and markets are
   drawn for anyone near the farm, as crops already are (the observer path in `farmingMode.js`). **Using** any of it
   (a post, a pen, a workshop, a beast post, a judging table) happens from the Farming Mode camera, entered at the
   farmhouse door as today. In the normal view, hovering a station gives its line and a hint ("Enter Farming Mode at
   the farmhouse to work here.").
3. **Care, not clicks.** Better farming raises **quality**, **variety** and **new goods**, not the number of clicks.
   Every minigame has a daily cap; skipping one is always allowed and only costs the bonus.
4. **Crops pause, never die.** Today's promise holds: neglect, blight, storms and raids cost *quality* or *a share* of a
   harvest, never a whole field, and never an animal.
5. **The server keeps time and truth.** Growth, workshops, livestock and stations run on the account service's clock,
   as beds do. Laws are pure files in `src/net/farm/` that both ends read.
6. **The hosts do not grow.** Each piece is a module `farmingMode.js` (or the world's existing farm observer) wires;
   nothing new in `bootWorld`, `bootExterior` or the other hosts (`bible/01-Overview/Host-Split.md`).
7. **Every piece can be switched off** in `src/systems/contentOff.js` (`farmLivestock`, `farmBeasts`, `farmWorkshops`,
   `farmThreats`, `farmMarkets`, `farmMinigames`), so a phase can ship and be pulled back alone.

---

## 2. What exists today, in short

- Company farms are MAPS.BSA's own farm locations, bought inside the Company's territory (up to 3). Passive daily
  production goes to Company Stores (food, herbs, hides and wool, timber) and members' chores add to it.
- Farming Mode turns the crop prefabs (53211-53214, `flatFields.js`) into **beds** 2 m apart. There are four tools (hoe,
  seeds, water, harvest) and three crops (grain 6 h, mushroom 12 h, herbs 18 h). Beds are shared and stored sparsely as
  garden JSON with a revision.
- Upgrades (tools, irrigation, soil) and weekly bulk orders run from a sidebar.
- Art: a soil decal per bed (302:1) and four billboards per planted bed from TEXTURE.301. Mushrooms use one sprite for
  every stage, and wet soil is only a darker tint.

What is missing: anything to look at but beds, any reason to come back besides the timer, animals, processing, and any
sense that the farm is a *place*.

---

## 3. The farmstead: where everything stands

### 3.1 Placing the fixtures

Each farm block has its farmhouse, its fields and some open ground. A new pure layout, `src/world/farm/farmstead.js`,
finds **fixture plots** on that ground once per farm:

- It samples the open ground inside the farm's blocks (not on a field, a road or a model's footprint), on a 1 m grid.
- A plot needs a flat patch (`heightAt` spread under 0.4 m) of its fixture's footprint.
- Plots are chosen by a seed of the farm's `mapId`, nearest the farmhouse door first, so **every client sees the same
  farm**, and the order of fixtures is fixed (below). A farm too cramped for one simply lacks it, and its stand-in
  (marked per fixture) carries its job.
- The result is cached per farm, like `farmGardenSite`.

### 3.2 The fixtures, in the order they claim ground

| Fixture | Footprint | Made of (ARENA2 / mods) | What it does (section) |
| --- | --- | --- | --- |
| **Order post** | 1x1 | the hanging signboard 212:5, notices drawn on it as pale paper quads | Weekly orders (3.3) |
| **Factor's wagon** | 3x5 | horse-cart-and-cargo's cart + a 201 horse, sacks 205:17 | Ships orders (3.3) |
| **Estate ledger** | 1x1 | the quill and ink 211:1 on the wooden block 211:31, in the porch (there is no lectern flat) | Read-only farm record (3.4) |
| **Seed shelf** | 1x2 | sacks 205:17-19 before the crate stack 205:24, each with its seedling on top | Picking a seed (3.5) |
| **Tool rack** | 1x2 | TEXTURE.214's tools (inventory pictures, sized by width) leaning on the crates 205:25 | Upgrades made visible (3.6) |
| **Well and trough** | 2x2 | the well 212:0, the hand pumps 212:8/9, troughs 41220-41222, buckets 205:29/30 | Water; irrigation (3.6) |
| **Compost heap** | 2x2 | the dark heap 212:7, the dung pile with flies 211:3 | Soil; manure in (3.6) |
| **Pens and sty** | 6x8 | posts 212:13/14 with rails drawn between them (no fence flat exists), haystack 212:1, the cart 205:27 | Livestock (5) |
| **Beast posts** | 2x2 each | a stake and chain, a kennel or straw bed | Sworn beasts (6) |
| **Workshop yard** | 8x8 | mill, press, churn, smokehouse, loom (7) | Crafting chains (7) |
| **Scarecrow** | 1x1 | the scarecrow 211:20 | Crows (8.3) |
| **Market green** | a field's edge | tent model (climates-calories), stalls, banners | Market day (9) |

An **unbuilt fixture** is not hidden: its plot shows **stakes and a rope** with a **work-order board**. Click it and the
foreman's line names the cost; an officer pays with the Y/N question. The fixture then rises over **real time** (an hour
for a post, a day for a mill): first scaffolding (timber flats), then the finished thing. Building is the progression
you can see from the road.

### 3.3 Orders: the post and the wagon (replaces the orders sidebar)

- Each week's three orders (one per crop line, same numbers as today) hang as **notices on the order post**. Hover:
  "Wanted by the Wayrest Grocers: 5,000 grain, by Morndas next. Pays 12,000 gold and 50 Argents."
- Harvested goods no longer vanish straight into the Stores. A harvest drops **sacks** on the bed's edge (205:17,
  a few per stack). They go to the Stores on their own after a minute, so nobody loses anything. A member who **carries
  them to the factor's wagon** (pick up, walk, drop on the cart; the cart's cargo visibly fills, as horse-cart-and-cargo
  already draws fullness) loads them as the week's cargo. *As built:* the harvest still banks the crops in the Stores
  at once, so hauling pays no extra goods; it counts as care work for the day's chore, and from Phase 2 earns farm work
  points (10.1).
- When an order is full, the factor arrives (an NPC flat with the horse and cart) on the next hour mark, an officer
  confirms (Y/N), and the wagon **drives off along the road**. The rewards land as today.
- A full shipment uses Stores stock exactly as today; hand-carried sacks are a bonus path, never required.

### 3.4 The estate ledger (replaces the progress sidebar)

A book on a lectern in the farmhouse porch. Clicking it **reads two lines aloud** into the message line, chosen by what
matters now ("The tempered tools want 300 more grain shipped." / "Last week: 4,200 grain, 900 mushrooms. Best bed: the
north field's Golden Ear."). Click again for the next pair. Everything else the old sidebar showed is now **in the
world**: tool levels on the rack, irrigation on the field, soil on the beds, orders on the post.

### 3.5 Choosing a seed

The Crop button goes away. **Seed sacks** stand on the seed shelf, one per known seed and strain (4.2). Click a sack to
take that seed; the belt's seed tool shows it. New strains appear as new sacks, labelled on hover.

### 3.6 Upgrades you can see

| Upgrade | Today | On the farm |
| --- | --- | --- |
| Tempered / Masterwork tools | a number | the rack's tools change; the character's held tool changes; a wider bed highlight |
| Irrigation channels | a number | **water channels** drawn between bed rows (thin dark-wet decal strips with a slow ripple), fed from the well |
| Living irrigation | a number | a **water wheel or windmill pump** at the well (the vendored windmill at small scale, its blades turning) |
| Compost / Rich loam | a number | the compost heap grows; **soil decals change** to a darker, richer loam |

---

## 4. Hands on the land: graphics, crops and minigames

### 4.0 The visual bar

The farm has to be one of the best-looking places in the game: somewhere players go to stand and watch. The limit
"ARENA2 and the mods only" is a limit on **pictures** (sprites, textures, meshes). **Light, motion, particles, weather
and shaders are code**, and the game already has plenty of each (the auras in `render/auraRing.js`, the dynamic skies,
heat haze, snowfall, the blood decals' wet sheen). The farm uses all of them. Daggerfall's look is kept: pixel sprites,
no smooth gradients on the sprites themselves, effects that sit in the world rather than on the screen.

**The signature moments.** Each phase must deliver at least one of these, captured and shown to the owner before it
ships:

| Moment | What you see |
| --- | --- |
| **Wind over the wheat** | a gust travels across the field as a visible wave: plants lean in sequence, a lighter band rolls through the rows, chaff lifts off ripe heads |
| **Golden hour** | at dusk the field takes a warm, low light, long sprite shadows (the blob shadow stretched away from the sun), dust motes and the first fireflies |
| **Morning mist** | at dawn a low mist lies in the furrows and burns off as the sun climbs; dew glints on the beds for the first hour |
| **The harvest** | scything a row throws chaff and a puff of dust, the plants fall in a sweep, sacks thump down and stack at the row's end |
| **The wagon leaves** | the loaded wagon (its cargo stacked high, horse-cart-and-cargo's fullness) rolls down the road, the Farming Mode camera lingers on it, the factor waves |
| **Rain on the fields** | rain darkens the soil row by row, puddles gather in the furrows, the trough fills, animals shelter by the barn |
| **Night on the farm** | lanterns along the posts, warm windows in the farmhouse, fireflies over ripe beds, the windmill's blades dark against the stars |
| **Market day** | bunting between the posts in the Company's colours, stalls with goods stacked on them, a crowd, smoke from a cooking fire, the show ring's fence |
| **A title earned** | for Sovereign of the Sheaf, the dawn breaks on the farm as First Light kindles at your feet for the first time |

**The toolkit**, all code over existing pictures:

- **Wind field.** One shared wind value per farm (direction, strength and moving gusts) read by every crop, weed, hay
  flat and banner. Plants lean by their height; gusts travel across the field as a wave. A per-vertex offset in the
  billboard pass (*check whether `createBillboardBatch` can take one, as the grass sway does*), otherwise a per-batch
  lean updated each frame.
- **Particles** (one pooled emitter module, `world/farm/farmParticles.js`): soil clods from the hoe, a spray from the
  watering can, chaff from the scythe, dust behind the plough and the wagon, flies over the dung heap, smoke from the
  smokehouse and the cooking fire, flour from the mill's door, sparks from a stationed dragonling, fireflies at night.
  Every particle is a tiny pixel quad or a borrowed ARENA2 sprite. The count scales with the graphics setting.
- **Light.** The farm's lights (lanterns, windows, the smokehouse's glow) join the scene's point lights where the
  renderer has them, with a soft flicker. At dusk the farm's sprites take the sky's warm tint (the dynamic skies'
  colour), so the farm sits in its light rather than on top of it.
- **Ground.** Decal layers for tilled rows, wet soil (the `wet` sheen), puddles, wheel ruts on the wagon's track,
  hoofprints in the pens, and a trodden path that forms where members walk most (a slow decal that darkens over days).
- **Life.** Animals are never still: they graze, turn, walk to the trough, lie down, follow the herding wolf. Birds lift
  off a field in a flock when you walk through. A cat sleeps on the porch (201:8) and stalks the barn (201:7).
- **Camera beats.** Farming Mode already owns a camera. It eases in for minigames (lower and closer over the bed), pulls
  back for the wagon's departure and a title, and rises to show a whole field after a big harvest. Every beat is short
  and skippable with any key.
- **Feedback with weight.** Every tool lands with a small punch in the world: the plant bends, soil kicks up, a sound
  (the immersive-footsteps and better-ambience sets, the sounds chosen in Phase 1), and a sack's thump.

**Performance.** The farm is a world scene, not a showcase. Budgets: under 2 ms of GPU at the farm on the mid setting,
a few hundred particles at most, plants and fixtures batched by sprite. Observers (other farms in view) draw fixtures
and a coarse field with no particles. The graphics settings get a farm detail level.

**Checked by eye, on the real game.** Each phase ends with captures at Old Morgorya's Farm, as Farming Mode did: a
Playwright run with ARENA2 at dawn, noon, dusk, night and in rain, plus a short clip of the wind and of a harvest. The
owner signs off the look before the phase ships.

### 4.1 A field that looks like a field

Today a bed is a flat square with four billboards. The overhaul, all with existing records:

- **Furrows.** Tilled soil becomes **rows**: two or three narrow soil-decal strips per bed along the field's long axis,
  so a worked field reads as ploughed lines. The tilled soil fades into the field's grass at the bed's edge (a soft
  alpha border on the decal), with no hard tiles.
- **Wet soil.** The decal's `wet` channel (the blood decals' sheen) is used, not only a tint, so watered beds glisten
  for their first hours and dry out visibly as `wetUntil` approaches.
- **Plants.** Each bed draws 3 to 6 plants, seeded by the bed's index for jitter, not a fixed 2x2. Their height grows
  **continuously** with growth (no three-step jumps), they sway gently in the wind (the grass shader's sway, if the
  billboard pass can take a per-vertex offset *(check the renderer)*), and a quality crop stands a little taller and
  fuller.
- **Stage art per crop**, from TEXTURE.301 (records named in `flatFields.js`): wheat 19/21, corn 0/1, sunflower 3/4,
  vines 7/8, desert plant 2/20. **No mushroom sprite exists** in these archives: today's mushroom beds draw 301:10, a low
  leafy row. They keep it, grown as a shaded bed (darker soil decal, a slatted cover drawn over it in code), and a
  harvest pops caps as particles. Wheat stands as **shocks** (301:0/1) once harvested, and a haystack (212:1) grows by
  the barn with the season's grain.
- **Weeds.** A bed left dry for a day grows weed flats (301:12, 301:20, 301:23) around its plants. They are shown
  and they can be weeded (4.4). They slow growth, never stop it.
- **Ripe crops** catch the light: a faint warm tint and, at dusk, a few fireflies (the dust motes the heat-haze mod
  draws). No glowing UI markers.
- **Harvest.** The plants drop away, leaving sacks at the bed's edge (3.3) and stubble (511:22, the winter stubble record)
  for an hour before the soil shows again.
- **Seasons.** The farm reads the **world's season** (`gameDate.js seasonValue` on the world clock, not the
  character's), not each player's own. In winter, untilled fields show snowed stubble (Seasons of the Iliac Bay's art) and
  planted beds show frost on their soil decal.
- **Night.** Lanterns on the posts and the porch (the handheld-torches mod's lights, or the town lamp flats) light at
  dusk, so the farm is worth walking at night.
- **Performance.** Fixtures and plants are batched by sprite the way `farmGardenArt.js` already does. The number of
  drawn plants scales with the graphics quality setting, and distant farms (observers) draw only fixtures and a coarse
  plant per bed.

### 4.2 More crops, strains and quality

**New crops** (seed, real hours, what it yields). Climate sets which grow outdoors; others need the greenhouse (6.2,
dragonling):

| Crop | Hours | Art (301) | Yields | Climates |
| --- | ---: | --- | --- | --- |
| Grain | 6 | 19/21 | `food:grain` | all but desert |
| Corn | 8 | 0/1 | `food:corn` (new) | mountain, woodland |
| Mushroom | 12 | 10 | `food:mushroom` | all (shade: next to buildings) |
| Herbs | 18 | 8/13/14 | climate's common herb | all |
| Sunflower | 14 | 3/4 | `food:seeds` (new), oil at the press | subtropical, woodland |
| Grapes | 30 | 7/8 | `food:grapes` (DET 10021:14/15 art) | rainforest, swamp, subtropical |
| Cabbage | 10 | 301:18 | `food:cabbage` | woodland, mountain |
| Flax | 20 | 301:19 growing, 301:15 in blue flower (flax flowers blue) | `fiber:flax` (new), linen at the loom | woodland, swamp |
| Gourd | 24 | 301:23 vines, the gourd 213:0 on the ground when ripe | `food:gourd` (new); the heaviest-gourd contest | woodland, subtropical |
| Berries | 16 | 301:5, 301:11, 301:14 (berry bushes) | `food:berries` (new), wine and pies | woodland, mountain |
| Tomato | 12 | 301:12 low plant, the fruit 213:1 when ripe | `food:tomato` (new) | subtropical, woodland |
| Desert root | 16 | 2/20 | `food:root` (new) | desert |

**Seasons scale growth:** in season ×1.0, off season ×0.7, winter outdoors ×0.4 (never zero: crops pause, never die). *As built:* only the climate crops follow the seasons; grain, mushrooms and herbs keep their pace all year so the weekly orders keep their balance. Corn's item picture is its plant (301:2): ARENA2 has no ear of corn.

**Quality** gains a fourth level. Today a bed has 0, 1 or 2 from soil. It becomes **Common, Fine, Choice, Prize**,
worked out at harvest from:

- the soil level at planting (as today);
- **care points** on the bed: watered before it dried, weeded, crows kept off, a minigame done well on it;
- the strain's own bonus.

Quality multiplies yield (×1, ×1.25, ×1.5, ×2) and is carried on the item as provisioning ingredients carry ranks, so a
Prize grain makes a better loaf in the pot (`docs/PROVISIONING.md`: a better ingredient raises the dish).
*As built (2b):* the grade comes from care alone (Fine 2, Choice 3, Prize 4), as the soil keeps its own extra crops; it
multiplies the yield. Carrying the grade on the item waits for Phase 4, when products need graded materials in the Stores.
The birds are ARENA2's seagull (201:11): billboards cannot be tinted, so the game calls them birds.

**Strains.** When two ripe beds of the same crop stand side by side, harvesting one has a small chance (rising with both
beds' quality) to drop a **cross seed**. Planted, it grows a **named strain** ("Golden Ear", "Hollowroot") with one or two
traits drawn from a short list: *hardy* (half the season penalty), *quick* (−15% time), *heavy* (+1 yield), *showy* (a
contest bonus, 9.2), *sweet* (a provisioning trait). A strain is the farm's own: it gets a new sack on the seed shelf.
At most 12 strains per farm; an officer can **burn** one at the shelf to free a slot.

### 4.3 The minigames, in general

Each minigame is a pure state machine like `systems/simmerAct.js`: `tick(dt, input)` and `report()`, a score from 0 to 1,
about 10 to 25 seconds. It is drawn **on the object itself** (a wobbling furrow line, a churn's dasher, a pail
filling). Rules for all of them:

- **Optional.** The plain tool click still works. A minigame is the *better* way, not the only one.
- **Score buys care, not crops.** A score adds care points or quality to the bed, animal or batch it is played on.
- **Daily caps per character.** Each one pays its full bonus a few times a day (listed below), then a token one, so
  nobody is rewarded for an hour of the same game.
- **The server records the score on the action it rides** (one revision, as harvests are), with plausibility bounds: a
  score needs the minigame's minimum real time between its start and its commit.

### 4.4 The minigames

| Minigame | Where | Input | Score feeds | Full-bonus cap per day |
| --- | --- | --- | --- | --- |
| **Ploughing furrow** | an untilled field strip, with a stationed bear or a horse (6) | steer with A/D to keep the share on a guide line that wanders; the beast pulls on its own | tills a whole row (5 to 9 beds) at once; straightness adds care to every bed in it | 4 rows |
| **Sowing rhythm** | a tilled row, seed tool | press when the swinging hand passes the mark; seeds scatter as flats | care on each bed sown; a perfect streak saves a seed | 6 rows |
| **Weeding** | a weedy bed | weeds pop up as flats; click them before they reseed; don't hit the crop | clears the bed's weeds and adds care | 10 beds |
| **Scything** | a row of ripe grain or corn | hold to wind up, release at the bright mark; a swing clears the next bed and chains | +quality on the row; a perfect chain of 5 drops a bonus sheaf | 4 rows |
| **Crow chasing** | the field while crows have landed (8.3) | crows hop along rows; click near one to scare it; a stationed wolf helps | stops the crows' quality theft; a clean chase adds care | 3 chases |
| **Milking** | a cow in the pen | alternate two keys in the beast's rhythm; too fast and it kicks the pail | milk amount and its quality | once per animal per day (it is the animal's daily) |
| **Mucking out** | the sty or the cow pen | sweep the dung (211:3 flats) onto the cart before the pigs tread it back; the broom 214:10 in hand | contentment for every animal in the pen, and manure to the compost | once per pen per day |
| **Pig run** | the sty, when a pig gets out | herd it back through the gate before it reaches the beds; a stationed wolf herds with you | the pig's contentment; no trampled bed | when it happens |
| **Threshing** | the mill's floor | flail on the beat | +flour from the batch (7) | 3 batches |
| **Treading grapes** | the press's vat | alternate feet in time with a work song (the song the dfu-music set plays) | +must and its quality (7) | 3 batches |

All the input is the existing keys and pointer, so they also work on the mobile/touch layout where Farming Mode does
(taps for clicks, the virtual stick for A/D).

---

## 5. Livestock

### 5.1 Animals and their art

| Animal | Art | Products | Needs |
| --- | --- | --- | --- |
| Cow | 201:3 (standing), 201:4 (grazing), 4 frames each; a calf at ×0.6 | milk daily, manure | hay or grain, water |
| Horse | 201:0 (bay), 201:1 (black), 4 frames each | ploughs (as a bear does, slower), hauls the factor's wagon faster | grain, water |
| Dog | 201:9/10 (two breeds) | guards the pens (prowlers, 8.4) | scraps (any food) |
| Pig | 201:5 (walking, 4 frames), 201:6 (rooting, 3 frames) | meat for the smokehouse, manure, truffles with a stationed boar | scraps, corn |
| Cat | 201:7 (walking), 201:8 (sitting) | keeps the granary's vermin down: stored grain keeps longer | scraps |

These are every farm animal ARENA2 has (201 also holds a camel, 201:2, kept for a desert farm's drover, and a seagull,
201:11, the crows' stand-in in 8.3). **No chickens, sheep or goats exist** in ARENA2 or the vendored mods, so there are
no eggs, no shearing and no coop. Wool still comes to the loom from the Company's hides-and-wool farms.

### 5.2 Getting them

The **drover** is a wandering merchant (8.5) who comes to the farm's gate once a week with two or three animals in tow.
An officer buys it with Company gold (the Y/N question). **Every animal is the Company's**, as the beds are: any member
feeds, waters and milks it, and everything it gives goes to the Company Stores. A member who cares for it earns farm
work (10.1). Animals live in the **pens and sty** fixture: one pen holds 4 large animals, the sty 4 pigs. Members may
**name** an animal at its pen (a short name, with the same filter as character names).

### 5.3 Care

Each animal has one number, **contentment** (0 to 100), shown by how it behaves, not as a bar: content animals graze
and wander; hungry ones stand at the trough and call; unhappy ones lie down. The hover line says it in words ("Bessie.
Hungry."). Contentment rises with fed and watered days, a clean pen (mucking out) and being milked,
and falls slowly with neglect. It sets the **quality** of what the animal gives. **Animals never die or run off**: at
zero they only stop producing.

Feed comes from the farm itself (hay from grain stubble, grain, corn, scraps): the **trough** is a crate you drop feed
into, and it empties over real time. This closes the loop between crops and animals.

### 5.4 State

A new `herd` in the farm's garden JSON (or its own column if it grows too big): `{ id, kind, name, bornS, fedUntil,
wateredUntil, content, lastMilkS, ... }`, at most 16 per farm. Products are worked out on read, as crops are.

---

## 6. Sworn beasts on the farm

### 6.1 Who can come

A revenant can be **stationed** at a farm when it is:

- **sworn** to the character (`revenantCompanions.js`), not on an errand and not resting;
- of a **beast kind**: `signatureFamily(mobileType) === 'beast'` (Grizzly Bear, Sabertooth Tiger, Spider, Giant
  Scorpion, Werewolf, Wereboar, Dragonling), or a beast, vermin or fish faction (`kinPool`'s BEASTPACK, VERMIN, AQUATIC:
  Rat, Giant Bat, Slaughterfish), or an Enemy Expansion beast (Wolf, Snow Wolf, Hell Hound, Boar, Bat);
- at a farm the character's **Company holds**.

A person, an orc, an undead or a daedra is never stationed (the owner chose "sworn beasts only").

### 6.2 What each kind does

"Matching type" means each kind gets the work its nature suits:

| Kind | Farm role | It does |
| --- | --- | --- |
| **Wolf, Snow Wolf** | Herder and guard | Keeps livestock content (+5 a day); joins crow chases; fights raiders (8.2) |
| **Hell Hound** | Watch at the gate | Raiders strike this farm less often; it lights the night lanterns |
| **Grizzly Bear** | Plough beast and hauler | Pulls the plough (ploughing minigame); hauls the factor's wagon in a third less time |
| **Boar, Wereboar** | Rooter | Tills a few wild beds a day on its own; finds **truffles** (new food, rare) in mushroom beds |
| **Spider** | Silk spinner | Spins **silk** (`cloth:silk`, new or the existing material *(check professionLaw)*) on a frame by the loom; eats field pests |
| **Giant Scorpion** | Pest warden and venom | Blights spread more slowly (8.1); gives **venom** to the provisioning cauldron |
| **Rat** | Barn rat | Turns scraps into compost faster; sometimes "finds" a stray coin in the barn |
| **Giant Bat, Bat** | Night guard and guano | Guano is the best manure (soil care on the beds nearest its roost); keeps the night moths off |
| **Sabertooth Tiger** | Predator ward | No prowlers at the pens; raiders' first wave flees |
| **Werewolf** | Night watch | At night, does a wolf's guard work twice over; by day it sleeps in the barn |
| **Dragonling** | Hearth beast | Warms a **greenhouse** bed patch: out-of-climate crops grow there, and winter does not slow them; also fires the smokehouse |
| **Slaughterfish** | Fish pond | Only at a farm with water nearby: a pond fixture yields fish (`food:fish`) |

**Rank** (1 to 5) scales its output (+20% a rank). Its **art** (`revenantArts.js`) gives a farm bonus where it fits:
Mending lifts the herd's contentment, Ward shields the farm in a raid, War Cry makes the factor's wagon arrive an hour
sooner. Its **personality** (`revenantPersonality.js`) colours what it says and does: a proud one won't pull the plough
on a feast day; a devoted one works an extra hour.

### 6.3 Stationing it, without a menu

- **To station:** bring the sworn beast to the farm (it walks at your heel as now). Walk to an **empty beast post** and
  click it. The beast's line ("Grushnak sniffs the post, and lies down.") and a Y/N confirm it. It is **chained at the
  post**, then works its patch.
- **To call it back:** click it at its post. A Y/N, and it walks to your heel (or goes **away**, if your companion slots
  are full).
- **Stationed** is a new state beside *with me*, *away* and *on errand*. It **frees a companion slot** but still counts
  toward `REVENANT_RETINUE_MAX`, so the farm is no way to keep more sworn ones. It can't be sent on an errand from the
  farm without first being called back. It **never deserts** while stationed (as errands: `revenantFester` skips it).
- Each farm has a beast post per member up to **6 per farm**, and at most **2 stationed per character** across all
  farms.

### 6.4 How it stays true online

A revenant is the character's own record (save plus app storage). A farm is the Company's, on the server. Both keep
their part:

- The **character's record** gets `station: { mapId, sinceS }`.
- The **service** gets a row in a new `farm_stations` table: `map_id, player, character, revenant_id, kind, name, rank,
  art, personality, since`. The kind, rank and art are **the client's word**, as the farm's place is today (a friends'
  server), bounded to real values.
- Its work is computed **on the server** from the row, like the farm's daily reap. Goods go to the **Company Stores**;
  the character's share of renown and the beast's **loyalty** are paid back when they next load.
- Every member and visitor **sees** it: the farm read returns the farm's stations, and the client stands each as its
  own kind's sprite with its revenant name (the foe sprite path the revenant already uses, at a calm idle in its patch).
- If the character **leaves the Company**, or the farm is **lost**, the row is dropped and the beast goes **away** on
  the character's next load ("Grushnak has come home from the farm.").
- If the save and the row disagree (an older save loaded), the **server row wins** for where it is; the record's
  revision (`revenant.js`'s merge) wins for everything about the beast itself.

---

## 7. Crafting chains: the workshop yard

Each workshop is a fixture you build (3.2), with an **input crate**, a **working part** you can see move, and an
**output shelf**. Goods dropped into the crate are processed over **real time** on the server. Collect them from the
shelf, or the shelf **empties into the Stores** after a day so nothing is lost. Each has an optional minigame (4.4) that
lifts a batch's quality.

| Workshop | In | Out | Time | Seen working | Art |
| --- | --- | --- | --- | --- | --- |
| **Windmill** | grain, corn | flour, cornmeal | 2 h/batch | blades turn (the vendored mesh); the millstones 211:16/17 turn inside (`windmillInterior.js`) | windmills-kamer |
| **Press** | grapes, sunflower seeds, apples | must → wine, oil, cider | 6 h; wine ages 3 days | the screw turns, the vat fills | barrels 205:0, buckets 205:29/30, the wheel 211:15 as the press's screw |
| **Dairy churn** | milk | butter, cheese (wheel, soft) | 4 h; cheese ages 2 days | the dasher bobs; wheels appear on the shelf | DET 10021 cheese flats |
| **Smokehouse** | meat, fish | smoked meat, smoked fish (slower spoilage) | 8 h | smoke from the chimney | hanging meats 211:40 and 211:43-46 on the tripods 211:13/14, smoke particles |
| **Loom** | wool, flax, silk | cloth bolts (wool, linen, silk) | 3 h | the shuttle moves | 204 cloth flat |
| **Brewery** | grain, honey (the Grocers' pantry), berries | ale, mead, berry wine | 12 h | a bubbling vat | barrels |

**Outputs feed the systems we already have:**

- Food goes into **Provisioning** as ingredients with traits (flour, cheese, butter, wine, berries, smoked meat). Their
  traits are written into `provisionLaw.js`'s ingredient table, and farm quality raises them as rank does.
- Cloth (wool, linen, silk), wax and oil are **Outfitting and Enchanting materials** where the crafting rework has slots
  for them (`docs/CRAFTING.md`).
- Every product can fill **orders**: the order post gets **product orders** too (barrels of ale for a tavern, cheese for
  a castle) that pay better than raw crops and rotate weekly.

New items take **existing DFU pictures** (the way `professionLaw.js` borrows TEXTURE.254 records), never new art.

---

## 8. Events and threats

All threats are **visible on the farm** before they bite, can be **answered by doing something there**, and cost at most
a share of quality or yield (rule 4).

### 8.1 Blight

A planted bed has a small daily chance to catch blight, higher when the same crop has stood in it three times running.
Blight shows as **yellowed, drooping plants** and spreads to a neighbouring bed of the same crop each half day. Treat it
by **pulling the sick plants** (a click per bed: the bed is lost to replanting but stops the spread) or with a **blight
draught** brewed in Provisioning (a new recipe). **Crop rotation**, a different crop in the bed than last time, halves
the chance. A stationed scorpion slows the spread.

### 8.2 Raids

The Raiding Parties port (`raidingParties.js`) already rolls the day's raids from the world's own generator, the same
for every player. Farms join the roll as targets:

- A Company farm in a raided region can be struck (bandits, or orcs in orc country), at most **once a week per farm**,
  with the raid's hours shown in advance on the **order post** ("Bandits seen on the Wayrest road").
- **Only while a member is there** (the owner's choice). The raid's window is a threat, not a clock: it begins when a
  member of the Company is at the farm during the window, and passes harmlessly if nobody comes. Nobody loses anything
  while everyone is away.
- While the raid runs, raiders spawn at the farm's edge and go for the **sacks, the workshop shelves and the animals**.
- Members who are there defend; **stationed beasts fight** (wolves, tigers, hounds). The raid ends when enough raiders fall
  or after its two hours.
- **Loss if undefended:** up to a quarter of what is on the shelves and in uncollected sacks, and ripe beds trampled to
  Common quality. **Never** the Stores, never an animal, never a beast.
- **Driven off:** the Raiding Parties reputation reward, and the Company's renown.

### 8.3 Crows and pests

Crows (the seagull 201:11, darkened in code to a crow's black) land on ripening fields a few times a day and
**hop along the rows**, eating quality from each bed they sit on. A **scarecrow** fixture keeps them off its quarter of
the field. The crow chase minigame (4.4) and stationed wolves and bats clear them.

### 8.4 Prowlers at the pens

At night, now and then, a wild wolf (the Enemy Expansion's Wolf, already in the game) slinks toward the pens and
frightens the animals: their contentment drops for the next day. A dog, a tiger or a stationed wolf stops it. Seen
early, it can be chased off by walking at it. It never takes an animal.

### 8.5 Weather and wanderers

- **Rain** waters every outdoor bed (the weather system's rain, read on the world clock): free water, visible on the soil.
- **Hail or storm** flattens **ripe** beds left unharvested past half a day: they drop a quality level. Harvest in time.
- **Drought** (a long dry spell in summer, desert climates) makes beds dry twice as fast unless irrigated.
- **The drover** (5.2), the **seed peddler** (rare seeds of another climate, sometimes a strain from another farm) and
  the **tinker** (repairs nothing, sells farm decorations for the market green) are NPC flats who arrive at the gate on a
  weekly world roll, stay a day, and are walked up to and talked with (DFU's talk line, one Y/N per purchase).

---

## 9. Market day

### 9.1 Every farm, once a week

Every Company farm holds a **market day once a week**. Each farm's weekday is set by its `mapId` and the days are spread
out, so on most days some farm in the Bay is holding one and players can travel from market to market. It runs for that
whole **UTC day**.

- In the morning the **market green** fills: the climates-calories tent, **stalls** with goods stacked on them (the
  workshops' cheese wheels, sacks, barrels, bundles), **bunting in the Company's colours**, a cooking fire, a show ring
  fenced off in the field, and a crowd of villagers (the town crowd's flats) who come up the road.
- The farm's **order post** announces it the day before ("Market at Old Morgorya's tomorrow"). Towns within a day's
  ride hear it from the crier, and the map marks it (the bounty and lode marks' pattern).
- **Visitors from anywhere** walk in. Farming Mode is the Company's, but on market day the **gate** lets anyone enter it
  for the market green alone: the stalls, the judging tables and the show ring. The beds, pens, workshops and posts stay
  the members'.
- At dusk the judge (an NPC flat) walks along the tables, ribbons appear, the lanterns light, and the crowd goes home
  down the road.

### 9.2 What happens at the market

- **The farm's stalls sell.** Members stock a stall with Company goods, carried there as sacks (the same carrying as the
  wagon). Visitors buy at the stall, paying gold into the Company's treasury. Prices sit a little above the shops', so a
  farm earns a modest income without a new faucet (12).
- **Contests.** Each market holds three, drawn from the table below on the farm's seed and the week, so markets differ.
  Visitors and the host Company's members may enter any.

| Contest | Entry | Judged by |
| --- | --- | --- |
| **Heaviest sheaf** | a harvested crop item | quality, a *showy* strain's bonus, a small random |
| **Best in show** | one of a Company's animals, led into the ring by a member | its contentment over the week, its products' quality |
| **The beast show** | a sworn beast, led in by its owner | rank, care at its farm, its art; the crowd reacts to its kind |
| **The pie and the pot** | a Provisioning dish | its traits' strength and the farm-quality of its ingredients |
| **The brewers' bench** | an ale, mead, wine or cider | quality and age |
| **Ploughing match** | the ploughing minigame, live, on a marked strip | straightness and time; three tries |
| **Scything race** | the scything minigame on a market row | chain length and time |

- **Entering** is placing your entry on that contest's **judging table**, or walking your animal into the ring.

### 9.3 Prizes

- **Ribbons** (blue, red, white) as items, hangable in a home (the decor system), naming the contest, the farm and the
  week.
- A ribbon's **farm work** (10.1). Ribbons count for titles at most **three a week** per account, so markets reward
  turning up, not farming one contest.
- **No Argents** from markets: the Company farms' weekly Argent cap stays for orders. Gold prizes are small and come
  from the host farm's stall takings (a tenth of the day's sales goes to the prize pot).
- The **host Company's** reward is its stalls' income, and renown for each visitor who bought something.
- Entries go back to their owners at the close.

### 9.4 State

New tables `farm_markets` (map id, day, contests, takings, judged), `farm_market_entries` (market, contest, player,
character, entry snapshot, score) and `farm_stalls` (market, slot, material, qty, price). The market's day comes from the
law (the farm's seed), so the service only writes a row when something happens. Judging runs on the first read after
the day closes, once, with a claimed revision so it pays once.

---

## 10. Rewards: three titles and an aura

The owner asked for rewards: **three titles earned by grinding the farm, and one of the breaches' unused auras with the
last one.**

### 10.1 Farm work, the one count

Titles need a number that only goes up and measures **time put into the farm**, all of it, not one loop. Each account
gets **farm work** points, kept by the service (they are never the client's word):

| Earned by | Points |
| --- | ---: |
| *(added as built)* each bed hoed, planted or watered by your hand | 1 |
| each crop unit harvested by your own hand | 1 |
| each sack carried to the factor's wagon (3.3) | 2 |
| a minigame played to its full bonus (4.4, within its daily cap) | 5 |
| an animal fed, watered, milked or mucked out, once per animal per day | 3 |
| a workshop batch started from your own goods | 10 |
| a fixture's building paid for, or materials brought to it | 10 |
| a raid on your farm driven off with you there | 50 |
| a market-day ribbon, blue, red, white (at most three a week) | 100 / 60 / 30 |

- A **daily cap of 400 points** an account (UTC day), so the titles measure days spent on the farm, not one long session
  or a script. Points past the cap still count toward everything else (orders, quality); they just don't count for titles.
- Points are counted **per account**, across all its characters and all its Company's farms. Leaving a Company keeps
  them.
- They are awarded in the **same transaction** as the action that earns them (the harvest, the delivery, the batch),
  so a retried request never pays twice. This is how harvest credits already work.

### 10.2 The titles

Each one is a key added to `TITLES` (`src/net/identityToken.js`). Like the Marks of Mastery, it is **derived by the
service** from the account's points (`server-account/src/titles.js`), so it can't be granted by the client and never
needs a migration to award:

| Title | Key | Farm work | About (at the daily cap) |
| --- | --- | ---: | --- |
| **Furrowhand** | `furrowhand` | 3,000 | about 1 to 2 weeks of steady play |
| **Harvestwarden** | `harvestwarden` | 15,000 | about 1.5 months |
| **Sovereign of the Sheaf** | `sheafsovereign` | 45,000 | about 4 months |

The owner chose these (half the first draft's) for a small group. They are tunable in the law file.

**Diegetic, as everything else:** the farm acknowledges a title where it happens. When you cross a threshold, the
factor (or the foreman, if the factor is away) says it in the HUD's message line ("They're calling you Harvestwarden in
Wayrest now."). The title then shows above your name, worn the usual way. Your farm work is **read in the estate ledger**
(3.4) as one of its spoken lines ("You have worked 41,200 hours of this land's ledger."), never as a bar.

### 10.3 The aura: one of the breaches'

Both breaches are switched off (`src/systems/contentOff.js`: `eliteBreach: false`, `dagonBreaches: false`). With them
off, these auras can't be earned:

| Aura | Look (`render/auraRing.js`) | Its source | Reachable today? |
| --- | --- | --- | --- |
| **First Light** `firstlight` | the dawn's ring at the feet, a veil of light | Elite Breach: First of the Spire | **No** |
| **The Burning Stair** `burningstair` | a stair at the feet, embers falling | Elite Breach: Wellhead-Walker (Redoubt 20) | **No** |
| **Dagon's Fire** `dagonfire` | a ring of fire, flames licking up | Dagon's Breaches: Sigil Broker, for Sigil Stones | **No** (no gates, no stones) |
| Beaconlight `beaconlight` | beacons at the feet | Elite Breach: Kynbane; **also** the Legendary Bartender | yes, by the bar |

**Chosen: First Light** (the owner, 2026-11-19), a dawn's ring, which fits the farmer's day.

- The aura is held while the account holds `sheafsovereign`: one line in `server-account/src/titles.js`'s held auras,
  beside the existing `EG_HONOUR_AURA` and bartender lines. It is not stored on its own.
- If the breach is switched back on, its old path also grants the aura. The held list already de-duplicates, so nothing
  conflicts.
- No art work is needed: the aura's look is already drawn and shipped.

---

## 11. Server, data and laws

New pure laws, both ends read them (`src/net/farm/`):

| File | Holds |
| --- | --- |
| `farmsteadLaw.js` | fixtures, their costs and build times, their order |
| `cropLaw.js` | crops, seasons, strains, quality, blight (extends `farmGardenLaw.js`) |
| `herdLaw.js` | animals, contentment, products |
| `stationLaw.js` | who can be stationed, each kind's role and numbers |
| `workshopLaw.js` | recipes, times, quality |
| `threatLaw.js` | blight, raids on farms, crows, prowlers, weather effects |
| `marketLaw.js` | each farm's market day, its contests, stalls, scoring, prizes |
| `farmGameLaw.js` | each minigame's state machine and score bounds |

Service: `server-account/src/farms.js` grows by modules beside it (`farmStead.js`, `farmHerd.js`, `farmStations.js`,
`farmWorkshops.js`, `farmMarkets.js`, `farmWork.js`). Migrations: `farm_fixtures`, `farm_stations`, `farm_workshops`,
`farm_markets`, `farm_market_entries`, `farm_stalls`, `farm_work` (the per-account points and the day's count for the cap, 10.1). The herd
stays in the garden JSON unless it grows too big.

### 11.1 Every route, accounted for

A route the account service handles but doesn't list in `ROUTES` answers `not-found` before its handler runs. This has
bitten the project before. So the expansion's routes are fixed here, in one table, before any is written. **Each one
lands in three places in the same commit:** the handler in `server-account/src/index.js`, the path in `ROUTES` in
`server-account/src/service.js` (on the `farms` line, 401), and the client call in `src/net/accountClient.js` (beside
the farm calls at 1374-1379).

| Route | Phase | Handler (module) | Does | Who |
| --- | --- | --- | --- | --- |
| `/v1/farms` | (exists) | `farms.js` farmsRead | the map's farms; a member's own | any |
| `/v1/farms/buy`, `/crop`, `/release`, `/chore` | (exist) | `farms.js` | as today | officers / members |
| `/v1/farms/garden` | (exists, grows) | `farmGardens.js` | the one farm read (11, "One read") and bed ops; new ops `weed`, `scythe`, `sow-row`, `plough`, `pull-blight`, `crow`, each with an optional minigame `score` | members to act, anyone to read |
| `/v1/farms/build` | 1 | `farmStead.js` | pay for a fixture; bring materials to it | officers pay, members bring |
| `/v1/farms/garden` op `haul` | 1 (built) | `farmGardens.js` with `src/net/farm/haulLaw.js` | sacks carried to the wagon. *As built,* a new op on the existing garden route, not a new route, so it shares the garden's one revision; shipping stays the `deliver` op, asked at the wagon | members |
| `/v1/farms/herd` | 3 | `farmHerd.js` | buy from the drover; feed, water, milk, muck out, herd a pig back | members (officers for Company gold) |
| `/v1/farms/workshop` | 4 | `farmWorkshops.js` | fill a workshop's crate; collect its shelf | members |
| `/v1/farms/station` | 5 | `farmStations.js` | station a sworn beast; recall it | the beast's owner |
| `/v1/farms/threat` | 6 | `farmStead.js` | a raid's result at its end (raiders slain, who stood) | members there |
| `/v1/farms/market` | 7 | `farmMarkets.js` | read the market; stock and price a stall; buy from one; enter and withdraw a contest entry | members stock, anyone buys and enters |

Farm work points (10.1) and the titles need **no route of their own**. Points are written by the routes above, inside
their own transactions, and titles are derived by the existing titles read.

**Checked both ways.** `node tools/routesCheck.mjs` now also checks the other direction (changed with this document):
every `/v1/...` path the client names must be one the account service lists (`ROUTES`, or the POI prefix that
`poiPathOf` answers), or one the relay serves. Today it reports all 338 handled routes listed and all 456 client paths
served. It runs before every push that touches a route, alongside lint and `npm run build`.

**One read, one revision.** The farm read returns garden, fixtures, herd, stations, workshops and the current threat in
one response with one revision, so the existing ~1 s observer poll keeps working and sends the small unchanged answer
when nothing moved.

Client modules, each wired by `farmingMode.js` or the farm observer, never by a host: `world/farm/farmstead.js`
(layout), `world/farm/fixtureArt.js`, `world/farm/herdArt.js`, `world/farm/beastPosts.js`,
`world/farm/workshopArt.js`, `world/farm/threatArt.js`, `world/farm/marketGreen.js`, `world/farm/farmParticles.js`,
`world/farm/farmWind.js`, and `scenes/farm/farmGames.js` for
minigame input and drawing.

---

## 12. Balance

- **No new gold or Argent faucet beyond the caps we have.** Orders keep the 600 Argent per Company per week cap.
  Product orders share it; markets pay no Argents. Gold from orders is checked against the wealth budget
  (`server-account/src/budget.js`).
- **Quality and variety over volume.** The new value is in Prize goods, strains and products, which feed Provisioning
  and crafting, not in more raw grain.
- **Daily caps** on every minigame (4.4) and a weekly cap on raids per farm.
- **Beasts don't print money.** A stationed beast's output is about what an animal of the same work gives, a little more
  by rank. Its worth is what only it can do (silk, truffles, greenhouse, guard).
- **Numbers above are first guesses** to be tuned on the live server with the group.

---

## 13. Phases

Each phase ships on its own, behind its `contentOff` flag, with a `CHANGELOG.md` line.

1. **The farm as a place.** Farmstead layout, order post, factor's wagon, ledger, seed shelf, tool rack, visible
   upgrades. The graphics pass on beds (furrows, wet soil, plants, weeds, seasons, night). **Removes the orders
   sidebar.**
2. **Hands on the land.** Farm work points and the three titles with their aura (10) start counting here. New crops by
   climate, the four quality levels, strains, and the field minigames (sowing,
   weeding, scything, crows).
3. **Livestock.** Pens and sty, the drover, horses, cows, pigs, dogs and cats, care, milking, mucking out, the trough.
4. **Workshops.** Windmill, churn, press, loom, smokehouse, brewery; product orders; Provisioning and crafting
   hooks.
5. **Sworn beasts.** Beast posts, stationing, the kind roles, server stations, ploughing with a beast.
6. **Threats.** Blight, crows and prowlers, weather, raids on farms.
7. **Market day.** The market green on every farm each week, stalls, contests and ribbons.

---

## 14. Open questions for the owner

All answered (2026-11-19); see *Decisions taken*. The art check is done (Appendix A). The farm sounds are chosen at the
start of Phase 1 from the vendored sound sets.

---

## Appendix A. The art register

Checked by eye on 2026-11-19 against the owner's ARENA2 files, with `node tools/farmArtSheet.mjs <arena2> <out>`, which
draws a labelled contact sheet of each archive (it reads the game's files and writes PNGs outside the repo).

| Archive | Records used | What they are |
| --- | --- | --- |
| **201** animals | 0, 1 horses (4 frames); 3 cow, 4 grazing cow (4 frames); 5 pig walking (4), 6 pig rooting (3); 7 cat walking, 8 cat sitting; 9, 10 dogs; 11 seagull (crows); 2 camel (a desert drover) | every farm animal there is: no chicken, sheep or goat |
| **205** clutter | 0 barrel; 9, 10 baskets (empty, full); 17-20 sacks; 24-26 crates and stacks; 27, 28 carts; 29, 30 buckets | sacks, the wagon's cargo, the stalls' goods |
| **211** fixtures | 1 quill and ink; 3 dung heap with flies; 11 hanging bundle; 13, 14 tripods; 15-17 wheels and millstones; (18, 19 are stocks, not shelves: unused); 20 **scarecrow**; 31 wooden block; 40 ham; 43-46 hanging cloths and meats | the ledger, the seed shelf, the smokehouse, the mill |
| **212** yard | 0 well; 1 **haystack**; 4, 5 hanging signboards; 6 signpost; 7 dark heap; 8, 9 hand pumps; 10 post; 11, 12 woodpiles; 13, 14 posts | the order post, the compost, the pens' posts, the water |
| **213** plants | 0 gourd; 1 tomato; 2-6 potted plants (the porch, the market stalls) | ripe fruit on the ground |
| **214** tools | 0 shovel; 1 rake; 4 spade; 5 lantern on a pole; 6 pick; 7 hoe; 10 broom; 11 pail; 14 shears | the tool rack, the lanterns, the belt's tools |
| **254** items | 11, 12, 16-18 berries and flowers; 24-33 roses and blooms | the market's flower stalls, ribbons' rosettes |
| **301** crops | 0, 1 wheat shocks; 2 corn; 3, 4 sunflowers; 5, 11, 14 berry bushes; 6 hay shock; 7-9 climbing vines; 10 low leafy row (mushroom beds); 12, 20, 23 low plants and weeds; 15 blue flowers (flax); 16, 17 flowers; 18 **cabbage**; 19, 21 tall grain | every crop stage and weed |
| **302** ground | 1 dirt; 2 grass; **54 ploughed furrows** | tilled beds: 302:54 replaces the plain dirt 302:1 under worked beds |

**Not in the data, so left out:** chickens, sheep, goats, beehives, a fence flat (the pens use posts with rails drawn in
code), a lectern (the ledger is a quill on a block), a mushroom sprite (mushroom beds keep 301:10).
