// @ts-check
// ═══════════════════════════════════════════════════════════════════
// AUDIT-ACC F2: WHAT THIS SERVICE IS, SEPARATE FROM ITS ENTRYPOINT.
//
// These four constants lived in `src/index.js` until the audit stood
// the Worker up in a real workerd and it refused to boot:
//
//   Uncaught TypeError: Incorrect type for map entry 'ACCOUNT_VERSION':
//   the provided value is not of type 'function or ExportedHandler'.
//
// IN A MODULE WORKER, EVERY NAMED EXPORT OF THE ENTRYPOINT IS AN
// ENTRYPOINT. workerd reads them as additional handlers - a
// WorkerEntrypoint, a Durable Object, a Workflow - and a plain string
// or Set is not one of those, so it is a hard startup failure rather
// than something ignored. The relay's own `server/src/index.js` is the
// control: it exports `default` and the `Room` Durable Object class,
// both legal, and it has deployed for months.
//
// No node test could see this. The tests IMPORTED those very names, so
// they proved the exports existed while the runtime rejected them for
// existing. The fix is not to hide them - it is to stop the entrypoint
// doubling as a library. The entrypoint answers requests; this file
// says what the service is; both the entrypoint and the tests read it
// from here.
// ═══════════════════════════════════════════════════════════════════

import { busyRead, BUSY_SHED_MS } from '../../src/net/busyLaw.js';   // BUSY-GATE: the reads an overloaded isolate sheds, one law with the client's gate

/** Bumped with every change to this Worker's law, and answered by
 *  /v1/health - the same discipline RELAY_VERSION keeps, for the same
 *  reason: a deploy that did not happen looks exactly like one that
 *  did. Kept in step with ACCOUNT_VERSION in wrangler.toml, which
 *  test/server/accountworker.test.js holds. */
