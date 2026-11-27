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
  let _walkTs = null;
  let _walkBox = null, _walkBoxRound = null;
  let _walkHeard = null;

  let _walkWas = false, _walkAt = 0;

  let _partyRestMirrored = null;

  let _partyRestReadyRound = null;
  let _partyRestStartWaived = false;
  let _restAloneNight = false;

  /** Off only through a hub that carries `nr` (REST_OPT_RELAY_MIN); an older hub would keep counting me a voter. */
  const restsWithParty = () => getPref('restWithParty') !== false || !socialLink()?.restOptOk;

  const partyRestModeCode = (mode) => (mode === 'timed' ? 1 : mode === 'full' ? 2 : 0);

  const composePartyPose = () => {
    const mode = shared.modes?.mode ?? 'exterior';
    const px = playerTravelPixel();
    const ident = mode === 'dungeon' ? shared.modes?.roomIdentity?.() : null;
    const loc = locationIndex.get(`${px.x},${px.y}`) ?? null;
    const restWin = mode === 'interior' ? shared.modes?.restState
      : mode === 'dungeon' ? shared.modes?.dungeonCtx?.restState
        // Only a window in the `resting` state counts; a session stays set on its end screen until OK is clicked.
        : (townTalk.overlay?.isRestWindow && !townTalk.overlay.isPartyRestMirror && townTalk.overlay.session && townTalk.overlay.state === 'resting'
          ? { mode: townTalk.overlay.mode, hoursRemaining: townTalk.overlay.session.hoursRemaining, totalHours: townTalk.overlay.session.totalHours }
          : null);
    return {
      px: px.x, py: px.y,
      in: mode === 'dungeon' ? 1 : mode === 'interior' ? 2 : 0,
      ...(shared.online?.layer ? { ly: shared.online.layer } : {}),
      ...(shared.online?.room ? { rk: shared.online.room } : {}),
      loc: ident?.kind === 'dungeon' ? (ident.name ?? '') : (loc?.name ?? ''),
      // Fatigue goes out in the units the character sheet shows; the stored pool is times FATIGUE_MULTIPLIER.
      h: playerEntity.health ?? 0, hm: playerEntity.maxHealth ?? 0, f: Math.trunc((playerEntity.fatigue ?? 0) / FATIGUE_MULTIPLIER), fm: Math.trunc(maxFatigue(playerEntity) / FATIGUE_MULTIPLIER), m: playerEntity.magicka ?? 0, mm: playerEntity.maxMagicka ?? 0,
      race: artRaceOf(playerEntity), gender: playerEntity.gender ?? 'male', face: playerEntity.faceIndex ?? 0,
      bk: mode === 'interior' ? (shared.modes?.interiorBuilding?.buildingKey ?? null) : null,
      // The rest kind goes out so a follower mirror uses that kind instead of judging its own feet.
      rest: restWin ? { mode: partyRestModeCode(restWin.mode), hoursRemaining: restWin.hoursRemaining, totalHours: restWin.totalHours, kind: playerEntity.restKind ?? null } : null,
      // A monotonic marker outside `rest`: a session ends the same tick an enemy break is found.
      restEnemyAt: playerEntity._restEnemyBreakAt ?? null,
      ready: shared._partyRestReady,
      readyAt: shared._partyRestReady && Number.isFinite(shared._partyRestReadyAt) && shared._partyRestReadyAt > 0 ? shared._partyRestReadyAt : null,
      // Null until a real not-ready refusal; sending the current moment would look like an ongoing vote forever.
      voteAt: Number.isFinite(shared._partyRestGateRefusedAt) ? shared._partyRestGateRefusedAt : null,
      cl: playerEntity.level ?? 1,
      restCancelFor: playerEntity._restCancelRequestFor ?? null,
      restCancelAt: playerEntity._restCancelRequestAt ?? null,
      restStartedAt: Number.isFinite(shared._partyRestJustStartedAt) ? shared._partyRestJustStartedAt : null,
      ...(shared._rezOut && performance.now() < shared._rezOut.until ? { rz: { to: shared._rezOut.to, at: shared._rezOut.at } } : {}),
      ...rescueLink.poseField(),
      ...(shared._deadMark ? { dd: shared._deadMark } : {}), ...(shared.legacyHost?.raisable() === false || !hourRezOpen() ? { fg: 1 } : {}),
      ...(shared.partyTravel?.poseFields() ?? {}),
      ...(shared._walkLead && socialLink()?.partyWalkOk ? { tw: shared._walkLead } : {}),
      ...(_walkTs != null && socialLink()?.partyWalkOk ? { ts: _walkTs } : {}),
      ...(shared.social?.leads?.() && mode === 'exterior' && walkMode && shared.playerSpawned && !worldMoveBusy() ? partyFeetOf(player.pos) : {}),
      ...(!shared.social?.party && mode === 'exterior' && walkMode && shared.playerSpawned && !worldMoveBusy() && partyFeetOf(player.pos)),
      ...partyFxField(),
      ...(shared.bountyHost?.poseField() ?? {}),
      ...(shared.partyPing?.poseField() ?? {}),
      lv: Math.max(1, Math.min(99, playerEntity.level | 0 || 1)),
      ...(!restsWithParty() || (_restAloneNight && playerEntity.isResting) ? { nr: 1 } : {}),
      ...(playerEntity.isResting ? { rs: 1 } : {}),
      ...keptKillField(),
    };
  };
  const keptKillField = () => { const qk = keptKills.rows(Date.now()); return qk ? { qk } : {}; };
  const partyFxField = () => { const fx = composePartyFx(playerEntity); return fx.length ? { fx } : {}; };
  const partyFeetOf = (pos) => { const wc = state.worldCoords(pos); return { wx: wc.x, wy: pos[1] - state.compensation[1], wz: wc.z }; };
  const partyRestModeFromCode = (code) => (code === 1 ? 'timed' : code === 2 ? 'full' : 'loiter');
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
      racialOverrideBlocks: !!racialRestBlock(playerEntity, Math.floor(ownMinutes())),
    });
    return d.kind !== 'rest';
  };
  const partyRestMirrorDeps = (restKind, targetAcct) => {
    // overrideRestKind sets the kind inside the closure setResting reads, so it runs before the window is built.
    outdoorRestDeps.overrideRestKind(restKind ? () => restKind : null);
    return {
    ...outdoorRestDeps,
    partyRest: () => true,
    // Only the rester session reports enemies or rolls wanderers, so one party nap rolls once.
    enemiesNearby: () => false,
    // The mirrored night advances the follower's own clock and watch rolls, leaving out only the wanderers' roll.
    advanceMinutes: (n) => { playerTicker.advance(n); runEncounterTick(walkMode && shared.playerSpawned ? player.pos : cam.pos, true, { spawns: false }); },
    commitCrime: () => {},
    canceledByFollower: () => false,
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
  const PARTY_REST_RADIUS = 15;
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
  const partyNear = () => {
    if (!shared.social?.party) return [];
    const near = shared.peersNear();
    if (!near?.length) return [];
    const out = [];
    for (const m of shared.social.others()) {
      const peer = near.find((p) => m.peers?.includes(p.id));
      if (!peer?.feet) continue;
      out.push({ id: peer.id, acct: m.acct, name: m.name, feet: [peer.feet[0], peer.feet[1], peer.feet[2]], yaw: shared.online?.peers.get(peer.id)?.shown?.yaw ?? 0 });
    }
    return out;
  };
  const partyOnMaps = () => partyNear().filter((m) => !_hiddenPeers.has(m.id));

  const partyCompass = () => (shared.social?.party ? partyCompassPoints({
    bodies: partyOnMaps, others: shared.social.others().filter((m) => !m.peers?.some((id) => _hiddenPeers.has(id))), here: playerTravelPixel(),
    fromWorld: (wx, wz) => state.localFromWorld(wx, wz),
    pixelCentre: (px, py) => { const t = state.pixelTranslation(px, py); return [t[0] + TERRAIN_SIZE / 2, t[2] + TERRAIN_SIZE / 2]; },
  }) : null);
  const partySize = () => {
    if (!shared.online || shared.online.status !== 'open' || !shared.online.room) return 1;
    const me = player.feetAt?.();
    if (!me) return 1;
    const r2 = GROUP_ROLL_RADIUS * GROUP_ROLL_RADIUS;
    let n = 1;
    for (const m of partyNear()) { const dx = m.feet[0] - me[0], dz = m.feet[2] - me[2]; if (dx * dx + dz * dz <= r2) n++; }
    return partySizeOf(n);
  };

  /** Indoors the same building key is enough: walls separate rooms, and indoor peer tracking is less reliable. */
  const nearAccount = (acct, pose, from = player.feetAt()) => {
    if (!pose || !samePlace(myPartyLocation(), { px: pose.px, py: pose.py, in: pose.in, bk: pose.bk })) return false;
    if ((shared.modes?.mode ?? 'exterior') === 'interior') return true;
    return distanceToPartyAccount(acct, from) <= PARTY_REST_RADIUS;
  };
  const nearPartyMembers = (from = player.feetAt()) => {
    if (!shared.social?.party) return [];
    return shared.social.others().filter((m) => memberPresent(m) && nearAccount(m.acct, m.p, from));
  };
  const restTogether = () => partyRestsTogether(restsWithParty(), shared.social?.party ?? null, !!shared.social?.leads?.());
  const nearRestMembers = (from = player.feetAt()) => nearPartyMembers(from).filter((m) => !restsAlone(m));
  const partyRoundActive = (nearHere = nearRestMembers()) => {
    const now = shared.social.now();
    return now - latestStamp(nearHere, 'voteAt', shared._partyRestGateRefusedAt, now) < PARTY_REST_VOTE_COOLDOWN_MS;
  };
  // Online there is no party vote, gather, or mirror; a long rest only stamps `restStartedAt` for the camp roll.
  const hostRestDeps = () => {
    const mode = shared.modes?.mode ?? 'exterior';
    return mode === 'interior' ? shared.modes?.restDeps?.() ?? null : mode === 'dungeon' ? shared.modes?.dungeonCtx?.restDeps?.() ?? null : outdoorRestDeps;
  };
  const publicRestPoint = () => { const pt = hostRestDeps()?.restAct?.()?.point; return !!pt && pt.where !== 'bedroll'; };
  setNightListener((kind) => { if (shared.social && sharedClockOn()) { shared._partyRestJustStartedAt = nightStamp(shared.social.now(), kind ?? undefined); shared._partyComposedAt = -Infinity; } });
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
  const campFeet = () => (playerEntity.isResting ? partyNear().filter((m) => { const row = shared.social?.others().find((o) => o.acct === m.acct); return !!row && !restsAlone(row) && nearAccount(m.acct, row.p); }).map((m) => m.feet) : []);
  const partyRestHere = () => !sharedClockOn() && !!shared.social?.party && !shared.modes?.insidePartyRestExempt && restTogether();
  const partyRestGate = () => {
    if (!shared.social?.party) return null;
    if (!restTogether()) return null;
    if (sharedClockOn()) return null;
    if (shared.modes?.insidePartyRestExempt) return null;
    const nearHere = nearRestMembers();
    const iAmLeader = shared.social.leads();
    const onlineOtherCount = shared.social.others().filter((m) => memberPresent(m) && !restsAlone(m)).length;
    if (iAmLeader) {
      if (nearHere.length < onlineOtherCount) return 'You must gather the party before you can rest.';
    } else if (!nearHere.some((m) => m.acct === shared.social.party.leader)) {
      return 'You are not near the leader.';
    } else if (nearRestMembers(feetOfPartyAccount(shared.social.party.leader) ?? player.feetAt()).length < onlineOtherCount) {
      // A follower measures gathering around the leader's feet, so every client counts the same group.
      return 'You must gather the party before you can rest.';
    }
    const roundActive = partyRoundActive(nearHere);
    if (!iAmLeader && !roundActive) return 'Only the leader can start a resting vote.';
    const lastStartedAt = latestStamp(nearHere, 'restStartedAt', shared._partyRestJustStartedAt, shared.social.now());
    // The cooldown is asked before the press marks me ready, so a refused press leaves no vote on the next pose.
    if (shared.social.now() - cooldownStamp(nearHere, _partyRestStartWaived ? -Infinity : shared._partyRestJustStartedAt, shared.social.now()) < PARTY_REST_START_COOLDOWN_MS) return 'A rest just happened. Wait a moment before starting another.';
    shared._partyRestReady = true;
    shared._partyRestReadyAt = shared.social.now();
    const notReady = nearHere.filter((m) => !voteStands(m.p, shared.social.now(), lastStartedAt));
    const totalCount = nearHere.length + 1;
    const readyCount = (nearHere.length - notReady.length) + (shared._partyRestReady ? 1 : 0);
    if (!notReady.length) {
      if (!iAmLeader) return 'Everyone is ready. The leader must press Rest to start.';
      return null;
    }
    const line = `You are ready to rest (${readyCount}/${totalCount} ready). Everyone can /ready or press Rest.`;
    if (partyRoundActive(nearHere)) return 'Resting vote ongoing.';
    shared._partyRestGateRefusedAt = shared.social.now();
    shared._partyRestVoteOrigin = player.feetAt();
    return refusePartyRest(line);
  };
  const refusePartyRest = (line) => { shared.chatNotice(line); return line; };
  const markPartyRestSpent = () => {
    // Offline there is no party and no social clock, so a granted rest has nothing to spend.
    if (!shared.social) return;
    shared._partyRestReady = false;
    shared._partyRestGateRefusedAt = -Infinity;
    if (!sharedClockOn()) shared._partyRestJustStartedAt = shared.social.now();
    _partyRestStartWaived = false;
    shared._cancelSeen = snapshotCancels(shared.social.others());
    _restAloneNight = !restTogether();
  };
  const cancelPartyRestStart = () => { if (!shared.social) return; _partyRestStartWaived = true; };
  const PARTY_REST_VOTE_COOLDOWN_MS = 60_000;
  const PARTY_REST_START_COOLDOWN_MS = 10_000;
  const STRANGER_REST_BLOCK_RADIUS = 50;
  const STRANGER_REST_BLOCK_RADIUS_DUNGEON = 30;
  const otherPartyCamp = (peerId) => restsApart(shared.social?.others().find((o) => o.peers?.includes(peerId)) ?? null, restTogether());
  const strangerRestGate = () => {
    const mode = shared.modes?.mode ?? 'exterior';
    if (mode === 'interior') return null;
    if (sharedClockOn() && publicRestPoint()) return null;
    const radius = mode === 'dungeon' ? STRANGER_REST_BLOCK_RADIUS_DUNGEON : STRANGER_REST_BLOCK_RADIUS;
    const near = shared.peersNear();
    if (!near?.length) return null;
    const mine = player.feetAt();
    for (const p of near) {
      if (!p?.id || p.id === shared.online?.id || !p.feet) continue;
      const camp = shared.social?.isPartyPeer(p.id) ? otherPartyCamp(p.id) : true;
      if (!camp) continue;
      const dx = p.feet[0] - mine[0], dy = p.feet[1] - mine[1], dz = p.feet[2] - mine[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= radius) {
        return shared.social?.isPartyPeer(p.id) ? REST_APART_TEXT : 'Other players are too close to rest here.';
      }
    }
    return null;
  };
  let _partyRestVoteTrackAt = 0;
  let _partyRestVoteLastReady = null;
  // Each client pushes its own local tally notice from pose data; a chat send would make the avatar say it.
  const _partyRestVoteTrackTick = () => {
    if (!shared.social?.party || shared.modes?.insidePartyRestExempt || !restTogether() || sharedClockOn()) { _partyRestVoteLastReady = null; shared._partyRestVoteOrigin = null; return; }
    const now = performance.now();
    if (now - _partyRestVoteTrackAt < 1000) return;
    _partyRestVoteTrackAt = now;
    // Checked before the nobody-near return, since walking apart also empties nearHere a moment later.
    if (shared._partyRestVoteOrigin && shared.social.now() - shared._partyRestGateRefusedAt < PARTY_REST_VOTE_COOLDOWN_MS) {
      const mine = player.feetAt();
      const dx = mine[0] - shared._partyRestVoteOrigin[0], dy = mine[1] - shared._partyRestVoteOrigin[1], dz = mine[2] - shared._partyRestVoteOrigin[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) > PARTY_REST_RADIUS) {
        shared._partyRestGateRefusedAt = -Infinity;
        shared._partyRestVoteOrigin = null;
        _partyRestVoteLastReady = null;
        shared._partyRestReady = false;
        shared.chatNotice('The rest is called off. Someone moved too far from where it began.');
      }
    }
    const nearHere = nearRestMembers();
    if (!nearHere.length) { _partyRestVoteLastReady = null; return; }
    const lastStartedAt = latestStamp(nearHere, 'restStartedAt', shared._partyRestJustStartedAt, shared.social.now());
    if (shared.social.now() - cooldownStamp(nearHere, _partyRestStartWaived ? -Infinity : shared._partyRestJustStartedAt, shared.social.now()) < PARTY_REST_START_COOLDOWN_MS) { _partyRestVoteLastReady = null; return; }
    const notReady = nearHere.filter((m) => !voteStands(m.p, shared.social.now(), lastStartedAt));
    const totalCount = nearHere.length + 1;
    const readyCount = (nearHere.length - notReady.length) + (shared._partyRestReady ? 1 : 0);
    if (readyCount === 0) { _partyRestVoteLastReady = null; return; }
    if (readyCount >= totalCount) {
      if (_partyRestVoteLastReady !== null) {
        if (shared.social.leads()) shared.chatNotice('Everyone is ready to rest. Press Rest to start!');
        else shared.chatNotice('Everyone is ready to rest. The leader can start it now.');
      }
      _partyRestVoteLastReady = null;
      return;
    }
    if (readyCount !== _partyRestVoteLastReady) {
      _partyRestVoteLastReady = readyCount;
      const iLead = shared.social.leads();
      if (!iLead && !shared._partyRestReady) shared.chatNotice(`The leader wants to rest. Press R to be ready! (${readyCount}/${totalCount} ready)`);
      else shared.chatNotice(`${readyCount}/${totalCount} ready to rest.${iLead ? ' Waiting for the party.' : ''}`);
    }
  };
  const PARTY_REST_FAR_TEXT = (who, loitering = false) => `${who} is ${loitering ? 'loitering' : 'resting'}. Come within ${PARTY_REST_RADIUS} m of them to ${loitering ? 'wait' : 'rest'} with the party.`;
  const PARTY_REST_FAR_SECONDS = 4;
  let _partyRestFarSaid = false;
  const partyRestFarNotice = (rest, near, row) => {
    if (!rest || near) { _partyRestFarSaid = false; return; }
    if (_partyRestFarSaid) return;
    _partyRestFarSaid = true;
    setMidScreenText(PARTY_REST_FAR_TEXT(row?.name || 'A party member', rest.mode === 0), PARTY_REST_FAR_SECONDS);
  };
  const partyRestFollowTick = () => {
    // The vote expires every frame, even after leaving a party, so a rejoin never finds a stale ready flag.
    if (shared._partyRestReady && (!shared.social || shared.social.now() - shared._partyRestReadyAt > PARTY_READY_TIMEOUT_MS)) shared._partyRestReady = false;
    // A member vote belongs to the round the leader opened and goes when that round ends or is replaced.
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
    _partyRestVoteTrackTick();
    if (sharedClockOn()) return;
    const ov = townTalk.overlay;
    const mirroring = !!(ov?.isRestWindow && ov.isPartyRestMirror);
    if (mirroring && ov.state !== 'resting') return;
    if (!shared.social?.party) {
      if (mirroring) ov._end(ov.session.endEarly());
      _partyRestFarSaid = false;
      return;
    }
    if (mirroring) {
      const mirrorRow = shared.social.party.members.find((m) => m.acct === ov._mirrorAcct);
      // `restEnemyAt` is compared with its value when this mirror began, so a break from before it never fires.
      const enemyAt = mirrorRow?.p?.restEnemyAt ?? null;
      if (enemyAt != null && enemyAt !== ov._mirrorEnemyAtStart) {
        ov._end({ textId: REST_TEXT.enemiesNearby, enemyBroke: true, died: false });
        return;
      }
      if (!mirrorRow?.p?.rest) {
        ov._end(ov.session.endEarly());
        return;
      }
      if (!memberPresent(mirrorRow) || !nearAccount(ov._mirrorAcct, mirrorRow?.p)) {
        ov._end(ov.session.endEarly());
      }
      return;
    }
    if (shared.modes?.insidePartyRestExempt) return;
    const farRow = restTogether() ? (shared.social.others().find((m) => m.p?.rest && !restsAlone(m) && m.online !== false && !nearAccount(m.acct, m.p)) ?? null) : null;
    const dead = playerEntity.health <= 0 || !!shared.modes?.deathUp?.();
    if (!dead) partyRestFarNotice(farRow?.p?.rest ?? null, !farRow, farRow);
    if (townTalk.overlayActive || playerEntity.isResting || playerEntity.isLoitering || playerEntity.health <= 0) {
      return;
    }
    if (!restTogether()) return;
    const restingRow = nearRestMembers().find((m) => m.p.rest);
    if (!restingRow) return;
    // One mirror per nap: a mirror that ends early is not opened again for the same rest.
    const key = mirrorKey(restingRow);
    if (key && key === _partyRestMirrored) return;
    if (mirrorRestRefused()) return;
    _partyRestMirrored = key;
    const win = createRestWindow(partyRestMirrorDeps(restingRow.p.rest.kind, restingRow.acct));
    win.isPartyRestMirror = true;
    win._mirrorAcct = restingRow.acct;
    win._mirrorEnemyAtStart = restingRow.p.restEnemyAt ?? null;
    playerEntity._restCancelRequestFor = null; playerEntity._restCancelRequestAt = null;
    townTalk.showOverlay(win);
    win._start(partyRestModeFromCode(restingRow.p.rest.mode), restingRow.p.rest.hoursRemaining);
    shared._partyRestReady = false;
    shared._partyRestGateRefusedAt = -Infinity;
    shared._partyRestJustStartedAt = shared.social.now();
    _partyRestStartWaived = false;
    _restAloneNight = false;
  };
  const partyPlaceName = (to, fallback = '') => locationIndex.get(`${to.x},${to.y}`)?.name || fallback || 'the wilderness';

  const partyTravelJourney = (pick, opts, computed) => {
    if (pick?.besideAt && (wildTeleportRefused(pick.pixel ?? null) || (!pick.veil && veilRefused(pick.pixel ?? null)))) return Promise.resolve(false);
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
  const walkNow = () => shared.social?.now?.() ?? Date.now();
  const walkJourneying = () => !!shared.travelOptions?.isTravelActive && !!shared.travelOptions.state?.autopilot;
  const walkDestLive = () => {
    const r = shared.travelOptions?.route;
    if (r?.summary?.pixel) return { x: r.summary.pixel.x, y: r.summary.pixel.y, spot: false };
    if (r?.point?.pixel) return { x: r.point.pixel.x, y: r.point.pixel.y, spot: true };
    const s = shared.travelOptions?.destinationName != null ? shared.travelOptions.state?.destinationSummary : null;
    return s?.pixel ? { x: s.pixel.x, y: s.pixel.y, spot: false } : null;
  };
  const walkDanger = () => duelEnemyNear() || areEnemiesNearby(exteriorFoePool());
  const walkFree = () => !!shared.travelOptions && (shared.modes?.mode ?? 'exterior') === 'exterior' && shared.playerSpawned && playerEntity.health > 0 && !shared.modes?.deathUp?.()
    && !worldMoveBusy() && !townTalk.overlay && !gamePaused() && !(shared.modes?.modalWindowUp?.() ?? false) && pointerSurfaces.size === 0 && !walkDanger()
    && !shared.wagonRiders?.seated()
    && travelViewAllowed().ok && !csaAboard.aboard;

  function walkBoxDown() {
    const box = _walkBox;
    _walkBox = null; _walkBoxRound = null;
    if (!box) return;
    box.withdraw();
    townTalk.closeOverlay(box);
  }
  function walkAnswered(box, round, yes) {
    if (_walkBox === box) { _walkBox = null; _walkBoxRound = null; }
    if (walkAskStands({ tw: _walkHeard?.tw ?? null, round, now: walkNow(), danger: walkDanger() })) shared._walkMine = { at: round, yes, go: null };
  }
  function partyWalkFrame(nowMs) {
    if (nowMs - _walkAt < 250) return;
    _walkAt = nowMs;
    const journeying = walkJourneying();
    const cleared = shared.travelOptions?.cleared ?? 0, ended = cleared !== shared._walkCleared;
    shared._walkCleared = cleared;
    const now = walkNow();
    const leads = !!shared.social?.party && !!shared.social.leads?.();
    if (shared._walkLead && !leads) shared._walkLead = null;
    if (shared._walkLead) {
      const stops = shared.social.others().filter((m) => memberPresent(m)).map((m) => m.p?.ts);
      const next = leaderWalkStep({ tw: shared._walkLead, journeying, dest: walkDestLive(), ended, stops, now });
      shared._walkLead = next.tw;
      if (next.halt) { shared.travelOptions?.messages?.pauseTravel(); tvSay(TRAVEL_VIEW_TEXT.partyHalted); }
    }
    const leadRow = shared.social?.party && !leads ? (shared.social.others().find((m) => m.acct === shared.social.party.leader) ?? null) : null;
    _walkHeard = walkHeard(_walkHeard, { acct: leadRow?.acct ?? null, present: memberPresent(leadRow), tw: leadRow?.p?.tw ?? null }, nowMs);
    const tw = leadRow ? _walkHeard.tw : null;
    shared._walkMine = memberAnswer(shared._walkMine, tw);
    const why = shared._walkStopWhy;
    shared._walkStopWhy = null;
    const stop = memberStopOf({ was: _walkWas, journeying, ended, following: memberFollowing(shared._walkMine, tw), why });
    if (stop === 'stop' || stop === 'balk') _walkTs = now;
    if (stop === 'balk') shared._walkMine = { ...shared._walkMine, balk: true };
    else if (stop === 'done') shared._walkMine = { ...shared._walkMine, yes: false };
    // A window pushed over the question suspends it; only a window that replaced it (showOverlay) loses it.
    if (_walkBox && !townTalk.containsOverlay(_walkBox)) { _walkBox = null; _walkBoxRound = null; }
    if (_walkBox && !walkAskStands({ tw, round: _walkBoxRound, now, danger: walkDanger() })) walkBoxDown();
    const gathered = memberPresent(leadRow) && distanceToPartyAccount(leadRow.acct) <= PARTY_WALK_RADIUS_M;
    const onWalk = journeying && sameWalkDest(tw, walkDestLive(), true);
    const step = memberWalkStep({ tw, mine: shared._walkMine, gathered, journeying, onWalk, was: _walkWas, free: !!tw && walkFree(), now });
    if (step === 'ask' && !_walkBox) {
      const where = tw.sx != null ? TRAVEL_VIEW_TEXT.theSpot : (tvPlaceSummary(tw.x, tw.y)?.name ?? TRAVEL_VIEW_TEXT.theSpot);
      const round = tw.at;
      const box = new YesNoBoxWindow({
        rows: [`${leadRow.name ?? 'Your leader'} leads the party to ${where}.`, ...[wildWalkRow(tw.x, tw.y)].filter(Boolean), 'Travel with them?'],
        onYes: () => walkAnswered(box, round, true),
        onNo: () => walkAnswered(box, round, false),
      });
      _walkBox = box; _walkBoxRound = round;
      townTalk.showOverlay(box);
    } else if (step === 'start') {
      const summary = tw.sx == null ? tvPlaceSummary(tw.x, tw.y) : null;
      const o = mapPixelToWorldCoords(tw.x, tw.y);
      const there = summary ? null : tvLocationAt(tw.x, tw.y);
      const door = there ? locationWorldRect(there, tw.x, tw.y) : null;
      // A sea spot is asked as sea by the planner's own byte for that pixel, since the walk record does not say so.
      const water = tw.sx != null && !there && tvWater(tw.x, tw.y);
      const ok = summary ? travelViewRouteTo(summary) : travelViewWalkTo(tvSceneOf(tw.sx ?? o.x + 16384, tw.sz ?? o.z + 16384, 0), { x: tw.x, y: tw.y }, { door, water });
      shared._walkMine = { ...shared._walkMine, go: tw.go, yes: ok, balk: false };
    } else if (step === 'halt') {
      shared.travelOptions?.messages?.pauseTravel();
      tvSay(TRAVEL_VIEW_TEXT.partyHalted);
    } else if (step === 'leave') {
      shared._walkMine = { ...shared._walkMine, yes: false };
    }
    // Read after the party halt, so that halt is never taken for my own stop.
    _walkWas = walkJourneying() && memberFollowing(shared._walkMine, tw) && sameWalkDest(tw, walkDestLive(), true);
  }

  const partyMapFrame = (nowMs) => {
    const k = (shared.modes?.mode ?? 'exterior') === 'dungeon' ? liveDungeonAutomapKey() : null;
    const f = shared._partyMapSender.next({ active: hasSharedCartography(playerEntity), inDungeon: !!k, partied: !!shared.social?.party?.members?.some((m) => m.online && m.acct !== shared.social.acct),
      key: k, rec: k ? getDungeonAutomap(k) : null, nowMs });
    if (f && socialLink()?.shareAutomap(f.k, f.r)) shared._partyMapSender.commit(f, nowMs);
  };
  const partyMateLevels = () => (shared.social?.party ? shared.social.others().filter((m) => m.online !== false && Number.isInteger(m.p?.cl)).map((m) => m.p.cl) : []);

  const partyFrame = (nowMs) => {
    playerEntity._online = isOnlinePage();
    // Mentor mode follows the party every frame, so leaving the group restores the real character that frame.
    const mentorLevels = partyMateLevels();
    const mentorWord = refreshMentor(playerEntity, mentorLevels);
    setFirmamentMentoring(!!playerEntity._mentor);
    if (mentorWord) {
      const text = mentorWord === 'on' ? mentorStatusText(playerEntity) : 'Party level ended. Enemies and loot are built for your own level again.';
      try { shared.chatLog.push(shared.chatLog.active, { text, system: true }); } catch { }
    }
    if (!shared.social) return;
    const hub = socialLink();
    shared.social.setClockOffset(hub?.clockRead ? hub.clockOffsetMs : (shared.online?.clockOffsetMs ?? 0));
    partyWalkFrame(nowMs);
    partyMapFrame(nowMs);
    if (socialLink()) socialLink().solo = !shared.social.party;
    // A refused ping retries on the pose clock, never every frame, which would reset the partyGate refill.
    const pingNow = !!shared.partyPing?.unsent();
    const due = nowMs - shared._partyComposedAt >= PARTY_SEND_MS / 2;
    if (!due && !pingNow) return;
    if (pingNow && !due && nowMs - shared._partyPingTry < PARTY_SEND_MS / 2) return;
    if (pingNow && !due) shared._partyPingTry = nowMs;
    shared._partyComposedAt = nowMs;
    shared._partyPose = composePartyPose();
    // The leader sets out only once the link sent the set-out pose; sendParty refuses poses inside PARTY_SEND_MS.
    // `urgent` skips that floor for the one pose that carries a new ping.
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
