# Bunnyfall guide

The short version of how this repo works. Read this first, query `npm run codex` (or the `codex` MCP server in
`.mcp.json`) second, and inspect the target modules from there.

Bunnyfall is a self-hosted fork of DFO Online (Daggerfall in the browser) for a small group of friends. It is live at
https://dagg.campfirerp.com/play/ and runs on the owner's Linux box.

## The three pieces

| Piece | Where | What it does |
|---|---|---|
| Client | `src/`, `index.html`, `play/` | The game, in the browser. Also wrapped by the desktop app in `app/`. |
| Relay | `server/src/` | Live multiplayer: who is where, chat, shared world events. |
| Account service | `server-account/src/` | Everything kept: accounts, homes, decor, guestbooks, guilds, boards. SQL migrations in `server-account/migrations/`. |

On the box, Caddy (`selfhost/Caddyfile`) sends `/relay` to the relay, `/v1` and `/accounts` to the account service,
`/updater` to the owner's update door and everything else to the built game in `dist/`. Both servers run on
wrangler's local runtime through `selfhost/start.mjs`, configured by `selfhost/relay.toml` and `selfhost/accounts.toml`.
Their data lives in `data/` (not in git). The `wrangler.toml` files in `server/` and `server-account/` are upstream's
originals: do not edit them.

The client finds the servers from the page's own address (`src/net/selfHost.js`), falling back to the domain.

## Working on it

- `npm run dev` runs the game with hot reload. Run `node selfhost/start.mjs` beside it for the servers.
- Game data: `sh tools/fetch-data.sh` puts ARENA2 at `/home/claude/dfdata/arena2`. Set `ARENA2_PATH` to it for
  anything that reads the game's files. It never goes in the repo.
- There is no test suite and no CI gate. Check a change by reading it and, when it matters, trying it in the game.
  `tools/*Probe.mjs` are small browser or node probes if you want one.

## Using and updating codex

`tools/codex/` exposes the same live index and 798 reference cards over MCP (`.mcp.json`, server name `codex`) and the terminal (`npm run codex -- <cmd>`):

- `npm run codex -- module <path>`: exports, imports, inbound callers, and line or binding counts.
- `npm run codex -- routes [filter]`: `/v1/*` HTTP routes, WebSocket room frames, and save hooks with `file:line`.
- `npm run codex -- schema [filter]`: SQLite D1 tables, columns, indexes, triggers, migrations, and room keys.
- `npm run codex -- cards <query>` / `npm run codex -- card <slug>`: search or read `<= 250`-word reference cards (or pass an older `bible/...` comment path to `npm run codex -- bible <path>`).
- `npm run codex -- dfu-fetch` then `dfu-search <query>` / `dfu-read <File.cs:start-end>`: search or read classic Daggerfall Unity C# scripts in `.cache/dfu-scripts/`.
- `npm run codex -- diff main HEAD`: list cards affected by your branch (`impactedCards`) and new modules without a card (`uncoveredFiles`).

When your PR changes an invariant, route, SQLite table, or file path covered by a card (or adds a new subsystem), update or create `tools/codex/cards/<slug>.md` via `codex_card` (`action: "write"`) or `npm run codex -- card <slug> --write <draft.md>`, then run `npm run codex:check`.

## Shipping

Before a push:

1. `npx eslint <changed files>`
2. `npm run build`
3. If a server file changed, a wrangler dry run for each service:
   `node server/node_modules/wrangler/bin/wrangler.js deploy --dry-run --outdir <scratch>/relay -c selfhost/relay.toml`
   and the same with `selfhost/accounts.toml`.
4. English text: run `node tools/l10nExtract.mjs` so `locales/en/Port_Strings.csv` matches.

Commit to `main` and push. Every push to `main` also builds and publishes the desktop app
(`.github/workflows/release-desktop.yml`), but a change to `app/` only reaches players with a new desktop release.

A change that touches the relay or account service needs a server update on the box: `./selfhost/update.sh`, or the
↻ button in the main menu when signed in as Killbunny. A client-only change is live after the same update, since it
rebuilds `dist/`. Never edit files on the box itself.