export const ACCOUNT_VERSION = 'acct203';   // acct203: HUNTERS-MARK and MARKS-OF-MASTERY (acct201, then acct202, on its branch, renumbered past JEWEL-KIN's acct197 and FIELD BUGS 2026-10-26r's acct198 at the merges; bible/06-Systems/Bounty-Boards.md section 12): /v1/hunt/state and /v1/hunt/clear (migration 0181, hunt_clears - 0178, then 0180, on its branch, renumbered at the merges), a seat's influence from a bounty's clear (migration 0182, the hunt source - 0179, then 0181, on its branch), the hunt's, the Masters' and the sea's sixteen titles derived at every ask, the account read's wardrobe carrying the Annals' pages kept, and the Trophy Hunter's harvest. A service without the routes leaves the client keeping its clears to send again, so either side may deploy first. AUDIT HORIZONTAL, in the same release (bible/01-Overview/audits/Audit-Horizontal.md): a Master's work signs its values (B1), a recruit is held by a character and the day's 24 in one statement (C2, C8), the hunt's day is 750 and says its day (F3), a mark's rung reads its week (F10), the Marks of Mastery ride letters and notes (F5), and a living Master needs a realm row.
// acct202: APPEARANCES (acct200, then acct201, on its branch; bible/04-Characters/Wardrobe.md section 7): a piece's look (`appearance`, { t, m, v }) is a declared item field the judge reads and a receiver's mark the wire's clamp strips (systems/item/itemFields.js, net/realm/realmTradeLaw.js RECEIVER_MARKS, systems/loot/loot.js), so a trade's offer and its checkpoint agree on a piece that wears a look; and POWER-CEILING's two leaf modules (powerCeiling.js, sigil/setReach.js) join the bundle through lootRarity.js without running there. No route, table or migration; deploy the account service before the site (AUDIT HORIZONTAL E8: the new site offers a piece in a look without its look, which an acct199 record still holds, so acct199 refuses the trade, the listing and the vault).
// acct201: SEA-OPEN (acct199, then acct200, on its branch) - CREW-SIGNED's /v1/crew/hall, /v1/crew/sign and /v1/crew/release (migration 0180, crew_signed; the hourly sweep): a crew hall's recruit held by the account that signed him for the day. A service without the routes leaves the client hiring as before, so either side may deploy first.
// acct200: MASTER-ART (acct198, then acct199, on its branch) - /v1/prof/master, a Master's work (migration 0179, prof_masters): a Legendary of chosen lines rolled in the band, its record's `l` and mint version 5 (4 on its branch, past JEWEL-KIN's 4); the judge reads its lines against its record; profState says `master.made`. Deploy the account service before the site.
// acct199: CRAFT-HALL (acct196, acct197, then acct198, on its branch, renumbered past WOVEN-PAYS, JEWEL-KIN and FIELD BUGS 2026-10-26r at the merges) - profState says what the character has made; either side may deploy first.
// acct198: FIELD BUGS 2026-10-26r (RPT1026, the private reports of 10-18 to 10-26; acct197 on its branch, renumbered past JEWEL-KIN and MASTER-THREE's acct197 at the merge; bible/01-Overview/bugs/Field-Bugs-2026-10-26r.md) - RECOVERY HOLDS (a password change, a sign-in's rehash and its session, a device admitted and a recovery's own session each write only on the hash or the session their request verified); CHESTGOLD (a shared chest's gold paid into the record in the settle's own batch, `purse`; its hold kept, op `hold`, a lapsed one refused `decor-lapsed`; the owner's access change refused `decor-busy` under another's open window); LEDGERLAW (`products.handed_to`, written at each hand-over the service makes, read by the ledger before the owner; a character finding excused by its values, `law_v`, a clean checkpoint ending the excuse - migration 0178_rpt1026_ledgerlaw); MARKET (/v1/market/road, a collect's `landed` repeat, the holds' words). An older client sends no `purse`, no `hold` and no `landed`, and is answered as before; AUDIT RPT1026 (the batch audited): a recovery signs every device out only while its own password stands (A3, accounts.js recover), the owner's access change is no longer refused while a guest holds the chest (B2) and a settle already landed answers its retry as landed (B3, decorAccess.js decorSettle); the shared law it bundles moved under F1 (masterSkills.js, the switch's held practice) and F3 (absorption.js and effects.js, a self-cast absorb asking no more room than the cast spent); and C1 (ledger.js, realmTrade.js: the craft record hands over only from the account it names, the trade's other side or the escrow's), C2 (verdict.js: a piece's excuse is not ended by a clean checkpoint, only an excuse of character values) and C5 (judge.js: a cut set of law values is marked and never excused)
// acct197: JEWEL-KIN and MASTER-THREE (FIELD BUGS 2026-10-26d, acct195 then acct196 on its branch, renumbered past LOCKPICK's acct195 and WOVEN-PAYS' acct196 at its merges; Discord #feature-feedback "jewelcrafting, roll chances not equal (h2h, critical)" and "Let us master all three primary skills"; bible/01-Overview/bugs/Field-Bugs-2026-10-26d.md) - a craft stamps its product record with the mint version its client says it mints (src/net/productRecord.js craftMintVersion: MINT_VERSION 4 at most, MINT_V_LINES for a client that says none), whose jewellery's skill lines lean to Hand-to-Hand and Critical Strike beside the mind's thirteen; and systems/masterSkills.js, which the Worker's graph reaches, holds MASTERY_SLOTS 3/2/1 (no service code reads the slots).
// acct196: WOVEN-PAYS and AUDIT WOVEN-PAYS (FIELD BUGS 2026-10-26b, acct195 on its branch, renumbered past main's LOCKPICK and AUDIT GATHER acct195 at the merge; fogs, #feature-feedback: "First time XP bonus from the Loom still isn't working"; the owner: "Woven cloth pays", then "Audit this"; bible/01-Overview/bugs/Field-Bugs-2026-10-26b.md) - a piece of cloth the character wove or spun pays its first-make share whatever its goods, and cloth bought with silver never does, counted: the bolts of Linen and Wool a character buys with silver (buyStock; market.js a Drakes buy, a courier's load, a buy order filled) against the bolts its stations use (craftAtAnvil, temperPiece) - prof_silver_cloth, migration 0177_woven_pays, filled from the bought cloth held; a judged pattern is made by the craft that laid its first on (prof_crafts.first_paid); a cloth's Stores count and the state say the count (`silver`); the answer's `firstPaid` reads first_paid
// acct195: LOCKPICK and AUDIT GATHER (2026-10-26, the owner: "I want to build a detailed lock picking minigame and introduce a lockpick item"; "Audit the harvesting and gathering systems"; bible/06-Systems/Lockpicking.md 2, Professions-Arc.md 55) - the item law knows the Lockpick (template 584, src/systems/lockpick/lockpickRow.js: deploy the account service before the site, or an honest Lockpick reads as a forgery in the gap); a Motherlode struck only once risen on the service's clock (AUDIT GATHER F2); a haul's school counted on an account's first forty hauls of the day (F3)
// acct194: NIRNROOT-SAGE (2026-10-26, for Blob-Marley, an Immortal backer: "billowing smoke, circling nirn roots around midsection, small glowing green runes encircling feet"; bible/06-Systems/Accounts-And-Cloud-Saves-Arc.md NIRNROOT-SAGE) - NIRNROOT_SAGE_HANDLES grants the Nirnroot Sage title, its glyph and Sage's Smoke together (titles.js TIER_LISTS, TIER_GLYPH, TIER_AURA). Deploy the relay first (world268): this service signs the new glyph into Blob-Marley's every token, which a relay before world268 refuses whole
// acct193: COPY-LIFT (FIELD BUGS 2026-10-25i, acct191 on its branch, renumbered past main's YARD-TOWN acct191 and ECON-LEFT-OUT acct192 at the merge; #bug-reports: "I placed 89 rare/legendary items in a chest ... they were all 'Realm Locked'"; bible/01-Overview/bugs/Field-Bugs-2026-10-25i.md) - staff's purge-dupes with `keep: true` keeps one of each copied piece, destroys only the copies, and lifts a record's own `twice` lock in the same batch (ledger.js ownCopiesLiftable); no checkpoint lifts a copy.
// acct192: ECON-LEFT-OUT and ECON-WORTH (2026-10-25, acct186 on its branch, renumbered past DECOR-USE and PERK-TRIAL's acct186, AFFIX-LINES and REFORGE-REPLACE's acct187, FIRST-BUDGET's acct188, DAEDRIC-SMELT's acct189, BROKER-RID's acct190 and YARD-TOWN's acct191 at the merge; mob: "we need to remove gold of banned or trade held player in staff menu data", "economy", "we need a total games worth as well with hover break down on gold held bank held and item total") - /v1/staff/econ/economy keeps a banned account's and a held character's gold out of its totals, its hours and its richest (staffEconomy.js leftOutSql; their gold never touched, its sum said as gold.leftOut), and answers gold.worth: the living counted characters' wealth, split purse, bank and items; the census tally says its banks' share (`b`, staffCensus.js censusTally - each character's tally text changes once, at its next checkpoint). GUILD-LETTER-FIX (2026-10-25, mob: a player's Dark Brotherhood letter that never came, "do it"; folded into acct186 before it shipped) - /v1/staff/fix/letter, Admins only: a crime guild's letter sent again or called off on one realm character (review.js letterAct, net/repairLaw.js applyGuildLetter), once a ticket, the record seized one sequence on, its realm_repairs row naming the guild's faction below nothing. No migration. Deploy BEFORE the site; no relay change. acct185: CLOTH-GEMS (2026-10-25, acct182 on its branch, renumbered past STAFF-EVENT's acct182, AUDIT HIDDEN-UNCOUNTED's acct183 and STAFF-EVENT BOSS's acct184 at the merge; the player SaberGGaming's "Profession oversights", the owner: "No band aids"; bible/06-Systems/Professions-Arc.md section 50) - the loom weaves Linen from Root Tendrils and spins Wool from furs (/v1/prof/smelt's weave:linen-north, weave:linen-south and spin:<fur> - net/professionLaw.js WEAVE_RECIPES, SPIN_RECIPES); AUDIT 32 S1 is judged by the units - a recipe wholly of the counter's cloth lays its first-make 500 on only where none of its inputs is held loose or bought (craftAtAnvil's `p`, B7's own test; the answer's `firstPaid`), and a disenchant pays a piece of it Enchanting XP only where it is its maker's own (alchemy.js); the jeweller sets every grade of gem (the thirty-two graded gems' material keys, gem:<grade>-<kind>, in by the loose door alone; a recipe id a grade - 504 jewels; a gem's points its grade's ladder; a Lapidary's cracked gem a plain one's); a craft's first-make kin is one JSON bind (json_each - a Wand's 82); no buy order, Stores listing or commission names a graded gem (market.js; writLaw.js commissionUnyielded). No migration. Deploy BEFORE the site; no relay change. acct184: STAFF-EVENT BOSS (2026-10-25, mob: "need be able to eneter a exact amount of healt for mini bosses", "let me clear other events as well form history"; bible/11-Multiplayer/Staff-Events.md) - a staging carries the boss's exact health (`hp`, the law's), and /v1/staff/event 'clear' takes an event that is over off the list (one by `id`, or `all`; a live one never; audited 'event-clear'). Deploy BEFORE the site; the relay's world257 carries `hp`. acct183: AUDIT HIDDEN-UNCOUNTED (2026-10-25, acct182 on its branch, renumbered past STAFF-EVENT's acct182 at the merge; the owner, asked: "Last seen when hid"; bible/01-Overview/audits/Audit-Hidden-Uncounted.md C1) - a hidden staff member reads offline in their guild, last online the moment they hid (guilds.js viewOf, staffHidden.js hiddenSince), and the reader's own row says `hidden`. acct182: STAFF-EVENT (2026-10-24, acct181 and migration 0166 on its branch, renumbered past KETCH's acct181 and 0166 at the merge; mob: "lets start making an event tool for staff to use" - bible/11-Multiplayer/Staff-Events.md) - /v1/staff/event and /v1/staff/events, Admins only, migration 0167; acct181: KETCH (2026-10-24, acct180 on its branch, renumbered past FOE-KEEPS' acct180 at the merge; the owner: "A proper dwarven airship flies in once a week over the skies of daggerfall, and you, along with other players venture into it in a raid like format", "Make the dwarven event 8 player"; bible/11-Multiplayer/Sky-Ketch.md section 9) - /v1/ketch/claim takes the Tonal Warden's `y1` receipt (net/ketch/ketchReceipt.js, verified with the gate's key) and keeps one row a voyage and account (migration 0166_ketch_voyages, ketch.js): the first receipt it is shown takes the voyage's share and grants the account's spoils, a receipt of the same voyage from another crew's ship is answered `taken`, and the same ship's again pays its share only to the device's claim id that wrote the row (`cid`, AUDIT KETCH L2-1), the budget's fill in the claim's own batch (L2-9); and the item law moves to 13 (systems/item/itemLaw.js ITEM_LAW_VERSION): the Gilded rung's Ketch pair - Volendrung's Echo, a gilded Dwarven Thunderlock, and the Ketchmaster's Word, a gilded Dwarven Pistolet (systems/gilded.js) - lawful from it on. Deploy BEFORE the site; the relay's world253 mints the receipts. acct179: STAFF-PANEL 0.2.3, the staff panel's five features folded (2026-10-23, mob picked "The five WIP features"; acct177 on their branches, renumbered past ACCOUNT-HOMES' acct177 and GUNS-UNFOUND's acct178 at the fold) - STAFF-SET-BANK (mob: "we need a set bank setting"), the Staff Panel sets a realm character's bank - the total the profile says, still the one staff read, made the Empire's account holding the gold named, once a ticket, the record seized one sequence on and the gold witnessed, its faucet the gold the judge counts (/v1/staff/fix/bank; review.js bankAct, net/repairLaw.js applyBankSet); STAFF-BANNED (mob: "player that are banned need to be taken out of staff panel list of players we need a tab for banned players as well", "add a ban status as well to player list", "so we can filter them"), the staff panel's Players list says each ban and leaves the banned out unless filtered for, and a Banned tab lists every account banned now with until when, the reason and who set it, on an index of its own (migration 0164); STAFF-HIDE-TOGGLE (mob: "i cant talk in chat?", "need hide to be a toggle"), Hide me off by default for every staff member - its switch moved to players.staff_hide_on, a Hide me pressed since 0159 kept (migration 0165) - and the mint's lapse read beside the switch; STAFF-CHAT-RED and STAFF-VIEW1 are the game's halves alone. Deploy BEFORE the site; no relay change. acct178: GUNS-UNFOUND (2026-10-23, the owner: "remove the thunderlock and pistolet from the loot pool and revert the gilded weapon from the serpent"; bible/06-Systems/Gilded.md section 9; acct177 on its branch, renumbered past ACCOUNT-HOMES' acct177 at the merge) - the item law moves to 12 (systems/item/itemLaw.js ITEM_LAW_VERSION): the Hourlock is lawful as the gilded Dwarven Long Bow it is minted as now and as the Thunderlock minted before (systems/gilded.js HOURLOCK_GUN_ERA), the Sunken Sovereign as the Ebony Saber again and as the Pistolet minted between (SOVEREIGN_PISTOLET_ERA). No migration: law 11 never saw a bow Hourlock. acct177: ACCOUNT-HOMES and GUILD-HALL-SALE (2026-10-06, asked: "Deleted characters should remove their houses from online", "House ownership should be account bound, not character bound", "Guild houses should be able to be sold, like regular houses"; acct90 and migration 0087 on its branch, renumbered past main's acct91-acct176 and migrations 0087-0162 at its merge, 2026-10-23; bible/06-Systems/Online-Arc.md ACCOUNT-HOMES): a home is its account's - every character of it decorates it, paints it, rents it out, stocks its trader, collects its rent and sells it, the gold its own record's (decor.js OWNS, rent.js, market.js, homes.js realmRelease) - its buyer's cap and its buyer's delete still its own (a deed the realm gave stays its knight's); the town's answer and the vendor board tell any realm character of the account a home's sale and door, and its guild entry the guilds of all the account's characters; a delete waits for goods another character stocked at its homes' traders ('home-vendor-stocked') and lets its towns' kept yards go; migration 0163_account_homes releases the homes of realm characters already gone; a guild's hall is sold at its own door (`hallSell`, `refund` on the town's answer; sellHall's `mapId`/`buildingKey`). Deploy BEFORE the site; no relay change. acct176: STAFF-PANEL-SPEED (2026-10-23, mob: "slow when moving in menus"), the staff routes' reads and audit rows folded into fewer D1 round trips, with two indexes (migrations 0161-0162). acct175: STAFF-PANEL5, the staff panel relay half: follow tokens, Message on screen, the staff feeds, hidden staff, freeze and staff chat; acct174 on its branch, renumbered past STAFF-PANEL2-6 at its merge; migrations 0157-0160. acct174: STAFF-PANEL2 to STAFF-PANEL6, the staff panel's server side (2026-10-22, mob: "do all 6", "serer side shit should have AALLLL been done"; acct171 on its branch, then acct172, renumbered past AUDIT COLLECTIONS-II's acct171, SEA VENTURES' acct172 and LOST-SPOILS' acct173 at the merges) - step 2 (2026-10-22, mob: "do all 6"; design doc "DFO Staff Panel: design", build step 2) - the staff panel's reports (staffCases.js): the open chat cases most urgent first, one case with its strike record, a case claimed by one staff member (a Moderator one at a time; mod_cases.claimed_by, claim_until and claim_from, migration 0149; a Discord press leaves a case another holds in the panel alone), and Mute, Ban, Unban and Dismiss made as the game's moderators' own acts, from the panel; step 3 notes, watchlist, settings, server notice and the AI scorecard (staffDesk.js, migration 0150), players: search, profile, devices and rename (staffPlayers.js, 0151), trade holds, roll back, the account fix desk, unexplained gains and item removal (staffRealm.js, 0152), market and trades, node activity and the economy (staffEconomy.js, 0153); step 4 the census and contested pieces (staffCensus.js, 0154); step 6 the status tiles, the limits an Admin sets and Home (staffStatus.js, 0155).
// acct191: YARD-TOWN (2026-10-25, players: "Decorative items placed in any house yard in that area disappear after restarting the game"), a town's yards bound at the placement - DECOR_YARDS_TOWN_MAX 6,500, a piece past it refused as yard-town-full - and every town built again at the bound (migration 0175); acct177 on its branch, renumbered past acct177-acct190 at its merges. acct190: BROKER-RID (AUDIT FB1024, 2026-10-25, the owner: "Audit this", of FIELD BUGS 2026-10-24's EMBERS-OWED - #bug-reports: "I now have 52 deadlands embers on me, and it will not let me buy the aura"; bible/01-Overview/bugs/Field-Bugs-2026-10-24.md; acct182 on its branch, renumbered past main's acct182-acct189 at the merges) - a press of the Broker's insignia or her Panoply piece carries a request id (`rid`), written beside its sale (migration 0174_broker_sales, brokerSales.js); /v1/broker/settle answers the sale an id wrote and its first ask, or fences the id so the press can never write after. + VENDOR-LOST (FIELD BUGS 2026-10-25g, a trader's two pieces bought, the gold gone and the pieces never come - bible/01-Overview/bugs/Field-Bugs-2026-10-25g.md; acct177 on its branch, renumbered past main's acct177-acct190 at the merges), a gold buy asked again from the sequence before it, with a sale its id made, answered as that sale landed with the record's sequence, to a tab that says it reads it so (`landed`). acct190: BROKER-RID (AUDIT FB1024, 2026-10-25, the owner: "Audit this", of FIELD BUGS 2026-10-24's EMBERS-OWED - #bug-reports: "I now have 52 deadlands embers on me, and it will not let me buy the aura"; bible/01-Overview/bugs/Field-Bugs-2026-10-24.md; acct182 on its branch, renumbered past main's acct182-acct189 at the merges) - a press of the Broker's insignia or her Panoply piece carries a request id (`rid`), written beside its sale (migration 0174_broker_sales, brokerSales.js); /v1/broker/settle answers the sale an id wrote and its first ask, or fences the id so the press can never write after. + WILD-REJOIN (2026-10-25, acct186 on its branch, renumbered past DECOR-USE and PERK-TRIAL, AFFIX-LINES and REFORGE-REPLACE, FIRST-BUDGET, DAEDRIC-SMELT and DEEP-OPEN, and BROKER-RID at the merges; FIELD BUGS 2026-10-25h; bible/11-Multiplayer/Wild-Zone.md section 4) - /v1/wild/fall lets a killer carry a fall receipt at once where the relay signed it with its fallen gone from the room (`g` 1, net/wild/wildReceipt.js wildFallGraceS); every other fall keeps WILD_FALL_GRACE_S. No migration. Deploy BEFORE the relay's world260, which signs `g`, and the site. acct190: BROKER-RID (AUDIT FB1024, 2026-10-25, the owner: "Audit this", of FIELD BUGS 2026-10-24's EMBERS-OWED - #bug-reports: "I now have 52 deadlands embers on me, and it will not let me buy the aura"; bible/01-Overview/bugs/Field-Bugs-2026-10-24.md; acct182 on its branch, renumbered past main's acct182-acct189 at the merges) - a press of the Broker's insignia or her Panoply piece carries a request id (`rid`), written beside its sale (migration 0174_broker_sales, brokerSales.js); /v1/broker/settle answers the sale an id wrote and its first ask, or fences the id so the press can never write after.
// acct190: BROKER-RID (AUDIT FB1024, 2026-10-25, the owner: "Audit this", of FIELD BUGS 2026-10-24's EMBERS-OWED - #bug-reports: "I now have 52 deadlands embers on me, and it will not let me buy the aura"; bible/01-Overview/bugs/Field-Bugs-2026-10-24.md; acct182 on its branch, renumbered past main's acct182-acct189 at the merges) - a press of the Broker's insignia or her Panoply piece carries a request id (`rid`), written beside its sale (migration 0174_broker_sales, brokerSales.js); /v1/broker/settle answers the sale an id wrote and its first ask, or fences the id so the press can never write after.
// acct189: DAEDRIC-SMELT + DEEP-OPEN (2026-10-25, acct182 on its branch, renumbered past STAFF-EVENT's acct182, AUDIT HIDDEN-UNCOUNTED's acct183, STAFF-EVENT BOSS's acct184, CLOTH-GEMS's acct185, DECOR-USE and PERK-TRIAL's acct186, AFFIX-LINES and REFORGE-REPLACE's acct187 and FIRST-BUDGET's acct188 at the merge; bible/06-Systems/Professions-Arc.md section 53; the report, SaberGGaming's; the owner: "No band aids", "the heart may come FROM LOOT OR THE GATE", "FULL ORE TABLE") - /v1/prof/smelt smelts the Daedric Ingot: an Ebony Ingot, a Daedra's Heart (loose alone, a catalyst) and a Deadlands Ember a unit, the ember spent from the account's purse in the smelt's own decision (`insignia_spent`, the Broker's reading - refused `prof-embers` short); the harvest's dungeon vein nobody has witnessed draws the deep table whole (nodeLaw.js dungeonVein), its Diamond with it, the account's four a day the bound, the climate's Moonstone still the witnesses'
// acct188: FIRST-BUDGET and POTION-DOOR (2026-10-25, acct182 on its branch, renumbered past STAFF-EVENT's acct182, AUDIT HIDDEN-UNCOUNTED's acct183, STAFF-EVENT BOSS's acct184, CLOTH-GEMS's acct185, DECOR-USE and PERK-TRIAL's acct186 and AFFIX-LINES and REFORGE-REPLACE's acct187 at the merge; SaberGGaming's report: "Provisioning is slow" and "potions from recipes give no XP"; the owner: "No band aids"; the owner, asked: "Match Smithing's pace"; bible/06-Systems/Professions-Arc.md section 52) - a first-make's XP is its track's share, set so every crafting track reaches Master in the crafts Smithing takes, 500 at the least (src/net/recipeLaw.js FIRST_MAKE_SHARE, FIRST_MAKE_FLOOR - firstCraftXp, workFirstXp, brewFirstXp; derived by tools/craftPace.mjs firstShares; CLOTH-GEMS' `p` still says whether a first pays, the share how much), laid on by /v1/prof/craft, /v1/prof/smelt (a mason's work) and /v1/prof/brew where they laid a flat 500: Smithing's 500 as it was, Outfitting's 511, Building's 1,823, Provisioning's 3,155; the potion maker's mix at an alchemy station (a Mages Guild hall one now) is the brew, no new route. No migration. Deploy BEFORE the site; no relay change.
// acct187: AFFIX-LINES and REFORGE-REPLACE (2026-10-25, acct182 on its branch, renumbered past STAFF-EVENT's acct182, AUDIT HIDDEN-UNCOUNTED's acct183, STAFF-EVENT BOSS's acct184, CLOTH-GEMS's acct185 and DECOR-USE and PERK-TRIAL's acct186 at the merge; a player - SaberGGaming: carrying capacity on four Rare pieces in five; the owner: "No band aids", and for the Reforge "Replace, price rises"; bible/06-Systems/Loot-Rarity.md, the affix law, and Loot-Arc.md section 11) - /v1/prof/reforge takes the piece's `count` (its reforges, systems/loot/lootRarity.js reforgeCount; absent, none - a page from before it) and asks 2 or 5 Arcane Essence doubled for each (net/temperLaw.js reforgeEssence; a count no piece holds refused `prof-reforge`, nothing spent); a craft stamps mint version 2 on its record (net/productRecord.js MINT_V_LINES: its quality's roll drawn over the lines, the piece named by them - a record of 1 or none mints as it always did); and the item law moves to 14 (systems/item/itemLaw.js ITEM_LAW_VERSION): the Reforge's count (`reforges`) a mark of the tiers it takes alone - on a Legendary no Exalted, or a piece of no tier, a finding from it on. Deploy BEFORE the site; no relay change. acct186: DECOR-USE and PERK-TRIAL (2026-10-24, acct182 on its branch, renumbered past STAFF-EVENT's acct182, AUDIT HIDDEN-UNCOUNTED's acct183, STAFF-EVENT BOSS's acct184 and CLOTH-GEMS's acct185 at the merge; the Discord's feature-feedback - "Make bed decor and firepit decor actually funtional" and "The time limit of a profession's perks changing", the owner picking the trial and the change at once; bible/06-Systems/Online-Arc.md DECOR-USE, Professions-Arc.md section 51 PERK-TRIAL) - the decor law's tenth station, `cooking` (net/decorLaw.js DECOR_STATIONS, its licence 50,000 gold as the crafts'), kept and charged by the shared law; /v1/prof/spec changes a choice free and at once on its day of trial (SPEC_TRIAL_S, a `prof_choices` row), a paid change takes effect at once and locks the track's next paid change a week (`respec_at`), a change asked as a trial's past its day refused unburnt (`prof-trial-over`), and the track says `trial` and `lock`; migration 0173_perk_trial adds each rank's choice's time and lands every change still waiting its week. Deploy BEFORE the site; no relay change. acct185: CLOTH-GEMS (2026-10-25, acct182 on its branch, renumbered past STAFF-EVENT's acct182, AUDIT HIDDEN-UNCOUNTED's acct183 and STAFF-EVENT BOSS's acct184 at the merge; the player SaberGGaming's "Profession oversights", the owner: "No band aids"; bible/06-Systems/Professions-Arc.md section 50) - the loom weaves Linen from Root Tendrils and spins Wool from furs (/v1/prof/smelt's weave:linen-north, weave:linen-south and spin:<fur> - net/professionLaw.js WEAVE_RECIPES, SPIN_RECIPES); AUDIT 32 S1 is judged by the units - a recipe wholly of the counter's cloth lays its first-make 500 on only where none of its inputs is held loose or bought (craftAtAnvil's `p`, B7's own test; the answer's `firstPaid`), and a disenchant pays a piece of it Enchanting XP only where it is its maker's own (alchemy.js); the jeweller sets every grade of gem (the thirty-two graded gems' material keys, gem:<grade>-<kind>, in by the loose door alone; a recipe id a grade - 504 jewels; a gem's points its grade's ladder; a Lapidary's cracked gem a plain one's); a craft's first-make kin is one JSON bind (json_each - a Wand's 82); no buy order, Stores listing or commission names a graded gem (market.js; writLaw.js commissionUnyielded). No migration. Deploy BEFORE the site; no relay change. acct184: STAFF-EVENT BOSS (2026-10-25, mob: "need be able to eneter a exact amount of healt for mini bosses", "let me clear other events as well form history"; bible/11-Multiplayer/Staff-Events.md) - a staging carries the boss's exact health (`hp`, the law's), and /v1/staff/event 'clear' takes an event that is over off the list (one by `id`, or `all`; a live one never; audited 'event-clear'). Deploy BEFORE the site; the relay's world257 carries `hp`. acct183: AUDIT HIDDEN-UNCOUNTED (2026-10-25, acct182 on its branch, renumbered past STAFF-EVENT's acct182 at the merge; the owner, asked: "Last seen when hid"; bible/01-Overview/audits/Audit-Hidden-Uncounted.md C1) - a hidden staff member reads offline in their guild, last online the moment they hid (guilds.js viewOf, staffHidden.js hiddenSince), and the reader's own row says `hidden`. acct182: STAFF-EVENT (2026-10-24, acct181 and migration 0166 on its branch, renumbered past KETCH's acct181 and 0166 at the merge; mob: "lets start making an event tool for staff to use" - bible/11-Multiplayer/Staff-Events.md) - /v1/staff/event and /v1/staff/events, Admins only, migration 0167; acct181: KETCH (2026-10-24, acct180 on its branch, renumbered past FOE-KEEPS' acct180 at the merge; the owner: "A proper dwarven airship flies in once a week over the skies of daggerfall, and you, along with other players venture into it in a raid like format", "Make the dwarven event 8 player"; bible/11-Multiplayer/Sky-Ketch.md section 9) - /v1/ketch/claim takes the Tonal Warden's `y1` receipt (net/ketch/ketchReceipt.js, verified with the gate's key) and keeps one row a voyage and account (migration 0166_ketch_voyages, ketch.js): the first receipt it is shown takes the voyage's share and grants the account's spoils, a receipt of the same voyage from another crew's ship is answered `taken`, and the same ship's again pays its share only to the device's claim id that wrote the row (`cid`, AUDIT KETCH L2-1), the budget's fill in the claim's own batch (L2-9); and the item law moves to 13 (systems/item/itemLaw.js ITEM_LAW_VERSION): the Gilded rung's Ketch pair - Volendrung's Echo, a gilded Dwarven Thunderlock, and the Ketchmaster's Word, a gilded Dwarven Pistolet (systems/gilded.js) - lawful from it on. Deploy BEFORE the site; the relay's world253 mints the receipts. acct179: STAFF-PANEL 0.2.3, the staff panel's five features folded (2026-10-23, mob picked "The five WIP features"; acct177 on their branches, renumbered past ACCOUNT-HOMES' acct177 and GUNS-UNFOUND's acct178 at the fold) - STAFF-SET-BANK (mob: "we need a set bank setting"), the Staff Panel sets a realm character's bank - the total the profile says, still the one staff read, made the Empire's account holding the gold named, once a ticket, the record seized one sequence on and the gold witnessed, its faucet the gold the judge counts (/v1/staff/fix/bank; review.js bankAct, net/repairLaw.js applyBankSet); STAFF-BANNED (mob: "player that are banned need to be taken out of staff panel list of players we need a tab for banned players as well", "add a ban status as well to player list", "so we can filter them"), the staff panel's Players list says each ban and leaves the banned out unless filtered for, and a Banned tab lists every account banned now with until when, the reason and who set it, on an index of its own (migration 0164); STAFF-HIDE-TOGGLE (mob: "i cant talk in chat?", "need hide to be a toggle"), Hide me off by default for every staff member - its switch moved to players.staff_hide_on, a Hide me pressed since 0159 kept (migration 0165) - and the mint's lapse read beside the switch; STAFF-CHAT-RED and STAFF-VIEW1 are the game's halves alone. Deploy BEFORE the site; no relay change. acct178: GUNS-UNFOUND (2026-10-23, the owner: "remove the thunderlock and pistolet from the loot pool and revert the gilded weapon from the serpent"; bible/06-Systems/Gilded.md section 9; acct177 on its branch, renumbered past ACCOUNT-HOMES' acct177 at the merge) - the item law moves to 12 (systems/item/itemLaw.js ITEM_LAW_VERSION): the Hourlock is lawful as the gilded Dwarven Long Bow it is minted as now and as the Thunderlock minted before (systems/gilded.js HOURLOCK_GUN_ERA), the Sunken Sovereign as the Ebony Saber again and as the Pistolet minted between (SOVEREIGN_PISTOLET_ERA). No migration: law 11 never saw a bow Hourlock. acct177: ACCOUNT-HOMES and GUILD-HALL-SALE (2026-10-06, asked: "Deleted characters should remove their houses from online", "House ownership should be account bound, not character bound", "Guild houses should be able to be sold, like regular houses"; acct90 and migration 0087 on its branch, renumbered past main's acct91-acct176 and migrations 0087-0162 at its merge, 2026-10-23; bible/06-Systems/Online-Arc.md ACCOUNT-HOMES): a home is its account's - every character of it decorates it, paints it, rents it out, stocks its trader, collects its rent and sells it, the gold its own record's (decor.js OWNS, rent.js, market.js, homes.js realmRelease) - its buyer's cap and its buyer's delete still its own (a deed the realm gave stays its knight's); the town's answer and the vendor board tell any realm character of the account a home's sale and door, and its guild entry the guilds of all the account's characters; a delete waits for goods another character stocked at its homes' traders ('home-vendor-stocked') and lets its towns' kept yards go; migration 0163_account_homes releases the homes of realm characters already gone; a guild's hall is sold at its own door (`hallSell`, `refund` on the town's answer; sellHall's `mapId`/`buildingKey`). Deploy BEFORE the site; no relay change. acct176: STAFF-PANEL-SPEED (2026-10-23, mob: "slow when moving in menus"), the staff routes' reads and audit rows folded into fewer D1 round trips, with two indexes (migrations 0161-0162). acct175: STAFF-PANEL5, the staff panel relay half: follow tokens, Message on screen, the staff feeds, hidden staff, freeze and staff chat; acct174 on its branch, renumbered past STAFF-PANEL2-6 at its merge; migrations 0157-0160. acct174: STAFF-PANEL2 to STAFF-PANEL6, the staff panel's server side (2026-10-22, mob: "do all 6", "serer side shit should have AALLLL been done"; acct171 on its branch, then acct172, renumbered past AUDIT COLLECTIONS-II's acct171, SEA VENTURES' acct172 and LOST-SPOILS' acct173 at the merges) - step 2 (2026-10-22, mob: "do all 6"; design doc "DFO Staff Panel: design", build step 2) - the staff panel's reports (staffCases.js): the open chat cases most urgent first, one case with its strike record, a case claimed by one staff member (a Moderator one at a time; mod_cases.claimed_by, claim_until and claim_from, migration 0149; a Discord press leaves a case another holds in the panel alone), and Mute, Ban, Unban and Dismiss made as the game's moderators' own acts, from the panel; step 3 notes, watchlist, settings, server notice and the AI scorecard (staffDesk.js, migration 0150), players: search, profile, devices and rename (staffPlayers.js, 0151), trade holds, roll back, the account fix desk, unexplained gains and item removal (staffRealm.js, 0152), market and trades, node activity and the economy (staffEconomy.js, 0153); step 4 the census and contested pieces (staffCensus.js, 0154); step 6 the status tiles, the limits an Admin sets and Home (staffStatus.js, 0155).
// acct180: FOE-KEEPS and its audit (2026-10-24, the owner: "I dont want people to lose everything they have"; asked, "Only PvP deaths drop" and "The usual tenth" - bible/11-Multiplayer/Wild-Zone.md section 4) - /v1/wild/fall refuses a death to a foe (`foe`, nothing moved) and a kill's drop takes a tenth of the purse, the cart's coin and each companion's, where it took half; AUDIT FOE-KEEPS L3: the version moves with the law, so the site's deploy gate waits on it
// acct179: STAFF-PANEL 0.2.3, the staff panel's five features folded (2026-10-23, mob picked "The five WIP features"; acct177 on their branches, renumbered past ACCOUNT-HOMES' acct177 and GUNS-UNFOUND's acct178 at the fold) - STAFF-SET-BANK (mob: "we need a set bank setting"), the Staff Panel sets a realm character's bank - the total the profile says, still the one staff read, made the Empire's account holding the gold named, once a ticket, the record seized one sequence on and the gold witnessed, its faucet the gold the judge counts (/v1/staff/fix/bank; review.js bankAct, net/repairLaw.js applyBankSet); STAFF-BANNED (mob: "player that are banned need to be taken out of staff panel list of players we need a tab for banned players as well", "add a ban status as well to player list", "so we can filter them"), the staff panel's Players list says each ban and leaves the banned out unless filtered for, and a Banned tab lists every account banned now with until when, the reason and who set it, on an index of its own (migration 0164); STAFF-HIDE-TOGGLE (mob: "i cant talk in chat?", "need hide to be a toggle"), Hide me off by default for every staff member - its switch moved to players.staff_hide_on, a Hide me pressed since 0159 kept (migration 0165) - and the mint's lapse read beside the switch; STAFF-CHAT-RED and STAFF-VIEW1 are the game's halves alone. Deploy BEFORE the site; no relay change. acct178: GUNS-UNFOUND (2026-10-23, the owner: "remove the thunderlock and pistolet from the loot pool and revert the gilded weapon from the serpent"; bible/06-Systems/Gilded.md section 9; acct177 on its branch, renumbered past ACCOUNT-HOMES' acct177 at the merge) - the item law moves to 12 (systems/item/itemLaw.js ITEM_LAW_VERSION): the Hourlock is lawful as the gilded Dwarven Long Bow it is minted as now and as the Thunderlock minted before (systems/gilded.js HOURLOCK_GUN_ERA), the Sunken Sovereign as the Ebony Saber again and as the Pistolet minted between (SOVEREIGN_PISTOLET_ERA). No migration: law 11 never saw a bow Hourlock. acct177: ACCOUNT-HOMES and GUILD-HALL-SALE (2026-10-06, asked: "Deleted characters should remove their houses from online", "House ownership should be account bound, not character bound", "Guild houses should be able to be sold, like regular houses"; acct90 and migration 0087 on its branch, renumbered past main's acct91-acct176 and migrations 0087-0162 at its merge, 2026-10-23; bible/06-Systems/Online-Arc.md ACCOUNT-HOMES): a home is its account's - every character of it decorates it, paints it, rents it out, stocks its trader, collects its rent and sells it, the gold its own record's (decor.js OWNS, rent.js, market.js, homes.js realmRelease) - its buyer's cap and its buyer's delete still its own (a deed the realm gave stays its knight's); the town's answer and the vendor board tell any realm character of the account a home's sale and door, and its guild entry the guilds of all the account's characters; a delete waits for goods another character stocked at its homes' traders ('home-vendor-stocked') and lets its towns' kept yards go; migration 0163_account_homes releases the homes of realm characters already gone; a guild's hall is sold at its own door (`hallSell`, `refund` on the town's answer; sellHall's `mapId`/`buildingKey`). Deploy BEFORE the site; no relay change. acct176: STAFF-PANEL-SPEED (2026-10-23, mob: "slow when moving in menus"), the staff routes' reads and audit rows folded into fewer D1 round trips, with two indexes (migrations 0161-0162). acct175: STAFF-PANEL5, the staff panel relay half: follow tokens, Message on screen, the staff feeds, hidden staff, freeze and staff chat; acct174 on its branch, renumbered past STAFF-PANEL2-6 at its merge; migrations 0157-0160. acct174: STAFF-PANEL2 to STAFF-PANEL6, the staff panel's server side (2026-10-22, mob: "do all 6", "serer side shit should have AALLLL been done"; acct171 on its branch, then acct172, renumbered past AUDIT COLLECTIONS-II's acct171, SEA VENTURES' acct172 and LOST-SPOILS' acct173 at the merges) - step 2 (2026-10-22, mob: "do all 6"; design doc "DFO Staff Panel: design", build step 2) - the staff panel's reports (staffCases.js): the open chat cases most urgent first, one case with its strike record, a case claimed by one staff member (a Moderator one at a time; mod_cases.claimed_by, claim_until and claim_from, migration 0149; a Discord press leaves a case another holds in the panel alone), and Mute, Ban, Unban and Dismiss made as the game's moderators' own acts, from the panel; step 3 notes, watchlist, settings, server notice and the AI scorecard (staffDesk.js, migration 0150), players: search, profile, devices and rename (staffPlayers.js, 0151), trade holds, roll back, the account fix desk, unexplained gains and item removal (staffRealm.js, 0152), market and trades, node activity and the economy (staffEconomy.js, 0153); step 4 the census and contested pieces (staffCensus.js, 0154); step 6 the status tiles, the limits an Admin sets and Home (staffStatus.js, 0155).
// acct173: LOST-SPOILS (2026-10-22, the owner: "utilize the mailbox as a way to obtain lost items/loot if not picked up from a boss" - asked, "Mail the leftovers"; bible/06-Systems/Accounts-And-Cloud-Saves-Arc.md LOST-SPOILS; acct168 on its branch, renumbered past STAFF-PANEL1's acct168, CRAFT-PAYS' acct169, PISTOLET's acct170, AUDIT COLLECTIONS-II's acct171 and SEA VENTURES' acct172 at the merge) - POST /v1/post/lost writes a boss's floor's leftovers to the post from the Lost and Found, one piece an item, under a kill the service recorded (a gate's, an Hour's, a Redoubt that paid), once a piece, read to its own body bound (lostSpoils.js); a Lost and Found piece's claim is charged to the budget, never witnessed (post.js, realm.js prepareRealmRecord `witness`). No migration.
// acct172: SEA VENTURES (2026-10-22, acct168 on its branch, then acct169 - renumbered past STAFF-PANEL1's acct168, CRAFT-PAYS' acct169, PISTOLET's acct170 and AUDIT COLLECTIONS-II's acct171 at the merges; the owner: "Build ever single bit of this and dont return until its perfected" - the Eltheric Ocean's ventures; bible/03-World/Eltheric-Ocean.md SEA-SET and its sections after it) - item law 11 (the Eltheric Tidemail's nine records lawful, systems/aetheric.js ELTHERIC_SET_PIECES), the sea's season boards, its bounties and its wrecks' prizes; migrations from 0146
// acct171: AUDIT COLLECTIONS-II (2026-10-22, the owner: "Audit this"; bible/01-Overview/audits/Audit-Collections-II.md; acct169 on its branch, renumbered past CRAFT-PAYS' acct169 and PISTOLET's acct170 at the merge) - the glyph's and the icon's doors answer the whole wardrobe: the arena's, Iliac Hand's, The King's Gambit's and the Spire's honours read on them (arena.js ARENA_HONOUR_PATHS), and the glyph's reads a Charter's and a chapter's titles, as the title's door does - a press there dropped a champion's title and laurel from the answer the flow takes whole, and the laurel could not be hidden
// acct170: PISTOLET (2026-10-22, acct168 on its branch, renumbered past STAFF-PANEL1's acct168 and CRAFT-PAYS' acct169 at the merge; bible/05-Combat/Dwarven-Pistolet.md; AUDIT PISTOLET A7, C1, D8) - the item law moves to 10 (systems/item/itemLaw.js ITEM_LAW_VERSION): the Dwarven Pistolet (562) is a template the judge knows, and the Sunken Sovereign is lawful as the gilded Pistolet it is minted as now and as the Ebony Saber minted before (systems/gilded.js SOVEREIGN_SABER_ERA). No migration: no law-10 finding has been made, and law 9 never saw a Pistolet. Before it, acct167: CAKE-CAP-SAID.
// acct169: CRAFT-PAYS and CRAFT-WRITS, one release (2026-10-21 and 22; acct168 and migration 0144 on its branch, renumbered past STAFF-PANEL1's at the merge; the Discord's #feature-feedback, "Crafting seems unrewarding"; bible/06-Systems/Professions-Arc.md sections 48 and 49) - a Novice's brew answers two potions where it answered one (src/net/alchemyLaw.js brewCount; the rungs above stand, prof_brews.count's CHECK of 1 to 3 with them), and a brew says whether it was witnessed whole; the crafting writs - an account's three a day on the Work tab (AUDIT CRAFT-WRITS E1: the account's draw, never a character's), filled by any of its realm characters with its own witnessed brews and pieces out of its realm record (craftWrits.js; /v1/writs/craft, `crafts` on /v1/writs/list), migration 0145_craft_writs.
// acct168: STAFF-PANEL1 (2026-10-22, mob: "a staff admin panel"; design doc "DFO Staff Panel: design", build step 1) - the staff panel's sign-in (staff.js): a password, a key only the staff member's own Staff Panel extension holds, and the role lists; staff keys, invites, sessions and an append-only audit. Migration 0144.
// acct167: CAKE-CAP-SAID (FIELD BUGS 2026-10-21b, the Discord's #bug-reports: "Soul Cake stopped dropping"; bible/01-Overview/bugs/Field-Bugs-2026-10-21b.md; acct166 on its branch, renumbered past FIELD BUGS 2026-10-20h's acct166 - ESSENCE-LOOSE and SOUL-LAW - at the merge) - a festival find answers the day's cakes found (`today`) and `capped: true` once they are all found, and the account's festival answers `today` too: a find past the day's 120 had answered a miss's own `{ found: 0 }`. No migration.
// acct166: FIELD BUGS 2026-10-20h, one release - ESSENCE-LOOSE (FIELD BUGS 2026-10-20h, 2026-10-21 - a player's Arcane Essence "bought with gold"; bible/01-Overview/bugs/Field-Bugs-2026-10-20h.md ESSENCE-LOOSE) - a piece walled to gold by the loose goods it was made or raised with says so (products.loose, migration 0142_essence_loose; professions.js craftAtAnvil and temperPiece write it, market.js buyWithGold clears it), and its disenchant's Arcane Essence goes into the Stores LOOSE, a station's, never gold's (alchemy.js disenchantPiece; prof_disenchants.origin may be 'loose', the Essence already misnamed moved); the Reforge with Essence spends as a station does, loose first (reforgeWithEssence - workableSql, workStatements); and SOUL-LAW (FIELD BUGS 2026-10-20h - a Soul Trap holding an Ogre's soul, and its trapper's trading frozen; bible/01-Overview/bugs/Field-Bugs-2026-10-20h.md SOUL-LAW) - item law 9 (src/systems/item/itemLaw.js reads Daggerfall Enemy Expansion's fifty ids from the mod's own tables, src/systems/enemyExpansion/dexIds.js): law 8 found a soul of theirs in a Soul Gem or Azura's Star 'soul', and held its character's trade with a strike; migration 0143 lifts what that finding alone made, as 0130 lifted the Weir Key's. Before it, acct165: THE WITCHES' FESTIVAL AND ITS STARFALL, one release - WITCH1 (2026-10-20, the owner: "develop our first live event"; bible/06-Systems/Witches-Festival.md; acct162 then acct164 and migration 0134 then 0135 on its branch, renumbered past NAME-WORDS' acct162, PURSE-MEND's acct163 and LEAN-READS' acct164 and migrations 0135-0139 at the merges) - THE WITCHES' FESTIVAL (src/festival.js, migrations/0140_festival.sql): an account's Soul Cakes, the day's finds rolled by the service's own die, the Wyrd Sister's sales, the Hearth Offerings at homes' doors; the profile icon worn (/v1/account/icon, the token's `pi`) and the festival's titles and aura in the wardrobe. STAR7 (2026-10-20, the owner: "a lore accurate world encounter defense mission ... a boss topping off the encounter at the end"; bible/11-Multiplayer/Starfall.md section 6) - /v1/star/claim: a fallen star's `j1` receipt (the relay's, world235) counted once a (star, account), nine a UTC day of its fall, paid in Renown and in silver under the day's combat cap (stars.js claimStar, marks.js starStrikeStatement - MARKS_COMBAT gains `star`), the device's spoils once (star_spoils), the cards' stars held (starRecordOf; migration 0141 - 0140 on its branch, past WITCH1's 0140 when the festival was folded in); STAR8, the same version: the questlines' `star` and `stars3` witnesses over stars_held and the Thirteenth of Frostfall's Starwarden (questlines.js QL_WITNESS_SQL, net/questlineClaims.js). acct164: LEAN-READS (2026-10-19, acct159, acct160, acct161, acct162 then acct163 and migrations 0133-0137 then 0134-0138 on its branch, renumbered past QL12's acct159 and 0133, WB14's acct160, JUNGLE-WOODS' acct161, NAME-WORDS' acct162 and 0134 and PURSE-MEND's acct163 at the merges; the account database overloaded again from 18:05 UTC - "D1 DB is overloaded. Requests queued for too long." on the harvest and the pixels, the median request 10 s; the owner: "Do everything. No band aids. No short fixes."; bible/11-Multiplayer/Scale-Arc.md THE OVERLOAD OF 2026-10-19) - LEAN-WITNESS: a hall's and a seat's answers that agree with their key's confirmation a second after it are late, kept by the database (witness_confirmed, its triggers), and the reads that judge read the rest - a hall witness reads no region unless its own answers could have it ignored, and a late report moves no region (leanWitness.js, npcHalls.js, townSeats.js; migration 0135); YARD-SNAP: a town's yards one row, built at the version the database moves on every yard row written (decor.js, migration 0136); VENDOR-BOARD: a region's traders one row, the caller's door off its own rows (market.js vendorBoard, migration 0137); WRIT-BOARD: a region's writs sought by their owner (professions.js, migration 0138); ARENA-BOARD: the arena board's counts one row a season (arena.js arenaShared, migration 0139); SLOW-SHED: an isolate whose requests wait SLOW_SHED_WAIT_MS a trip sheds what an overload sheds (service.js noteD1Wait); AUDIT LEAN-READS (2026-10-20, the owner: "Audit this and ensure perfection"): a key's answers settled at the cost of the rows that change (a strike, the old Worker's too, a confirmer at a time), every kept board in its reads' shape (keptBoard.js), kept once, last and only where it serves - the vendor board from the second it was read at - and the shed weighed by trips; AUDIT LEAN-READS 2 (2026-10-20, the owner: "Audit this"): a strike deletes each row once (leanWitness.js strikeWitness), every trigger read names its index, a late report whose town rests on a confirmer the law may ignore moves its region, the boards' versions narrow rows of their own and the traders' board served to a lagging clock (market.js vendorSpan), a trip capped where it is measured
// acct165: THE WITCHES' FESTIVAL AND ITS STARFALL, one release - WITCH1 (2026-10-20, the owner: "develop our first live event"; bible/06-Systems/Witches-Festival.md; acct162 then acct164 and migration 0134 then 0135 on its branch, renumbered past NAME-WORDS' acct162, PURSE-MEND's acct163 and LEAN-READS' acct164 and migrations 0135-0139 at the merges) - THE WITCHES' FESTIVAL (src/festival.js, migrations/0140_festival.sql): an account's Soul Cakes, the day's finds rolled by the service's own die, the Wyrd Sister's sales, the Hearth Offerings at homes' doors; the profile icon worn (/v1/account/icon, the token's `pi`) and the festival's titles and aura in the wardrobe. STAR7 (2026-10-20, the owner: "a lore accurate world encounter defense mission ... a boss topping off the encounter at the end"; bible/11-Multiplayer/Starfall.md section 6) - /v1/star/claim: a fallen star's `j1` receipt (the relay's, world235) counted once a (star, account), nine a UTC day of its fall, paid in Renown and in silver under the day's combat cap (stars.js claimStar, marks.js starStrikeStatement - MARKS_COMBAT gains `star`), the device's spoils once (star_spoils), the cards' stars held (starRecordOf; migration 0141 - 0140 on its branch, past WITCH1's 0140 when the festival was folded in); STAR8, the same version: the questlines' `star` and `stars3` witnesses over stars_held and the Thirteenth of Frostfall's Starwarden (questlines.js QL_WITNESS_SQL, net/questlineClaims.js). acct164: LEAN-READS (2026-10-19, acct159, acct160, acct161, acct162 then acct163 and migrations 0133-0137 then 0134-0138 on its branch, renumbered past QL12's acct159 and 0133, WB14's acct160, JUNGLE-WOODS' acct161, NAME-WORDS' acct162 and 0134 and PURSE-MEND's acct163 at the merges; the account database overloaded again from 18:05 UTC - "D1 DB is overloaded. Requests queued for too long." on the harvest and the pixels, the median request 10 s; the owner: "Do everything. No band aids. No short fixes."; bible/11-Multiplayer/Scale-Arc.md THE OVERLOAD OF 2026-10-19) - LEAN-WITNESS: a hall's and a seat's answers that agree with their key's confirmation a second after it are late, kept by the database (witness_confirmed, its triggers), and the reads that judge read the rest - a hall witness reads no region unless its own answers could have it ignored, and a late report moves no region (leanWitness.js, npcHalls.js, townSeats.js; migration 0135); YARD-SNAP: a town's yards one row, built at the version the database moves on every yard row written (decor.js, migration 0136); VENDOR-BOARD: a region's traders one row, the caller's door off its own rows (market.js vendorBoard, migration 0137); WRIT-BOARD: a region's writs sought by their owner (professions.js, migration 0138); ARENA-BOARD: the arena board's counts one row a season (arena.js arenaShared, migration 0139); SLOW-SHED: an isolate whose requests wait SLOW_SHED_WAIT_MS a trip sheds what an overload sheds (service.js noteD1Wait); AUDIT LEAN-READS (2026-10-20, the owner: "Audit this and ensure perfection"): a key's answers settled at the cost of the rows that change (a strike, the old Worker's too, a confirmer at a time), every kept board in its reads' shape (keptBoard.js), kept once, last and only where it serves - the vendor board from the second it was read at - and the shed weighed by trips; AUDIT LEAN-READS 2 (2026-10-20, the owner: "Audit this"): a strike deletes each row once (leanWitness.js strikeWitness), every trigger read names its index, a late report whose town rests on a confirmer the law may ignore moves its region, the boards' versions narrow rows of their own and the traders' board served to a lagging clock (market.js vendorSpan), a trip capped where it is measured
// acct160: WB14g (2026-10-19, acct159 on its branch, renumbered past the acct159 of QL12 at the merge; Mac: "This is all yours to take on"; bible/11-Multiplayer/Breach-Portents.md section 11) - a kill receipt's portents (net/gate/gateReceipt.js `p`, a bit each: the Vanguard, the Sundering, the Captive freed) read and verified, and a portent night's receipt rolls the Weir Key at the rite's odds (eg.js EG_KEY_ODDS_PORTENT, a quarter); AUDIT WB14 (WIRE-6, before it shipped): and fills the wealth budget a piece's room more for each portent (budget.js SPOILS_GRANT_PIECE, portentPieces)
// acct159: QL12 (2026-10-19, acct157 on its branch, renumbered past PLAN-1000 and FOE-BOUNDS, acct157 and acct158, at the merge; the owner: "New questlines tying into and introduced the oblivion gates, abyss dungeons, elite dungeons and elite breaches"; bible/06-Systems/Questlines-Arc.md sections 1 and 5.3) - the questlines' claim (/v1/ql/claim, questlines.js): a step opened by its first claim, witnessed by its endgame receipt written after it (gate_kills, eg_redoubts - no Rehearsal's -, sd_kills, serpent_kills); a line's title on `players.ql_titles`, held for good (titles.js titlesHeld - the five in the vocabulary, RELAY world228 first), and the Covens' Hoard's Weir Key once an account (`ql_key`, `eg_keys` + 1); QUESTLINES_OPEN; migration 0133.
// acct158: FOE-BOUNDS and GRANT-ASKS (2026-10-19, acct156 on its branch, renumbered past TOWN-ECON's acct156 and PLAN-1000's acct157 at the merges; Mac: "Spec + B + A"; bible/11-Multiplayer/Spawn-Grants.md sections 19 and 21) - the relay's own count opens a moderators' case: a record it stripped because no builder could give it (the batch's `~relay` tally, its evidence on the line) and an account's own asks far past its budget in a window; one batch's findings on an account are one line; the count opens at most GRANT_OWN_CASES_HOUR cases an hour; a tally's `stats` is a case's reason; the Discord card says the spawn grants opened a case of theirs
// acct157: PLAN-1000 (2026-10-18, acct155 on its branch, renumbered past GRANT2's acct155 and TOWN-ECON TE2's acct156 at the merge; the owner at a thousand online: "We really need to future proof even more and improve our server. Like really deep"; bible/11-Multiplayer/Scale-Arc.md THE PLAN PAST 1,000) - PRIMARY-FOLD: a claim's door asks its tombstone, seat and bucket in one statement (door.js), the spend steps its bucket inside its own upsert (progress.js spendProgress, AUDIT PLAN-1000 C1), a week read settled stays settled in its isolate (weekKept.js), the chapters' sheet and a chapter claim read in one batch each; SESSION-SIGN: the hot routes believe a signed pass of five minutes for the session's lookup (sessionPass.js, `x-session-pass`); no migration.
// acct156: TOWN-ECON TE2 (2026-10-18, Mac: "Everything"; bible/06-Systems/Town-Economy-Arc.md section 4) - the town economy's players' share: the towns' shares read (/v1/towns/econ), a town witnessed into the registry (/v1/towns/witness), the Watch's ticks walked in a town claimed (/v1/towns/watch), a trader's sale, a patron's and a raid driven off counted at their town, each account capped a town a day; migration 0132 (renumbered past GRANT2's 0131_grant_measure, acct155, at the merge). And LAW-3 (section 7.4): the item law's `counterPaid` (src/systems/item/itemFields.js) SEA-TRADE and AUDIT TOWN-ECON 2 (2026-10-18, the same branch, the same version - none of it deployed between): a captain's dealing a `sea` act of the Watch's claim; a town reported with a Watch tick at its pixel, struck and audited by a developer (/v1/towns/strike, /v1/towns/audit), its shares kept by the clock (`town_econ_kept`), the doors behind TOWNS_OPEN, and the town Watch asked of the account's seat (INT16).
// acct155: GRANT2 (2026-10-18, Mac: "Lets build the plan"; bible/11-Multiplayer/Spawn-Grants.md section 12) - the spawn grants' measure: POST /v1/mod/grant-feed takes a cell's window of grant asks under the relay's signature (grants.js takeGrantMeasure, net/grantMeasure.js), once, into grant_batches and grant_rows (migration 0131_grant_measure); a developer reads it with /v1/mod/realm-grants (grantsMeasure: per kind, an account's asks an hour, what the buckets and the ceiling would have refused, the cells' most live; tools/realmReview.mjs grants)
// acct154: PRIVATE-REPORT (2026-10-17, Mac: "Can we add a private disclosure method for exploits/bugs with the client"; bible/06-Systems/Private-Reports.md) - a registered player's private report of an exploit, a bug or a security hole to the readers REPORT_READER_HANDLES names, and their inbox (/v1/report/*, reports.js; a reader's count on the post box), migration 0129 (acct152 then acct153, and 0126 then 0127, on its branch, renumbered past SAFE's and INT16-INT19's at the merges).

