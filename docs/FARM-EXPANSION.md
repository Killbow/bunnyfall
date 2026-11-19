# The Farm Expansion

Status: **design draft for review** (2026-11-19). Nothing here is built yet. It extends the Company farms
(`docs/FARMING.md`, `src/net/farmLaw.js`) and Farming Mode (`src/scenes/farmingMode.js`).

## Decisions taken

- **Design first.** This document is reviewed before any code.
- **Art is ARENA2 and the vendored DFU mods only.** No new hand-made sprites and no new meshes beyond the ones already
  vendored (the windmill, the carts, the tent). Records this document names without a source in the repo are marked
  *(confirm)*: the data could not be read while writing it, and each must be checked against `ARENA2_PATH` before use.
- **Four content pillars:** hands-on farm work, fairs and contests, crafting chains, farm events and threats.
- **Revenants:** only **sworn** revenants of a **beast** kind can be stationed at a farm, each doing the work its kind
  suits.
- **It lives on the farm, not in menus** (the owner, mid-design: "avoid making this all menus, I want this to live on
  the farm diegetically"). This is the first rule below and it overrides convenience everywhere.
- **Rewards:** three titles earned by grinding the farm (Furrowhand, Harvestwarden, Sovereign of the Sheaf) at
  3,000 / 15,000 / 45,000 farm work, and the Elite Breach's **First Light** aura with the last one (section 10).
- **Work in Farming Mode only.** The farm is *seen* by everyone in the normal view; its stations are *used* from the
  Farming Mode camera.
- **Raids strike only while a Company member is at the farm.** Nobody loses goods while everyone is away.

---

## 1. The rules of the expansion

1. **Diegetic first.** Every feature is a *thing on the farm* you walk up to and use: a post, a crate, a pen, a wagon, a
   hive. There are no new panels, pages, sidebars or lists. What a screen may still show:
   - the **tool belt** (it is your hands: what you hold);
   - a **hover line** in the world-tooltips style ("Grushnak the Scarred, ploughing. Content.");
   - **short spoken lines and notices** in the HUD's normal message line;
   - DFU's own **Y/N question** for one thing only: spending Company gold or Argents (an officer's confirmation), because
     money must never move on a stray click;
   - a minigame's **in-world gauge** (drawn on or above the object, like a meter on the churn), never a modal window.
   The current **Progress & orders** sidebar (`src/ui/farmProgressHud.js`) is replaced by things on the farm (section 3).
2. **Seen in the normal view, worked in Farming Mode.** Fixtures, animals, sworn beasts, weeds, crows and fairs are
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
   `farmThreats`, `farmFairs`, `farmMinigames`), so a phase can ship and be pulled back alone.

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
| **Order post** | 1x1 | a signpost flat, nailed notices (paper flats *(confirm)*) | Weekly orders (3.3) |
| **Factor's wagon** | 3x5 | horse-cart-and-cargo's cart + a 201 horse, sacks 205:17 | Ships orders (3.3) |
| **Estate ledger** | 1x1 | a lectern/book flat *(confirm)* in the porch | Read-only farm record (3.4) |
| **Seed shelf** | 1x2 | sacks 205:17, baskets *(confirm)* | Picking a seed (3.5) |
| **Tool rack** | 1x2 | the tools as flats *(confirm: 205/207 records)* | Upgrades made visible (3.6) |
| **Well and trough** | 2x2 | 212:0/2/8/9 wells, troughs 41220-41222 | Water; irrigation (3.6) |
| **Compost heap** | 2x2 | grain pile (DET 10024:1), dung *(confirm)* | Soil; manure in (3.6) |
| **Pens and coop** | 6x8 | fences (RMB fence models *(confirm)*), hay (DET 10024:0) | Livestock (5) |
| **Beast posts** | 2x2 each | a stake and chain, a kennel or straw bed | Sworn beasts (6) |
| **Workshop yard** | 8x8 | mill, press, churn, smokehouse, loom (7) | Crafting chains (7) |
| **Apiary** | 3x3 | hive flats *(confirm)*, flowers 254 | Bees (4.7) |
| **Scarecrow** | 1x1 | a person flat on a pole *(confirm)* | Crows (8.3) |
| **Fair ground** | a field | tent model (climates-calories), banners | Fairs (9) |

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
  already draws fullness) credits them to an open order with a small **haulage bonus** in Company renown.
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
  vines 7/8, desert plant 2/20. Mushrooms get a real progression: a small cap, then a cluster, then a large cluster (301:10
  scaled, plus the dungeon mushroom flats *(confirm: 213/254)*).