## Rules that matter

- **The hosts do not grow.** `bootWorld` (`src/scenes/world.js`, 35k lines), `createWorldModes`, `buildDungeonContext`,
  `bootExterior` and the relay's `Room` are huge knots. New behaviour goes into its own module, and the host gets a
  line or two to wire it. Do not read these files whole: grep for the name you need.
- **Text:** write English as `t('some.key', 'English words')`, then run `node tools/l10nExtract.mjs`.
- **Network fields:** anything new on the wire passes through the validators in `src/net/wire.js`.
- **A new account-service route goes in two places.** The handler in `server-account/src/index.js` AND the `ROUTES`
  list in `server-account/src/service.js`. The service turns away any path not in that list as `not-found` before the
  handler runs, so a route only in `index.js` never works, with no error anywhere. On 2026-11-05 this had silently broken
  the account vault, the Dusk Token count, player festivals, guestbooks and the great cannon. Run
  `node tools/routesCheck.mjs` after adding a route: it lists anything `index.js` handles that `ROUTES` lacks, and any
  `/v1/...` path the client calls that neither the account service nor the relay serves.
- **Test a server feature against the real service, not only its functions.** `BUNNYFALL_DATA=/tmp/bf node
  selfhost/start.mjs` runs both servers locally (migrations included); make a guest with
  `POST /v1/auth/guest {"terms":true,"privacy":true}` and call the route with its `secret` as a Bearer token.
- **Content switched off** (Phase 2) is one list, `src/mods/contentOff.js`, read by the client and the relay. Flip
  a flag to bring a piece back.
- **Credits stay:** `LICENSE`, the authors in `src/ui/credits.js` and `vendor/`.
- **Fork changes are tagged.** `grep -rn BUNNYFALL src server server-account app` finds them. Comments quoting "Mac"
  are the upstream owner, not us.

## How a feature is shaped

Most online features follow the same path. The guestbook is the plainest example:

1. **Law**, pure and shared by both ends, in `src/net/`: `guestbookLaw.js` (line length, how many are kept, the
   signing gap). No DOM, no network, no clock.
2. **Server**, in `server-account/src/`: `guestbook.js` holds the rules, a route in `index.js`
   (`/v1/homes/guestbook/sign` and `/read`), and a migration (`0186_guestbook.sql`).
3. **Client API**, in `src/net/accountClient.js`: one method per route, plus the words for each refusal.
4. **Client module**, in `src/homes/guestbook.js`: the door rows and what pressing them does.
5. **Wiring**: a line in `world.js` (passes the api) and in `worldModes.js` (adds the door rows). Nothing more.

Features with no server part skip steps 2 and 3. The tavern is `tavernLaw.js` (in `src/trade/tavern/`) plus
`src/trade/tavernSocial.js`, with its pose fields added to the wire.

Adding a DFU mod: `node tools/importDfmod.mjs <file.dfmod>` unpacks it into `vendor/<mod>/`. Asset-only mods are mostly
done by that. A mod's C# is ported by hand into `src/` and wired like the other vendored mods. Add its licence and
authors to `src/ui/credits.js`.

## Where Bunnyfall's own things live

