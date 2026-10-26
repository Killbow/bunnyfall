# FIELD BUGS 2026-10-26b - five #feature-feedback threads, and the owner's level cap

Five threads from the Discord's #feature-feedback, handed over by the owner as phone screenshots, with one line of their
own: "Also bring the level cap to 45." Read on main's `d5a4c9c6a`, with the freeware's data (`tools/fetch-data.sh`); the
main quest's thread and the boats' and the courtship's were each read by a reader of its own beside this one. The pins
are named under each fix, the mutants `tools/mutants/fb1026b_*.json` - all dead.

| | Report | What it was | Done |
|---|---|---|---|
| 1 | Blu3cak3, "Main quest borked": "Level 8 and still no letter from Morgiah ... Other people having issues too", then "If you do not visit Brisienna off the bat ... and instead power level to level 3 you will get a letter from Morgiah" | The letter is S0000999's (the main quest's backbone), and _BRISIEN starts it once. An online birth saves and reloads between that start's first tick and its second; when the reloaded page parsed the backbone before FACTION.TXT landed, the parse threw, `start quest` swallowed it, and nothing started it again. Either order - the measurement could not make Brisienna's matter | MAIN-SPINE |
| 2 | Ony4an, "jewelcrafting, roll chances not equal (h2h, critical)": "i crafted around 100 rare rings (gold and platinum, handcraft not auto) and h2h or critical not roll on them" | LOOT1's lean, as built: jewellery's skill lines lean to the mind's thirteen, and Hand-to-Hand and Critical Strike were two of the open share's thirty-five - about 0.4% of a ring's skill lines each, against a mind skill's 7% | JEWEL-KIN |
| 3 | Wheyrest, "Let us master all three primary skills" (11 votes): "1 minor, 2 major, 3 primary master skills ... helps alleviate the issue of trying to cram in two mastered weapon skills" | SOFTCAP4's 2/2/1, as decided (Mac, 2026-09-29) | MASTER-THREE |
| 4 | "Boat Player Collision": "Player boat collision needs to be off outside of PVP zone or just during the Sethrakul fight too many people out there bumping into each other ruining their shots" | FIELD BUGS 2026-10-01b stood every peer's ship in my collider, so her hull met my helm's sweep as a rock everywhere; in Sethrakul's waters SERPENT4's bumpers shoved ships apart at up to 30 m/s besides | HULL-PASS |
| 5 | lumin, "Better Courtship" (5 votes): "Compliments, giving gifts, hugging, kissing ... Right now it's confusing on what exactly you're supposed to use"; Revy: "the only thing that seems to work is to have 1 conversation per day ... to raise their disposition by 1 point" | The talk's +3 is noted as the window opens, so the panel only ever showed the tone's +1 move; a friend was about ten days of talk, a courtship seven more, and the courtship's number was shown nowhere | COURT-DEEDS |
| 6 | The owner: "Also bring the level cap to 45" | No cap stood: the level stopped where the sum did - 31 with the class's skills at 100, 44 with every 2/2/1 mastery at 200 | LEVEL-45 |

## MAIN-SPINE (1) - `src/systems/quest/mainSpine.js`, `src/systems/quest/machine.js`

WHAT DFU DOES. `_BRISIEN.txt`'s `until _exitstarter_ performed` block runs `start quest 999 999` on the game's second
tick - the backbone's one start. S0000999 sends every royal letter of the opening (Morgiah's at level 3: `_S.46_ when
_S.11_ and _S.18_` - a regard of 0 or more with her, and level 3; Lhotun's at 5) and starts each court's first quest.
Meeting Brisienna touches it once: `MetLadyBrisienna` writes a journal line. StartQuest asks QuestMachine.StartQuest and
marks itself done whatever ParseQuest answered; ParseQuest's try/catch answers null (`QuestMachine.cs:670-687`).

