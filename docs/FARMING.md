# Farming Mode

At a farm owned by your Company, use the farmhouse door and choose **Enter Farming Mode**. A regular door click also enters the mode when no action list is shown. Completing the old daily chore does not lock you out.

The camera rises behind your character. Walk with the normal movement controls, orbit with Q/E or a right-button drag, and zoom with the mouse wheel. Press Escape or the Leave button to return to the usual view. Going indoors, leaving the farm, mounting or dying ends the mode too. The ordinary hotbar and quickslots hide while the farming tool belt is active and return on exit without changing preferences. Controls use the active Classic or Enhanced Plus styling, including Grimoire and theme colors.

Soil, grass and crops load through the normal ARENA2 texture pipeline (archives 302 and 301). Game data stays outside the repository. Set `ARENA2_PATH` to your local Daggerfall `ARENA2` directory for development and browser probes.

## Working the land

Every supported crop field on the farm is divided into workable beds, following the actual field boundaries. The original 16 bed addresses retain their positions and saved crops. Untouched land keeps its native crops; working a bed replaces only the plants inside that bed. Paths and areas outside the crop fields remain unchanged. Hover a bed to highlight it, approach within 3.5 metres, then click with the selected tool:

1. **Hoe** prepares empty soil.
2. **Seeds** plants the seed in hand in prepared soil. Take grain, mushroom or herb seed from the seed shelf.
3. **Water** starts growth and supplies 24 hours of growing time.
4. **Harvest** collects a mature crop into Company Stores and leaves prepared soil for replanting.

Keys 1–4 select the tools. Crops take 6, 12 and 18 real hours respectively, measured by the account service. Dry crops pause; mature crops wait for collection. Sleeping, fast travel and the client clock cannot advance the server's harvest time.

Company members share all beds. State is sparse: only worked beds are stored, with up to 65,536 stable bed addresses per farm. Existing 16-bed saves convert on their next edit.

Any authenticated visitor can see the shared soil and crops without Company membership or Farming Mode. The client also observes other fully loaded nearby farms. Observers poll roughly once per second and receive a small unchanged response when the revision matches. Only Company members may edit or harvest. Conflicting edits refresh the state rather than overwriting another gardener's work. Harvest credits and revision claims commit together; retrying a harvest cannot pay twice. This is polling, so remote changes appear after approximately one second plus network latency.

Working three distinct beds in a UTC day earns the existing daily care bonus. Repeating actions on one bed does not count as three beds. Passive Company farm production remains in place during this first version.

## The farmyard

Since the farm expansion's first phase (`docs/FARM-EXPANSION.md`) the farm is used where it stands, not from a menu. Each farm lays out a farmyard on the open ground by its fields (`src/world/farm/farmstead.js`): the same for every client, gathered round one spot by the first field. Everyone nearby sees it; it is used in Farming Mode by walking within reach and clicking:

- **Order post** reads this week's notice for each crop in turn.
- **The factor's wagon** ships an order. A Captain or Officer is asked Y/N before the crops leave the Stores.
- **Estate ledger** reads the farm's totals, the week's orders and what each next improvement still needs.
- **Seed shelf** has a sack for each seed: click one to take that seed (this replaced the Crop button).
- **Tool rack**, **well** and **compost heap** show the tools, irrigation and soil improvements, and sell the next one to a Captain or Officer with a Y/N question.
- The **haystack** and the **scarecrow** dress the yard; lanterns by the order post, the ledger and the well light at night.

### Farm work and the farm titles

Every account counts its farm work (`src/net/farm/farmWorkLaw.js`, migration `0217_farm_work.sql`): 1 for each bed hoed, planted or watered, 1 for each crop harvested by hand, 2 for each sack carried to the wagon. At most 400 counts a UTC day. The service raises it in the same batch as the work. The titles Furrowhand (3,000), Harvestwarden (15,000) and Sovereign of the Sheaf (45,000) and First Light with the last are derived from it in `server-account/src/titles.js`. The ledger reads your total; the factor says when a title is earned.

### The crops of the land