/** A body bigger than this is not a request this service has. Read
 *  BEFORE the JSON is parsed, so a megabyte of nothing costs nothing. */
export const MAX_BODY_BYTES = 4 * 1024;

/** STORM-SHED: THE DATABASE A WRAPPER WRAPS. metrics.js counts a
 *  request's statements through a Proxy made for that request, so what
 *  an isolate keeps beside its database (townSeats.js seatRowsKept) is
 *  keyed by the binding this names - asked of the Proxy, it answers the
 *  binding; the binding has no such member and is its own. */
export const DB_ROOT = Symbol('db-root');

/** GATHER-SPEED / MARKET-SPEED (2026-10-11, Mac: "look at gathering minigame performance and how the server affects it/
 *  slows down, same with the market", then "Do everything. A comprehensive improvement"): READS IN ONE ROUND TRIP. Each
 *  `first()` and `all()` is its own trip from the Worker to the database's primary, and a harvest's answer and a market
 *  read were fifteen to twenty of them in a row - each one the whole distance again, wherever the Worker ran. A batch is
 *  ONE trip, its statements run in order in one transaction (D1's `batch`), so a statement reads what the ones before
 *  it wrote. Answers each statement's rows, in order; nothing asked, nothing sent. */
export async function readAll(/** @type {any} */ db, /** @type {any[]} */ statements) {
  if (!statements.length) return [];
  const out = await db.batch(statements);
  return statements.map((_, i) => out?.[i]?.results ?? []);
}

