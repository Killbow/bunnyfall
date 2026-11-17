# Farming Mode

At a farm owned by your Company, use the farmhouse door and choose **Enter Farming Mode**. A regular door click also enters the mode when no action list is shown. Completing the old daily chore does not lock you out.

The camera rises behind your character. Walk with the normal movement controls, orbit with Q/E or a right-button drag, and zoom with the mouse wheel. Press Escape or the Leave button to return to the usual view. Going indoors, leaving the farm, mounting or dying ends the mode too. The ordinary hotbar and quickslots hide while the farming tool belt is active and return on exit without changing preferences. Controls use the active Classic or Enhanced Plus styling, including Grimoire and theme colors.

Soil, grass and crops load through the normal ARENA2 texture pipeline (archives 302 and 301). Game data stays outside the repository. Set `ARENA2_PATH` to your local Daggerfall `ARENA2` directory for development and browser probes.

## Working the land

Every supported crop field on the farm is divided into workable beds, following the actual field boundaries. The original 16 bed addresses retain their positions and saved crops. Untouched land keeps its native crops; working a bed replaces only the plants inside that bed. Paths and areas outside the crop fields remain unchanged. Hover a bed to highlight it, approach within 3.5 metres, then click with the selected tool:

1. **Hoe** prepares empty soil.
2. **Seeds** plants the selected crop in prepared soil. Click the Crop button to cycle grain, mushrooms and herbs.
3. **Water** starts growth and supplies 24 hours of growing time.
4. **Harvest** collects a mature crop into Company Stores and leaves prepared soil for replanting.

Keys 1–4 select the tools. Crops take 6, 12 and 18 real hours respectively, measured by the account service. Dry crops pause; mature crops wait for collection. Sleeping, fast travel and the client clock cannot advance the server's harvest time.

Company members share all beds. State is sparse: only worked beds are stored, with up to 65,536 stable bed addresses per farm. Existing 16-bed saves convert on their next edit.

Any authenticated visitor can see the shared soil and crops without Company membership or Farming Mode. The client also observes other fully loaded nearby farms. Observers poll roughly once per second and receive a small unchanged response when the revision matches. Only Company members may edit or harvest. Conflicting edits refresh the state rather than overwriting another gardener's work. Harvest credits and revision claims commit together; retrying a harvest cannot pay twice. This is polling, so remote changes appear after approximately one second plus network latency.

Working three distinct beds in a UTC day earns the existing daily care bonus. Repeating actions on one bed does not count as three beds. Passive Company farm production remains in place during this first version.

## Estate progression and bulk crop orders

Open **Progress & orders** from the farming belt. Improvements belong to the farm and benefit all Company members. Only a captain or officer may spend Company funds or ship communal crops, with an explicit second-click confirmation. The sidebar follows the active UI skin and shows officers their current Company balances.

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
