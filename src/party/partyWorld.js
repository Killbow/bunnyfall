// The world's party: resting together, with its vote, the camp watch, and a stranger's camp, and
// the party's places, feet, compass, and markers. It also holds the party walk and its frame,
// the party map frame, the travel journey, and the party frame.
// Party travel, the walk's stop reason, and the rest-ready marks stay in the world.
import { areEnemiesNearby } from '../characters/encounters.js';
import { artRaceOf } from '../characters/races.js';
import { campMarkOf, campStamp, nightKindOf, nightStamp, setNightListener } from '../systems/survival/restAct.js';
import { composePartyFx } from '../net/partyBuffs.js';
import {
  cooldownStamp, createCampWatch, latestStamp, memberPresent, mirrorKey, PARTY_READY_TIMEOUT_MS, partyRestsTogether,
  REST_APART_TEXT, restsAlone, restsApart, snapshotCancels, stampOf, voteStands,
} from './partyRestLaw.js';
import { createRestWindow } from '../ui/restDoor.js';
import { FATIGUE_MULTIPLIER, maxFatigue } from '../characters/statMods.js';
import { getDungeonAutomap, liveDungeonAutomapKey } from '../maps/automap.js';
import { getPref } from '../ui/uiPrefs.js';
import { getPreventedRestMessage, REST_TEXT, restDecision } from '../player/restSession.js';
import { GROUP_ROLL_RADIUS } from '../characters/campEncounters.js';
import { hasSharedCartography } from './partyMap.js';
import { hudFade } from '../ui/fadeLayer.js';
import { isOnlinePage } from '../platform/onlineLane.js';
import { isPlayerInTown } from '../world/nearbyObjects.js';
import {
  leaderWalkStep, memberAnswer, memberFollowing, memberStopOf, memberWalkStep, PARTY_WALK_RADIUS_M, sameWalkDest,
  walkAskStands, walkHeard,
} from './partyWalk.js';
import { locationWorldRect, mapPixelToWorldCoords } from '../world/streamingWorld.js';
import { mentorStatusText, refreshMentor } from '../characters/mentorMode.js';
import { ownMinutes, sharedClockOn } from '../world/worldTick.js';
import { PARTY_SEND_MS } from '../net/wire.js';
import { partyCompassPoints } from '../ui/partyMapMarks.js';
import { partySizeOf } from './partyScale.js';
import { playerEntity } from '../characters/playerEntity.js';
import { racialRestBlock } from '../afflictions/vampirism.js';
import { setFirmamentMentoring } from '../characters/firmamentLive.js';
import { setMidScreenText } from '../ui/midScreenText.js';
import { startRestGroundedCheck } from '../player/motor.js';
import { TERRAIN_SIZE } from '../world/terrainSampler.js';
import { TRAVEL_VIEW_TEXT } from '../travel/travelView.js';
import { YesNoBoxWindow } from '../ui/yesNoBox.js';