/** SCALE4f (2026-10-10): WHETHER AN ERROR IS D1 OVERLOADED - the primary's queue full ("D1 DB is overloaded. Requests
 *  queued for too long.", D1's code 7429), which #755's deploy met and the service answered as any other fault: `server`,
 *  500. It is still `server` (every book asks that again, and a new word would be a refusal to eight of them), but 503,
 *  so the metrics count an overload apart from a bug. */
export const d1Overloaded = (/** @type {unknown} */ e) => /overloaded|queued for too long|\b7429\b/i.test(String((/** @type {any} */ (e))?.message ?? e ?? ''));

/** BUSY-GATE (2026-10-13, net/busyLaw.js): THE READS THIS ISOLATE SHEDS, HAVING MET AN OVERLOADED DATABASE. An overload
 *  is the primary's queue full; every read sent into it only lengthens it. So for BUSY_SHED_MS after this isolate meets
 *  one, the reads busyLaw.js names are answered as the overload itself is - `server`, 503, with its Retry-After - and
 *  never asked of the database: the clients from before the gate ask them again on their own schedules, each answer now
 *  costing the database nothing, and the primary drains. Each overload met keeps it open; a moment without one closes
 *  it. The moment the shedding ends (ms) - one an isolate, as the database is one. */
let busyShedUntil = 0;
/** BUSY-GATE: an overload met at `nowMs` - the reads shed for BUSY_SHED_MS from it. */
export function noteOverload(/** @type {number} */ nowMs) { busyShedUntil = Math.max(busyShedUntil, nowMs + BUSY_SHED_MS); }
/** BUSY-GATE: whether this request is a read the isolate sheds at `nowMs`. */
export const shedding = (/** @type {string} */ path, /** @type {string} */ method, /** @type {number} */ nowMs) => busyRead(path, method) && nowMs < busyShedUntil;
/** BUSY-GATE: a stood service is a fresh isolate - nothing shed. */
export function _resetBusyShed() { busyShedUntil = 0; slowWaits.length = 0; slowSum.ms = 0; slowSum.trips = 0; }