WHAT THE PORT DID. Parsing S0000999 reads seven royals' faction records (WhenNpcIsAvailable, WhenReputeWith -
`person.js` getFactionDataOrThrow), and the world host answers from townTalk's FACTION.TXT, read fire-and-forget at boot.
The wizard's `onDone` starts _BRISIEN, its first tick puts up message 1025 - and the quest tick waits while that box is
up - and `realmBirth` saves and replaces the page: an online character's first save is very nearly always taken between
the backbone's start's first tick and its second. The reloaded page's first tick parses S0000999; if FACTION.TXT has not
landed, it throws "Could not find faction data for FactionID 382" (Prince Lhotun, the first `when ... is available`),
`scheduleQuestByName` swallows it, StartQuest is done, and the backbone never exists. Brisienna's own letter still comes
(its timer is in the same block); no royal letter ever does. Reproduced through the real bridge, the vendored scripts and
the real FACTION.TXT, with online's clocks, both orders - meeting Brisienna at level 1 first or reaching level 3 first -
lose it alike; every later save point, a faction store missing for a tick mid-wait, and the letter's own wait all
deliver. The report's correlation with Brisienna is the second character's luck, not her: its page won the race.

FIXED - A DEPARTURE (`Port-Ledger.md` section A). A LOST BACKBONE IS STARTED AGAIN (`mainSpine.js` spineOwed,
`machine.js` keepSpine from `tick`, every SPINE_CHECK_TICKS = 30): a game whose opener has run its `start quest 999 999`
(or met Brisienna) with no S0000999 running, ended or scheduled, and no step of the story begun - a backbone that ran
starts the courts' quests, so none begun is one that never ran. A parse that fails again (the records still away) is
asked again at the next check, and a character who lost theirs before this law gets it back on their next session, at
once owed every letter its level has earned. A legacy save (its story never recorded) is left as it is.

Pinned by `test/systems/quest/fb1026b_mainspine.test.js` (the real bridge over the vendored quests, a cold page's
missing faction records, both orders; a save that already lost it; owed never with a story begun, a legacy save, a
backbone standing or scheduled). Mutants `tools/mutants/fb1026b_mainspine.json` (6, dead).

## JEWEL-KIN (2) - `src/systems/loot/lootRarity.js`, `src/net/productRecord.js`, `src/systems/smithItems.js`

WHAT DFU DOES. Nothing to follow: the ladder's affixes are the port's own (`06-Systems/Loot-Arc.md`).

WHAT THE PORT DID. Measured through the real `mintPiece`, 20,000 Masterwork rings of each metal: a ring carries about
2.5 skill lines, 85% of them one of the mind's thirteen; Hand-to-Hand was 0.42-0.47% of its skill lines and Critical
Strike 0.40-0.43%, Illusion 7.07%. A hundred Rare rings held no Hand-to-Hand line a third of the time - the report's
"never" is LOOT1's law, not a fence.