| Feature | Files |
|---|---|
| Camps: a camping kit's tent kept as a camp and decorated (100 pieces, free, until packed) | `src/net/campLaw.js`, `server-account/src/camps.js` (migration 0207), stood and furnished through `src/homes/homeYards.js` |
| Seven new guilds and their halls (online only) | `src/net/bunnyGuildLaw.js`, `src/systems/guild/bunny*.js`, `src/guilds/bunnyHallBanners.js`, `src/ui/hallAutomap.js` |
| Guild hall interiors (house stripped, each guild's trade furnished about the clerk) | `src/guilds/bunnyHallFurnish.js`, wired in `src/scenes/interiorContext.js` |
| Raid camps, waves gathering and marching in, smoke over camps and burning houses | `src/worldEvents/raidMuster.js`, `src/worldEvents/raidMusterHost.js`, wired in `src/worldEvents/raidingParties.js` and `world.js` |
| Emperor's statue at Daggerfall's north gate | `src/world/emperorMemorial.js`, `public/art/bunnyfall-npcs/` |
| Wrothgarian Mountains as the reach of Cromwark (no PvP, haze counter, desolate towns, Dusk Tokens and shop, purple border) | `src/world/wild/cromwark.js` (switch and numbers), `cromwarkTowns.js`, `nyxShop.js`, `src/world/wild/cromwarkHost.js`, `src/ui/nyxWindow.js`, `server-account/src/nyx.js` |
| Company territories on the held map, +10% yield inside your own (grown by members' Renown in the hall's region) | `src/net/territoryLaw.js` (numbers), `src/guilds/companyTerritory.js`, `src/ui/territoryMapInk.js`, `server-account/src/territory.js`, migration `0197_company_territory.sql` |
| City Charters (up to 3 Companies holding a regional capital; outline on the held map, Charter section on the Company page) | `src/net/charterLaw.js`, `server-account/src/charters.js`, migration `0198_city_charters.sql`, `src/guilds/companyTerritory.js`, `src/ui/socialPanel.js` (guildCharterNodes) |
| Rodney's blight (spreads daily round Cromwark, held by territories, pushed back by raids; purple enemies +25% damage and Dusk Tokens inside) | `src/net/blightLaw.js` (numbers), `src/guilds/rodneyBlight.js`, `server-account/src/blight.js`, migration `0199_rodney_blight.sql`, `src/ui/territoryMapInk.js` (paintBlight), `src/world/wild/cromwark.js` (blightHere, foeDamageMult) |
| Garrisons and patrols (Company guard, Charter garrison; daily upkeep from the Company Stores; patrol walkers on set routes; march pushes the blight) | `src/net/garrisonLaw.js` (numbers), `server-account/src/garrisons.js`, migration `0200_garrisons.sql`, `src/justice/garrisonBook.js`, `src/justice/garrisonPatrols.js`, `src/ui/socialPanel.js` (guildGarrisonNodes) |
| Company farms (map farms bought inside the territory, daily harvest into the Company Stores, member chores at the farmhouse door, lost when the territory shrinks) | `src/net/farmLaw.js` (numbers), `server-account/src/farms.js`, migration `0201_company_farms.sql`, `src/guilds/farmBook.js`, `src/guilds/farmDoor.js` (the door's chore row and question), `src/ui/socialPanel.js` (guildFarmsNodes), `src/ui/territoryMapInk.js` (the marks) |
| Staff chat commands /vanish, /spawn, /greed | `src/tools/staffCommandsHost.js`, `server-account/src/staffCommands.js`, migration `0202_staff_commands.sql`, `server-account/src/staffHidden.js` (hiddenToken reads `vanish_on`) |
| Staff panel (in game and staff.html) | `staff.html`, `src/tools/staffPanel.js` (sign-in, picks, the game hook's half: Follow, live map, Hide me, tags), `src/tools/staffPanelActions.js` (More > All tools: every staff route as a form), `server-account/src/staffPanelDesk.js` (`/v1/staff/chars`, `/v1/staff/greed`), `src/ui/staffDock.js` (the ST button, the window, the message relay to `src/net/staffHook.js`) |
| /dm banner (coloured line across the top of every screen; developers and Dungeon Masters) | `src/net/dmLaw.js` (colours), `src/ui/dmBanner.js`, the narrate arm in `server/src/message/frames/narrate.js` and `src/net/wire.js` |
| The chat window (look, scrolling, the player menu under a name, popping it out into its own window) | `src/ui/chatPanel.js` (the panel and its sheet), `src/ui/chatMenu.js` (the popover; rows with a `group` fold behind one entry), `src/ui/chatScroll.js`, `src/ui/chatPopout.js` + `public/chat-popout.html` (the box itself is moved into that window); `src/ui/chatLook.js` (the chat font and text size); `src/ui/chatPlace.js` (size presets, edge drags, moving, and the popped-out window's size and place); `src/ui/chatDrawer.js` (the drawer with its Online, Friends, and Party tabs, its width limits, and the Letters view; `src/ui/socialPanel.js` draws Friends, Party, and Letters into it through its `dock`); the rows come from `socialRowActions` in `world.js` and `src/net/chatSafetyHost.js` |
| Royal Ballista and Grappling Hook (items 564 and 565: rows, shops, loot, icons; the ballista's arced bolt and burst; the hook's throw and pull on its own key, `GrapplingHook` (Numpad1); the aiming arc, the rope and the hook's rest on screen) | `src/characters/heavyGearIds.js` (all the numbers), `src/systems/heavyGear.js`, `src/combat/ballista/ballistaFlight.js` (hooks in `arrowFlight.js` and `dungeonContext.js`), `src/combat/grapple/grapple.js` (one hook in `player/motor.js` `_step`), `src/combat/heavyGearRig.js` + `heavyGearArt.js` (wired in `combat/weaponRig.js`), `src/ui/heavyGearOverlay.js`, the pose's `bl` in `net/wire.js`, art in `public/art/bunnyfall-ballista/` and `bunnyfall-grapple/` |
| Names (first and last, how NPCs address you) | `src/characters/names.js`, `src/ui/namePicker.js` |
| Content switched off | `src/mods/contentOff.js` |
| Vampire expansion, phase 1 (Vitae, the Beast's stages, Blood Sight, feeding in Steal mode on townsfolk and sleepers, the Clan Elder's summons; switch `vampireBlood` in contentOff) | `src/systems/vampire/bloodLaw.js` (numbers), `vitae.js` (the curse's state, the HUD tile, the Elder's letter), `vampireActions.js` (the quest's `vamp` lines), `src/systems/questlines/quests/QLVA01.txt`, `src/scenes/vampire/vampireFeed.js`; hooks in `vampirism.js`, `townTalk.js` (steal arm), `worldModes.js` (bed rows), `livingTown.js` (`sleepersAt`) |
| Vampire expansion, phase 2: thralls (Blood Slots, upkeep, prisoners and vials, servants with gear, errands and the follower, social thralls and their perks, the Haven at an owned home's door) | `src/systems/vampire/thrallLaw.js` (numbers), `thralls.js` (state, acts, daily round, the vial item, the follower's party, save), `src/scenes/vampire/thrallCapture.js` (subdue, one line in each foe pool's death arm), `thrallHost.js` (the follower over `crewAshore.js`), `vampireFeed.js` (take and enthrall rows), `src/ui/vampire/havenWindow.js`; the Thralls section in `src/ui/companionRoster.js` |
| Vampire expansion, phase 3: the Masquerade (per-character heat by region), the nine clans' strengths and banes, the Clan Courts (strikes, tithe, Blood Hunts, penance and Court work), witch hunters and assassins | `src/systems/vampire/clanLaw.js` (territories, seats, rivals, every clan rule), `courtLeaf.js` (who hunts the player), `masquerade.js` (heat, Courts, ambush rolls, save), `courtDoor.js` (the tavern row by night), `src/ui/vampire/courtWindow.js`, `src/scenes/vampire/huntersHost.js`, quests `QLVA02` (penance) and `QLVA03` (Court work) |
| Vampire Disciplines (3 shared + 2 per clan, Vitae and cooldown, one key: tap the last, hold the wheel) | `src/systems/vampire/disciplineLaw.js` (every power's effects and numbers), `disciplines.js` (the cast: free through `enchantments.js castFreeForPlayer`), `src/ui/vampire/disciplineWheel.js` (the `Discipline` action, Numpad0); installed in `world.js` |
| Vampire bloodline chosen before the turn (claimed at a Court while infected; the turn waits for it; one re-pick for existing vampires) | `src/systems/vampire/bloodlineLeaf.js` (a leaf read by `infection.js`), `vampirism.js changeVampireClan`, the bitten's and the re-pick's rows in `src/ui/vampire/courtWindow.js`, `courtDoor.js courtCanSee` |
| Vampire windows and screen effects (both skins) | `src/ui/vampire/vampKit.js` (the two dresses, the window shell, meters, buttons, the clans' crests and the bloods' and Disciplines' glyphs), `bloodSightCard.js`, `havenWindow.js`, `courtWindow.js`, `disciplineWheel.js`, `beastOverlay.js` (the vignette, Classic's vial); the Vitae bar in `src/ui/enhancedHud.js` |
| Homes: buying, votes, who may enter | `src/net/homeLaw.js`, `server-account/src/homes.js`, `homeVotes.js`, `src/homes/onlineHomes.js` |
| Decor: caps, placing, nudging, panel | `src/net/decorLaw.js`, `server-account/src/decor.js`, `src/homes/`, `src/ui/decorPanel.js` |
| Yards and their edges | `src/homes/homeYards.js` |
| Hiding another home's decor (only you) | `src/homes/homeDecorHide.js` |
| Guestbook | see the list above |
| Player festivals (hosted at an innkeeper, map pennant, chat line, Festival Cheer buff) | `src/net/playerFestivalLaw.js`, `server-account/src/playerFestival.js`, `src/systems/festival/playerFestivals.js`, the `festivals` marks in `src/ui/heldMap.js` and `src/ui/inkMap.js` |
| Magical taverns (one blue tavern per town with two or more; its portal door opens one shared hall: the biggest tavern interior in the game, Nyx at the bar, star windows; switch `magicTaverns` in contentOff) | `src/systems/magicTavern.js` (the rule and the shared room's numbers), `src/scenes/magicTavernRoom.js` (the door's swap, the people, the room's identity), `src/render/magicTavernLook.js` (blue pictures, portal, star glass); a line each in `pixelBuild.js`, `worldModes.js` (`interiorTransition`), `interiorContext.js`, `world.js` (room key and pose offset) |
| Bards' Guild services paid in Favor (rename an item, cosmetic flourish on an item, rename a home) | `src/net/bardServiceLaw.js` (prices, limits, word filter), `server-account/src/bardServices.js` (route `/v1/bards/service`, migration `0212_home_titles.sql`), `src/scenes/bardServicesShop.js` (the window, opened from the Favor shop), item fields `bardName`/`bardBuff` in `src/items/itemFields.js`, the name read in `itemInfo.js` |
| Hired-trader stacks (a stack listed by the unit, bought in chosen amounts) | `server-account/src/marketShared.js` (`stackedListing`) and `server-account/src/market.js` (`buyWithGold`; a trader's listing keeps its count in `own` and `item.stackCount`), `src/ui/vendorTab.js`, `src/trade/vendorHost.js` |
| Tavern rounds, busking, tips | `src/trade/tavern/tavernLaw.js`, `src/trade/tavernSocial.js`, `src/guilds/bunnyServices.js` (`bunnyTavernRows`: the rows the tavern window carries beside Daggerfall's own) |
| Other players' paperdolls, seen from behind | `src/ui/paperDollBack.js`, `src/ui/paperDoll.js`, `src/net/remotePlayers.js` |
| Your own third-person body as a paperdoll (the `Graphics.Paperdoll` setting) | `src/player/eotbDoll.js`, the draw in `eotbBody.js`, the source wired in `world.js` |
| Paperdoll Enhanced and Weeberfall attached from their downloads (.zip/.7z read in the browser; Weeberfall over PDE; PDE's missing metals recoloured, missing styles borrowed) | `src/systems/modPacks/` (`archiveReader.js`, `lzma.js`, `modPacks.js`, `pdeGapFill.js`), `storeModPackFiles`/`pickModPack`/`removeModPack` in `src/scenes/dataSource.js`, `modPackSections` in `src/ui/enhancedMenu.js`, the gap fill in `src/ui/paperDoll.js` (`loadRecord`) |
| Flat Replacer (Weeberfall's townsfolk, the Dibellan Degeneracy switch; one add-on entry deliberately left out) | `src/systems/flatReplacer/` (`flatReplacerLaw.js` the matching, `flatReplacer.js` the records and switch), `src/scenes/flatReplacerStand.js` (the stand), a line each in `interiorContext.js`, `worldModes.js` (pick, portrait, body), `staticNpc.js` (name bank) |
| Custom paperdolls (upload, staff review, worn online, drawn for everyone) | `src/net/skinLaw.js`, `server-account/src/skins.js`, `src/characters/customSkins.js`, `src/ui/skinsPanel.js`, `skins.html`, the Skins tab of `staff.html`; hooks in `src/ui/paperDoll.js` and `src/net/remotePlayers.js` |
| Crafting rework (salvage, upgrades) | `src/net/salvageLaw.js`, `src/net/upgradeLaw.js`, `src/ui/` |
| Server switches for a small server | `server-account/src/bunnyfall.js`, `selfhost/accounts.toml` |
| Self-host, updates, the ↻ button | `selfhost/`, `src/ui/ownerUpdate.js` |
| Desktop app | `app/`, `.github/workflows/release-desktop.yml` |
| Logo and brand mark | `src/assets/branding/`, `src/ui/brandMark.js`, `public/icons/` |
| World Builder live view (`/play/?live`: the open draft over the real world) | `src/poi/poiLive.js` (game half), `tools/poi-editor/src/liveLink.js` (builder half) |
| World Builder (POIs: build, review, DM content, Sandbox) | `tools/poi-editor/` (the editor, see its README), `src/poi/` (the law, `poiLawV2.js`; the game logic, `poiDmCore.js`) |
| POI trades and events in the world, paid by the server | `src/poi/poiDmRuntime.js`, `src/poi/poiHost.js`, `server-account/src/poiTrade.js` |
| What level a fight is built at (party level, dungeon session, wilds, quests) | `src/characters/encounterLevel.js` (all the numbers), `dungeonLevel.js`, `wildLevel.js`, `mentorMode.js` `partyLevel` |
| The air's small life: fireflies, butterflies, petals, dust, sun shafts, far birds (visual only, OFF unless `?atmo=on`) | `src/render/atmosphere.js` (sim and draw), `src/weather/atmosphereHost.js` (the host), six lines in `world.js` marked `ATMO1` |

## Folders in `src/`

`formats/` reads Daggerfall's files. `world/` builds towns, blocks and dungeons from them. `scenes/` holds the hosts and
their modules. `systems/` is game rules and state. `net/` is the wire, the client for the servers and the laws both
ends share. `ui/` is every window. `render/` is the WebGL renderer. `combat/`, `characters/`, `player/`, `ai/` and
`poi/` are what their names say.

## Facts about the game's files

Checked against the real data, so worth trusting:

- Every town with a palace and at least 40 houses keeps all seven Bunnyfall guilds. Smaller towns hold fewer.
- Guild halls are converted houses (House1 to House4), so they read as houses until a banner and the map colour mark them.
- Lantern flame heights on chain lights are measured per texture in `src/homes/decorFlame.js`.

## Open work

- Small leftovers in the paperdoll back view: a stray skin block beside a loincloth, blocky hair, shields drawn flat.
- Player festivals are `playerFestivalLaw.js`, not the Witches' Festival (`festivalLaw.js` and `server-account/src/festival.js` are upstream's calendar event, switched off).
- **Atmosphere (ATMO1) is written but has never been seen running in the real game**, so it ships off. Try it with
  `?atmo=on` (`&atmoSeason=spring|summer|autumn|winter` pins the season, `&atmoDebug` exposes `window.__atmo`). Known
  gaps: the sun shafts stand in the open as well as under trees (they should be tied to woods and capped at canopy height),
  fireflies and butterflies ignore where flowers, woods and water are, and the open-land wish list (denser forest floor,
  mountains, streams, wildlife) is not started. The exterior host (`exterior.js`) has no hook yet.
- Mothsbee's "Decor & Miscellanea" sprite pack (113 sprites: anvils and cauldrons in five metals, potions, jars, food,
  lanterns, mannequins) is not in the repo: its licence was not checked. Import it with `node tools/importDfmod.mjs`
  once the licence is known and add it to `src/ui/credits.js`.
