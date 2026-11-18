# Tavern service

An innkeeper offers **Work a tavern shift** and **Recipe book** beside the existing inn services.
The player stays in the real room. Existing NPCs and their normal activation rays are the counter and customers;
there is no new room, population, table UI or mouse-look mode. Orders are personal to the worker.

## Playing

1. Ask the innkeeper for a shift. A tavern needs at least one available adult talk-only NPC. Quest actors and service
   NPCs are excluded. The shift assigns six distinct drinks to the existing patrons.
2. Each customer calls out their order in the HUD message line. Look at the innkeeper and activate **Mix a drink**:
   the counter window pours one dose per bottle click (or 1/2/3). Three doses fill a cup; the third lifts the cup
   into the player's hand and the counter closes by itself. Each dose is final.
3. Read the recipe book when needed. It has three pages and a line of lore per drink, with no automatic crafting,
   recipe matching or highlighted answer. The order names the drink, not its ingredients.
4. Walk to the named NPC and activate **Serve the prepared drink**. One action pays the wage, tips and one Favor
   Token, and the customer calls the next order. A wrong recipe stays in hand: **Discard the mixture** at the
   innkeeper and start again. No individual-dose undo exists. After six orders the shift ends. **End this shift**
   keeps payments already earned.
5. Served customers leave chores (`TAVERN_CHORE_PLAN`: three tables, two spills, none for the last order). Empties sit
   on the nearest real table top beside the customer (found with the room collider), or the floor where there is none;
   a spill lies on the floor beside them. Both use Daggerfall flats (`CHORE_ART` in `src/scenes/tavernChores.js`).
   Activate one for a short hands-on panel low on screen: **sweep** with alternating left/right strokes (the mess
   shrinks in the room), or **clear the table** by gathering the three empties (they leave the table) and wiping two
   circles. Leaving the panel puts the mess back. Each chore pays 6 gold (rank-scaled) and warms the room.
6. Work the room is offered on the customer just served while the next drink is mixed.

Shifts saved under the earlier flow (separate carry, collect and return steps) still finish with those steps.

All new player-facing strings, recipe names and PR text are English. Text remains registered through the game's normal
localization system. The inn screen uses `tavernDoor`, the book/actions use `ChoiceWindow`, and both select the active
UI skin. The service readout uses the shared `wplaque` skin and active Enhanced Plus theme; Classic draws the same
model with the game's native bitmap font and standard shadow. No service-specific font or panel palette is injected.
Changing skin during a shift switches the readout on the next frame. The cup is drawn in the game's native viewport.

Touch/classic clients get the same explicit action chooser when the world plaque is unavailable. Inn services and
normal conversation remain available. NPC activation uses the existing distance and occlusion checks, so the player
cannot serve a customer through a wall. The carried cup is a first-person HUD graphic; the NPC art is unchanged.

## Recipes

All quantities are equal doses. Ingredient order does not matter. Three doses of cream are not a valid drink.

| Drink | Wine | Cream | Beer |
|---|---:|---:|---:|
| Griffin's Oath | 0 | 0 | 3 |
| Last Vigil | 3 | 0 | 0 |
| Smuggler's Step | 1 | 0 | 2 |
| Midnight Pact | 2 | 0 | 1 |
| Beggar's Crown | 0 | 1 | 2 |
| Dibella's Veil | 1 | 2 | 0 |
| Duchess's Kiss | 2 | 1 | 0 |
| Pilgrim's Rest | 0 | 2 | 1 |
| Innkeeper's Secret | 1 | 1 | 1 |

## Initial balance

Each served drink pays 20 gold and one Favor Token; Bards' College members get 15% more gold per rank
(`bardGoldMultiplier`). Members earn 1 College reputation for every clean drink (right first time and within the
customer's patience), and when the shift ends 3 more for a perfect shift (no waste, no wrong drink, no chore left)
or 1 otherwise: up to 9 a shift. Completing a shift also grants 1 city and regional reputation. Nonmembers can work
for the base pay and Favor. Orders cannot be served earlier than 20 real seconds after they
were assigned; shifts expire after one hour. These are initial values for playtesting, not an economy calibration.

## Authority and persistence

- `src/net/tavernServiceLaw.js`: shared recipes, order generation and immutable state transitions.
- `src/scenes/tavernServiceHost.js`: NPC actions, recipe book and response application.
- `src/ui/tavernServiceHud.js`: order readout and first-person cup, without a cursor surface.
- `server-account/src/tavernService.js`: authenticated `/v1/tavern/service` actions, leased character validation,
  saved-room identity, revision checks, minimum service time and payments.
- Migration `0210_tavern_service.sql`: one shift per character and per-request receipts. Gold/reputation, the shift
  revision and the receipt commit in one database batch. Retried payments cannot credit a second time. Client rewards
  are applied inside `realmGoldAct.apply`, before its next checkpoint.

Online shifts recover from the service on room entry. Offline shifts are local and end on leaving the room. An
unanswered online action keeps its request ID for retry. A reload loads the authoritative realm save and shift.
`world.js` receives one additional API adapter; the behavior lives in dedicated modules. `worldModes.js` has only
construction, NPC activation/naming, inn rows, frame and transition hooks.

The server validates the checkpointed room and the service state, but does not independently simulate NPC positions.
The candidate NPC identities come from the client; this follows the existing small-server trust model. This release
does not add player-to-player drink transfers, visible carried-cup replication, or timed pouring precision. It adds
the three-dose memory/recipe activity and a complete NPC service loop. Live in-world art/placement and reward pacing
still need a playtest with ARENA2.

## Deployment and verification

Deploy account service `acct205` with migration 0210 before the new client. No relay protocol fields or relay deploy
are required. Use the normal self-host update process; do not edit the live database by hand.

```
node --test tools/tavernService*.test.mjs
node tools/tavernServiceUiProbe.mjs
node tools/routesCheck.mjs
node tools/l10nExtract.mjs
npx eslint src/net/tavernServiceLaw.js src/scenes/tavernServiceHost.js src/ui/tavernServiceHud.js src/systems/tavern/tavernServiceWords.js src/scenes/worldModes.js src/scenes/world.js server-account/src/tavernService.js server-account/src/index.js server-account/src/service.js tools/tavernService*.mjs
npm run build
node server/node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir /tmp/bf-tavern-accounts -c selfhost/accounts.toml
BUNNYFALL_DATA=/tmp/bf-tavern-test node tools/tavernServiceRouteProbe.mjs
```

The route probe creates a disposable guest and realm character, checkpoints a tavern save, completes one actual HTTP
service cycle and verifies the R2-backed gold after replaying its payment. No production account is used.