FIXED. Jewellery leans to the bare hand's two besides the mind's thirteen (`JEWEL_KIN`): neither is any weapon's own,
and a ring is where a fist or a striker's line has to come from. Each of the fifteen takes about one skill line in
sixteen; a hundred rings without a Hand-to-Hand line is a one-in-a-thousand chance. A found ring takes the lean at once.
A crafted piece is minted again from its signed record on every client, so the lean rides a new mint version:
`MINT_V_JEWEL_KIN` 3, stamped by the account service (acct195); a record of 2 or less mints on the mind's thirteen
(`skillKin`'s `fists` false) and a ring already made keeps its lines.

Pinned by `test/systems/fb1026b_jewelkin.test.js` (the report's rings through `mintPiece` at 3 and at 2; a found
ring); pins moved by intent: `loot1_kin` (the kin), `fb1013e_craftprocs` and `affixlines_reforge` (the version 3).
Mutants `tools/mutants/fb1026b_jewelkin.json` (6, dead); eighteen records of other lists re-aimed by content at the lines
this moved (the account version, the mint's call, the charsheet's Level box, the virtue commit, the lean's door).

## MASTER-THREE (3) - `src/systems/masterSkills.js`

WHAT DFU DOES. Nothing past 100: Master Skills is the port's own (SOFTCAP3).

FIXED. `MASTERY_SLOTS` 3 / 2 / 1: every primary skill may be mastered. A character who chose two keeps them and has the
third slot now. Every Master Skills box and the skill screen say 3. A martial or arcane path whose pair is two weapons
or two schools among the primaries is reachable where it was not; the Growth guide reads the slots, so it follows.

Pinned by `test/systems/fb1026b_masterthree.test.js`. Pins moved by intent - each fixture that spent "the primary slots"
on two now spends a group still at its cap (the majors' two, or a career whose third primary is a weapon):
`audit_martial`, `fb1019b_audit`, `growth1_tab`, `specreset` (an AUDIT SPEC-RESET mutant had survived the first move -
Destruction's third slot reached a path on its own - and the fixture was re-aimed until it died). Mutants
`tools/mutants/fb1026b_masterthree.json` (5, dead).

## HULL-PASS (4) - `src/scenes/comeSailAway/peerHulls.js`, `src/scenes/naval/navalHost.js`

WHAT DFU DOES. Nothing to follow: DFU has no other players.

WHAT THE PORT DID. Come Sail Away's `CheckCollision` sweeps the hull with the host's `sphereCastAll` (world.js
csaSphereCastAll), and every peer's ship stands in my collider (FIELD BUGS 2026-10-01b, Mac: "Players aren't colliding
with other players' boats") - so her hull cancelled my way into her and refused the turn toward her, everywhere. In the
serpent's waters SERPENT4's bumpers pushed my ship off every peer's at up to 30 m/s besides.

FIXED. Another player's hull meets my helm only inside a PvP zone (`peerHullsMeet`: `wildZone.js` wildHere - the
Eltheric Ocean past Veilhaven's peace, the Wrothgarian Mountains), the host handing Come Sail Away the sweep through
`peerHullSweep` (one entry swapped, bootWorld unchanged). Her hull stays in my collider: her deck is walked and stood on,
a swimmer meets her side, and my own boats, a sea ship, a rock and the ground are swept as before. Sethrakul's site
stands on the Bay's lanes, never in the ether's box, so the fight is always outside a PvP zone - and the bumpers,
which ran only there, are retired (`withBumpers`, `bumperDrift`, `BUMPER_*` gone; createNavalHost 10 logical lines out,
its ceiling 6,259 -> 6,249). THE FOUR HOSTS: `scenes/world.js` wires it; `worldModes.js` (a building) and
`dungeonContext.js` (a dungeon) stand no one's boat, and `exterior.js` (the fixed city) has no peers.

Pinned by `test/scenes/fb1001b_peerboats.test.js` (HULL-PASS: the sweep as wired, outside a zone and in one, over the
real pool, peers, aboard machine and collider); pins moved by intent: `serpent4` (the bumpers' test now pins them gone)
and `serpent1_client` (the drift line); SERPENT4's four bumper mutants retired with the code. Mutants
`tools/mutants/fb1026b_hullpass.json` (4, dead).

## COURT-DEEDS (5) - `src/systems/legacy/courtDeeds.js`, `src/scenes/legacyHost.js`, `src/systems/livingWorld/relations.js`

FIXED - the law is `06-Systems/Legacy-Arc.md` COURT-DEEDS. Four rows on the Tell me about page beside Courtship: Pay a
compliment, Give a gift (50 gold), Hug (a friend's, or a courtship's), Kiss (a courtship at 34, a betrothal or a
marriage) - each once a day per resident, each raising the regard (+2, +8, +3, +4) and a courtship's affection (+3, +6,
+5, +8), and each answer saying what it moved: "(Regard +2, now +14. Courtship +4, now 41 of 100.)". A hug or a kiss not
yet welcome says what it waits on and costs nothing. The regard badge and the Family page name the deeds.

Pinned by `test/systems/legacy/fb1026b_courtdeeds.test.js`; pins moved by intent: `lw1_livingWorld` (EVENTS: a
compliment, a hug, a kiss), `plainui` (the badge names a gift - nothing had noted one). Mutants
`tools/mutants/fb1026b_courtdeeds.json` (8, dead).

## LEVEL-45 (6) - `src/systems/levelCap.js`

WHAT DFU DOES. No cap: PlayerEntity.CheckForLevelUp raises the flag whenever CalculatePlayerLevel's floor((current -
starting + 28) / 15) passes the level.

FIXED - A DEPARTURE (`Port-Ledger.md` section A). `LEVEL_CAP` 45 on both lanes: Daggerfall's sum owes no level past it
(`checkForLevelUp`), the virtue bar fills and holds (`checkForVirtueLevelUp`), a level latched before the cap is never
spent at it (`applyLevelUp`, `commitVirtueLevelUp`), and the Level box ("You have reached the highest level, 45.") and the
level-up bar ("Highest level reached") read whole. The ceiling it names: a class whose six counted skills reach 200 under
the 3/2/1 masteries would climb to 47 for a starting sum of 156, so 45 is reached at the end of the long climb past 100,
by every class. A level already past it is kept.

Pinned by `test/systems/fb1026b_levelcap.test.js`. Mutants `tools/mutants/fb1026b_levelcap.json` (7, dead).