Grain, mushrooms and herbs grow on every farm, all year. The climate crops grow where their climate suits them (`src/net/farm/cropLaw.js`; the service checks the farm's stored climate): corn, cabbage, tomatoes, sunflowers, berries, flax, gourds, grapes and desert root. They follow the shared calendar's seasons: full pace in their own, 0.7 in the others, 0.4 in winter; growth across a season's turn is integrated exactly. Each yields a pantry food (templates 714-722, with Provisioning traits). The weekly orders stay on the first three crops.

### Care, grades and the field games

A planted bed gathers care (`src/net/farm/careLaw.js`, 0-6): sown or scythed with a good field game (+1 or +2), weeded (+1, more with the game), watered in its last six hours of moisture (+1). Birds visit each farm in windows its map id draws from the hour (the same for every client and the service); a visit nobody chases off costs each crop growing through it a point, at most two. At harvest the care makes the grade (Fine at 2, Choice at 3, Prize at 4) and the grade multiplies the yield (x1.25, x1.5, x2); the soil improvements keep their own extra crops. The bed's hover line shows the grade it is on course for.

Careful work (F, or the belt button) turns sowing, weeding and scything into a short game pinned over the bed (`src/net/farm/farmGameLaw.js`, drawn by `src/ui/farmGames.js`); the hoe on a weedy planted bed weeds it. When birds are about, the scarecrow starts the chase. The service judges each play (the right game for the work, a score 0-1, at least its shortest honest time) and gives its care only for each account's first plays of the day (6 sowings, 10 weedings, 4 scythings, 3 chases); a full-bonus play is also 5 farm work.

### Strains

Harvesting a ripe bed with another ripe bed of the same crop within reach (the client names the nearest as the partner; the service checks it is ripe and the same crop) may drop a cross seed (`src/net/farm/strainLaw.js`): 5% plus 2% for each point of both beds' care, at most 30%. The strain is named from its id and has one or two traits (inherited from strain parents first): quick (85% of the time), hardy (half the season slowing), heavy (+1 crop), showy and sweet (for the market and the pot, later phases). A planted bed carries its strain's traits. Up to 12 a farm; an officer burns one (op `burn`) by taking its sack while holding its seed.

### Workshops

Open ground on a farm shows **staked plots** for six workshops (`src/net/farm/workshopLaw.js`, drawn by `src/world/farm/farmstead.js` WORKSHOP_FIXTURES, used through `src/scenes/farm/workshopActs.js`): windmill, press, dairy churn, smokehouse, loom, brewery. They claim ground after every other fixture, so a cramped farm may lack some. An officer clicks the staked plot and answers DFU's Y/N to pay the Company gold; the workshop rises over real hours (scaffold, then the finished parts), recorded as `garden.built[id] = readyAtS`. Once built, any member clicks its **input crate**: the service takes the recipe's inputs from the communal Stores and writes `garden.batches[id] = { r, t0, t1, out, qty }`; the body click cycles which recipe is set. The **output shelf** collects a finished batch into the Stores; starting the next batch collects a finished one first, so nothing is lost. A started batch is 10 farm work (`farmWorkOf` op `workshop`). All of it is garden op `workshop` (acts `build`, `start`, `collect`, `order`) on the existing garden route; the service turns the law's answer into the treasury and Stores statements in the garden's revision batch.

The products are Stores foods (PANTRY templates 723-732, with Provisioning traits) and `cloth:linen`. The order post's fourth click reads this week's **product order** (one per farm, by its map id and the week: e.g. 40 flour for 600 gold, no Argents); an officer ships it from the Stores with Y/N, once a week (`garden.prodWeek`, claimed with the revision so a replay pays nothing). Wool needs no loom: `cloth:wool` already is a bolt.

### Livestock

The herd lives in the garden (`src/net/farm/herdLaw.js`), at most 16, all the Company's: cows and horses in the pen, pigs in the sty, dogs and cats about the yard (art: TEXTURE.201). Contentment (0-100) rises 10 a day fed and watered, falls 15 a day for each lack; mucking a pen out lifts it 10 once a day. Feeding takes 2 food from the communal Stores (grain or corn for cows and horses, any food otherwise); water is free. The drover comes one UTC day a week (by the map id) with three animals; an officer buys with treasury gold (garden op `herd`, act `buy`). Content animals work: cows give 1-3 milk a day (+1 with the milking game), a mucked sty with content pigs gives manure (each sown bed takes one: +1 care), a dog caps the birds' toll at 1, a cat keeps sacks 30 minutes, a horse makes a hauled sack 3 farm work. Tending an animal is 3 farm work. Animals never die.

### Sacks and the wagon

A harvest still puts its crops into the Company Stores at once. It also leaves the crops' sacks at the bed corner for fifteen minutes (`src/net/farm/haulLaw.js`). Click a sack to shoulder it and the others lying near it, up to four; click the wagon to load them. The wagon's cargo for the week (Monday UTC) fills the cart as it grows and is read in the ledger. Hauling adds nothing to the Stores (the crops are there already) and counts as working the sack's bed for the day's care bonus. The garden route's `haul` op commits it with the garden revision, so a sack loads once.

Every picture is a Daggerfall record listed in the expansion's art register. A farm too cramped for a fixture lacks it.

## Estate progression and bulk crop orders

Improvements belong to the farm and benefit all Company members. Only a captain or officer may spend Company funds or ship communal crops, each after a Y/N question at the fixture. Officers' Company balances are read while they use a fixture.

Each crop has its own order ladder. Grain, mushrooms and herbs all need to be grown and harvested at this farm. An order consumes that many crops from communal Company Stores and credits the Company's gold and Argent treasuries together:

| Order per crop | Crops shipped | Gold reward | Argent reward |
| --- | ---: | ---: | ---: |
| First | 1,000 | 2,000 | 10 |
| Second | 5,000 | 12,000 | 50 |
| Third and later | 20,000 | 60,000 | 200 |

Each farm may fill one order of each crop per week, resetting Monday at 00:00 UTC. All farms in a Company share a 600-Argent weekly farm reward cap. An order that would exceed it is refused without consuming crops. Existing Argent availability settings and treasury caps still apply.

Harvested-minus-delivered counters limit shipments to real manual harvests recorded by the service at this farm; bought goods and passive production alone do not create eligibility. Eligible units must also still be present in communal Company Stores. Herb orders accept the farm's mix of herb materials. Harvest history begins with this feature; old stock cannot be credited retroactively without a harvest record.

| Improvement | Gold cost | Argent cost | Required deliveries of **each** crop | Effect |
| --- | ---: | ---: | ---: | --- |
| Tempered tools | 20,000 | 25 | 1,000 | Up to 3 nearby beds per click |
| Masterwork tools | 100,000 | 150 | 6,000 | Up to 5 nearby beds per click |
| Irrigation channels | 40,000 | 50 | 1,000 | New seeds receive water automatically |
| Living irrigation | 200,000 | 300 | 26,000 | Harvest replants and waters the same crop |
| Compost beds | 30,000 | 40 | 1,000 | Newly planted crops yield 1 extra item |
| Rich loam | 150,000 | 200 | 6,000 | Newly planted crops yield 2 extra items and grow 25% faster |

Each branch must be bought in order. Crops keep the soil quality and growth rate they had when planted; buying an upgrade does not instantly mature an old crop. Living irrigation does not harvest automatically. Larger tools keep the same range and obstruction checks, and only valid bed actions commit. Delivery, currency movement, upgrade purchases and the garden revision claim commit in one transaction, so retries and races cannot pay twice or consume stock without a reward.

Progress and upgrade levels are stored in the existing garden JSON. Old saves default to no upgrades and remain compatible; no additional migration is required.

Improvements belong to this farm. Releasing or losing the farm clears its garden and progression, with no upgrade refund.

## Current scope

This version supplies starter tools and seeds without inventory costs. It requires a supported crop-field prefab and a ready third-person body. Tools currently change the soil and crops directly; bespoke hoe, watering-can and harvesting character animations, weather/season effects, animal husbandry, paid seed supplies and farm customization remain future work.

Apply migration `0212_farm_gardens.sql` through the normal self-host startup/update before using the new account-service route. No production deployment is performed by adding this code.

## Validation

- `node --test tools/farmGarden.test.mjs` — bed rules, shared revisions, atomic rewards, daily care, all-field layout, legacy save conversion and visitor permissions.
- `node tools/farmingModeUiProbe.mjs` — browser input, actual ARENA2 WebGL crop/soil draws, tools, range, themes, hotbar hold, camera and teardown, using a body-hold fixture. Requires `ARENA2_PATH`.
- `node tools/farmGardenRouteProbe.mjs` — actual account Worker, authentication, D1 migrations, service route, store deposits and replay rejection. Uses an isolated Miniflare runtime and a relay stub; production account data is untouched. Rolldown bundles the Worker to avoid the native esbuild parent-directory restriction encountered in the Windows sandbox.

A real in-game capture has been made at Old Morgorya's Farm using the installed ARENA2 data, the normal world renderer and the real third-person paperdoll. Ownership and crop stages were staged in an isolated offline screenshot session. Normal ownership, harvest credits and concurrency are covered separately by the Worker tests; camera feel and bespoke farming animations still need further playtesting/polish.