/** @param {any} shared */
export function createPartyWorld(shared) {
  const {
    _hiddenPeers, _isPlayerInTownStrict, _musicLocationType, cam, collider, csaAboard, duelEnemyNear, exteriorFoePool,
    fastTravelTo, gamePaused, hourRezOpen, keptKills, locationIndex, outdoorRestDeps, player, playerTicker,
    playerTravelPixel, pointerSurfaces, rescueLink, runEncounterTick, socialLink, state, townTalk, travelViewAllowed,
    travelViewRouteTo, travelViewWalkTo, tvLocationAt, tvPlaceSummary, tvSay, tvSceneOf, tvWater, veilRefused,
    walkMode, wildTeleportRefused, wildWalkRow, worldMoveBusy,
  } = shared;
  let _walkTs = null;   // TV8: when my journey last stopped for a reason of mine (never the party's halt)
  let _walkBox = null, _walkBoxRound = null;   // TV8: the question on screen, and the round it asks about (AUDIT OW3 P4)
  let _walkHeard = null;   // AUDIT OW3 P7: the leader's walk as last heard { acct, tw, at } - believed a while without a pose

  let _walkWas = false, _walkAt = 0;   // TV8: last step I walked the walk's own journey as a yes; the step's clock

  let _partyRestMirrored = null;   // AUDIT PARTY-REST: the mirrorKey of the nap I last mirrored - one mirror per nap, however it ended

  let _partyRestReadyRound = null;   // PARTY-REST31: the leader's voteAt my (member's) ready was cast into - when that round ends, so does my vote
  let _partyRestStartWaived = false;   // PARTY-REST29: my own start stamp no longer blocks a new vote (my rest window closed with no rest) - it is still BROADCAST, so the members see the round was spent
  let _restAloneNight = false;   // REST-OPT (AUDIT C3): the rest I am in was granted as my own (restTogether false at its grant) - it says `nr` until it ends

  /** REST-OPT (AUDIT C1): my "Rest with my party" switch as the party can hear it - off only through a hub that carries
   *  a pose's `nr` (net/wire.js REST_OPT_RELAY_MIN). Through an older one the party went on counting me a voter to
   *  gather while my own client refused every rest of theirs: nobody rested, and my own night was theirs to follow. */
  const restsWithParty = () => getPref('restWithParty') !== false || !socialLink()?.restOptOk;

  /** PARTY-REST1: RestWindow's own `mode` string ('loiter'|'timed'|'full', restWindow.js:"is the host's live") to the wire's small
   *  numbers (net/wire.js validPartyPose: 0/1/2) - the one place the three hosts' restState getters (worldModes.js,
   *  dungeonContext.js) and this host's own outdoor overlay converge, so the mapping is written once. */
  const partyRestModeCode = (mode) => (mode === 'timed' ? 1 : mode === 'full' ? 2 : 0);

  const composePartyPose = () => {
    const mode = shared.modes?.mode ?? 'exterior';
    const px = playerTravelPixel();   // AUDIT SOC B18: read ONCE - this ran twice a second, and it used to read the pixel three times and compose a whole look (every equipped item) for three fields
    const ident = mode === 'dungeon' ? shared.modes?.roomIdentity?.() : null;
    const loc = locationIndex.get(`${px.x},${px.y}`) ?? null;
    // PARTY-REST1: my own real session, whichever of the three hosts is
    // holding it right now - never a MIRRORED one (each restState getter
    // already excludes those; this host's own outdoor overlay excludes
    // itself the same way, one line down, so a follower here never
    // reads back as somebody else's leader).
    // OVH4: on either skin - a party's rest is the party card wherever it opens (restDoor.js), so there is no
    // classic-skin rest that nobody can mirror any more (ONLINE-REST1's classic arm, retired).
    const restWin = mode === 'interior' ? shared.modes?.restState
      : mode === 'dungeon' ? shared.modes?.dungeonCtx?.restState
        // PARTY-REST6: `state === 'resting'`, the same guard added to worldModes.js's/dungeonContext.js's own
        // restState getters - session truthy alone does not mean this window is still actually ticking; it
        // sits on its own ended/refused screen, session unchanged, for however long its owner takes to click
        // OK. See those getters' own doc comment for the bug this closes.
        : (townTalk.overlay?.isRestWindow && !townTalk.overlay.isPartyRestMirror && townTalk.overlay.session && townTalk.overlay.state === 'resting'
          ? { mode: townTalk.overlay.mode, hoursRemaining: townTalk.overlay.session.hoursRemaining, totalHours: townTalk.overlay.session.totalHours }
          : null);
    return {
      px: px.x, py: px.y,
      in: mode === 'dungeon' ? 1 : mode === 'interior' ? 2 : 0,
      ...(shared.online?.layer ? { ly: shared.online.layer } : {}),   // SCALE5d: the layer of the place I stand in, so a mate who comes asks for it
      ...(shared.online?.room ? { rk: shared.online.room } : {}),   // STAFF-PANEL5-FOLLOW: the room I stand in - a cell's or a world room's alone (net/wire.js validPartyPose), the staff's to read, never fanned
      loc: ident?.kind === 'dungeon' ? (ident.name ?? '') : (loc?.name ?? ''),
      // AUDIT SOC B5: fatigue in the DIGITS a sheet shows (ui/charsheet.js: the stored pool is x FATIGUE_MULTIPLIER) - a
      // member's card said 3200/6400 where their own sheet said 50/100
      h: playerEntity.health ?? 0, hm: playerEntity.maxHealth ?? 0, f: Math.trunc((playerEntity.fatigue ?? 0) / FATIGUE_MULTIPLIER), fm: Math.trunc(maxFatigue(playerEntity) / FATIGUE_MULTIPLIER), m: playerEntity.magicka ?? 0, mm: playerEntity.maxMagicka ?? 0,
      race: artRaceOf(playerEntity), gender: playerEntity.gender ?? 'male', face: playerEntity.faceIndex ?? 0,   // the hello's own reading (net/remotePlayers.js composeLook), without the items
      // PARTY-REST1: the building key, only meaningful `in === 2` - a
      // dungeon and the open air both leave it null (net/wire.js
      // validPartyPose already zeroes it outside a building, but this
      // host names its OWN law rather than leaning on the wire's).
      bk: mode === 'interior' ? (shared.modes?.interiorBuilding?.buildingKey ?? null) : null,
      // PARTY-REST4 (2026-09-21, per-request: "15m away from the leader do not change the healrate party
      // member MUST heal their health near the leader" - the bug this closed): a follower's mirror was
      // computing its OWN restKind() - a position check (bed/houseOwned/ship/byFire) asked of THEIR OWN feet,
      // which almost never finds one of those under a follower who is simply standing beside a resting
      // leader's actual bed, not lying in one themselves. That silently downgraded every follower to
      // systems/survival/rest.js's REST_KIND.Rough - which pays HALF of DFU's hourly recovery, floored - so a
      // follower's health, whose own hourly gain is often small enough that half of it truncates to nothing
      // some hours (systems/survival/rest.js's own restHour, "half of what it gained... and is never healed
      // while it took some back" - fatigue and magicka's much larger raw gains rarely land on that same
      // knife-edge, which is why they visibly filled while health did not). Broadcasting the actual `restKind`
      // the leader is resting AS lets a follower's mirror inherit that SAME kind instead of guessing their own
      // - they are sharing this rest event, not merely standing near a stranger's.
      rest: restWin ? { mode: partyRestModeCode(restWin.mode), hoursRemaining: restWin.hoursRemaining, totalHours: restWin.totalHours, kind: playerEntity.restKind ?? null } : null,
      // PARTY-REST5 (2026-09-21, per-request: "when the initiator spawns mobs only he gets taken out of the rest
      // not the follower... the ones who not initiate need to also stop resting when an enemy appears for the
      // initiator" - the bug this closes): a monotonic marker, NOT nested inside `rest` above - a real session
      // moves to 'ended' the same tick an enemy break is discovered, so by the next pose `rest` may already read
      // null again; a follower's edge-check needs a value that survives that. Unconditional (sent whether or not
      // I am resting at all right now) so a follower already mid-mirror still sees it change the instant it does.
      restEnemyAt: playerEntity._restEnemyBreakAt ?? null,
      // PARTY-REST2: `ready` is this tab's own /ready vote - the leader's toggleRest gate (below) reads it straight
      // off each near member's last pose. `restPending` (net/wire.js validPartyPose) stays unsent: nothing here
      // proposes a session over the wire for anyone else to answer, so it lands as the validator's own default null.
      ready: shared._partyRestReady,
      readyAt: shared._partyRestReady && Number.isFinite(shared._partyRestReadyAt) && shared._partyRestReadyAt > 0 ? shared._partyRestReadyAt : null,   // AUDIT PARTY-REST: when the vote was cast, on the shared clock - a reader counts it only while fresh (partyRestLaw voteStands)
      // PARTY-REST2e: this tab's own vote-cooldown clock - null while no genuine "not ready" refusal has ever
      // fired (or it has fully expired - see partyRestGate itself for where this is set) - never the current
      // moment; broadcasting "now" every pose would make every tab look like an ongoing vote forever.
      voteAt: Number.isFinite(shared._partyRestGateRefusedAt) ? shared._partyRestGateRefusedAt : null,
      cl: playerEntity.level ?? 1,   // SOFTCAP1: my REAL level, so a mentor in my party can play at it (net/wire.js validPartyPose `cl`)
      // PARTY-REST19 (2026-09-22, per-request: "An non initiator MUST cancel the rest for all if he cancels
      // the ongoing resting"): stamped by a follower's own Stop click (partyRestMirrorDeps' `onManualStop`),
      // naming the ONE account they were mirroring - broadcast unconditionally, like restEnemyAt above, so
      // the target's own session sees it even though the follower's own mirror ends (and stops broadcasting
      // `rest`) the same tick.
      restCancelFor: playerEntity._restCancelRequestFor ?? null,
      restCancelAt: playerEntity._restCancelRequestAt ?? null,
      // PARTY-REST21 (2026-09-22, per-request: confirmed by direct testing - "1/2 pops up again in the
      // chat"/"the non initiator presses r again when all ready he starts a new vote... just put a cooldown
      // on being able to start a new rest"): the last time MY OWN rest actually started, for real or via
      // mirror - see toggleRest's own doc comment (world.js) for the race window this closes. Broadcast
      // unconditionally, like restEnemyAt/restCancelAt above.
      restStartedAt: Number.isFinite(shared._partyRestJustStartedAt) ? shared._partyRestJustStartedAt : null,
      ...(shared._rezOut && performance.now() < shared._rezOut.until ? { rz: { to: shared._rezOut.to, at: shared._rezOut.at } } : {}),
      ...rescueLink.poseField(),   // BUNNY-SPELLS: my Rescue's call
      ...(shared._deadMark ? { dd: shared._deadMark } : {}), ...(shared.legacyHost?.raisable() === false || !hourRezOpen() ? { fg: 1 } : {}),   // PCORPSE3: my body, for a party member who missed the death   // RESURRECT1: my Resurrect's call, held a few sends   // REZ-BLOODLINE: fallen for good - no Resurrect raises me (net/wire.js validPartyPose `fg`)
      // PARTY-TRAVEL (2026-09-25, Mac: "...the option for party members to ready up and travel together"): the party's
      // journey (net/wire.js validPartyPose, systems/party/partyTravelLaw.js), each field omitted when there is none - my
      // proposal while I lead one (`tv`, the round's stamp and, once we set out, `go`), my answer to the leader's round
      // (`tr` ready / `td` staying behind, naming its `at`), and, while I lead, where I stand in the open air (`wx`, `wy`,
      // `wz`: the world pose's own frame) so a member travelling to me lands beside me - never while a journey, a load
      // or a teleport is moving me, when the scene's frame is between two places.
      ...(shared.partyTravel?.poseFields() ?? {}),
      ...(shared._walkLead && socialLink()?.partyWalkOk ? { tw: shared._walkLead } : {}),   // TV8: my walk while I lead one
      ...(_walkTs != null && socialLink()?.partyWalkOk ? { ts: _walkTs } : {}),   // TV8: when my journey last stopped for a reason of mine
      ...(shared.social?.leads?.() && mode === 'exterior' && walkMode && shared.playerSpawned && !worldMoveBusy() ? partyFeetOf(player.pos) : {}),
      ...(!shared.social?.party && mode === 'exterior' && walkMode && shared.playerSpawned && !worldMoveBusy() && partyFeetOf(player.pos)),   // STAFF-PANEL5-FOLLOW: and outside a party, so a staff /tp lands on my feet without asking my game
      ...partyFxField(),   // PARTY-BUFFS: my live spell effects, for the party's cards (net/partyBuffs.js)
      ...(shared.bountyHost?.poseField() ?? {}),   // BOUNTY1: my bounties - the shared, the held and today's cleared (validPartyPose `bq`)
      ...(shared.partyPing?.poseField() ?? {}),   // PARTY-PING: the look's point, while the route is still worth saying (validPartyPose `pg`)
      lv: Math.max(1, Math.min(99, playerEntity.level | 0 || 1)),   // BOUNTY-TIER: my level, so a sharer knows whose tier a bounty shuts out
      ...(!restsWithParty() || (_restAloneNight && playerEntity.isResting) ? { nr: 1 } : {}),   // REST-OPT: I rest alone - no voter, nobody to gather, no rest to mirror (AUDIT C3: and a night granted as my own stays mine to its end)
      ...(playerEntity.isResting ? { rs: 1 } : {}),   // PARTY-BUFFS: resting, mine or followed - what I gain is the night's, no heal to float
      ...keptKillField(),   // KEPT-KILL: the foes I kept on a partner's word that fell here lately (validPartyPose `qk`)
    };
  };
  /** KEPT-KILL (2026-10-01): the kills of foes I kept on a partner's word, held KEPT_KILL_HOLD_MS (scenes/quest/questFoeHost.js
   *  KeptKillLedger) - omitted with none. */
  const keptKillField = () => { const qk = keptKills.rows(Date.now()); return qk ? { qk } : {}; };
  /** PARTY-BUFFS (2026-09-27, Tabitha: "Allow us to see buff timers or SOME sort of indicator that we have placed a buff
   *  on a party teammate [preferably on their party portrait]"): my effects as my HUD rows them, omitted with none. */
  const partyFxField = () => { const fx = composePartyFx(playerEntity); return fx.length ? { fx } : {}; };
  /** PARTY-TRAVEL: my feet as the party pose says them - the world pose's own frame (MapsFile's X and Z, the height
   *  with the floating origin's vertical shift shed), so a party mate's client puts them back in ITS scene. */
  const partyFeetOf = (pos) => { const wc = state.worldCoords(pos); return { wx: wc.x, wy: pos[1] - state.compensation[1], wz: wc.z }; };
  /** PARTY-REST1: the wire's small numbers back to RestWindow's own mode strings - `partyRestModeCode`'s inverse,
   *  read on the way IN instead of the way out. */
  const partyRestModeFromCode = (code) => (code === 1 ? 'timed' : code === 2 ? 'full' : 'loiter');
  /** PARTY-REST1: a follower's own copy of `outdoorRestDeps`, with the hooks that must never fire twice for one
   *  nap swapped out - `enemiesNearby` and the encounter half of `advanceMinutes`. Everything else (tickVitals,
   *  fullyHealed, onRestFinished/raisePlayerSkills, the message box, onClose) is the SAME closure `outdoorRestDeps`
   *  already carries, over this SAME player's `playerEntity` - a mirrored rest heals exactly as a real one would,
   *  because underneath the swapped hooks it IS one. `place` is read fresh each call rather than copied, since
   *  a follower can be indoors or in a dungeon while the leader they are mirroring rests outdoors, or the reverse.
   *
   *  PARTY-REST4 (2026-09-21, per-request: "15m away from the leader do not change the healrate party member
   *  MUST heal their health near the leader" - the bug this closed): `restKind` is ALSO overridden, to the
   *  RESTING MEMBER's own broadcast kind (`restKind` param, read from their pose's `rest.kind`) rather than
   *  `outdoorRestDeps`'s own inherited restKind() - a position check (bed/houseOwned/ship/byFire) asked of the
   *  FOLLOWER's own feet, which almost never finds one of those under someone simply standing beside another
   *  player's actual bed. Left uncorrected, that silently downgraded every follower to Rough - HALF of DFU's
   *  hourly recovery, floored (systems/survival/rest.js's own restHour) - while the person they were mirroring
   *  slept in the real bed at the real rate. A follower now shares the exact quality of rest the person they are
   *  mirroring is actually getting, since that is what mirroring a rest is supposed to mean. Falls back to the
   *  inherited position-based check only if the broadcast carried no kind at all (an older peer; AUDIT SURV-TIERS:
   *  every tier sends its place now) - never silently to Rough specifically. */
  /** AUDIT PARTY-REST: the rest gate's own questions, asked of the FOLLOWER before a mirror opens - the outdoor
   *  toggleRest's restDecision inputs, with the foe scan taken from whichever host I stand in (the hosts answer
   *  `restEnemiesNearby`), plus the interior/dungeon window stack (`modes.overlayHeld`, which townTalk's own
   *  `overlayActive` does not cover). A pending give-offer is not spent by a mirror. */
  const mirrorRestRefused = () => {
    if (shared.modes?.overlayHeld) return true;
    const mode = shared.modes?.mode ?? 'exterior';
    const enemies = mode === 'interior' ? !!shared.modes?.restEnemiesNearby?.()
      : mode === 'dungeon' ? !!shared.modes?.dungeonCtx?.restEnemiesNearby?.()
        : !!outdoorRestDeps.enemiesNearby();
    const d = restDecision({
      enemiesNearby: enemies,
      swimming: !!player.isPlayerSwimming,
      grounded: startRestGroundedCheck(!!player.grounded, player.pos, collider),
      preventedMessage: getPreventedRestMessage,
      racialOverrideBlocks: !!racialRestBlock(playerEntity, Math.floor(ownMinutes())),   // LIVED1: the thirst is the character's own
    });
    return d.kind !== 'rest';
  };
  const partyRestMirrorDeps = (restKind, targetAcct) => {
    // PARTY-REST4b (2026-09-21, per-request: "only the leader heals up hp not the members" - a genuine closure
    // bug found on re-inspection of PARTY-REST4): the `restKind` KEY this function used to spread onto its
    // returned copy was inert - `outdoorRestDeps.setResting` is one specific closure, made once, over
    // `outdoorRestDeps`'s OWN `restKind` local; a same-named key on a spread COPY of the object is never
    // consulted by it. Fixed at the real seam: `outdoorRestDeps.overrideRestKind` (shared.js's `createRestDeps`)
    // flips a mutable slot INSIDE that same closure, which `setResting` actually reads from, and which clears
    // itself the moment resting turns off - so this call must run before the mirror's window-construction call
    // fires `setResting(true)` at construction (world.js's own call site does exactly that: this factory runs to
    // completion, THEN the window is built). Falls back to the inherited position-based check when the broadcast
    // carried no kind at all (an older peer - every tier sends its place) - never silently to Rough specifically.
    outdoorRestDeps.overrideRestKind(restKind ? () => restKind : null);
    return {
    ...outdoorRestDeps,
    partyRest: () => true,   // OVH4: a mirror IS a party's rest - the party card on either skin (restDoor.js)
    // PARTY-REST1: only the leader's own real session is allowed to say enemies are near or roll an encounter - a
    // follower's mirror answers false unconditionally and, below, never rolls a wanderer. A room of
    // four followers independently rolling the SAME slept hours would spawn four rooms' worth of monsters for one
    // party's one nap; the leader's own session (composePartyPose's `restWin`, unmirrored) is the one roll that counts.
    enemiesNearby: () => false,
    // LIVED1: the mirrored night is the follower's own time too. AUDIT LIVED1 H (P2): and the encounter loop's marker
    // rides it - a marker left at the night's start made the first frame up walk the whole night as WALKING minutes.
    // AUDIT LIVED1b P1: ...but H moved the marker PAST the night, and the loop's minutes are not the wanderers' alone:
    // its second arm is the follower's own watch (PlayerEntity.cs:498-511 - a legal reputation below -10 rolls a 5%
    // Criminal_Conspiracy and the city guards each minute, a banishment 10%), and a hated member slept in town untouched
    // by mirroring a clean partner's night (0 of 200 nights watched, against 200 alone). The mirror walks each sub-tick
    // through the loop with the wanderers' roll left out - the rester's is the party's (PSCALE1 COUNT-1).
    advanceMinutes: (n) => { playerTicker.advance(n); runEncounterTick(walkMode && shared.playerSpawned ? player.pos : cam.pos, true, { spawns: false }); },
    commitCrime: () => {},   // a follower did not choose to trespass here themselves - the leader's own session already answers for the room
    canceledByFollower: () => false,   // AUDIT PARTY-REST: a mirror is nobody's target - only the real rester's session answers a follower's Stop
    // PARTY-REST19 (2026-09-22, per-request: "An non initiator MUST cancel the rest for all if he cancels the
    // ongoing resting" - the bug this closes): fired ONLY by enhancedRest.js's own Stop button (a NEW,
    // dedicated hook, never by a natural completion or an enemy break), so an ACTUAL, deliberate cancel here
    // stamps a broadcast request directed at the ONE account I am mirroring - `canceledByFollower` (below, on
    // outdoorRestDeps/interiorRestDeps/dungeon's own) is what the REAL rester's own session checks every tick
    // for a request naming THEM specifically, ending their own session the same way Stop would if they had
    // pressed it themselves.
    onManualStop: () => { playerEntity._restCancelRequestFor = targetAcct ?? null; playerEntity._restCancelRequestAt = performance.now(); },
    place: () => {
      const m = shared.modes?.mode ?? 'exterior';
      return {
        inTownOutside: m === 'exterior' && _isPlayerInTownStrict(),
        inTownLocation: m === 'exterior' ? isPlayerInTown(_musicLocationType()) : true,
        insideBuilding: m !== 'exterior',
      };
    },
    };
  };
  /** PARTY-REST1/2: my own current location, in the SAME terms composePartyPose broadcasts it - shared by the
   *  follower mirror's proximity check and the leader's consensus gate below, so the two can never disagree about
   *  what "near" means. */
  const myPartyLocation = () => {
    const mode = shared.modes?.mode ?? 'exterior';
    const px = playerTravelPixel();
    return {
      px: px.x, py: px.y,
      in: mode === 'dungeon' ? 1 : mode === 'interior' ? 2 : 0,
      bk: mode === 'interior' ? (shared.modes?.interiorBuilding?.buildingKey ?? null) : null,
    };
  };
  const samePlace = (a, b) => !!(a && b && a.px === b.px && a.py === b.py && a.in === b.in && (a.in !== 2 || a.bk === b.bk));
  /** PARTY-REST3 (2026-09-20, per-request: "how near is near" - a world-map pixel is roughly 832x416 METERS
   *  (dfworkshop.net's own figure for Daggerfall Unity's world-pixel scale), so `samePlace` alone would call two
   *  players on opposite sides of an entire city, or an entire wilderness pixel, "near" each other. This is the
   *  SECOND, tighter law `nearPartyMembers` also asks: a real distance in Unity meters, read off the same 3D
   *  positions ui/enhanced/enhancedInventory.js's remote-player list and CAMP-REST's own group-roll guard already use
   *  (`peersNear()`, `player.feetAt()`) - not the wire's own coarse px/py at all. Chosen at "the same room or
   *  camp circle", not GROUP_ROLL_RADIUS's 100 (that guard only needs to keep two UNRELATED camps from double-
   *  rolling on top of each other; this one means "close enough to be resting together"). A member whose peer is
   *  not even a rendered, visible body right now (out of stream range, or simply never loaded in) answers
   *  Infinity, same as one with no live position at all - too far, not an error. */
  const PARTY_REST_RADIUS = 15;
  /** The feet of a party member's body as this client draws it, or null when no body of theirs is tracked here. */
  const feetOfPartyAccount = (acct) => {
    const row = shared.social?.party?.members.find((m) => m.acct === acct);
    const peer = row ? shared.peersNear()?.find((p) => row.peers.includes(p.id)) : null;
    return peer?.feet ? [peer.feet[0], peer.feet[1], peer.feet[2]] : null;
  };
  const distanceToPartyAccount = (acct, from = player.feetAt()) => {
    const peerFeet = feetOfPartyAccount(acct);
    if (!peerFeet) return Infinity;
    const peer = { feet: peerFeet };
    const mine = from;
    const dx = peer.feet[0] - mine[0], dy = peer.feet[1] - mine[1], dz = peer.feet[2] - mine[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };
  /** DISC23-A (2026-09-24, Starempire42 on Discord: "It would be really nice to be able to see your party members on
   *  the town and dungeon maps"): the party members whose BODIES this client draws in the room I am in - their feet in
   *  this scene's frame (peersNear, the frame my own feet are in), their facing (the peer's eased yaw, the caret's own
   *  convention) and their name. The town and dungeon plans draw from this; a member with no tracked body here is
   *  omitted, not guessed at - they are on the bay, which reads the hub's pixel. Composed on every read: they walk. */
  const partyNear = () => {
    if (!shared.social?.party) return [];   // AUDIT COMPASS-PARTY C6: no walk of the room's players out of a party - the compass asks every frame
    const near = shared.peersNear();
    if (!near?.length) return [];
    const out = [];
    for (const m of shared.social.others()) {
      const peer = near.find((p) => m.peers?.includes(p.id));
      if (!peer?.feet) continue;
      out.push({ id: peer.id, acct: m.acct, name: m.name, feet: [peer.feet[0], peer.feet[1], peer.feet[2]], yaw: shared.online?.peers.get(peer.id)?.shown?.yaw ?? 0 });   // AUDIT PSCALE1: the id, for the party's own roll election
    }
    return out;
  };
  /** AUDIT (the pre-merge audit, I-E): the party the MAPS mark - those drawn here; a mate the classic lane stands nowhere
   *  (INVIS-NET) is no caret on a plan either. The roll's election, the party's size and the Renown share read
   *  `partyNear` whole - a concealed mate still fights beside me. */
  const partyOnMaps = () => partyNear().filter((m) => !_hiddenPeers.has(m.id));

  /** COMPASS-PARTY (2026-09-27, Discord - Ashley: "being able to see where party members are on compass? - just lil
   *  green marks that point in that direction"): the party on MY compass, in this scene's XZ (ui/partyMapMarks.js
   *  partyCompassPoints) - the bodies the maps mark where they stand, and the rest where their poses say: the leader's
   *  own feet (`wx`,`wz`), else the middle of their map pixel (the pixel's terrain spans TERRAIN_SIZE from its
   *  translation, as gateSceneXZ reads it). Out of a party, none. */
  const partyCompass = () => (shared.social?.party ? partyCompassPoints({
    bodies: partyOnMaps, others: shared.social.others().filter((m) => !m.peers?.some((id) => _hiddenPeers.has(id))), here: playerTravelPixel(),   // AUDIT C4: a concealed mate is no mark - the leader's own feet (`wx`) followed them
    fromWorld: (wx, wz) => state.localFromWorld(wx, wz),
    pixelCentre: (px, py) => { const t = state.pixelTranslation(px, py); return [t[0] + TERRAIN_SIZE / 2, t[2] + TERRAIN_SIZE / 2]; },
  }) : null);
  /** PSCALE1 (Mac: "I want enemy difficulty, enemy numbers, etc to scale approriately with party size"): THE PARTY AN
   *  OUTDOOR ROLL STANDS FOR (systems/party/partyScale.js partyExtraFoes) - me and the partymates within GROUP_ROLL_RADIUS, the
   *  camp's own group, before any blow is struck; a town full of strangers is not my party. Offline, or with the room
   *  not open, one. A FIGHT's weight is not this: it is the foe's own fighters (AUDIT PSCALE1, Mac: "Whoever fights
   *  it"), counted by the pools at their doors. */
  const partySize = () => {
    if (!shared.online || shared.online.status !== 'open' || !shared.online.room) return 1;
    const me = player.feetAt?.();
    if (!me) return 1;
    const r2 = GROUP_ROLL_RADIUS * GROUP_ROLL_RADIUS;
    let n = 1;
    for (const m of partyNear()) { const dx = m.feet[0] - me[0], dz = m.feet[2] - me[2]; if (dx * dx + dz * dz <= r2) n++; }
    return partySizeOf(n);
  };

  /** PARTY-REST2/3: true when `pose` (a party member's last broadcast pose) puts them in the SAME place as me
   *  (samePlace) AND within PARTY_REST_RADIUS meters for real (distanceToPartyAccount) - the one law both
   *  nearPartyMembers (the consensus gate, over every member) and partyRestFollowTick (the mirror, over the
   *  leader alone) ask, so the two can never drift into disagreeing about what "near" means.
   *
   *  PARTY-REST8 (2026-09-21, per-request: "in a tavern when i want to rest it says gather your party as leader
   *  or must be near leader we are in the same room" - the bug this closes): the real-meters half of this check
   *  was applied UNCONDITIONALLY, indoors included - but `strangerRestGate`, a few lines below, already carries
   *  the doc-commented law this one missed: "indoors (a tavern room, a shop, a guild hall) the check does not
   *  run at all - walls already separate one room's strangers from another's". `distanceToPartyAccount` depends
   *  on `peersNear()` actually having a fresh, tracked body for the other account RIGHT NOW - real, but a
   *  strictly weaker guarantee indoors than outdoors, where PARTY-REST3's own 15m radius exists specifically to
   *  make up for a world-map pixel being ~832m across. `samePlace`'s own indoor arm already asks for something
   *  far more precise than that - the SAME building key - which is exactly the signal `net/wire.js`'s own
   *  `inRange()` already treats as sufficient at the network layer itself ("in every other room [than a world
   *  cell], always" in range) as a small, walled, single-building instance. Skipping the extra real-distance
   *  requirement indoors brings this check in line with both of those existing laws instead of quietly
   *  depending on indoor peer-tracking being as reliable as outdoor peer-tracking, which it need not be. */
  const nearAccount = (acct, pose, from = player.feetAt()) => {
    if (!pose || !samePlace(myPartyLocation(), { px: pose.px, py: pose.py, in: pose.in, bk: pose.bk })) return false;
    if ((shared.modes?.mode ?? 'exterior') === 'interior') return true;   // walls already do this job - see the doc comment above
    return distanceToPartyAccount(acct, from) <= PARTY_REST_RADIUS;
  };
  /** PARTY-REST2/3: the OTHER seated members standing in this SAME place right now (samePlace, the wire's own
   *  coarse px/py/in/bk) AND within PARTY_REST_RADIUS meters of me for real (distanceToPartyAccount) - the
   *  leader's gate reads this to ask "has everyone actually HERE said /ready", and it is nobody's job but the
   *  leader's: a follower far across the map, or simply not yet posed since taking the seat, does not hold up a
   *  rest happening HERE - and now, neither does one merely sharing the same square kilometre of wilderness. */
  const nearPartyMembers = (from = player.feetAt()) => {
    if (!shared.social?.party) return [];
    return shared.social.others().filter((m) => memberPresent(m) && nearAccount(m.acct, m.p, from));   // AUDIT PARTY-REST: a seat the hub marked offline is nobody here
  };
  /** PARTY-REST2 (2026-09-20, per-request, then extended: "when a member wants to rest can this also initiate a
   *  rest vote... but only when the member is near the leader"; then, per-request: "when the leader or the party
   *  member starts resting when outside the range a pop up should appear - for the leader 'you must gather the
   *  party' and for the member 'you're not near the leader'"; then, per-request: "when someone presses R and
   *  another member presses R it starts a new vote for the other member. Put a cooldown of 1 minute on it and
   *  when someone tries to rest while the vote is going it has to tell Resting vote ongoing"; then, per-request:
   *  "it only counts down the countdown for the player who initiated it not for the whole group... every one in
   *  the group can start a vote and has its own timer. The vote time also shouldn't start when out of range"):
   *  null only with no party at all, or once everyone standing here HAS typed /ready - every other path refuses
   *  with a line naming WHY, role by role:
   *  - the leader with no one standing near them at all: gather the party first;
   *  - a follower not standing where the leader is: go stand where the leader is first;
   *  - either one, standing together but not everyone here has voted yet: the existing X/Y-ready line.
   *  A follower who is simply off doing their own thing, nowhere near the leader, still opens their own solo rest
   *  exactly as before THIS message existed - the follower branch here fires only once the follower has actually
   *  tried to rest, the same as it always did; it does not chase them down to say so unprompted.
   *
   *  PARTY-REST2d/e: the cooldown belongs to the GROUP standing here, not to whichever one of them happened to
   *  press Rest first - one clock, read off the MOST RECENT of my own last refusal and every near member's own
   *  broadcast `voteAt` (composePartyPose), so a party-mate pressing Rest moments after mine already asked the
   *  same question sees the SAME "already in progress" answer I would, not a fresh vote of their own with its
   *  own separate timer. And the clock only ever starts on the THIRD line above - the leader-alone and
   *  follower-far-from-leader refusals never touch `_partyRestGateRefusedAt` at all, so simply being out of
   *  range is never mistaken for "a vote is in progress" by anyone, including me a minute later. */
  /** AUDIT PARTY-REST: whether a vote round is open among the members standing here - the most recent of my own
   *  refusal and every near member's broadcast `voteAt`, each read against the shared clock (a stamp from beyond
   *  its slack is no stamp - one client saying 1e300 held the whole party at "Resting vote ongoing." for ever),
   *  within the round's cooldown. The gate, the chat's /ready and the tally all ask this one question. */
  /** REST-OPT (2026-09-27, Discord - Tabitha: "Allow party members to choose not to rest with their party"): whether my
   *  rest is the party's (systems/party/partyRestLaw.js partyRestsTogether - my switch, and the leader's), and the near
   *  members the party's rest counts: those who rest with it (a member resting alone is no voter, nobody to gather,
   *  and no rest to mirror). The travel's own gathering (PARTY-TRAVEL) reads nearPartyMembers whole. */
  const restTogether = () => partyRestsTogether(restsWithParty(), shared.social?.party ?? null, !!shared.social?.leads?.());
  const nearRestMembers = (from = player.feetAt()) => nearPartyMembers(from).filter((m) => !restsAlone(m));
  const partyRoundActive = (nearHere = nearRestMembers()) => {
    const now = shared.social.now();
    return now - latestStamp(nearHere, 'voteAt', shared._partyRestGateRefusedAt, now) < PARTY_REST_VOTE_COOLDOWN_MS;
  };
  /** OVH4: whether a rest here is the PARTY'S - online, in a party, and not in a tavern, temple or guild hall
   *  (TAVERN-REST1/GUILD-REST1, every member sleeps for themselves there). The same two questions partyRestGate asks
   *  before it asks the party anything; ui/restDoor.js reads it (the rest deps' `partyRest`) to open the party card
   *  on either skin. */
  // REST5: online there is no party vote, gather or mirror (partyRestGate and partyRestHere answer nothing there). A
  // long rest stamps the pose's `restStartedAt` (setNightListener; createRestDeps' restNight calls it) for the camp roll
  // below; it no longer carries nearby party members into the night - each player chooses their own rest.
  const hostRestDeps = () => {
    const mode = shared.modes?.mode ?? 'exterior';
    return mode === 'interior' ? shared.modes?.restDeps?.() ?? null : mode === 'dungeon' ? shared.modes?.dungeonCtx?.restDeps?.() ?? null : outdoorRestDeps;
  };
  /** A rest point everyone may use - a fire, a tent, a bed; never a Bedroll, which keeps the stranger rule. */
  const publicRestPoint = () => { const pt = hostRestDeps()?.restAct?.()?.point; return !!pt && pt.where !== 'bedroll'; };
  setNightListener((kind) => { if (shared.social && sharedClockOn()) { shared._partyRestJustStartedAt = nightStamp(shared.social.now(), kind ?? undefined); shared._partyComposedAt = -Infinity; } });
  // CAMP-ROLL (2026-10-04, the player: "In a party, or with other players. Every player spawns their own enemies when
  // resting"; then "Do it"): ONE ROLL A CAMP - systems/party/partyRestLaw.js's own note says the whole of it. This is the
  // host's half: the rest windows (both skins) open the camp when an act's channel opens on a night (my stamp takes the
  // open mark, sent at once), ask it at the channel's end and through the wait (restAct.js campNightStep), settle it at
  // the end (an open mark with no night heard becomes `done`) and close it with the window (createRestDeps setResting).
  // A camp mate is a present member here within the party's 15 m (nearAccount, the night's own reach), not resting
  // alone. The outdoor host and the dungeon's carry it (createRestDeps `camp`); a building rolls nothing (encounters.js:
  // inside and no dungeon), so worldModes' interior bag carries none; the ?exterior dev host has no party.
  const _campWatch = createCampWatch({ kindOf: nightKindOf, campOf: campMarkOf });
  const campStampNow = (which) => { shared._partyRestJustStartedAt = campStamp(shared.social.now(), which); shared._partyComposedAt = -Infinity; };
  const campRest = {
    open: (night) => {
      if (!night || !shared.social?.party || !sharedClockOn() || !restTogether()) { _campWatch.close(); return; }
      _campWatch.open(shared.social.others(), shared.social.now());
      campStampNow('open');
    },
    verdict: () => (shared.social?.party && sharedClockOn() ? _campWatch.verdict({
      me: shared.social.acct, members: shared.social.others(), now: shared.social.now(),
      inCamp: (m) => memberPresent(m) && nearAccount(m.acct, m.p),
    }) : null),
    settle: () => { if (shared.social && campMarkOf(shared._partyRestJustStartedAt) === 'open') campStampNow('done'); },
    close: () => { campRest.settle(); _campWatch.close(); },
  };
  /** CAMP-ROLL: the feet of the camp mates beside me - the band an ambush I roll at rest keeps from each of them. */
  const campFeet = () => (playerEntity.isResting ? partyNear().filter((m) => { const row = shared.social?.others().find((o) => o.acct === m.acct); return !!row && !restsAlone(row) && nearAccount(m.acct, row.p); }).map((m) => m.feet) : []);
  const partyRestHere = () => !sharedClockOn() && !!shared.social?.party && !shared.modes?.insidePartyRestExempt && restTogether();   // REST-OPT: resting alone is a rest of my own
  const partyRestGate = () => {
    if (!shared.social?.party) return null;
    if (!restTogether()) return null;   // REST-OPT: I (or the leader) rest alone - my rest is my own, as in a tavern
    if (sharedClockOn()) return null;
    // ONLINE-REST1 (2026-09-21, per-request: "what we are working with here is online mode only. the
    // partyrest feature should not be used in classic and offline enhanced"): the whole consensus/mirror
    // mechanic is an ONLINE-only feature - `social?.party` above already excludes offline (both skins: `social`
    // is only ever built by socialStart, which never runs without a connected online account).
    // OVH4 (2026-09-24, Mac chose "A": "How do we make it where it's not solo rest for other UI's") RETIRES ITS
    // CLASSIC ARM: this gate answered null on the classic skin because classic's RestWindow carried none of the
    // party's arms, so a classic player in a party rested alone. Since OVH3 the online panels mount on either skin,
    // and a party's rest is one of them - ui/restDoor.js opens the party card for it on either skin (partyRestHere
    // below), so every member votes, mirrors and wakes together whichever UI they wear.
    // TAVERN-REST1/GUILD-REST1 (2026-09-21, per-request: "we stripped the tavern partyresting mechanic out
    // same needs to be done for temples and guilds since its not needed in there every member can rest there
    // as they want"): a tavern's rented rooms, a guild hall's own beds, and a temple's own beds are all slept
    // in individually - unlike a dungeon or the open road there is no single shared camp the whole party
    // either agrees to or is interrupted together, so the whole consensus/mirror mechanic below simply does
    // not apply inside any of the three: no vote, no gather-the-party or not-near-the-leader refusal, and
    // (partyRestFollowTick, further down) no mirroring - every member rests for themselves, on their own.
    if (shared.modes?.insidePartyRestExempt) return null;
    // PARTY-REST12 (2026-09-22, per-request: "the R button is the rest button and when the party stands near
    // each other it should be mentioned how many players are ready to rest when pressed R and you should get
    // a popup for yourself that youre you agreed to rest. Should be easier than typing in the chat the whole
    // time"): pressing Rest IS the vote - it was already treated that way for what the CHECK below asks of
    // everyone ELSE (their own `ready`, set the same way on their end), but never actually set MY OWN flag,
    // so a party mate waiting on ME saw me as still not ready even after I had already tried to rest myself.
    // One-way: this never CLEARS the flag - only `/ready`'s own toggle (chatPanel's onSend) can un-ready
    // someone, so mashing Rest while waiting on a straggler can never accidentally cancel my own vote.
    //
    // PARTY-REST20 (2026-09-22, per-request: confirmed by direct testing - "in the chat as soon as the
    // initiator pressed r its 1/2 again... this can cause both sides being stuck in ongoing vote" - the bug
    // this closes): this line used to set ONLY `_partyRestReady`, never `_partyRestReadyAt` alongside it the
    // way `/ready`'s own toggle (chatPanel's onSend, above) always does. `_partyRestReadyAt` starts at 0 and
    // is the clock PARTY_READY_TIMEOUT_MS is measured against (partyRestFollowTick's own expiry check, which
    // already runs unconditionally, every frame) - so unless the page happened to be under 90 seconds old,
    // that check saw a 90-SECOND-STALE timestamp on the very next frame and expired the flag right back to
    // false, regardless of how recently Rest had actually been pressed. A player relying purely on pressing
    // Rest (never once typing /ready) would flicker ready -> not-ready one frame later, forever - visible as
    // the tally dropping back down in chat and the vote never able to complete.
    const nearHere = nearRestMembers();   // REST-OPT: a member resting alone is no voter and nobody to gather
    const iAmLeader = shared.social.leads();
    // PARTY-REST23/24/25 (2026-09-22, per-request: confirmed by direct testing - "when 2 party members are in
    // 15m range they both can start resting without the 3rd partymember you shouldnt be able to vote when not
    // all members are nearby", then "wrong the whole party must be" (correcting an earlier "at least one"
    // wording), then "please check now its even more broken than before" (a regression this same fix
    // introduced) - all closed together here): the ORIGINAL leader-alone check only ever confirmed SOMEONE was
    // near, never THE WHOLE PARTY - with 3+ members it was entirely possible for 2 to gather, vote, and rest
    // while a 3rd was off elsewhere, never asked. Counting online members only (not the raw party roster) is
    // the fix for the regression that first version had: this codebase's own server (server/src/index.js,
    // PARTY_OFFLINE_MS) keeps a disconnected member's seat for a grace period before removing them - an
    // offline member can never, ever be "near", so counting the WHOLE roster made this permanently
    // impossible to satisfy the moment one stale entry existed. `m.p` existing at all is the same "are they
    // actually here right now" distinction `nearAccount` itself already relies on, one call up.
    const onlineOtherCount = shared.social.others().filter((m) => memberPresent(m) && !restsAlone(m)).length;   // AUDIT PARTY-REST: the hub's `online: false` outranks a pose it carried over
    if (iAmLeader) {
      if (nearHere.length < onlineOtherCount) return 'You must gather the party before you can rest.';   // never touches the cooldown clock at all
    } else if (!nearHere.some((m) => m.acct === shared.social.party.leader)) {
      return 'You are not near the leader.';   // never touches the cooldown clock at all
    } else if (nearRestMembers(feetOfPartyAccount(shared.social.party.leader) ?? player.feetAt()).length < onlineOtherCount) {
      // AUDIT PARTY8 (2026-09-23): a follower asks "is everyone gathered" AROUND THE LEADER, not around themselves.
      // Measured from the follower's own feet, eight people within 15 m of the leader can stand 28 m apart, so a
      // member on the edge of a gathered party was told to gather it - and each client's tally counted a
      // different group. One reference point, the leader's, is what the leader's own arm above already measures.
      return 'You must gather the party before you can rest.';   // never touches the cooldown clock at all
    }
    // PARTY-REST26 (2026-09-22, per-request: confirmed by direct testing, repeated several times for emphasis
    // - "When a member in the party presses R it should NEVER initiate a rest or start a vote! never make it
    // 1/2 ... only the leader can start the Resting vote and then a member has to press R and then the leader
    // has to press r" - the bug this closes): PARTY-REST25 already stopped a member's press from ever
    // SUCCEEDING, but it still marked them ready and showed a tally on ITS OWN, even with no round active at
    // all - a member's press was starting the whole thing by itself, exactly what was never wanted. Checked
    // BEFORE `_partyRestReady` is ever touched, so a blocked member's press truly has NO effect of any kind -
    // no ready flag, no tally, nothing - until the leader's OWN press has already started a round (read the
    // same way the cooldown further down already does: the most recent of mine and every near member's own
    // broadcast `voteAt`, so every machine agrees on whether a round is active). The leader's own press is
    // never blocked here (`!iAmLeader` is false for them), round active or not - it either continues an
    // existing one or IS the one that starts it.
    const roundActive = partyRoundActive(nearHere);
    if (!iAmLeader && !roundActive) return 'Only the leader can start a resting vote.';
    // PARTY-REST12 (2026-09-22, per-request: "the R button is the rest button and when the party stands near
    // each other it should be mentioned how many players are ready to rest when pressed R and you should get
    // a popup for yourself that youre you agreed to rest. Should be easier than typing in the chat the whole
    // time"): pressing Rest IS the vote - it was already treated that way for what the CHECK below asks of
    // everyone ELSE (their own `ready`, set the same way on their end), but never actually set MY OWN flag,
    // so a party mate waiting on ME saw me as still not ready even after I had already tried to rest myself.
    // One-way: this never CLEARS the flag - only `/ready`'s own toggle (chatPanel's onSend) can un-ready
    // someone, so mashing Rest while waiting on a straggler can never accidentally cancel my own vote.
    //
    // PARTY-REST20 (2026-09-22, per-request: confirmed by direct testing - "in the chat as soon as the
    // initiator pressed r its 1/2 again... this can cause both sides being stuck in ongoing vote" - the bug
    // this closes): this line used to set ONLY `_partyRestReady`, never `_partyRestReadyAt` alongside it the
    // way `/ready`'s own toggle (chatPanel's onSend, above) always does. `_partyRestReadyAt` starts at 0 and
    // is the clock PARTY_READY_TIMEOUT_MS is measured against (partyRestFollowTick's own expiry check, which
    // already runs unconditionally, every frame) - so unless the page happened to be under 60 seconds old,
    // that check saw a STALE timestamp on the very next frame and expired the flag right back to false,
    // regardless of how recently Rest had actually been pressed. A player relying purely on pressing Rest
    // (never once typing /ready) would flicker ready -> not-ready one frame later, forever - visible as the
    // tally dropping back down in chat and the vote never able to complete.
    // PARTY-REST21 (2026-09-22, per-request: confirmed by direct testing - "the non initiator presses r
    // again when all ready he starts a new vote... just put a cooldown on being able to start a new rest" -
    // the bug this closes): a SEPARATE cooldown from the vote-in-progress one further down - this one is
    // about not starting a brand new rest attempt moments after finishing one, not about waiting out an
    // ongoing round. Checked against mine and every near member's own broadcast `restStartedAt` (the same
    // "read the most recent of everyone's own copy" law voteAt/groupVoteAt already use), so it fires
    // regardless of whose rest actually just happened - never touches _partyRestGateRefusedAt/voteAt at all,
    // so it can never itself be mistaken for "a vote is in progress" by the check further down.
    const lastStartedAt = latestStamp(nearHere, 'restStartedAt', shared._partyRestJustStartedAt, shared.social.now());
    // PARTY-REST30 (2026-09-23, per-request: "when you start resting again shortly after a short rest it says a rest
    // already happened but shows 1/2 for all"): THE COOLDOWN IS ASKED BEFORE THE PRESS MARKS ME READY - a press this
    // refuses leaves no vote behind, or my `ready` went out on the next pose and every mate's tally read 1/2 for a
    // round nobody started. PARTY-REST29: the cooldown reads cooldownStamp - an unrested grant cools nothing down.
    if (shared.social.now() - cooldownStamp(nearHere, _partyRestStartWaived ? -Infinity : shared._partyRestJustStartedAt, shared.social.now()) < PARTY_REST_START_COOLDOWN_MS) return 'A rest just happened. Wait a moment before starting another.';
    shared._partyRestReady = true;
    shared._partyRestReadyAt = shared.social.now();   // AUDIT PARTY-REST: the shared clock - `readyAt` on the wire
    const notReady = nearHere.filter((m) => !voteStands(m.p, shared.social.now(), lastStartedAt));   // AUDIT PARTY-REST: a vote counts while it is fresh and cast after the last rest here
    // PARTY-REST11/12: the tally as the WHOLE gathered group would read it - `nearHere` is everyone ELSE
    // standing here (social.others(), filtered), so I am added back in on both sides: to the total, and to
    // the ready count too, now that pressing Rest (above) always marks me ready by the time either is read.
    const totalCount = nearHere.length + 1;
    const readyCount = (nearHere.length - notReady.length) + (shared._partyRestReady ? 1 : 0);
    // PARTY-REST25 (2026-09-22, per-request: "Anyone in the party can press R, not just the leader: Change
    // this to leader only so it isnt confusing anymore" - the simplification this closes): a member's own
    // press still marks THEM ready (PARTY-REST12's own convenience feature, unchanged - easier than typing
    // /ready) and still counts toward the tally below, but can never itself open a real rest window, even
    // once everyone happens to be ready - only the LEADER'S press can. This retires PARTY-REST18's entire
    // "who owns this specific round" tracking (voteBy/_partyRestVoteInitiator/computeVoteOwner) - it existed
    // ONLY to answer "whose press gets to succeed", which is now always a plain, direct question
    // (`social.leads()`) instead of a broadcast one, with no ambiguity left to track at all.
    if (!notReady.length) {
      if (!iAmLeader) return 'Everyone is ready. The leader must press Rest to start.';
      return null;
    }
    // PARTY-REST17 (2026-09-22, per-request: "the popup still says the names of the members that shouldnt
    // be" - the bug this closes): Update 14 dropped names from the CHAT broadcast per the same instruction,
    // but this popup line is a separate string (`refusePartyRest`/`chatNotice` both just display whatever
    // this returns) that still had "Waiting on ${names}" baked in from before that instruction existed - the
    // one spot I missed. Generic now, matching everywhere else this rule already applies.
    const line = `You are ready to rest (${readyCount}/${totalCount} ready). Everyone can /ready or press Rest.`;
    if (partyRoundActive(nearHere)) return 'Resting vote ongoing.';
    shared._partyRestGateRefusedAt = shared.social.now();
    // PARTY-REST16 (2026-09-22, per-request: "when the players move more then 15m away where the vote
    // started it should cancel the rest vote"): stamped only on a FRESH vote round (this line, not a retry
    // within an existing one) - `_partyRestVoteTrackTick` (below) watches this against my own current
    // position every second and cancels the cooldown the moment I've wandered more than PARTY_REST_RADIUS
    // meters from here, the same "near enough to rest together" distance already used everywhere else in
    // this mechanic.
    shared._partyRestVoteOrigin = player.feetAt();
    return refusePartyRest(line);
  };
  // PARTY-REST2c (2026-09-20, per-request: "a pop up should appear" AND "the
  // message of the vote should be visible in the chat"): BOTH, every refusal,
  // from the one place - all three hosts route their own toggleRest through
  // this same partyRestGate closure (world.js calls it directly;
  // worldModes.js's/dungeonContext.js's own copies are just
  // `() => partyRestGate()` over this one), so the chat push reaches a
  // refused Rest key indoors and underground exactly the same as outdoors,
  // with no separate wiring needed in either host. The pop-up itself is each
  // host's own job still - this only returns the line for whichever
  // `ActionTextBox` the caller already shows on a non-null return.
  const refusePartyRest = (line) => { shared.chatNotice(line); return line; };
  // PARTY-REST28 (2026-09-22, per-request: confirmed by direct testing, in a DUNGEON specifically - "when we
  // finished resting... it shows 1/2 ready to rest again that shouldnt happen" - the bug this closes): the
  // "spent the moment it is acted on" reset (PARTY-REST2) lived ONLY inside world.js's own outdoor toggleRest,
  // never in a shared place all three hosts could reach - worldModes.js's interior and dungeonContext.js's
  // dungeon each call this SAME partyRestGate for their own vote check (`host.partyRestGate`/
  // `opts.partyRestGate`), but neither one ever reset anything afterward, since `_partyRestReady` and its
  // siblings are private to THIS closure and were never exposed for them to touch. A rest granted indoors or
  // underground left the granting player's own ready flag (and the group's cooldown/start-timer state) stuck
  // exactly as it was the moment they voted - forever, until the 60-second timeout eventually caught up - so
  // simply walking apart and back together within that window replayed the old tally as if it were new.
  // Extracted here so all three hosts share the identical reset (forwarded the same way onEnemyBreak/
  // canceledByFollower already are), rather than three copies that can drift out of sync with each other again.
  const markPartyRestSpent = () => {
    // AUDIT PARTY-REST's classic-skin exclusion here (a classic rest never ran the gate, so its `restStartedAt` held
    // every enhanced mate at "A rest just happened") is gone with ONLINE-REST1's classic arm (OVH4): every skin's
    // granted rest ran the gate now.
    // REST-OFFLINE1 (Discord, 2026-09-22, a crash report: "TypeError: Cannot
    // read properties of null (reading 'now') at markPartyRestSpent <-
    // toggleRest <- travel"): OFFLINE THERE IS NO PARTY AND NO SOCIAL
    // CLOCK. `social` is built by socialStart alone, which never runs
    // without a connected online account, and partyRestGate answers null
    // on `!social?.party` for the same reason - but this reset, called on
    // every granted rest (the outdoor R, the interior and dungeon rests,
    // the travel window's "rest until" arm), read `social.now()`
    // unconditionally and threw the whole rest away with the frame. Every
    // field it resets is party state; with no party there is nothing to
    // spend.
    if (!shared.social) return;
    shared._partyRestReady = false;   // PARTY-REST2: spent the moment it is acted on - next nap asks again
    // PARTY-REST2f (2026-09-20, per-request: "it also seems it cant initiate a new rest it tell me vote is
    // still ongoing" - the bug this closed): a genuinely RESOLVED vote - this one, right now, succeeding -
    // must not go on shadowing the NEXT one. Without this, a second rest attempted within
    // PARTY_REST_VOTE_COOLDOWN_MS of the FIRST vote's own refusal (easily done - a short "Rest for a While"
    // can finish in well under a minute) read the stale `_partyRestGateRefusedAt`/broadcast `voteAt` from a
    // question that had already been answered, and reported "Resting vote ongoing" for a situation with no
    // vote going on at all.
    shared._partyRestGateRefusedAt = -Infinity;
    // PARTY-REST21 (2026-09-22, per-request: confirmed by direct testing - "1/2 pops up again in the chat"
    // the instant this succeeds, and separately "the non initiator presses r again when all ready he starts a
    // new vote... just put a cooldown on being able to start a new rest" - the bug this closes): the moment
    // this succeeds, MY OWN ready/voteAt reset immediately (the two lines above), but this window
    // still has to show its OWN mode-selection screen before a real session (and thus this player's
    // broadcast `rest` field) exists at all - a real gap, however brief, where I look "not ready" to
    // everyone's tracker and am not yet mirrorable by anyone either. `restStartedAt`, stamped here and at the
    // mirror-start site below, closes BOTH holes at once: `partyRestGate` refuses a brand new vote attempt
    // outright while it's recent (a real, requested cooldown - not the vote-in-progress one above, which is
    // about waiting for THIS SAME round; this one is about not starting a DIFFERENT one moments after
    // finishing), and the chat tracker (`_partyRestVoteTrackTick`) skips announcing anything at all while it
    // is recent, rather than mistaking my own momentary "not ready" for a fresh partial vote.
    if (!sharedClockOn()) shared._partyRestJustStartedAt = shared.social.now();
    _partyRestStartWaived = false;   // PARTY-REST29: a fresh grant cools down again
    shared._cancelSeen = snapshotCancels(shared.social.others());   // AUDIT PARTY-REST: a request already in flight is not aimed at this rest
    _restAloneNight = !restTogether();   // REST-OPT (AUDIT C3): a night granted as my own stays my own - a leader who turns the switch back on mid-night pulls nobody into it
  };
  /** PARTY-REST29: the rest window closed with no rest chosen - the vote that opened it granted nothing that
   *  needs cooling down from, so my just-started stamp (PARTY-REST21) no longer holds the START COOLDOWN
   *  (cooldownStamp) and I can open a new vote at once. The stamp stays broadcast, and stays the line every vote is
   *  judged against (voteStands): the round it spent is spent, so the new one is voted afresh. */
  const cancelPartyRestStart = () => { if (!shared.social) return; _partyRestStartWaived = true; };
  const PARTY_REST_VOTE_COOLDOWN_MS = 60_000;   // PARTY-REST2d: "put a cooldown of 1 minute on it"
  // PARTY-REST21 (2026-09-22, per-request: "just put a coooooldown on being able to start a new rest"):
  // separate from the vote-in-progress cooldown above (which is about waiting out THIS round) - this one is
  // about not starting a DIFFERENT rest moments after finishing one, closing the exact race window a
  // rest-window's own mode-selection screen leaves open (this player's `ready`/`rest` broadcast fields both
  // go quiet for the brief moment between the vote succeeding and a mode actually being chosen). Short enough
  // not to feel restrictive for a genuinely new, later rest; long enough to comfortably outlast that gap.
  const PARTY_REST_START_COOLDOWN_MS = 10_000;
  /** STRANGER-REST1 (2026-09-20, per-request: "other players that are not in a party together can rest near each
   *  other that should have a 100 meter block range means players not in a party together cant rest near each
   *  other in a 100m radius"; then, per-request: "stranger resting near each other should still work in taverns
   *  its okay to rest there and 30 meter radius in dungeons"): null unless a rendered, visible online peer
   *  (peersNear() - the SAME list the remote-player panel and CAMP-REST's own group-roll guard already read) is
   *  within radius AND is not a fellow member of MY OWN party (social?.isPartyPeer - a peer with no party of
   *  mine at all, or in a DIFFERENT party, both count as a stranger here). Unlike partyRestGate, this asks
   *  nothing about parties being ready or gathered - it fires for a solo, partyless player exactly as it does
   *  for someone mid party-vote, since the question is only ever "is a stranger standing close enough to rest
   *  beside." A peer that is not even rendered right now (out of stream range) cannot be a stranger this check
   *  can see, the same law nearAccount already answers false for at distance.
   *
   *  THE RADIUS IS PER-SUBMODE, not one number everywhere: indoors (a tavern room, a shop, a guild hall) the
   *  check does not run at all - walls already separate one room's strangers from another's, and a packed tavern
   *  with travelers renting rooms down the hall is the ordinary case, not something to block. A dungeon's own
   *  corridors are far tighter than the open road, so its radius is smaller than the outdoors one. Read fresh off
   *  `modes?.mode` each call, exactly like myPartyLocation's own submode read just above - never cached, since a
   *  door crossed mid-session changes which radius (or none) applies without this function's own state to carry
   *  the stale answer forward. */
  const STRANGER_REST_BLOCK_RADIUS = 50;   // STRANGER-REST2 (2026-09-23, per-request: "set the stranger rest near each other range limitation from 100m to 50m") - outdoors; the dungeon's 30 below and the unchecked interiors are unchanged
  const STRANGER_REST_BLOCK_RADIUS_DUNGEON = 30;
  /** REST-OPT (AUDIT C2): whether the party mate behind a peer id rests a night that is not mine (systems/party/partyRestLaw.js
   *  restsApart) - a camp of its own, a stranger's to this gate. */
  const otherPartyCamp = (peerId) => restsApart(shared.social?.others().find((o) => o.peers?.includes(peerId)) ?? null, restTogether());
  const strangerRestGate = () => {
    const mode = shared.modes?.mode ?? 'exterior';
    if (mode === 'interior') return null;   // taverns, shops, guild halls - walls already do this job
    if (sharedClockOn() && publicRestPoint()) return null;   // REST5 (OPEN 15): a rest point is public - a stranger never blocks a rest at a fire or a bed; a Bedroll keeps the rule
    const radius = mode === 'dungeon' ? STRANGER_REST_BLOCK_RADIUS_DUNGEON : STRANGER_REST_BLOCK_RADIUS;
    const near = shared.peersNear();
    if (!near?.length) return null;
    const mine = player.feetAt();
    for (const p of near) {
      if (!p?.id || p.id === shared.online?.id || !p.feet) continue;
      // a fellow member of MY OWN party - never a stranger, unless our two nights are not one (REST-OPT, AUDIT C2)
      const camp = shared.social?.isPartyPeer(p.id) ? otherPartyCamp(p.id) : true;
      if (!camp) continue;
      const dx = p.feet[0] - mine[0], dy = p.feet[1] - mine[1], dz = p.feet[2] - mine[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= radius) {
        return shared.social?.isPartyPeer(p.id) ? REST_APART_TEXT : 'Other players are too close to rest here.';
      }
    }
    return null;
  };
  /** PARTY-REST1 (2026-09-20, per-request: "when the party leader rests everyone in the party gets the resting
   *  screen counting down... only the leader should spawn mobs"; then, PARTY-REST1c per-request: "when the member
   *  initializes the resting when everyone is ready he only rests for himself and not the others as well" - the
   *  bug this closed): started the moment ANY near party member's broadcast pose carries a `rest` - not only the
   *  leader's. `iAmLeader`/`social.leads()` gates PARTY-REST2's own consensus check (who has to be asked before a
   *  rest may begin), never who is allowed to be mirrored or to mirror; a REAL rest, once granted by that gate,
   *  belongs to whoever is actually resting, leader or not, and every OTHER near member - the formal leader
   *  included, if they are simply standing there rather than resting themselves - mirrors it the same way. Two
   *  members resting for real in the same place at once cannot happen (PARTY-REST2's gate is the only door either
   *  one opens through, and only one real rest at a time can ever be granted there), so "the one near member whose
   *  pose carries a `rest`" always names exactly one person, never a choice among several.
   *
   *  Started the moment I am standing in the SAME place they are - composePartyPose's own `px`,`py`,`in`, and
   *  `bk` when indoors, so two shops sharing one town pixel are not "the same place" to this check either, exactly
   *  as net/wire.js's own doc comment on `bk` says. Once started, it is MY OWN rest from there (PARTY-REST1b,
   *  per-request: "when the rest is running and one member cancels it, it gets canceled for the whole party" -
   *  the bug this closed): only walking out of range myself, or my own Stop, ends it early - the person I am
   *  mirroring waking, being interrupted, or cancelling their own no longer reaches an already-started mirror at
   *  all; `win._mirrorAcct` remembers WHO I started mirroring so the continuing check keeps asking about them
   *  specifically, not "is anyone at all nearby still resting" (which could silently hand me off to a second
   *  person's rest mid-nap if one happened to start right as the first one ended). Never touches a screen that is
   *  already busy (my own window up, or I am already really resting myself). */
  let _partyRestVoteTrackAt = 0;   // PARTY-REST15: throttle, so this cheap check runs at most once a second, not every frame
  let _partyRestVoteLastReady = null;   // PARTY-REST15: null = not currently tracking a vote (nobody near is ready yet, or it just resolved)
  // PARTY-REST15 (2026-09-22, per-request: confirmed by direct testing - "when i press r it starts the vote
  // okay, but my play char speak it out the 1/2 ready stuff etc" - the bug this closes): Updates 11-14's
  // `broadcastPartyRestVote` used `link.sendChat`, which is indistinguishable on the wire from a player typing
  // that line themselves - so it got the SAME treatment a real chat line gets, including `ui/nameLayer.js`'s
  // own BUBBLE1 feature drawing it as a speech bubble over the sender's own character. That was never the
  // intent; an automated tally has no business being "said" by anyone's avatar. `chatNotice` (used elsewhere
  // in this file, unchanged) pushes a LOCAL-only, `system: true` line - and `nameLayer.js`'s own doc comment
  // is explicit that system notices draw no bubble at all - so switching to it removes the bubble entirely,
  // as a side effect of removing the network send that caused it, not a separate bubble-specific fix.
  // The one thing a purely local push loses is reaching OTHER near members' own chat logs - fixed by having
  // every near member's OWN client independently watch the SAME shared pose data (nearHere/ready, already
  // broadcast for the vote gate itself) and push its OWN local notice the moment ITS OWN read of the tally
  // changes - no leader restriction needed anymore (that restriction existed ONLY to avoid four clients each
  // sending the same network message; a purely local push per client can never collide with another client's
  // own local push, since neither ever leaves its own machine), and no more silently baselining the first
  // transition either (that also existed only to avoid a DUPLICATE network broadcast of what partyRestGate's
  // own broadcast already sent; with partyRestGate no longer broadcasting anything itself, this tracker is
  // now the ONE place the tally ever reaches chat at all, so it has to announce every transition, the first
  // included, or nobody but the presser would ever see "someone wants to rest" show up.
  const _partyRestVoteTrackTick = () => {
    if (!shared.social?.party || shared.modes?.insidePartyRestExempt || !restTogether() || sharedClockOn()) { _partyRestVoteLastReady = null; shared._partyRestVoteOrigin = null; return; }   // REST-OPT: resting alone, the tally is not mine   // AUDIT REST-PARTY: online there is no vote to count (REST5)
    const now = performance.now();
    if (now - _partyRestVoteTrackAt < 1000) return;
    _partyRestVoteTrackAt = now;
    // PARTY-REST16 (2026-09-22, per-request: "when the players move more then 15m away where the vote
    // started it should cancel the rest vote. Vote canceled must be in the chat not as bubble ofc"): checked
    // BEFORE the "nobody near" early return below, since walking far enough apart to trigger this is
    // usually exactly what ALSO makes nearHere come up empty a moment later - the cancel must not depend on
    // still being near anyone. Cancels only MY OWN contribution to the shared cooldown (`_partyRestGateRefusedAt`
    // is per-client; the "group" cooldown other clients see is the MAX across everyone's own broadcast
    // `voteAt`) - if everyone who mattered to the vote walked away together, as this feature assumes, each of
    // their own clients reaches this same conclusion independently and the shared cooldown clears itself.
    if (shared._partyRestVoteOrigin && shared.social.now() - shared._partyRestGateRefusedAt < PARTY_REST_VOTE_COOLDOWN_MS) {
      const mine = player.feetAt();
      const dx = mine[0] - shared._partyRestVoteOrigin[0], dy = mine[1] - shared._partyRestVoteOrigin[1], dz = mine[2] - shared._partyRestVoteOrigin[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) > PARTY_REST_RADIUS) {
        shared._partyRestGateRefusedAt = -Infinity;
        shared._partyRestVoteOrigin = null;
        _partyRestVoteLastReady = null;
        // PARTY-REST31 (2026-09-23, per-request: "when the leader starts a rest moves away cancels it but goes near his
        // members again it says 1/2 waiting for party"): a canceled vote takes MY vote with it - the flag used to stay
        // up for its full PARTY_READY_TIMEOUT_MS, so walking back counted it again as a round nobody had started.
        shared._partyRestReady = false;
        shared.chatNotice('The rest is called off. Someone moved too far from where it began.');
      }
    }
    const nearHere = nearRestMembers();
    if (!nearHere.length) { _partyRestVoteLastReady = null; return; }   // nobody near - nothing to track, reset for next time
    // PARTY-REST21 (2026-09-22, per-request: confirmed by direct testing - "1/2 pops up again in the chat"
    // the instant the initiator's vote succeeds - the bug this closes): a rest's own mode-selection screen
    // resets that player's `ready`/(soon) `rest` broadcast fields before a real session exists to read back -
    // a real, if brief, gap where they look "not ready" to this exact computation, even though the rest they
    // asked for is already under way. Same cooldown and same "read the most recent of everyone's own copy"
    // reduce as partyRestGate's own check, so the two can never disagree about whether a rest just started.
    const lastStartedAt = latestStamp(nearHere, 'restStartedAt', shared._partyRestJustStartedAt, shared.social.now());
    if (shared.social.now() - cooldownStamp(nearHere, _partyRestStartWaived ? -Infinity : shared._partyRestJustStartedAt, shared.social.now()) < PARTY_REST_START_COOLDOWN_MS) { _partyRestVoteLastReady = null; return; }   // PARTY-REST29: the gate's own cooldown
    const notReady = nearHere.filter((m) => !voteStands(m.p, shared.social.now(), lastStartedAt));   // AUDIT PARTY-REST: a vote counts while it is fresh and cast after the last rest here
    const totalCount = nearHere.length + 1;
    const readyCount = (nearHere.length - notReady.length) + (shared._partyRestReady ? 1 : 0);
    if (readyCount === 0) { _partyRestVoteLastReady = null; return; }   // no vote in progress - the next 1/X is a fresh start, not a "change"
    if (readyCount >= totalCount) {
      // PARTY-REST25/27 (2026-09-22, per-request: "when it goes full like 3/3 it should say to the members
      // in the chat that the leader can now Start the Rest"): everyone just became ready - since only the
      // LEADER'S press can ever actually open a real rest window now (see partyRestGate's own doc comment for
      // the simplification this is part of), the leader gets told directly to press Rest, and every OTHER
      // near member gets a separate, correctly-worded notice of their own - "the leader can" rather than
      // "press Rest", since pressing it would do nothing for them. Only on the actual partial-to-full
      // transition (`_partyRestVoteLastReady !== null` means I was still tracking a partial tally a moment
      // ago), so this fires once each, not every second for as long as everyone stays ready.
      if (_partyRestVoteLastReady !== null) {
        if (shared.social.leads()) shared.chatNotice('Everyone is ready to rest. Press Rest to start!');
        else shared.chatNotice('Everyone is ready to rest. The leader can start it now.');
      }
      _partyRestVoteLastReady = null;
      return;
    }
    if (readyCount !== _partyRestVoteLastReady) {
      _partyRestVoteLastReady = readyCount;
      // PARTY-REST30 (2026-09-23, per-request: "it should also tell the members that the leader starts a rest press R
      // to be ready or something like that not just 1/2 press r to ready"): the line says what is happening to ME -
      // a member not yet ready is asked by the leader, a member already ready and the leader just see the count.
      // No names (PARTY-REST17's rule for the chat): "the leader" is always enough.
      const iLead = shared.social.leads();
      if (!iLead && !shared._partyRestReady) shared.chatNotice(`The leader wants to rest. Press R to be ready! (${readyCount}/${totalCount} ready)`);
      else shared.chatNotice(`${readyCount}/${totalCount} ready to rest.${iLead ? ' Waiting for the party.' : ''}`);
    }
  };
  /** PARTY-REST-FAR1 (2026-09-22, Mac: "Notification when youre not near the party leader for resting"; carried
   *  as PARTY-REST4 until the party-rest drop's own PARTY-REST4 - the rest KIND - arrived, and renamed for it):
   *  THE WORD A MEMBER GETS WHEN A PARTY MATE RESTS WITHOUT THEM. The mirror (partyRestFollowTick) opens only
   *  for a member who is NEAR the rester (nearAccount: the same place, and outdoors within PARTY_REST_RADIUS
   *  metres); everyone else saw nothing at all - the card said "resting" on the party HUD and the tavern was
   *  silent. Now the frame that finds a party mate resting and me not near enough says so ONCE on the HUD's own
   *  centred label (ui/midScreenText.js: the door every refusal takes, redirected into the dungeon's own sink
   *  underground), and the latch re-arms only when that rest has ENDED or I have come near (then the mirror opens
   *  instead) - so a member across town is told once per nap, never sixty times a second. Not while the HUD is
   *  down for a death (AUDIT DROPS D3), a loiter is said as one, and the label stays PARTY_REST_FAR_SECONDS. */
  const PARTY_REST_FAR_TEXT = (who, loitering = false) => `${who} is ${loitering ? 'loitering' : 'resting'}. Come within ${PARTY_REST_RADIUS} m of them to ${loitering ? 'wait' : 'rest'} with the party.`;
  const PARTY_REST_FAR_SECONDS = 4;   // AUDIT DROPS D3: the label's default 1.5 s is a refusal's; a notice about somebody else stays long enough to be read
  let _partyRestFarSaid = false;
  const partyRestFarNotice = (rest, near, row) => {
    if (!rest || near) { _partyRestFarSaid = false; return; }
    if (_partyRestFarSaid) return;
    _partyRestFarSaid = true;
    setMidScreenText(PARTY_REST_FAR_TEXT(row?.name || 'A party member', rest.mode === 0), PARTY_REST_FAR_SECONDS);
  };
  const partyRestFollowTick = () => {
    // PARTY-REST2b: the expiry check - see /ready's own doc comment above (chatPanel's onSend) for the bug this
    // closes. Placed here, unconditionally, because this function already runs every frame regardless of party
    // state - a vote must expire even for a tab that has since left the party, or the flag would still be sitting
    // there, stale, the moment they rejoin one.
    if (shared._partyRestReady && (!shared.social || shared.social.now() - shared._partyRestReadyAt > PARTY_READY_TIMEOUT_MS)) shared._partyRestReady = false;   // AUDIT PARTY-REST: the same clock the readers use
    // PARTY-REST29/31 (2026-09-23, the drop's per-requests: "it doesnt start a new vote now i always get the resting
    // window", "when a member leaves the 15m radius and goes in again after a canceled rest it also show 1/2"): a
    // MEMBER's vote belongs to the leader's round. The readers already refuse a vote cast before the leader's grant
    // (voteStands) - this clears it on MY side too, so my own tally agrees; and when the round the vote joined ENDS
    // (the leader walked out of it: voteAt back to null) or is REPLACED by a newer one, the vote goes with it. A vote
    // cast with no round open (a typed /ready) joins the next round the leader opens, as it always did.
    if (shared._partyRestReady && shared.social?.party && !shared.social.leads?.()) {
      const lead = shared.social.others().find((m) => m.acct === shared.social.party.leader);
      const now = shared.social.now();
      if (lead && stampOf(lead.p?.restStartedAt, now) > shared._partyRestReadyAt) shared._partyRestReady = false;
      const round = lead ? (stampOf(lead.p?.voteAt, now) || null) : null;
      if (shared._partyRestReady && lead) {
        if (_partyRestReadyRound === null) _partyRestReadyRound = round;
        else if (round !== _partyRestReadyRound) { shared._partyRestReady = false; _partyRestReadyRound = null; }
      }
    }
    if (!shared._partyRestReady) _partyRestReadyRound = null;
    // PARTY-REST13 (2026-09-22, per-request: "so it also shows 1/4 then 2/4 then 3/4 and then 4/4 Ready
    // yes?" - the gap this closes): `partyRestGate` itself only ever announces on a fresh PRESS, and only
    // once per 60-second cooldown - so once the first press started that cooldown, everyone else quietly
    // /ready-ing or pressing Rest in turn changed nothing anyone else could see until either the cooldown
    // expired or the vote finished outright. This tracks the ACTUAL ready count separately from vote
    // ATTEMPTS, so 2/4 and 3/4 each get their own announcement the moment they happen, not just 1/4 and 4/4.
    // PARTY-REST15: runs from EVERY near member's own client now, each pushing its own local notice - see
    // this function's own doc comment above for why that's safe (no leader restriction needed anymore).
    _partyRestVoteTrackTick();
    if (sharedClockOn()) return;   // online there is no mirror, no vote, and a member's night carries nobody
    const ov = townTalk.overlay;
    const mirroring = !!(ov?.isRestWindow && ov.isPartyRestMirror);
    if (mirroring && ov.state !== 'resting') return;   // already finishing on its own (the wake message shown, refused, ...) - townTalk's own drain closes it; leave it be
    if (!shared.social?.party) {
      if (mirroring) ov._end(ov.session.endEarly());   // the party broke up
      _partyRestFarSaid = false;   // PARTY-REST-FAR1: nobody to be far from
      return;
    }
    if (mirroring) {
      // PARTY-REST1b: only my OWN distance to the specific person I started mirroring, asked fresh off their
      // CURRENT pose (they may well have moved since) - never whether they are still resting at all.
      const mirrorRow = shared.social.party.members.find((m) => m.acct === ov._mirrorAcct);
      // PARTY-REST5: the ONE deliberate exception to PARTY-REST1b's own rule above ("the leader's rest state is
      // no longer consulted at all once a mirror is running") - an enemy interrupting the person I am mirroring
      // is not them merely waking, cancelling or being interrupted for unrelated reasons; it means something is
      // now nearby, in the same place we are both standing, and I should stop pretending to sleep through it too.
      // `restEnemyAt` only ever moves forward (see composePartyPose's own doc comment); comparing it against the
      // value I captured when THIS mirror started - not merely "did it change since last frame" - means a break
      // that happened moments before I started mirroring (and so was already reflected in the very first pose I
      // read) never fires again after the fact. My own `enemiesNearby` stays forced false the whole time (this
      // is a relay of the leader's break, never a second encounter roll of my own).
      const enemyAt = mirrorRow?.p?.restEnemyAt ?? null;
      if (enemyAt != null && enemyAt !== ov._mirrorEnemyAtStart) {
        ov._end({ textId: REST_TEXT.enemiesNearby, enemyBroke: true, died: false });
        return;
      }
      // PARTY-REST7 (2026-09-21, per-request: "stopping it with 1 member doesn't stop it for the other" -
      // the bug this closes): PARTY-REST1b deliberately stopped checking "is the person I'm mirroring still
      // resting" AT ALL - that fix was for a DIFFERENT bug (the formal LEADER's state wrongly ending every
      // OTHER follower's mirror too, even ones mirroring someone else entirely). It overcorrected: it removed
      // the check for the one account this mirror actually tracks, not just for "the leader" generically.
      // `mirrorRow?.p?.rest` now correctly reads null the instant the SPECIFIC person I am mirroring truly
      // stops resting - Stop, hours up, healed, or an enemy break (PARTY-REST6's own `state === 'resting'` fix
      // to worldModes.js/dungeonContext.js/this file's own restState sources is what makes this null promptly,
      // rather than staying live until they click their own OK) - so ending on it here is exactly as narrow as
      // PARTY-REST1b intended: keyed on `_mirrorAcct` specifically, never on "the leader" broadly, so the old
      // bug (one unrelated member's state ending a different mirror) cannot come back.
      if (!mirrorRow?.p?.rest) {
        ov._end(ov.session.endEarly());
        return;
      }
      if (!memberPresent(mirrorRow) || !nearAccount(ov._mirrorAcct, mirrorRow?.p)) {   // AUDIT PARTY-REST: a seat gone offline ends its mirror
        ov._end(ov.session.endEarly());
      }
      return;
    }
    // OVH4: a mirror opens on either skin - the party card (ui/restDoor.js); see partyRestGate's own doc comment.
    // TAVERN-REST1/GUILD-REST1: never start mirroring while I myself am standing in a tavern, temple or guild
    // hall - see partyRestGate's own doc comment. (Two members can only ever be "near" each other in the same
    // building at all, so my own insidePartyRestExempt is sufficient - the person I'd be mirroring is
    // necessarily in the same exempt building too.)
    if (shared.modes?.insidePartyRestExempt) return;
    // PARTY-REST-FAR1: a party mate resting where I cannot mirror them (an offline row's stale `rest` rests nobody -
    // AUDIT DROPS D3) - told once per nap, on the SAME `nearAccount` the mirror below reads
    const farRow = restTogether() ? (shared.social.others().find((m) => m.p?.rest && !restsAlone(m) && m.online !== false && !nearAccount(m.acct, m.p)) ?? null) : null;   // REST-OPT: a rest alone is no one's to join
    const dead = playerEntity.health <= 0 || !!shared.modes?.deathUp?.();
    if (!dead) partyRestFarNotice(farRow?.p?.rest ?? null, !farRow, farRow);
    // Never steal a screen that is doing something else, and never double up on a rest that is already real.
    if (townTalk.overlayActive || playerEntity.isResting || playerEntity.isLoitering || playerEntity.health <= 0) {
      return;
    }
    // PARTY-REST1c: ANY near member actually resting for real right now, not just the leader.
    if (!restTogether()) return;   // REST-OPT: I rest alone - never pulled into anyone's night
    const restingRow = nearRestMembers().find((m) => m.p.rest);   // REST-OPT: and a mate resting alone is nobody's to follow
    if (!restingRow) return;
    // AUDIT PARTY-REST (2026-09-23): ONE MIRROR PER NAP. Nothing here remembered which rest it had already
    // mirrored, so a mirror that ended before the rester's - the follower already at full health under "Rest
    // Until Healed" (its first tick says "You are healed"), a quest's prevent-rest message, a Stop the rester had
    // not honoured yet - was opened again on the next frame, and again after every OK, until the rester woke.
    const key = mirrorKey(restingRow);
    if (key && key === _partyRestMirrored) return;
    // ...AND ONLY WHERE I COULD REST MYSELF. The mirror ran none of the rest gate's own questions: a follower
    // swimming, levitating, fighting their own foe, an unfed vampire, or with a shop window open in the building
    // (`modes.overlayHeld` - townTalk's stack is not the interior's) was pulled into the nap regardless.
    if (mirrorRestRefused()) return;
    _partyRestMirrored = key;
    const win = createRestWindow(partyRestMirrorDeps(restingRow.p.rest.kind, restingRow.acct));
    win.isPartyRestMirror = true;
    win._mirrorAcct = restingRow.acct;
    // PARTY-REST5: the baseline `restEnemyAt` reads against from here on - see the doc comment where it's read.
    win._mirrorEnemyAtStart = restingRow.p.restEnemyAt ?? null;
    playerEntity._restCancelRequestFor = null; playerEntity._restCancelRequestAt = null;   // AUDIT PARTY-REST: a request aimed at the LAST rester does not ride into this nap
    townTalk.showOverlay(win);
    win._start(partyRestModeFromCode(restingRow.p.rest.mode), restingRow.p.rest.hoursRemaining);
    shared._partyRestReady = false;   // PARTY-REST2: spent the moment it is acted on - next nap asks again
    shared._partyRestGateRefusedAt = -Infinity;   // PARTY-REST2f: this round is resolved too, from this follower's own side
    shared._partyRestJustStartedAt = shared.social.now();   // PARTY-REST21: see toggleRest's own doc comment for what this closes
    _partyRestStartWaived = false;   // PARTY-REST29: a real (mirrored) rest cools down again
    _restAloneNight = false;   // REST-OPT (AUDIT C3): a followed night is the party's
  };
  // ── PARTY-TRAVEL (2026-09-25, Mac: "Implementing a prompt for online to travel to party leader and the option for
  // party members to ready up and travel together") ────────────────────────────────────────────────────────────
  // The session is systems/party/partyTravel.js over the law in systems/party/partyTravelLaw.js (whose header carries the design);
  // what is here is its seams, this host's own. ONLINE ONLY: every door in the session asks for a party first, and
  // `social` is built by socialStart alone. PARTY-REST's shape, mirrored: the leader's proposal rides the leader's own
  // party pose, a gathered member's answer rides theirs, "gathered" is the rest law's own near (nearPartyMembers), a
  // seat the hub marked offline is nobody here. The prompts are ui/yesNoBox.js's box - DFU's parchment on the classic
  // skin, the enhanced card on the other - in this host's overlay slot, only while it is free.
  /** PARTY-TRAVEL: a place's name for the party's lines - the location on the pixel, else what the pose called it. */
  const partyPlaceName = (to, fallback = '') => locationIndex.get(`${to.x},${to.y}`)?.name || fallback || 'the wilderness';

  /** PARTY-TRAVEL: the journey itself - the travel popup's own order (ui/travel/travelPopUp.js tick): the screen smashed to
   *  black, then fastTravelTo, whose arrival fades it back; a journey that did not go clears it. */
  const partyTravelJourney = (pick, opts, computed) => {
    if (pick?.besideAt && (wildTeleportRefused(pick.pixel ?? null) || (!pick.veil && veilRefused(pick.pixel ?? null)))) return Promise.resolve(false);   // AUDIT CAPTAIN'S SEA P6: nor to a leader across the Veil - VEIL-PARTY: but a member following her captain's crossing (veilParty.js `veil`)   // PVPDUNGEONS: no teleport to the leader into, out of or inside the zone (a party's own journey on the zone's roads is fastTravelTo's, under wildTravelGate)
    hudFade.smashHUDToBlack();
    return fastTravelTo(pick, opts, computed).then((went) => { if (!went) hudFade.clearFade(); return !!went; },
      (e) => { console.error('[party-travel] the journey failed:', e); hudFade.clearFade(); return false; });
  };

  const partyMarkers = () => (shared.social?.others() ?? [])
    .filter((m) => !!m.p)
    .map((m) => ({
      acct: m.acct, name: m.name, px: m.p.px, py: m.p.py, in: m.p.in ?? 0, loc: m.p.loc ?? '',
      online: !!m.online, leader: shared.social?.party?.leader === m.acct,
    }));
  /** SOC2: once a frame, while online - my party pose out while I sit in a party, composed at most twice a second
   *  (the link's own floor is PARTY_SEND_MS, and it sends only what changed); the relay's clock offset onto the
   *  picture, so "last online" reads on the relay's clock. */
  // TV8 (2026-09-28, Mac: "Leader drives"; systems/party/partyWalk.js): GROUP TRAVEL. A leader's Overworld journey with
  // members gathered is a WALK on the leader's pose (`tw`); a gathered member is asked, and on a yes walks the same
  // journey in their own Overworld; the leader's stop halts everyone, a member's own stop (`ts`) halts the leader.
  const walkNow = () => shared.social?.now?.() ?? Date.now();
  /** AUDIT OW3 P1: my journey is MOVING - the panel up AND an autopilot under it. The panel alone (`isTravelActive`)
   *  stays up over a journey another door stopped (a window over it, the Overworld brought down: interruptTravel nulls
   *  the autopilot and leaves the panel), and a party that read the panel walked on past a stop. */
  const walkJourneying = () => !!shared.travelOptions?.isTravelActive && !!shared.travelOptions.state?.autopilot;
  /** My live journey's destination `{ x, y, spot }` - the Overworld's route (a place's pixel, or a spot's), or the
   *  mod's own named journey - or null (none, a followed road, a spot's stopped route). */
  const walkDestLive = () => {
    const r = shared.travelOptions?.route;
    if (r?.summary?.pixel) return { x: r.summary.pixel.x, y: r.summary.pixel.y, spot: false };
    if (r?.point?.pixel) return { x: r.point.pixel.x, y: r.point.pixel.y, spot: true };
    const s = shared.travelOptions?.destinationName != null ? shared.travelOptions.state?.destinationSummary : null;
    return s?.pixel ? { x: s.pixel.x, y: s.pixel.y, spot: false } : null;
  };
  /** AUDIT OW3 P4/P6: danger - a foe near (the mod's own journey refusal, travelViewCanGo's) or a live duel. */
  const walkDanger = () => duelEnemyNear() || areEnemiesNearby(exteriorFoePool());
  /** AUDIT OW3 P4/P6: FREE to be asked, or to set out with the party: outdoors in the open world, alive, NO window up
   *  (a townTalk overlay, a pausing window, the held map, a pointer surface - the chat, the friends panel, the F-menu:
   *  the key router's own `windowUp`), and no danger. The question REPLACED whatever was open (townTalk.showOverlay
   *  disposes the occupant without its close callback: an inventory, a talk, a map lost mid-use); a set-out started a
   *  journey in a dungeon, under the death screen, mid-fight. Both now wait for this - and a member with Travel Options
   *  off, who has no journey to walk (the start threw on its null), is never asked. AUDIT OW4 P5: and no arrival in
   *  flight (worldMoveBusy - a fast travel, a Recall, a respawn, a load): a set-out landing then planned its route from
   *  where the feet read mid-move, up to a kilometre from where they land (AUDIT OW3 D2's own law for the find). */
  const walkFree = () => !!shared.travelOptions && (shared.modes?.mode ?? 'exterior') === 'exterior' && shared.playerSpawned && playerEntity.health > 0 && !shared.modes?.deathUp?.()
    && !worldMoveBusy() && !townTalk.overlay && !gamePaused() && !(shared.modes?.modalWindowUp?.() ?? false) && pointerSurfaces.size === 0 && !walkDanger()
    && !shared.wagonRiders?.seated()   // WAGONS2: nor a rider seated in another's wagon - its driver steers (a party walk's Yes walked a held motor)
    // AUDIT OW5 P1: and only where the Overworld's own doors would let me set out - its gate (the enhanced interface, never
    // underwater: THE OVERHAUL's lane) and a passenger's refusal (travelViewCanGo: the helmsman steers). A passenger said
    // Yes and was walked off the leader's deck toward the first land leg; a classic-skin member was walked a route
    && travelViewAllowed().ok && !csaAboard.aboard;

  /** AUDIT OW3 P4: the question comes down - by its own door (the identity guard: a window that replaced it is left).
   *  AUDIT OW4 P3: WITHDRAWN first (ui/yesNoBox.js withdraw: inert, neither answer), so a question buried under a window
   *  pushed over it - where the identity guard leaves it - is dropped by the stack's own drain the moment it surfaces
   *  (townTalk's `overlay?.done`); before, it came back untracked and answerable minutes later. */
  function walkBoxDown() {
    const box = _walkBox;
    _walkBox = null; _walkBoxRound = null;
    if (!box) return;
    box.withdraw();
    townTalk.closeOverlay(box);
  }
  /** AUDIT OW4 P3: an answer counts only while its question stands (walkAskStands, off the walk as last heard) - a yes
   *  pressed on a box that outlived its round, its asking or a danger starts nothing, a no refuses nothing. */
  function walkAnswered(box, round, yes) {
    if (_walkBox === box) { _walkBox = null; _walkBoxRound = null; }
    if (walkAskStands({ tw: _walkHeard?.tw ?? null, round, now: walkNow(), danger: walkDanger() })) shared._walkMine = { at: round, yes, go: null };
  }
  function partyWalkFrame(nowMs) {
    if (nowMs - _walkAt < 250) return;
    _walkAt = nowMs;
    const journeying = walkJourneying();
    const cleared = shared.travelOptions?.cleared ?? 0, ended = cleared !== shared._walkCleared;   // AUDIT OW3 P5: a journey ENDED (arrived, forgotten)
    shared._walkCleared = cleared;
    const now = walkNow();
    const leads = !!shared.social?.party && !!shared.social.leads?.();
    // THE LEADER (systems/party/partyWalk.js leaderWalkStep): my stop halts the walk, my journey taken up again sets it out
    // again, its end ends it (members released), a member's stop after the last set-out halts me - AUDIT OW3 P1: through
    // the panel, the mod's Camp (closeWindow -> onClose -> interruptTravel, the destination kept for the resume)
    if (shared._walkLead && !leads) shared._walkLead = null;
    if (shared._walkLead) {
      const stops = shared.social.others().filter((m) => memberPresent(m)).map((m) => m.p?.ts);
      const next = leaderWalkStep({ tw: shared._walkLead, journeying, dest: walkDestLive(), ended, stops, now });
      shared._walkLead = next.tw;
      if (next.halt) { shared.travelOptions?.messages?.pauseTravel(); tvSay(TRAVEL_VIEW_TEXT.partyHalted); }   // AUDIT OW5 P5: said, once the clock is back to one
    }
    // A MEMBER: the leader's walk, as their pose says it - AUDIT OW3 P7: a pose missing a moment (a hub reconnect) keeps
    // the last walk a while; a pose saying none is believed
    const leadRow = shared.social?.party && !leads ? (shared.social.others().find((m) => m.acct === shared.social.party.leader) ?? null) : null;
    _walkHeard = walkHeard(_walkHeard, { acct: leadRow?.acct ?? null, present: memberPresent(leadRow), tw: leadRow?.p?.tw ?? null }, nowMs);
    const tw = leadRow ? _walkHeard.tw : null;
    shared._walkMine = memberAnswer(shared._walkMine, tw);   // AUDIT OW3 P3: a yes answers ITS round, and dies with it
    const why = shared._walkStopWhy;
    shared._walkStopWhy = null;   // AUDIT OW4 P4: read once - a stop's reason is its own step's
    const stop = memberStopOf({ was: _walkWas, journeying, ended, following: memberFollowing(shared._walkMine, tw), why });
    if (stop === 'stop' || stop === 'balk') _walkTs = now;   // my own stop (a foe, a band, a window): the leader halts on it
    if (stop === 'balk') shared._walkMine = { ...shared._walkMine, balk: true };   // AUDIT OW4 P4: cannot run as I am - the party's set-outs pass me by until I take it up
    else if (stop === 'done') shared._walkMine = { ...shared._walkMine, yes: false };   // AUDIT OW3 P5: arrived (or forgot it) - never a stop
    // AUDIT OW3 P4: the question stands only while its round stands, within its asking, no danger - AUDIT OW4 P3: and
    // while the window STACK holds it: a window pushed over it (the trade window, a quest popup, the exhaustion box)
    // suspends it and it is still the question, taken down through the stack when it goes; only a window that REPLACED
    // it (showOverlay disposes the occupant) loses it. The slot alone read "gone" under a push, and the box came back
    // untracked: never down with its round, the slot full so never asked again, and a yes minutes later still started.
    if (_walkBox && !townTalk.containsOverlay(_walkBox)) { _walkBox = null; _walkBoxRound = null; }   // replaced: asked again when free
    if (_walkBox && !walkAskStands({ tw, round: _walkBoxRound, now, danger: walkDanger() })) walkBoxDown();
    const gathered = memberPresent(leadRow) && distanceToPartyAccount(leadRow.acct) <= PARTY_WALK_RADIUS_M;
    const onWalk = journeying && sameWalkDest(tw, walkDestLive(), true);
    const step = memberWalkStep({ tw, mine: shared._walkMine, gathered, journeying, onWalk, was: _walkWas, free: !!tw && walkFree(), now });   // no walk: nothing to be free for
    if (step === 'ask' && !_walkBox) {
      const where = tw.sx != null ? TRAVEL_VIEW_TEXT.theSpot : (tvPlaceSummary(tw.x, tw.y)?.name ?? TRAVEL_VIEW_TEXT.theSpot);   // AUDIT OW5 P5: "to the marked spot"
      const round = tw.at;
      const box = new YesNoBoxWindow({
        rows: [`${leadRow.name ?? 'Your leader'} leads the party to ${where}.`, ...[wildWalkRow(tw.x, tw.y)].filter(Boolean), 'Travel with them?'],   // PARTY-TRUCE: the zone named
        onYes: () => walkAnswered(box, round, true),
        onNo: () => walkAnswered(box, round, false),
      });
      _walkBox = box; _walkBoxRound = round;
      townTalk.showOverlay(box);   // AUDIT OW3 P4: only onto an empty slot (walkFree) - it replaces nothing
    } else if (step === 'start') {
      const summary = tw.sx == null ? tvPlaceSummary(tw.x, tw.y) : null;
      const o = mapPixelToWorldCoords(tw.x, tw.y);
      // AUDIT OW4 X1: a place I have not found, or a spawn the leader walks to, is walked as its DOOR (never refused for the
      // peaks - the leader reached a mountain town by road, and the member heard "the mountains cannot be crossed")
      const there = summary ? null : tvLocationAt(tw.x, tw.y);   // AUDIT OW5b D3: a spawn my pixels never built, the leader's door all the same
      const door = there ? locationWorldRect(there, tw.x, tw.y) : null;
      // AUDIT OW5 P3: a spot on the SEA is asked as the sea, as the leader's own click asked it - by the planner's own byte
      // for the spot's pixel (the walk's record carries no word of it, and a new one is a relay's): asked as land, a member
      // at a helm had no way and was left behind, and one ashore was routed into the water to the ocean stop
      const water = tw.sx != null && !there && tvWater(tw.x, tw.y);
      const ok = summary ? travelViewRouteTo(summary) : travelViewWalkTo(tvSceneOf(tw.sx ?? o.x + 16384, tw.sz ?? o.z + 16384, 0), { x: tw.x, y: tw.y }, { door, water });
      shared._walkMine = { ...shared._walkMine, go: tw.go, yes: ok, balk: false };   // no way from here: left behind, never started again this round (AUDIT OW4 P4: a start is my balk taken up)
    } else if (step === 'halt') {
      shared.travelOptions?.messages?.pauseTravel();   // AUDIT OW3 P1: through the panel - stopped, not journeying, started again on the set-out
      tvSay(TRAVEL_VIEW_TEXT.partyHalted);   // AUDIT OW5 P5: said
    } else if (step === 'leave') {
      shared._walkMine = { ...shared._walkMine, yes: false };   // a journey of my own elsewhere, or (AUDIT OW4 P6) taken up myself under the halt: I left the walk, and my stops are mine
    }
    // what I walk now, for the next step's reading - AFTER the party's halt, so its stop is never taken for mine
    _walkWas = walkJourneying() && memberFollowing(shared._walkMine, tw) && sameWalkDest(tw, walkDestLive(), true);
  }

  const partyMapFrame = (nowMs) => {
    const k = (shared.modes?.mode ?? 'exterior') === 'dungeon' ? liveDungeonAutomapKey() : null;
    const f = shared._partyMapSender.next({ active: hasSharedCartography(playerEntity), inDungeon: !!k, partied: !!shared.social?.party?.members?.some((m) => m.online && m.acct !== shared.social.acct),   // SCALE2b: a party with a mate ONLINE - the map and its minute's resync go to nobody otherwise
      key: k, rec: k ? getDungeonAutomap(k) : null, nowMs });
    if (f && socialLink()?.shareAutomap(f.k, f.r)) shared._partyMapSender.commit(f, nowMs);
  };
  // SOFTCAP1: the other members' levels off their poses (`cl`; a relay from before world131 strips it), none at all
  // when I am in no party - ONE HOME for MENTOR MODE's partners and PARTY-LOOT's party level (a room container's base
  // is minted at the group's reference level, systems/roomLoot.js roomBaseLevel)
  const partyMateLevels = () => (shared.social?.party ? shared.social.others().filter((m) => m.online !== false && Number.isInteger(m.p?.cl)).map((m) => m.p.cl) : []);

  const partyFrame = (nowMs) => {
    playerEntity._online = isOnlinePage();   // SOFTCAP3: Master Skills is in force only online (systems/masterSkills.js)
    // SOFTCAP1: MENTOR MODE follows the party every frame - so leaving the group hands my real character back the same frame.
    const mentorLevels = partyMateLevels();
    const mentorWord = refreshMentor(playerEntity, mentorLevels);
    setFirmamentMentoring(!!playerEntity._mentor);   // AUDIT UICALM-FIRM1 L1 L2: the sky sleeps the frame mentoring starts, and wakes the frame it ends
    if (mentorWord) {
      const text = mentorWord === 'on' ? mentorStatusText(playerEntity) : 'Party level ended. Enemies and loot are built for your own level again.';
      try { shared.chatLog.push(shared.chatLog.active, { text, system: true }); } catch { /* no chat yet: the sheet says it too */ }
    }
    if (!shared.social) return;
    // AUDIT SOC B7: the HUB LINK's clock - its welcome carries the relay's `now` (AUDIT SOC B7, server side), and it is
    // the link whose stamps (last seen, an invite's lapse) the picture reads; the presence session's stands in for a
    // relay from before, and is null when the player is in the chat alone
    const hub = socialLink();
    shared.social.setClockOffset(hub?.clockRead ? hub.clockOffsetMs : (shared.online?.clockOffsetMs ?? 0));
    partyWalkFrame(nowMs);   // TV8: the party's walk - the leader's halts, a member's steps
    partyMapFrame(nowMs);   // PARTY-MAP: Shared Cartography's batches
    // STAFF-PANEL5-FOLLOW (design doc "DFO Staff Panel: design", Invisible follow): outside a party my pose goes on as my
    // where note, at the note's own pace (net/online.js sendParty, `solo`) - the hub keeps it for staff alone
    if (socialLink()) socialLink().solo = !shared.social.party;
    // PARTY-PING: a ping sends on the frame it is pressed. A refused one asks again on the pose's own clock -
    // never every frame, which would reset partyGate's refill (wire.js tokenGate stamps `at` on a refusal).
    const pingNow = !!shared.partyPing?.unsent();
    const due = nowMs - shared._partyComposedAt >= PARTY_SEND_MS / 2;
    if (!due && !pingNow) return;
    if (pingNow && !due && nowMs - shared._partyPingTry < PARTY_SEND_MS / 2) return;
    if (pingNow && !due) shared._partyPingTry = nowMs;
    shared._partyComposedAt = nowMs;
    shared._partyPose = composePartyPose();
    // PARTY-TRAVEL: once the pose saying we set out has LEFT, the leader's own journey may begin. AUDIT PARTY-TRAVEL: only a
    // pose the link sent - sendParty refuses one within PARTY_SEND_MS of the last (and a repeat, and one its gate holds),
    // and the session was told of every pose composed, so a leader walking about (a pose a second) set out before the
    // members had read "we set out", and a member whose last open reading found the leader's body gone was left behind.
    // PARTY-PING: `urgent` skips that floor for the one pose that carries a new point.
    if (socialLink()?.sendParty(shared._partyPose, { urgent: pingNow })) {
      shared.partyTravel?.sent(shared._partyPose);
      if (pingNow) shared.partyPing.sent();
    }
  };
  return {
    PARTY_REST_FAR_SECONDS, PARTY_REST_RADIUS, campFeet, campRest, cancelPartyRestStart, distanceToPartyAccount,
    markPartyRestSpent, nearAccount, nearPartyMembers, partyCompass, partyFrame, partyMarkers, partyMateLevels,
    partyNear, partyOnMaps, partyPlaceName, partyRestFollowTick, partyRestGate, partyRestHere, partyRoundActive,
    partySize, partyTravelJourney, restTogether, restsWithParty, strangerRestGate, walkNow,
  };
}