- **Weeds.** A bed left dry for a day grows weed flats (301 shrub records *(confirm)*) around its plants. They are shown
  and they can be weeded (4.4). They slow growth, never stop it.
- **Ripe crops** catch the light: a faint warm tint and, at dusk, a few fireflies (the dust motes the heat-haze mod
  draws, if usable *(confirm)*). No glowing UI markers.
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
| Cabbage | 10 | the DET cabbage flat 10021:16 | `food:cabbage` | woodland, mountain |
| Flax | 20 | a tall reed record *(confirm)* | `fiber:flax` (new), cloth at the loom | woodland, swamp |
| Desert root | 16 | 2/20 | `food:root` (new) | desert |

**Seasons scale growth:** in season ×1.0, off season ×0.7, winter outdoors ×0.4 (never zero: crops pause, never die).

**Quality** gains a fourth level. Today a bed has 0, 1 or 2 from soil. It becomes **Common, Fine, Choice, Prize**,
worked out at harvest from:

- the soil level at planting (as today);
- **care points** on the bed: watered before it dried, weeded, crows kept off, a minigame done well on it;
- the strain's own bonus.

Quality multiplies yield (×1, ×1.25, ×1.5, ×2) and is carried on the item as provisioning ingredients carry ranks, so a
Prize grain makes a better loaf in the pot (`docs/PROVISIONING.md`: a better ingredient raises the dish).