/** SLOW-SHED (2026-10-19, the account database overloaded again, 18:05-18:25 UTC; bible/11-Multiplayer/Scale-Arc.md
 *  SLOW-SHED): A DATABASE TOO SLOW TO ANSWER IS SHED AS ONE THAT REFUSES. BUSY-GATE's shed opened only on D1's own word
 *  (`overloaded`), and it left the case it could not measure yet - "a slow database that is not yet refusing opens neither
 *  gate". In the overload it is the case that held: 52 refusals logged in twelve minutes while the median request waited
 *  10 s and the region's traders were asked four times as often (each tab's read timing out and asked again).
 *
 *  THE MEASURE IS A TRIP'S WAIT (AUDIT LEAN-READS C1): the queue makes each round trip wait - a statement awaited alone,
 *  or a batch whole - so a request's D1 wait over its trips (metrics.js measured) is the queue's depth whatever the
 *  request batches; over its statements a batch of twelve read twelve times shorter. Measured over thirty hours of the
 *  service's own metrics (each request's wait over its statements, ten-minute points; a trip carries 1 to 1.2 statements,
 *  PRIMARY-TRIPS): a healthy service 40-680 ms a statement, so at most some 820 ms a trip; every overload 1,212 ms a
 *  statement or more, so as much a trip at the least. SLOW_SHED_WAIT_MS stands between (C2: 1,500 was above the lowest
 *  overload). Each trip counts SLOW_SHED_TRIP_CAP_MS at most (C4: one heavy statement in a quiet isolate's window is no
 *  queue). While the last SLOW_SHED_SPAN_MS of SLOW_SHED_MIN requests or more average SLOW_SHED_WAIT_MS a trip, each request
 *  itself that slow opens what an overload opens (noteOverload) - so it closes BUSY_SHED_MS after the last one once the
 *  database answers quickly again - and says so in the log when it opens (C6). A shed read asks the database nothing and
 *  adds nothing here. */
export const SLOW_SHED_WAIT_MS = 1_000;
export const SLOW_SHED_TRIP_CAP_MS = 5_000;
export const SLOW_SHED_SPAN_MS = 30_000;
export const SLOW_SHED_MIN = 16;
/** SLOW-SHED: this isolate's recent requests - `{ at, ms, trips }` their D1 wait (each trip capped) over their trips - and
 *  their sums, kept as they come and go (AUDIT LEAN-READS: an overload's window is the busiest; it is never added up again). */
const slowWaits = /** @type {{ at: number, ms: number, trips: number }[]} */ ([]);
const slowSum = { ms: 0, trips: 0 };
/** SLOW-SHED: a request's D1 wait (`ms`) over its `trips`, ended at `nowMs` - and the shed opened where the span averages
 *  too slow. A request that asked the database nothing says nothing of it. */
export function noteD1Wait(/** @type {number} */ ms, /** @type {number} */ trips, /** @type {number} */ nowMs) {
  if (!(trips > 0) || !Number.isFinite(ms)) return;
  const waited = Math.min(ms, trips * SLOW_SHED_TRIP_CAP_MS);   // metrics.js caps each trip; a caller that hands the whole is held to the same bound
  slowWaits.push({ at: nowMs, ms: waited, trips });
  slowSum.ms += waited;
  slowSum.trips += trips;
  while (slowWaits.length && nowMs - slowWaits[0].at > SLOW_SHED_SPAN_MS) {
    const gone = /** @type {{ ms: number, trips: number }} */ (slowWaits.shift());
    slowSum.ms -= gone.ms;
    slowSum.trips -= gone.trips;
  }
  if (slowWaits.length < SLOW_SHED_MIN || waited / trips < SLOW_SHED_WAIT_MS) return;   // a quick request keeps nothing open
  if (slowSum.ms / slowSum.trips < SLOW_SHED_WAIT_MS) return;
  if (nowMs >= busyShedUntil) console.warn(`[busy] slow: the shed opened - ${slowWaits.length} requests in ${SLOW_SHED_SPAN_MS / 1000} s waited ${Math.round(slowSum.ms / slowSum.trips)} ms a trip`);
  noteOverload(nowMs);
}

/** SCALE4d (2026-10-10, Mac: "we just hit 500 online people. I think its time to scale up our server and improve
 *  performance for more people"): THE ROUTES WHOSE READS A D1 READ REPLICA MAY SERVE. The token's mint is a dozen
 *  reads, and a relay deploy asks it of every player in the same minute: the wave that overloaded the one primary on
 *  2026-10-06 (STORM-SHED). Its writes are the primary's - a stale session's touch, and a region's chapters, written
 *  only over the version they read (npcHalls.js) - and its one read-then-write, the arena's and Iliac Hand's #1 counted
 *  again and stored, runs on the binding (index.js, AUDIT SCALE4d A1). Every other route stays on the binding. */
export const REPLICA_ROUTES = new Map([
  ['/v1/auth/token', 'POST'],
  // SCALE4g (2026-10-10, Mac: "really future proof our archetecture"; bible/11-Multiplayer/Scale-Arc.md SCALE4g): AND THE
  // READS A PLAYER'S TAB KEEPS ASKING, each on the session of the bookmark it carries (d1BookmarkOf) - the heartbeat (the
  // board, the box, the post; its beat a single UPDATE, which a session sends to the primary), the account view, the
  // realm's list, the professions' state and the day's motherlodes (their pick an INSERT OR IGNORE of a pure roll). Their
  // one read-then-store - the arena's and Iliac Hand's #1, counted again where it is stale - runs on the binding wherever
  // it is asked (index.js `honoursCtx`, board.js through `ctx.primary`), as AUDIT SCALE4d A1 put the mint's there.
  ['/v1/heartbeat', 'POST'],
  ['/v1/account', 'GET'],
  ['/v1/realm', 'GET'],
  ['/v1/prof/state', 'POST'],
  ['/v1/prof/motherlodes', 'POST'],
  // DISPLAY-REPLICA (2026-10-13, the account database's primary capped near 150 requests a second from 14:11 UTC and
  // every route waiting on it; bible/11-Multiplayer/Scale-Arc.md DISPLAY-REPLICA): AND THE DISPLAY READS - each of them
  // writes nothing (BUSY-GATE checked them statement by statement; the board's #1 is stored on the doors
  // ARENA_HONOUR_PATHS names, never here) and keeps nothing an isolate shares, so a replica's answer is never an
  // isolate's for another caller (the yards, the layouts and the seats' list keep one, and stay on the binding). With
  // the bookmark a tab carries, every statement a replica's; with none - a page from before this, or the read after a
  // write, which the client forgets its bookmark for (net/accountClient.js `call`, AUDIT SCALE II A-2) - the first, the
  // session's lookup, the primary's, and every one after it a replica's at least as new: the caller's own writes read.
  // LEAN-READS (AUDIT LEAN-READS B4): two of them write now - the region's traders (market.js vendorBoard) and the
  // arena's board (arena.js arenaShared) keep their board's one row where it was stale, a write the session sends to the
  // primary, after every read the request makes (D5) and only where the version it read is the primary's still: a
  // replica is a prefix of the primary and a version only rises, so a board read on a replica is kept at its version or
  // not at all. Neither keeps anything an isolate shares.
  ['/v1/homes/town', 'POST'],
  ['/v1/homes/mine', 'POST'],
  ['/v1/homes/rooms', 'POST'],
  ['/v1/homes/decor', 'POST'],
  ['/v1/prof/pixels', 'POST'],
  ['/v1/market/vendors', 'POST'],
  ['/v1/marks/balance', 'POST'],
  ['/v1/guilds/invites', 'POST'],
  ['/v1/realm/lineages', 'POST'],
  ['/v1/realm/unions', 'POST'],
  ['/v1/saves', 'GET'],
  ['/v1/arena/board', 'POST'],
  ['/v1/festival/town', 'POST'],   // WITCH1: a town's Hearth Offerings - reads and nothing else (festival.js festivalTown)
]);
/** SCALE4d: where a replica session's FIRST statement goes - the primary. A mint's first statement is the session
 *  lookup, and every statement after it is served by a replica at least as new as that answer (D1's Sessions API: one
 *  session is sequentially consistent), so a mint reads exactly what the primary held when it began. Not
 *  'first-unconstrained': a guest made a moment ago would be refused `auth` by a replica that has not yet seen its
 *  session - which the client takes as final - and a realm character created a moment ago would mint `rc` 0, which the
 *  relay refuses at its door. */
export const REPLICA_CONSTRAINT = 'first-primary';
/** SCALE4g: A D1 BOOKMARK, as D1 writes one (`0000007f-0018eec1-00005100-e64ff3f3...`: a position in the database's log)
 *  or as a client carries one back - anything else is no bookmark, and its request's session starts at the primary. */