**Strains.** When two ripe beds of the same crop stand side by side, harvesting one has a small chance (rising with both
beds' quality) to drop a **cross seed**. Planted, it grows a **named strain** ("Golden Ear", "Hollowroot") with one or two
traits drawn from a short list: *hardy* (half the season penalty), *quick* (−15% time), *heavy* (+1 yield), *showy* (a
contest bonus, 9.2), *sweet* (a provisioning trait). A strain is the farm's own: it gets a new sack on the seed shelf.
At most 12 strains per farm; an officer can **burn** one at the shelf to free a slot.

### 4.3 The minigames, in general

Each minigame is a pure state machine like `systems/simmerAct.js`: `tick(dt, input)` and `report()`, a score from 0 to 1,
about 10 to 25 seconds. It is drawn **on the object itself** (a wobbling furrow line, a swarm about the hive, a pail
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
| **Milking** | a cow or goat in the pen | alternate two keys in the beast's rhythm; too fast and it kicks the pail | milk amount and its quality | once per animal per day (it is the animal's daily) |
| **Shearing** | a sheep in the pen | trace the sheep's shape with the cursor; nicks lower the score | wool amount and quality | once per sheep per two days |
| **Smoking the hive** | the apiary | hold to puff smoke and keep the swarm in a calm band (the Simmer's shape), then lift the frame | honey and wax, quality | once per hive per day |
| **Egg gathering** | the coop | eggs hidden in straw flats; find them before the hens resettle | eggs and a chance of a double yolk | once per day |
| **Threshing** | the mill's floor | flail on the beat | +flour from the batch (7) | 3 batches |
| **Treading grapes** | the press's vat | alternate feet in time with a work song (the song the dfu-music set plays) | +must and its quality (7) | 3 batches |

All the input is the existing keys and pointer, so they also work on the mobile/touch layout where Farming Mode does
(taps for clicks, the virtual stick for A/D).

---

## 5. Livestock

### 5.1 Animals and their art

| Animal | Art | Products | Needs |
| --- | --- | --- | --- |
| Cow | 201:3 (cow), 201:4 (calf), 201:3 ×1.1 (bull) | milk daily, manure | hay or grain, water |
| Horse | 201:0/1 | ploughs (as a bear does, slower), hauls the factor's wagon faster | grain, water |
| Dog | 201:9/10 | guards the coop (foxes, 8.4) | scraps (any food) |
| Pig | 201 *(confirm record)* | meat on market day, truffles with a boar beside it | scraps |
| Chicken | *(confirm: a bird flat in 201 or a mod)* | eggs | grain |
| Sheep / goat | *(confirm)* | wool / goat milk | hay |

An animal with no ARENA2 or mod sprite is **left out** rather than drawn as a stand-in. The list above shrinks to what
the data really has.

### 5.2 Getting them

The **drover** is a wandering merchant (8.5) who comes to the farm's gate once a week with two or three animals in tow.
You walk up and buy one (a personal or Company purchase; the Company's is an officer's Y/N). Animals live in the **pens
and coop** fixture: one pen holds 4 large animals, one coop 8 birds.

### 5.3 Care

Each animal has one number, **contentment** (0 to 100), shown by how it behaves, not as a bar: content animals graze
and wander; hungry ones stand at the trough and call; unhappy ones lie down. The hover line says it in words ("Bessie.
Hungry."). Contentment rises with fed and watered days, a clean pen (the muck-out click) and being milked or sheared,
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
| **Grizzly Bear** | Plough beast and honey thief | Pulls the plough (ploughing minigame); the apiary gives more honey, but a hive is now and then raided (honey taken, the bear content) |
| **Boar, Wereboar** | Rooter | Tills a few wild beds a day on its own; finds **truffles** (new food, rare) in mushroom beds |
| **Spider** | Silk spinner | Spins **silk** (`cloth:silk`, new or the existing material *(check professionLaw)*) on a frame by the loom; eats field pests |
| **Giant Scorpion** | Pest warden and venom | Blights spread more slowly (8.1); gives **venom** to the provisioning cauldron |
| **Rat** | Barn rat | Turns scraps into compost faster; sometimes "finds" a stray coin in the barn |
| **Giant Bat, Bat** | Night guard and guano | Guano is the best manure (soil care on the beds nearest its roost); keeps the night moths off |
| **Sabertooth Tiger** | Predator ward | No foxes at the coop; raiders' first wave flees |
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
| **Windmill** | grain, corn | flour, cornmeal | 2 h/batch | blades turn (the vendored mesh); the interior already exists (`windmillInterior.js`) | windmills-kamer |
| **Press** | grapes, sunflower seeds, apples | must → wine, oil, cider | 6 h; wine ages 3 days | the screw turns, the vat fills | barrels, a vat *(confirm)* |
| **Dairy churn** | milk | butter, cheese (wheel, soft) | 4 h; cheese ages 2 days | the dasher bobs; wheels appear on the shelf | DET 10021 cheese flats |
| **Smokehouse** | meat, fish | smoked meat, smoked fish (slower spoilage) | 8 h | smoke from the chimney | a shed model *(confirm)*, smoke particles |
| **Loom** | wool, flax, silk | cloth bolts (wool, linen, silk) | 3 h | the shuttle moves | 204 cloth flat |
| **Brewery** | grain, honey | ale, mead | 12 h | a bubbling vat | barrels |
| **Apiary** | flowers nearby | honey, wax (→ candles at the workshop) | daily | bees as motes | hive *(confirm)* |

**Outputs feed the systems we already have:**

- Food goes into **Provisioning** as ingredients with traits (flour, cheese, butter, wine, honey, smoked meat). Their
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

Crows (bird flats *(confirm: 201 seagull or an Enemy Expansion bird)*) land on ripening fields a few times a day and
**hop along the rows**, eating quality from each bed they sit on. A **scarecrow** fixture keeps them off its quarter of
the field. The crow chase minigame (4.4) and stationed wolves and bats clear them.

### 8.4 Foxes at the coop

At night, now and then, a fox (a wolf sprite at small scale, or a DEX animal *(confirm)*) comes for the coop and takes
eggs. A dog, tiger or wolf stationed nearby stops it. Seen early, it can be chased off by walking at it.

### 8.5 Weather and wanderers

- **Rain** waters every outdoor bed (the weather system's rain, read on the world clock): free water, visible on the soil.
- **Hail or storm** flattens **ripe** beds left unharvested past half a day: they drop a quality level. Harvest in time.
- **Drought** (a long dry spell in summer, desert climates) makes beds dry twice as fast unless irrigated.
- **The drover** (5.2), the **seed peddler** (rare seeds of another climate, sometimes a strain from another farm) and
  the **tinker** (repairs nothing, sells farm decorations for the fair ground) are NPC flats who arrive at the gate on a
  weekly world roll, stay a day, and are walked up to and talked with (DFU's talk line, one Y/N per purchase).

---

## 9. Fairs and contests

### 9.1 The Harvest Fair

Once a **season** (by the world's calendar), a **fair** is pitched on one Company farm, chosen in rotation among farms
whose Company opts in at the order post. It stands for **three real days**:

- The farm's fair ground fills with **tents** (climates-calories' tent model), **banners in each Company's heraldry**,
  stalls and wandering villagers (the town crowd's flats).
- Anyone can walk in, members of any Company or none. Its location is cried in towns and marked on the map (the bounty
  and lode map marks' pattern).
- **Entering** is placing your entry on the right **judging table**, a physical table per contest.
- **Visitors at the fair.** Farming Mode is for the farm's own Company, but while a fair stands its **gate** lets
  anyone enter Farming Mode **for the fair ground alone**: the judging tables, the show ring and the match strips. The
  beds, pens, workshops and posts stay the members' own.
- At the close, a **judge** (an NPC flat) walks along the tables, and ribbons appear on the winners' entries.

### 9.2 The contests

| Contest | Entry | Judged by |
| --- | --- | --- |
| **Heaviest sheaf / biggest gourd** | a harvested crop item | quality + a *showy* strain's bonus + a small random |
| **Best in show** | an animal led into the show ring | its contentment over the last week, its quality products |
| **The beast show** | a stationed sworn beast, led in | rank, its farm's care, its art; a crowd reacts to its kind |
| **The pie and the pot** | a Provisioning dish | its traits' strength and the farm-quality of its ingredients |
| **The brewers' bench** | an ale, mead, wine or cider | its quality and its age |
| **Ploughing match** | the ploughing minigame, live, on a marked strip | straightness and time; three tries each |
| **Scything race** | the scything minigame on a fair row | chain length and time |

### 9.3 Prizes

- **Ribbons** (blue, red, white) as items that can be **hung in a home** (the decor system), named with the contest, the
  season and the winner.
- A Company **trophy** that stands on the winning farm until the next fair (a statue flat, 202:4).
- Argents within the farms' **weekly cap** (no new faucet), and renown.
- Entries go back to their owners at the close (an animal walks home; a dish returns to the pack).

### 9.4 State

New table `farm_fairs` (season, host farm, opens, closes) and `farm_fair_entries` (fair, contest, player, character,
entry snapshot, score). Judging is done by the service at the close, once, with a claimed revision so it pays once.

---

## 10. Rewards: three titles and an aura

The owner asked for rewards: **three titles earned by grinding the farm, and one of the breaches' unused auras with the
last one.**

### 10.1 Farm work, the one count

Titles need a number that only goes up and measures **time put into the farm**, all of it, not one loop. Each account
gets **farm work** points, kept by the service (they are never the client's word):

| Earned by | Points |
| --- | ---: |
| each crop unit harvested by your own hand | 1 |
| each sack carried to the factor's wagon (3.3) | 2 |
| a minigame played to its full bonus (4.4, within its daily cap) | 5 |
| an animal fed, milked, sheared or mucked out, once per animal per day | 3 |
| a workshop batch started from your own goods | 10 |
| a fixture's building paid for, or materials brought to it | 10 |
| a raid on your farm driven off with you there | 50 |
| a fair ribbon (blue, red, white) | 100 / 60 / 30 |

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
| `threatLaw.js` | blight, raids on farms, crows, foxes, weather effects |
| `fairLaw.js` | contests, scoring, prizes |
| `farmGameLaw.js` | each minigame's state machine and score bounds |

Service: `server-account/src/farms.js` grows by modules beside it (`farmStead.js`, `farmHerd.js`, `farmStations.js`,
`farmWorkshops.js`, `farmFairs.js`, `farmWork.js`). Migrations: `farm_fixtures`, `farm_stations`, `farm_workshops`,
`farm_fairs`, `farm_fair_entries`, `farm_work` (the per-account points and the day's count for the cap, 10.1). The herd
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
| `/v1/farms/ship` | 1 | `farmStead.js` | carry sacks to the wagon; dispatch a full order (replaces the garden's `deliver` op, which stays a while for old clients) | members carry, officers dispatch |
| `/v1/farms/herd` | 3 | `farmHerd.js` | buy from the drover; feed, water, milk, shear, muck out, gather eggs | members (officers for Company gold) |
| `/v1/farms/workshop` | 4 | `farmWorkshops.js` | fill a workshop's crate; collect its shelf | members |
| `/v1/farms/station` | 5 | `farmStations.js` | station a sworn beast; recall it | the beast's owner |
| `/v1/farms/threat` | 6 | `farmStead.js` | a raid's result at its end (raiders slain, who stood) | members there |
| `/v1/farms/fair` | 7 | `farmFairs.js` | read the fair; host it (opt in); enter and withdraw an entry | officers host, anyone enters |

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
`world/farm/workshopArt.js`, `world/farm/threatArt.js`, `world/farm/fairGround.js`, and `scenes/farm/farmGames.js` for
minigame input and drawing.

---

## 12. Balance

- **No new gold or Argent faucet beyond the caps we have.** Orders keep the 600 Argent per Company per week cap.
  Product orders and fair prizes share it. Gold from orders is checked against the wealth budget
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
3. **Livestock.** Pens and coop, the drover, animals with ARENA2 art, care, milking, shearing, eggs, the trough.
4. **Workshops.** Windmill, churn, press, loom, smokehouse, brewery, apiary; product orders; Provisioning and crafting
   hooks.
5. **Sworn beasts.** Beast posts, stationing, the kind roles, server stations, ploughing with a beast.
6. **Threats.** Blight, crows and foxes, weather, raids on farms.
7. **Fairs.** The fair ground, the contests, ribbons and trophies.

---

## 14. Open questions for the owner

1. **Personal or Company?** Animals and workshop goods go to the Company Stores like crops. Should a member be able to
   own a personal animal on the Company farm (their own cow, their own produce)?
2. **Offline play.** Farms are online only today. Should anything here work offline (a sworn beast at a "home plot")?
3. **Fair schedule:** one fair per season on one farm, or a smaller weekly market day on every farm?
4. **Hauling sacks:** is carrying sacks to the wagon fun or a chore for your group? It is optional by design, but it is a
   central diegetic loop.
5. **Art checks:** before Phase 1, I'd read the ARENA2 archives (201, 205, 211-214, 254, 301) and list the exact records
   for animals, birds, hives, fences, tools and the lectern. Anything missing is dropped or replaced by a mod's asset.