export const D1_BOOKMARK_RE = /^[0-9A-Za-z][0-9A-Za-z-]{0,159}$/;
/** SCALE4g: THE BOOKMARK A REQUEST CARRIES (`x-d1-bookmark`, the client's newest under its session secret), or null. */
export function d1BookmarkOf(/** @type {Request} */ request) {
  const b = request?.headers?.get?.('x-d1-bookmark') ?? null;
  return typeof b === 'string' && D1_BOOKMARK_RE.test(b) ? b : null;
}

/** AUDIT SCALE II A-1 (2026-10-11, the audit of SCALE4d-SCALE5d; Mac: "Lets do an audit on everything. Ensure
 *  perfection"): THE MINT STARTS AT THE PRIMARY, WHATEVER BOOKMARK IT CARRIES - SCALE4d's guarantee (REPLICA_CONSTRAINT),
 *  which SCALE4g's bookmark had undone. A bookmark is a position the tab has SEEN, and no write route answers one: a
 *  realm join, a create, a leave, another tab's join that took the lease (INT9) - none of them moves it. So a mint
 *  started from it could read a replica from before the tab's own join and sign `rc` 0 (the relay's door word, which
 *  the client takes as final), or a lease since moved still `rc` 1 for the character another tab now plays. The mint's
 *  first statement, the session lookup, is the primary's, and every read after it at least that new. */
export const PRIMARY_FIRST_ROUTES = new Set(['/v1/auth/token']);

/** BOOKMARK-SPIRAL (2026-10-16, the account database's primary "overloaded. Requests queued for too long." from 13:50
 *  UTC, every route 5 to 60 s; bible/11-Multiplayer/Scale-Arc.md BOOKMARK-SPIRAL): THE POLLED DISPLAY READS, ASKED WITH
 *  NO BOOKMARK, START AT ANY INSTANCE. The page forgets its bookmark at every other call and keeps an answer's only if
 *  no call went between (net/accountClient.js `_d1Era`) - so once the primary was slow, an answer never came back in
 *  time to be kept, the bookmarked share fell from three in four to one in a hundred, and every one of these started at
 *  the primary ('first-primary'): its session lookups went from 30 a second to 68, the replica's from 31 to 1, and the
 *  primary stayed past its ceiling. These six are asked again on the page's own clock and write nothing a reader of them
 *  needs back at once (a beat's and a pick's write go to the primary in their own session regardless), so with no
 *  bookmark their session starts wherever D1 places it; the session lookup that misses there asks the primary
 *  (accounts.js resolveSession - a session minted a moment ago). With a bookmark, as before; every other read, as before.
 *  SHED-LONG (2026-10-16, acct145; bible/11-Multiplayer/Scale-Arc.md SHED-LONG): ROLLED BACK - NONE. Read off the live
 *  service after BUSY-HEART: a request on a D1 session (the replica's reads) waited 31 s on the database for every 5.6 s
 *  one on the binding (the primary) waited - the replica the longer queue, and these six had moved some 40 session
 *  lookups a second onto it. With no bookmark every replica route starts at the primary again; the set stays, empty,
 *  with the lookup's miss on a session at any instance still asking the primary. */
export const ANY_REPLICA_ROUTES = new Map();
/** BOOKMARK-SPIRAL: where such a session starts - any instance, the replica nearest first. */
export const REPLICA_ANY = 'first-unconstrained';
/** BOOKMARK-SPIRAL: asked of a request's database, true when its session began at any instance (replicaDb, REPLICA_ANY). */
export const DB_ANY = Symbol('db-any');
/** SESSION-SIGN (AUDIT PLAN-1000 E5): asked of a request's database, true when its session began at the primary
 *  (replicaDb, REPLICA_CONSTRAINT) - its first statement, the session's lookup, the primary's own answer. */
export const DB_FIRST_PRIMARY = Symbol('db-first-primary');

/** SCALE4g: THE DATABASE A REQUEST RUNS ON - a D1 session for a route and method REPLICA_ROUTES names, started from the
 *  bookmark the request carries (every read at least as new as that position: the caller's own last writes, read back)
 *  or at the primary for a request that carries none (BOOKMARK-SPIRAL: any instance, for ANY_REPLICA_ROUTES); the
 *  binding itself for every other route. A bookmark D1 will not take starts as one with none would, and the mint's
 *  always starts at the primary (PRIMARY_FIRST_ROUTES, AUDIT SCALE II A-1). */
export function routeDb(/** @type {any} */ db, /** @type {string} */ path, /** @type {string} */ method, /** @type {string|null} */ bookmark = null) {
  if (REPLICA_ROUTES.get(path) !== method) return db;
  if (bookmark && !PRIMARY_FIRST_ROUTES.has(path)) { try { return replicaDb(db, bookmark); } catch { /* a bookmark D1 refuses: as with none, below */ } }
  return replicaDb(db, ANY_REPLICA_ROUTES.get(path) === method ? REPLICA_ANY : REPLICA_CONSTRAINT);
}

/** SEAT-REPLICA: a session's newest bookmark, or null (the binding, an older runtime or a harness, keeps none). YARDS-REPLICA
 *  (2026-10-16): here, beside replicaDb, so every kept read that starts its next from the last one's bookmark reads it one way. */
export const bookmarkOf = (/** @type {any} */ session) => { try { const m = session?.getBookmark?.(); return typeof m === 'string' && m ? m : null; } catch { return null; } };

/** SCALE4d: the binding as one D1 session (`withSession`) - every statement counted where the binding's are
 *  (metrics.js countedDb opens the session through itself), and DB_ROOT the binding the session came from, so what an
 *  isolate keeps beside its database stays one store for every request. A binding with no sessions (an older runtime, a
 *  harness's fake) is answered as it stands: the primary, as before. A write in a session goes to the primary - a
 *  replica takes none - and the session's later reads see it. Until the database's read replication is turned on
 *  (account-deploy.yml) every statement of a session is the primary's anyway. */
export function replicaDb(/** @type {any} */ db, constraint = REPLICA_CONSTRAINT) {
  const open = db?.withSession;
  if (typeof open !== 'function') return db;
  const root = db[DB_ROOT] ?? db;
  const session = open.call(db, constraint);
  return new Proxy(session, {
    get(target, key) {
      if (key === DB_ROOT) return root;
      if (key === DB_ANY) return constraint === REPLICA_ANY;   // BOOKMARK-SPIRAL: its lookup's miss asks the primary
      if (key === DB_FIRST_PRIMARY) return constraint === REPLICA_CONSTRAINT;   // SESSION-SIGN: its lookup the primary's
      const v = Reflect.get(target, key);
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });
}

/** ═══ ACC2: THE SAVE ROUTES, AND WHY THEY ARE NOT IN `ROUTES` ══════
 *
 * Every route above is a fixed string, so a Set answers "does this
 * exist?". A save route carries the character and the slot in the path,
 * so it needs a match rather than a lookup - and the match lives here,
 * pure, beside the Set, because `index.js` asks BOTH before it decides
 * a path is a 404.
 *
 * `/v1/saves/<characterId>/<saveName>[/data|/shot]`, with both segments
 * percent-encoded by the caller: a save name is the player's own words
 * ("before the lich"), so it may hold a space, a slash or a hash, and
 * pasting it into a path unencoded is how one slot comes to address
 * another.
 *
 * It returns null for anything it is not sure of. A name that decodes
 * to nothing, one past SAVE_NAME_MAX, an id that is not id-shaped and a
 * tail that is not one of the two known parts are all "no such route"
 * rather than a request this service half-understands.
 */
export const SAVE_NAME_MAX = 64;
/** Both shapes `systems/characterId.js` mints - a `crypto.randomUUID()`
 *  where the runtime has one, and `<base36 stamp>-<10 random>` on an old
 *  WebView where it does not. A pin drives that minter and asserts every
 *  id it produces passes this. DELIBERATELY NOT `net/wire.js` ID_RE:
 *  that is the shape of a PEER id, which is a different thing that
 *  happens to look similar, and reusing it would tie a save's filing to
 *  a bound the online arc is free to move. */
export const CHAR_ID_RE = /^[A-Za-z0-9_-]{4,64}$/;
export const SAVE_PARTS = Object.freeze(['data', 'shot']);

export function savePathOf(path) {
  if (typeof path !== 'string' || !path.startsWith('/v1/saves/')) return null;
  const rest = path.slice('/v1/saves/'.length);
  if (!rest) return null;
  const seg = rest.split('/');
  if (seg.length < 2 || seg.length > 3) return null;
  const part = seg.length === 3 ? seg[2] : null;
  if (part !== null && !SAVE_PARTS.includes(part)) return null;
  let characterId, saveName;
  try { characterId = decodeURIComponent(seg[0]); saveName = decodeURIComponent(seg[1]); }
  catch { return null; }   // a malformed escape is not a slot
  if (!CHAR_ID_RE.test(characterId)) return null;
  // A NAME IS BOUNDED AND PRINTABLE. The store's own cards carry
  // whatever the player typed, and this is the one door where that
  // string becomes part of a key somebody else's row also lives under.
  if (!saveName || saveName.length > SAVE_NAME_MAX || /[\u0000-\u001f\u007f]/.test(saveName)) return null;
  return { characterId, saveName, part };
}

/** The R2 key. PLAYER FIRST, so "everything this account holds" is a
 *  prefix walk rather than a join against D1 - which is what makes a
 *  deleted account cleanable at all. Every segment is encoded, for the
 *  reason `savePathOf` decodes: a save name is player-typed. */
export const savePrefix = (playerId) => `saves/${encodeURIComponent(playerId)}/`;
export const saveKey = (playerId, characterId, saveName, part) =>
  `${savePrefix(playerId)}${encodeURIComponent(characterId)}/${encodeURIComponent(saveName)}/${part}`;

/** THE BOUNDS. `MAX_BODY_BYTES` above is 4 KiB and is right for every
 *  JSON route this service has; a save is hundreds of kilobytes, so the
 *  blob routes read a RAW body against these instead. Named here rather
 *  than written into the ladder, because a bound nobody can find is a
 *  bound somebody raises by accident. */
export const SAVE_MAX_BYTES = 4 * 1024 * 1024;

/** RESTORE (2026-09-29): the switch the history restore throws for its minute - MAINTENANCE = "1", a var only its own
 *  deploy sets (.github/workflows/realm-restore.yml); every call but /v1/health and /v1/pubkey is then refused 503. */
export const maintaining = (/** @type {any} */ env) => env?.MAINTENANCE === '1';
export const SHOT_MAX_BYTES = 256 * 1024;
/** Slots per ACCOUNT. An account at this bound is refused; its oldest
 *  slot is never taken to make room, because this is a BACKUP and a
 *  backup that deletes things to make room is not one. */
export const SAVES_MAX = 60;

/** Every path this service serves. Named once, so the 404 and the
 *  ladder cannot come to disagree about what exists. */
export const ROUTES = new Set([
  '/v1/health', '/v1/pubkey', '/v1/relaykey', '/v1/auth/guest', '/v1/auth/token', '/v1/auth/session',
  '/v1/account', '/v1/auth/logout',
  // ACC1c: username and password. `register` needs a session (it
  // upgrades the guest row that session belongs to); `login` and
  // `recover` are the two that do NOT, because a player standing at
  // them has no session yet - which is exactly why they are the two
  // that are throttled.
  '/v1/auth/register', '/v1/auth/login', '/v1/auth/recover',
  '/v1/account/password', '/v1/account/email',
  // RECOVERY-SET: a new set of recovery codes, behind the password (accounts.js newRecoveryCodes)
  '/v1/account/recovery-codes',
  // ACC3: the one WRITE in the wardrobe. Holding a title is derived
  // and nothing can equip a glyph, so this is the only thing about
  // either that a player chooses - and so the only route.
  '/v1/account/title',
  // WB9g: the Broker's insignia - a title and an aura BOUGHT (a sale recorded, the account's closed gates paying),
  // and the one other thing about the wardrobe a player chooses: the aura worn.
  '/v1/account/insignia', '/v1/account/aura',
  '/v1/broker/settle',   // AUDIT FB1024 (BROKER-RID): a Broker sale whose answer was lost, asked after by its request id
  '/v1/account/icon',   // WITCH1: a profile icon worn, or none
  // WITCH1 (bible/06-Systems/Witches-Festival.md): THE WITCHES' FESTIVAL - the account's cakes, a find, a sale, a town's
  // offerings, and an offering set out, filled, taken in and taken from
  '/v1/festival/mine', '/v1/festival/find', '/v1/festival/buy', '/v1/festival/town',
  '/v1/festival/offering/set', '/v1/festival/offering/fill', '/v1/festival/offering/take-in', '/v1/festival/offering/take',
  // GLYPH-WEAR: a glyph shown or hidden - paint alone, the rights that ride one untouched.
  '/v1/account/glyph',
  // NAME-AS: which name the room reads - the account's, or the character's the mint is for (accounts.js chooseNameAs).
  '/v1/account/name',
  // ACC4: the beat that counts time played. It writes, and it is the
  // service's clock that decides how much - the body is never read.
  '/v1/account/played',
  // SCALE4c: ONE HEARTBEAT - the beat, a look at the letterbox and a
  // town's board in one request, each part answered as its own route
  // answers it (heartbeat.js). Behind a session like the three.
  '/v1/heartbeat',
  // MOD1: the one moderation route. Behind a session like every other,
  // and it refuses anybody the service's own lists do not name.
  '/v1/mod/mute',
  // CUSTOMS-PASS: a developer grants one account one character through
  // customs - the same wall, the developers' list alone.
  '/v1/mod/customs-pass',
  // INT6: the review of the judge's verdicts - the same wall, the developers' list alone (review.js)
  '/v1/mod/realm-holds',
  '/v1/mod/realm-findings',
  '/v1/mod/realm-clear',
  '/v1/mod/realm-hold',
  '/v1/mod/realm-rollback',
  '/v1/mod/realm-budget',
  '/v1/mod/realm-bodies',   // INT14: the boss fights' count, measured (review.js bodiesMeasure)
  '/v1/mod/realm-grants',   // GRANT2: the spawn grants' asks, measured (grants.js grantsMeasure)
  '/v1/mod/grant-feed',     // GRANT2: the relay's door in - a cell's window of asks, proven by its signature (grants.js)
  '/v1/mod/reaction-feed',  // STAFF-PANEL5-FEEDS: the relay's door in - the bot check's episodes, by its signature (staffReactions.js)
  '/v1/mod/hidden-seen',    // STAFF-PANEL5-HIDDEN: the relay's door in - a hidden staff subject entered a private home, proven by its signature (staffHidden.js takeHiddenSeen)
  '/v1/mod/realm-gains',    // HACKED-GOLD: who gained past the bucket (review.js gainsMeasure)
  '/v1/mod/realm-progress', // INT17: the progression claims' measure and their line (review.js progressMeasure)
  '/v1/mod/realm-trades',   // HACKED-GOLD: a character's realm trades, whom it traded with (review.js tradesOf)
  '/v1/mod/realm-characters',   // SUMMON-REPAIR: an account's realm characters by handle (review.js)
  '/v1/mod/realm-repair',       // SUMMON-REPAIR: one character mended by staff, once a ticket (review.js repairAct)
  '/v1/mod/realm-mend',         // PURSE-MEND: a purse below nothing mended by staff, once a ticket (review.js mendAct)
  // ACC2: the LISTING is a fixed path; every other save route carries
  // the slot in it and is matched by `savePathOf`.
  '/v1/saves',
  // MAIL1: letters to a registered player, kept until their reader
  // throws them away. The box is a GET; the three that change something
  // are POSTs, each naming the letter in its body - never in the path,
  // so an id is never a URL a log keeps.
  '/v1/mail/inbox', '/v1/mail/send', '/v1/mail/read', '/v1/mail/delete',
  // SERVER-POST: the developers' pieces to one registered account - the box a GET, the three that change something POSTs,
  // each naming the piece in its body; a claim names the realm character it goes into and where its record stands.
  '/v1/post/box', '/v1/post/read', '/v1/post/claim', '/v1/post/delete',
  // LOST-SPOILS: a boss's floor's leftovers sent to the account that left them - a POST, the kill named by the pool's day
  '/v1/post/lost',
  // PRIVATE-REPORT: a registered player's private report - sent, and their own listed; the readers' inbox, a report
  // opened and closed. All POSTs, every id in the body.
  '/v1/report/send', '/v1/report/mine', '/v1/report/inbox', '/v1/report/read', '/v1/report/close',
  // DUEL1: the duelling record - the loser's own report (INT8: retired,
  // answered `retired`), and any account's two counts for the Inspect
  // card; INT8: a duel's result, the relay's receipt claimed. All behind
  // a session.
  '/v1/duel/loss', '/v1/duel/record', '/v1/duel/claim',
  // INT9: a death in the open zone's drop, taken off the fallen's record against the relay's fall (or none, a foe's);
  // MAC (2026-10-14): its killer's piece in escrow - collected by the killer, taken back by the fallen, listed for it
  '/v1/wild/fall', '/v1/wild/collect', '/v1/wild/reclaim', '/v1/wild/escrows',
  // RENOWN1: Renown - what one of the caller's characters earned
  // online (the account's for a day under RENOWN-ACCOUNT; the
  // character's again since RENOWN-CHAR). Behind a session; the level
  // itself rides the token.
  '/v1/renown/xp',
  // FIRM1: the Firmament - a character's passive tree, read and changed whole (firmament.js)
  '/v1/firmament/state', '/v1/firmament/set', '/v1/firmament/respec',
  // HUNTERS-MARK: the hunt's ledger - a character's clears read, a paid bounty reported (hunts.js). Behind a session.
  '/v1/hunt/state', '/v1/hunt/clear',
  // CHAP1: the Roll - a realm character's standing with Daggerfall's guilds, read (seeded once) and claimed under the
  // playing tab's lease (npcRoll.js). Behind a session and CHAPTERS_OPEN.
  '/v1/chapters/roll', '/v1/chapters/claim',
  // CHAP2a: a town's guild halls witnessed - a registered account a week old (npcHalls.js); AUDIT CHAP2 E1: a region's
  // audit list and a false town struck, a developer's
  '/v1/chapters/witness', '/v1/chapters/halls', '/v1/chapters/strike', '/v1/chapters/list', '/v1/chapters/focus', '/v1/chapters/history',
  '/v1/chapters/back',   // CHAP6b: a member's backing in its chapter's Season
  '/v1/chapters/patron',   // CHAP7a: a guild's bid for a chapter's patronage
  // HOME1: the online homes - one owner a building (homes.js). A town's
  // homes are read by every session, a guest's too (the doors say whose
  // a home is to everyone); the three that change one are an account's.
  '/v1/homes/town', '/v1/homes/mine', '/v1/homes/claim', '/v1/homes/release', '/v1/homes/transfer', '/v1/homes/entry',
  // DECOR1: an online home's decor (decor.js). Its pieces are read by every session (the room is the same room to
  // every visitor); the three that change one are its owner's.
  '/v1/homes/decor', '/v1/homes/decor/place', '/v1/homes/decor/move', '/v1/homes/decor/remove', '/v1/homes/decor/batch', '/v1/homes/decor/use',
  // BASE-HIDE: what the owner took out of the room's own furniture - read with the pieces, written by the owner
  '/v1/homes/decor/hidden',
  // HOME-RENT: a home's rooms (rent.js) - read by every session at its door; offered and withdrawn by its owner, rented by
  // another player's realm character, the rent collected by the owner
  '/v1/homes/rooms', '/v1/homes/rooms/offer', '/v1/homes/rooms/withdraw', '/v1/homes/rooms/rent', '/v1/homes/rooms/collect',
  // HOME-LOOK: how a home looks outside (homes.js setHomeLook) - read with the town's homes, written by its owner
  '/v1/homes/look',
  // HOME-VOTE: a registered account's word on another's home (homeVotes.js) - read with the town's homes
  '/v1/homes/vote',
  // HOME-YARD: every yard of a town (decor.js yardsOf) - read by anyone, before a session (YARD-SHED, decor.js yardsKept);
  // its pieces written through the decor routes (`yard`), by the home's owner
  '/v1/homes/yards',
  // WD3: every town that holds a home and the layout it keeps (homes.js homeLayouts) - read by every session at its
  // online boot, so the room stands each such town as its homes were bought in it
  '/v1/homes/layouts',
  // ARENA4b: a home the arena displaced (homes.js arenaMoveHome) - moved by its owner's client to the house it picked, the
  // moves its character has not read, and one read
  '/v1/homes/arena-move', '/v1/homes/arena-moves', '/v1/homes/arena-seen',
  // FIELD BUGS 2026-10-04d KNIGHT-HOUSE: a deed the realm gave held off its character's record (homes.js holdDeed) - an
  // account's alone
  '/v1/homes/deed',
  // PERMADEATH-HOUSES: a fallen realm character's home taken up by the living realm character of its line who carries it
  // on (homes.js inheritHome) - an account's alone
  '/v1/homes/inherit',
  // GUILD1: the guilds (guilds.js) - a character's own guild and the account's invitations read by any session (a
  // guest's reads nothing); the rest change one, an account's alone.
  '/v1/guilds/mine', '/v1/guilds/invites', '/v1/guilds/found', '/v1/guilds/invite', '/v1/guilds/answer', '/v1/guilds/leave',
  '/v1/guilds/remove', '/v1/guilds/rank', '/v1/guilds/ranks', '/v1/guilds/deposit', '/v1/guilds/withdraw', '/v1/guilds/handover',
  '/v1/guilds/disband',
  // GUILD1d: the guild hall (halls.js) - bought and sold from the treasury by the guildmaster, who may walk in set by an
  // Officer; and the heraldry, the guildmaster's
  '/v1/guilds/hall/buy', '/v1/guilds/hall/sell', '/v1/guilds/hall/entry', '/v1/guilds/heraldry',
  // GUILD1e: a guild's own board (guildBoard.js) - read, pinned to and taken down by its members
  '/v1/guilds/board', '/v1/guilds/board/pin', '/v1/guilds/board/take-down',
  // GUILD2 (bible/11-Multiplayer/Guild-Overhaul.md): a new name for a price (guilds.js), and the vault - read, a piece put
  // in and taken out on the realm record, the guildmaster's grants (guildVault.js)
  '/v1/guilds/rename', '/v1/guilds/vault', '/v1/guilds/vault/put', '/v1/guilds/vault/take', '/v1/guilds/vault/grant',
  // SEAT1a: the seats' witnessed registry (townSeats.js) - the confirmed seats, a seat witnessed, a developer's strike
  '/v1/seats/list', '/v1/seats/witness', '/v1/seats/strike',
  // TOWN-ECON TE2 (townEcon.js): the towns' players' shares, a town witnessed, the Watch's ticks walked in a town
  '/v1/towns/econ', '/v1/towns/witness', '/v1/towns/watch', '/v1/towns/strike', '/v1/towns/audit',   // AUDIT TOWN-ECON 2 SVC-1: the strike and the audit
  // SEAT1b: influence (seatInfluence.js) - a guild's pledge, a seat's standings, the Watch's receipts, Tribute
  '/v1/seats/pledge', '/v1/seats/standings', '/v1/seats/records', '/v1/seats/watch', '/v1/seats/tribute',
  // SEAT1c: the Turning settles on any seat read (seatTurning.js); a Charter relinquished by its guildmaster
  '/v1/seats/relinquish',
  // SEAT1d: the holder's levers (seatHolding.js) - the Tithe, the coming week's Edict; a Bounty's camp claimed
  '/v1/seats/tithe', '/v1/seats/edict', '/v1/seats/bounty',
  // SEAT2a: the battles' week (seatBattles.js) - the holder's window, a side signed and unsigned, a Sellsword hired and withdrawn
  '/v1/seats/window', '/v1/seats/siege/sign', '/v1/seats/siege/unsign', '/v1/seats/siege/hire', '/v1/seats/siege/withdraw',
  // SEAT2a part three (seatSiege.js): a battle's pass, a fighter's receipt claimed; the deploy blackout's public question
  '/v1/seats/siege/pass', '/v1/seats/siege/claim', '/v1/seats/sieges/live',
  // VOID (Seats-Arc 18; seatSiege.js voidSiege): a moderator's `/siege void <key>` - the seat's battle this week void
  '/v1/seats/siege/void',
  // CROWN1 part two (seatRoyal.js): a Royal Tourney's pass, a bout's receipt claimed
  '/v1/seats/royal/pass', '/v1/seats/royal/claim',
  // CROWN2 (seatPolitics.js): fealty and Pacts
  '/v1/seats/fealty', '/v1/seats/fealty/accept', '/v1/seats/fealty/break', '/v1/seats/pact', '/v1/seats/pact/break',
  // SEASON1 part two (seatInfluence.js): an Orc Raid's camp cleared
  '/v1/seats/orc-camp',
  // SEAT2b (seatForts.js): a seat's fortifications read, a project begun
  '/v1/seats/forts', '/v1/seats/fort/fund',
  // WB5b: the gates closed - the kill receipt the relay signed, carried
  // here by the account it names. Behind a session.
  '/v1/gate/claim',
  // RAID4: the towns defended - a raid's receipt the relay signed, carried
  // here by the account it names with the character that fought it.
  '/v1/raid/claim',
  '/v1/serpent/claim',   // SERPENT1: a sea serpent's receipt
  '/v1/star/claim',   // STAR7: a fallen star's receipt
  '/v1/sd/claim',   // SD9b: a Brass Remnant's receipt - an Hour broken, and its grants on the first write
  '/v1/ketch/claim',   // KETCH: a Tonal Warden's receipt - the Ketchmaster's hold, once a voyage an account
  '/v1/eg/keys',   // EG-PLAY: the Weir Keys held, the live breach, the day's Rehearsal
  '/v1/eg/open',   // EG-PLAY: a key staked and the open order signed
  '/v1/eg/admit',   // EG-PLAY: a member's admission order
  '/v1/eg/claim',   // EG-PLAY: an Elite Breach's receipt - a Redoubt taken, a member's end, a void
  '/v1/eg/board',   // EG-E2: the Elite Breach's three boards - the Descent, the Depths, the Deepest Redoubts
  '/v1/eg/sink',   // EG-E1: the Broker's Panoply piece, once an account a week, for 20 embers
  '/v1/eg/find',   // EG-E3: a dungeon elite's find - the service's die at the tier's odds, capped a day and a week
  '/v1/eg/starts',   // EG-F: the start window's preflight - which starts each member of the opener's party may make
  '/v1/eg/first',   // EG-ZF: the first-time lines a client showed, kept once an account
  '/v1/lamp/claim',   // LAMP-KEEPER II: a lamp keeper spoken to - I Love Lamp laid on the row once (AUDIT FIVE-ASKS A1: it was never listed, so every claim was a 404)
  '/v1/ql/claim',   // QL12: a questline's step claimed - opened, then witnessed by its endgame receipt; a line's title, the Covens' Hoard's key (questlines.js)
  // MARKS1: Marks (marks.js) - an account's balance, the Bank's exchange (Marks for gold, never the other way), a
  // guild's Marks treasury, and the developers' weekly report. Every one behind a session, an account's alone.
  // SILVER-FINDS: and a loot find (the service's dice, the day's count).
  '/v1/marks/balance', '/v1/marks/exchange', '/v1/marks/find', '/v1/marks/guild/deposit', '/v1/marks/guild/withdraw', '/v1/marks/report',
  '/v1/board/read', '/v1/board/pin', '/v1/board/take-down', '/v1/board/report', '/v1/board/mod/remove', '/v1/board/mod/restore',
  '/v1/board/notice', '/v1/board/notice/remove',
  // SAFE1-SAFE8 (bible/11-Multiplayer/Chat-Safety-Arc.md): a player's block list, a report, the code of conduct agreed;
  // a moderator's ban, unban and look; and the two doors a stranger reaches that prove themselves (SAFE_OPEN_ROUTES);
  // AUDIT SAFE DOC-4: the moderators' read of the cases in the game - the open ones, one, and its dismissal
  '/v1/safety/blocks', '/v1/safety/block', '/v1/safety/unblock', '/v1/safety/report', '/v1/safety/conduct',
  '/v1/mod/ban', '/v1/mod/unban', '/v1/mod/strikes', '/v1/mod/feed', '/v1/discord/interactions',
  '/v1/mod/cases', '/v1/mod/case', '/v1/mod/dismiss',
  // STAFF-PANEL1: the staff panel's doors (staff.js) - its own sign-in and session, never a game session (STAFF_ROUTES)
  '/v1/staff/login', '/v1/staff/enroll', '/v1/staff/me', '/v1/staff/logout', '/v1/staff/keys', '/v1/staff/key/forget',
  '/v1/staff/team', '/v1/staff/invite', '/v1/staff/cut', '/v1/staff/audit', '/v1/staff/mods', '/v1/staff/mod/add', '/v1/staff/mod/remove',
  // STAFF-PANEL2: the panel's reports - the open cases, one case, a claim and its release, a strike record, and the acts
  '/v1/staff/cases', '/v1/staff/case', '/v1/staff/claim', '/v1/staff/release', '/v1/staff/strikes',
  '/v1/staff/mute', '/v1/staff/ban', '/v1/staff/unban', '/v1/staff/dismiss',
  // STAFF-BANNED (mob: "we need a tab for banned players as well"): the Banned tab - every account banned now, Admins and Moderators
  '/v1/staff/banned',
  // STAFF-PANEL3-DESK: staff notes, the watchlist and its events, your settings; the Admins' server notice, AI check
  // scorecard, and reported board notes (Remove, Restore) and market listings (staffDesk.js)
  '/v1/staff/notes', '/v1/staff/notes/add', '/v1/staff/watch', '/v1/staff/watch/add', '/v1/staff/watch/remove', '/v1/staff/watch/events',
  '/v1/staff/settings', '/v1/staff/settings/save', '/v1/staff/notice', '/v1/staff/ai-score', '/v1/staff/board/reported', '/v1/staff/board/moderate',
  '/v1/staff/market/reported',
  // STAFF-PANEL3-PLAYERS: the panel's players (staffPlayers.js) - the search, a profile's tabs, its devices, Sign out
  // everywhere, and a rename - Admins' alone
  '/v1/staff/players', '/v1/staff/player', '/v1/staff/player/devices', '/v1/staff/player/signout', '/v1/staff/player/rename',
  // STAFF-PANEL6-STATUS: the panel's server status, its Admin-set limits, and Home (staffStatus.js)
  '/v1/staff/status', '/v1/staff/home', '/v1/staff/limits', '/v1/staff/limit/set',
  // STAFF-PANEL3-REALM: the trade holds, a character's findings, a hold laid (one character, or every one of an account) and
  // lifted, Roll back, Fix account, wealth past the allowance, and the removals with their 30-day store (staffRealm.js);
  // STAFF-SET-BANK: and a character's bank set (Fix account's `bank`)
  '/v1/staff/trade-holds', '/v1/staff/findings', '/v1/staff/trade-hold', '/v1/staff/trade-unhold', '/v1/staff/rollback', '/v1/staff/fix/repair',
  '/v1/staff/fix/mend', '/v1/staff/fix/bank', '/v1/staff/fix/letter', '/v1/staff/gains', '/v1/staff/market/pull', '/v1/staff/market/remove', '/v1/staff/item/take', '/v1/staff/item/purge-dupes', '/v1/staff/evidence',
  '/v1/staff/evidence/return',
  // STAFF-GIVE: Add an item - the item list, and one piece minted and given (staffGive.js)
  '/v1/staff/item/catalogue', '/v1/staff/item/give',
  // STAFF-PANEL4-CENSUS: the item and gold census (a kind found, its count and holders, its jumps) and the contested pieces
  // (the list, one piece's trail, a trail check recorded) - Admin only (staffCensus.js)
  '/v1/staff/census/find', '/v1/staff/census', '/v1/staff/census/jumps', '/v1/staff/contested', '/v1/staff/contested/piece', '/v1/staff/contested/trail',
  // STAFF-PANEL3-ECON: the panel's economy (staffEconomy.js) - the market and trades stream, node activity, the economy, per guild
  '/v1/staff/econ/stream', '/v1/staff/econ/harvests', '/v1/staff/econ/economy', '/v1/staff/econ/guilds',
  // STAFF-PANEL5-FOLLOW: a follow token for a hidden staff spectator, minted and written down (staffFollow.js)
  '/v1/staff/follow',
  // STAFF-PANEL5-MESSAGE: Message on screen - one sent, and each one's state (staffMessage.js); and the game's two: the
  // messages waiting for its player, and one pressed OK (behind the game's own session)
  '/v1/staff/message', '/v1/staff/messages', '/v1/safety/staff-messages', '/v1/safety/staff-message-ok',
  // STAFF-EVENT: a staff event staged, ended or its mini boss called, and the events with their meters (staffEvents.js)
  '/v1/staff/event', '/v1/staff/events',
  // STAFF-PANEL5-FEEDS: the relay's counts - Network bursts, Monster watch and its Flag, the bot check's Reactions and
  // their keeping (staffNet.js, staffMonsters.js, staffReactions.js); and the relay's net feed in, by its signature
  '/v1/staff/net', '/v1/staff/monsters', '/v1/staff/monster/flag', '/v1/staff/reactions', '/v1/staff/reactions/keep', '/v1/staff/net-feed',
  // STAFF-PANEL5-HIDDEN: Hide me and Show myself - a staff member hidden from every player (staffHidden.js)
  '/v1/staff/hide',
  // STAFF-PANEL5-FREEZE (staffFreeze.js): freeze and unfreeze, the frozen list and a push again (Admins); Talk, a thread, a
  // line, a thread closed and the open threads (Admins and Moderators) - and the player's own two doors to their thread,
  // behind the game's session
  '/v1/staff/freeze', '/v1/staff/unfreeze', '/v1/staff/freezes', '/v1/staff/freeze-push',
  '/v1/staff/talk', '/v1/staff/chat', '/v1/staff/chat-send', '/v1/staff/chat-close', '/v1/staff/chats',
  '/v1/staff-chat/read', '/v1/staff-chat/send',
  // PROF1: the professions (professions.js) - a character's tracks, Stores and day, the witnessed pixels, a harvest,
  // a specialisation, a withdrawal to the pack, a region's Court writs and a delivery. Every one behind a session, a
  // registered account's alone, and PROFESSIONS_OPEN's.
  '/v1/prof/state', '/v1/prof/pixels', '/v1/prof/harvest', '/v1/prof/spec', '/v1/prof/smelt', '/v1/prof/craft', '/v1/prof/stock', '/v1/stores/withdraw', '/v1/writs/list', '/v1/writs/deliver',
  // PROF12: the alchemy station's brew and an enchanting station's disenchant (alchemy.js) - the same doors
  '/v1/prof/brew', '/v1/prof/disenchant',
  // CRAFT4: a temper (professions.js) and an Enchanter's Reforge with Essence (alchemy.js) - the same doors
  '/v1/prof/temper', '/v1/prof/reforge',
  // MASTER-ART: a Master's work (masterWork.js) - the same doors
  '/v1/prof/master',
  // BAG1: a deposit - carried units into the Stores (professions.js depositStores), the same door
  '/v1/stores/deposit',
  // PROF2b: today's Motherlodes (a strike rides /v1/prof/harvest, its node naming it)
  '/v1/prof/motherlodes',
  // PROF6: guild writs (posted, supplied, withdrawn, the Officers' budget), commissions (posted, fulfilled, cancelled,
  // declined) and the guild Stores (read, deposit, withdraw) - writs.js; behind a session, a registered account's alone.
  '/v1/writs/post', '/v1/writs/supply', '/v1/writs/withdraw', '/v1/writs/budget', '/v1/writs/commission', '/v1/writs/fulfil',
  '/v1/writs/cancel', '/v1/writs/decline', '/v1/stores/guild', '/v1/stores/guild-deposit', '/v1/stores/guild-withdraw',
  // SILVER-WAYS: a guild contract posted and withdrawn (contracts.js); its pay rides a raid's claim
  '/v1/writs/contract', '/v1/writs/contract-withdraw',
  // CRAFT-WRITS: a crafting writ filled (craftWrits.js) - its goods out of the realm record; its list rides /v1/writs/list
  '/v1/writs/craft',
  // PROF5: the market (market.js) - the Market tab's views, a listing, a purchase, a cancel, a buy order, a fill, an
  // order withdrawn, a piece collected, a report and a moderator's removal. Every one behind a session, a registered
  // account's alone, and the board's, the professions' and the Marks' switches together. PROF5b: an auction posted, a bid.
  // GOLD-MARKET: a realm character's gold its sales hold, collected into its record.
  '/v1/market/read', '/v1/market/list', '/v1/market/buy', '/v1/market/cancel', '/v1/market/order', '/v1/market/fill',
  '/v1/market/unorder', '/v1/market/collect', '/v1/market/report', '/v1/market/remove', '/v1/market/auction', '/v1/market/bid',
  '/v1/market/gold',
  '/v1/sea/bounty/board', '/v1/sea/bounty/post', '/v1/sea/bounty/collect',   // SEA-BOUNTY: a freeport's bounty board on the open sea's killers
  '/v1/sea/season/board',   // SEA-SEASON: the sea's season boards
  '/v1/crew/hall', '/v1/crew/sign', '/v1/crew/release',   // CREW-SIGNED: a crew hall's recruit signed once online (crewSigns.js)
  '/v1/sea/wreck', '/v1/sea/prize/collect', '/v1/sea/prize/reclaim',   // SHIP-PVP: a wreck at sea, and its prize
  '/v1/cards/stake',   // CARDS6: a card table's stake held against the realm record
  '/v1/cards/cashout',   // CARDS6: the relay's cash-out receipt paid back into it
  '/v1/cards/deck',   // CARDS10: a ranked seat's deck vouched for (iliac.js deckOrderOf)
  '/v1/iliac/claim', '/v1/iliac/board',   // CARDS10: Iliac Hand's season board
  '/v1/gambit/claim', '/v1/gambit/board',   // KG6: The King's Gambit's season board
  // HOME-VENDOR: a home's trader's stock, and the region's traders
  '/v1/market/vendor', '/v1/market/vendors', '/v1/market/myvendors',
  // RPT1026-MARKET ARRIVE: the road alone - the account's market settled and what is on its way read (market.js marketRoad)
  '/v1/market/road',
  // REALM P1: the realm's characters (realm.js). The listing and the five that change one; the save itself rides a
  // path that names the character, matched by `realmPathOf`.
  '/v1/realm', '/v1/realm/create', '/v1/realm/customs', '/v1/realm/join', '/v1/realm/leave', '/v1/realm/delete',
  // REALM P2.1: a trade's half (realmTrade.js) - settled here, both records at once or neither.
  '/v1/realm/trade',
  // HOUSE-LOSS: the door's undo of a customs whose first save never landed (realm.js undoRealm) - its own path, so a
  // door newer than this service is told `not-found`, never handed a delete.
  '/v1/realm/undo',
  // LEGACY7: Project Legacy's lines (legacy.js) - listed, written past their rev - and a fallen character's tombstone
  '/v1/realm/lineages', '/v1/realm/lineage', '/v1/realm/die',
  // REZ-BLOODLINE AUDIT R1 (FIELD BUGS 2026-10-16b): a party's Resurrect taking back a fall the realm holds (legacy.js realmRaise)
  '/v1/realm/raise',
  // LEGACY7 part three: a half of one wedding between two players' characters, and the account's unions
  '/v1/realm/wed', '/v1/realm/unions',
  // PATREON-LINK: a patron's own Patreon, linked (patreon.js) - Patreon sends the player back to the callback, the
  // confirm is their yes, the webhook is Patreon's word on a member; the unlink is the account's, behind a session.
  '/v1/patreon/callback', '/v1/patreon/confirm', '/v1/patreon/webhook', '/v1/patreon/unlink',
  // ARENA4: the arena (arena.js) - a bout's receipt the relay signed, carried here by an account it names; the boards,
  // counted from the rows; a banner joined or quit. Every one behind a session; a guest reads the boards and keeps nothing.
  '/v1/arena/claim', '/v1/arena/board', '/v1/arena/team',
  // AUDIT ARENA-LADDER: a ladder attempt's ticket (arena.js arenaAttempt), behind a session
  '/v1/arena/attempt',
]);

/** REALM P1: `/v1/realm/<id>/data` - a realm character's save, PUT as a checkpoint and GET for a join's load or a copy
 *  to offline. The id is the service's own shape (realm.js REALM_ID_RE); anything else is no route. */
export function realmPathOf(path) {
  const m = typeof path === 'string' ? /^\/v1\/realm\/(r[0-9a-f]{20})\/data$/.exec(path) : null;
  return m ? { id: m[1] } : null;
}

/**
 * POI-1 (2026-10-14; server-account/src/poi.js): THE POI STORE'S PATHS - `{ route, sha?, id? }`, or null for a path that
 * is not one. Matched as a save slot is, so the 404 knows them: `live` and an asset's GET are read without a session (a
 * live asset; a draft's needs a builder's), the rest behind one.
 *   GET /v1/poi/live | GET /v1/poi/asset/<sha> | PUT /v1/poi/asset/<sha>?kind=mesh|texture
 *   GET /v1/poi/me | /v1/poi/list | /v1/poi/queue | /v1/poi/doc/<id>
 *   PUT /v1/poi/draft { doc, base } | POST /v1/poi/{submit,withdraw,retire,review,rollback}
 * @param {string} path
 */
export function poiPathOf(path) {
  if (typeof path !== 'string' || !path.startsWith('/v1/poi/')) return null;
  const rest = path.slice('/v1/poi/'.length);
  if (['live', 'me', 'list', 'queue', 'draft', 'submit', 'withdraw', 'retire', 'review', 'rollback', 'shelf', 'unshelve'].includes(rest)) return { route: rest };
  let m = /^asset\/([0-9a-f]{64})$/.exec(rest);
  if (m) return { route: 'asset', sha: m[1] };
  m = /^doc\/(poi-[0-9a-f]{12})$/.exec(rest);
  if (m) return { route: 'doc', id: m[1] };
  m = /^shelf\/(lib-[0-9a-f]{12})$/.exec(rest);   // POI-4b: one library entry
  if (m) return { route: 'shelf', id: m[1] };
  return null;
}

/** The routes a caller reaches WITHOUT a credential. Everything else
 *  resolves a session first. Named rather than special-cased inside the
 *  ladder, so "what can a stranger reach?" has one answer. */
export const OPEN_ROUTES = new Set(['/v1/health', '/v1/auth/guest', '/v1/auth/login', '/v1/auth/recover']);

/** PATREON-LINK: the three a stranger reaches that are NOT the JSON ladder's - a browser carrying Patreon's code back
 *  (a GET, answered with a page), the page's yes (a form), and Patreon's own webhook. Each proves itself with what it
 *  carries - a state or a ticket this service signed, a signature under the webhook's secret - never a session. */
export const PATREON_OPEN_ROUTES = new Set(['/v1/patreon/callback', '/v1/patreon/confirm', '/v1/patreon/webhook']);

/** SAFE5 + SAFE8: the chat safety's two doors a stranger reaches, NOT the JSON ladder's - the relay's feed of public
 *  lines and Discord's presses and commands. Each proves itself by a signature over its exact bytes (the relay's receipt
 *  key, the Discord application's key), never a session. */
export const SAFE_OPEN_ROUTES = new Set(['/v1/mod/feed', '/v1/discord/interactions']);

/** STAFF-PANEL1: the staff panel's doors (staff.js), NOT the JSON ladder's - none takes a game session. Two prove themselves by
 *  a password and an extension's signature (login, enroll); the rest by a staff session in `x-staff-session`. */
export const STAFF_ROUTES = new Set([...ROUTES].filter((r) => r.startsWith('/v1/staff/') && r !== '/v1/staff/net-feed'));   // STAFF-PANEL5-FEEDS: the relay's feed, by its signature, takes no session
