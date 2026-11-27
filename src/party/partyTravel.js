// @ts-check
// Party travel session: runs the leader round and member answers against the host seams in a fixed order.
// One session per client holds both roles; a member who takes the lead drops the member state.
import { PARTY_READY_TIMEOUT_MS, memberPresent } from './partyRestLaw.js';
import { t } from '../ui/textManager.js';
import {
  tripBits, tripOptionsOf, tripRoundOf, tripTally, tripSetsOut, tripCountText, leaderTripOf, besideTargetOf,
  leaderJourneyed, fareText, leaderOfferRows, tripAskRows, PARTY_TRAVEL_TEXT, TRIP_FOLLOW_MS,
} from './partyTravelLaw.js';

export const PARTY_TRIP_TICK_MS = 250;
export const PARTY_TRIP_GO_MS = 3000;
export const LEADER_MAP_QUIET_MS = 60_000;
/** Poses of a walked journey jump pixels every second, so an offer waits until the leader pixel holds still. */
export const LEADER_SETTLE_MS = 5000;

/** My index among non-leader members in hub seat order, the same on every client, so followers start apart. */
export function followerSeatOf(party, me) {
  let seat = 0;
  for (const m of party?.members ?? []) {
    if (m.acct === party.leader) continue;
    if (m.acct === me) return seat;
    seat++;
  }
  return 0;
}

export function createPartyTravel(host) {
  /** @type {any} */ let trip = null;
  /** @type {number|null} */ let vote = null;
  /** @type {number|null} */ let decline = null;
  /** @type {number|null} */ let asked = null;
  /** @type {number|null} */ let told = null;
  /** @type {number|null} */ let near = null;
  /** @type {{x: number, z: number}|null} */ let nearFrom = null;
  /** @type {any} */ let follow = null;
  /** @type {string|null} */ let followRefused = null;
  /** @type {{x: number, y: number}|null} */ let stay = null;
  /** @type {{x: number, y: number}|null} */ let bound = null;
  /** @type {any} */ let prompt = null;
  /** @type {number|string|null} */ let promptFor = null;
  /** @type {{acct: string, px: number, py: number}|null} */ let leaderSeen = null;
  let offerDue = false;
  let settledAt = -Infinity;
  let mapQuietUntil = -Infinity;
  let mapPending = false;
  let company = false;
  let tickAt = -Infinity;

  const social = () => host.social();
  const leaderRow = () => {
    const s = social(), party = s?.party;
    if (!party || party.leader === s.acct) return null;
    return party.members.find((m) => m.acct === party.leader) ?? null;
  };
  const roundOf = (lead) => (lead && memberPresent(lead) ? tripRoundOf(lead.p, social().now()) : null);
  const waitLabel = (t, now) => host.mid(`Waiting for the party to ready up (${t.count}).`, Math.max(1, (PARTY_READY_TIMEOUT_MS - (now - t.at)) / 1000));
  const leaderTrip = () => leaderTripOf({ party: social()?.party ?? null, me: social()?.acct ?? null, leader: leaderRow(), outdoors: host.outdoors(), here: host.here() });

  function showPrompt(rows, about, onYes, onNo = null) {
    closePrompt();
    let handle = null;
    const answered = () => { if (prompt === handle) { prompt = null; promptFor = null; } };
    handle = host.prompt(rows, () => { answered(); onYes?.(); }, () => { answered(); onNo?.(); });
    prompt = handle; promptFor = about;
  }
  function closePrompt() {
    const h = prompt;
    prompt = null; promptFor = null;
    if (h) host.closePrompt(h);
  }

  function journey(to, opts, leadAcct, leadName, fallback = '') {
    const refusal = host.refusal();
    if (refusal) { host.say(refusal); return false; }
    const fare = host.fare(to, opts);
    if (!fare.afford) { host.say(fareText(fare.computed, false)); return false; }
    const name = host.placeName(to, fallback);
    const pick = {
      pixel: { x: to.x, y: to.y }, name,
      besideAt: () => { const row = social()?.party?.members.find((m) => m.acct === leadAcct); return row && memberPresent(row) ? besideTargetOf(row.p, to.x, to.y) : null; },
      besideText: `You join ${leadName || 'your leader'} at ${name}.`,
      besideMissedText: t('party.travel.noRoomBeside', 'There was no room beside {leader}. You arrive at {place}.', {
        leader: leadName || t('party.travel.yourLeader', 'your leader'),
        place: name,
      }),
      besideSeat: followerSeatOf(social()?.party, social()?.acct),
    };
    const journeyBound = { x: to.x, y: to.y };
    bound = journeyBound;
    // A journey that did not arrive leaves me where I was, so `watch` must offer that place again when the leader
    // is next there.
    Promise.resolve(host.travel(pick, fare.opts, fare.computed)).then((went) => {
      if (!went && bound === journeyBound) bound = null;
    });
    return true;
  }

  function offerLeader({ fromMap = false } = {}) {
    const trip0 = leaderTrip();
    if ('refuse' in trip0) return trip0.refuse;
    if (host.busy()) return PARTY_TRAVEL_TEXT.busy;
    const refusal = host.refusal();
    if (refusal) return refusal;
    const fare = host.fare(trip0, host.myToggles());
    if (!fare.afford) return fareText(fare.computed, false);
    // Asking here spends the unasked offer due for this place, so a No is not followed by the same box later.
    offerDue = false; leaderSeen = { acct: trip0.acct, px: trip0.x, py: trip0.y };
    showPrompt(leaderOfferRows(trip0, host.placeName(trip0, trip0.loc), fareText(fare.computed), fare.unwell), 'leader', () => {
      const now = leaderTrip();
      if ('refuse' in now) { host.say(now.refuse); return; }
      journey(now, host.myToggles(), now.acct, now.name, now.loc);
    }, fromMap ? () => { mapQuietUntil = host.clock() + LEADER_MAP_QUIET_MS; mapPending = true; } : null);
    return true;
  }

  function propose(pick, opts, computed) {
    const s = social();
    if (!s?.party || !s.leads() || !host.relayOk() || !pick?.pixel || opts?.playerControlled) return false;
    // Never open a round over one that set out; its followers read it on my pose until TRIP_FOLLOW_MS past `go`.
    if (trip && trip.go != null) return false;
    const here = host.here();
    if (pick.pixel.x === here.x && pick.pixel.y === here.y) return false;
    const gathered = host.gathered();
    if (!gathered.length) return false;
    trip = {
      at: Math.round(s.now()), x: pick.pixel.x, y: pick.pixel.y, o: tripBits(opts), name: pick.name || host.placeName(pick.pixel),
      pick, opts, computed, origin: host.feet(), go: null, goSent: false, started: false, arrived: false, heard: new Set(),
    };
    const count = tripCountText(tripTally(gathered, trip.at));
    trip.count = count;
    host.say(`You ask the party to travel to ${trip.name}. (${count})`);
    waitLabel(trip, s.now());
    host.poseDirty();
    return true;
  }
  const offWith = (why) => (why === PARTY_TRAVEL_TEXT.off ? why : `${why} ${PARTY_TRAVEL_TEXT.off}`);
  function cancel(text) {
    if (!trip) return;
    const open = trip.go == null;
    trip = null;
    if (text) host.say(text);
    if (open && text) host.mid(text);
  }

  function leaderTick() {
    const t = trip;
    if (!t) return;
    const s = social();
    if (!s.leads()) { trip = null; return; }
    const now = s.now();
    if (t.go == null) {
      if (!host.outdoors() || !host.alive()) { cancel(PARTY_TRAVEL_TEXT.off); return; }
      const f = host.feet();
      if (Math.hypot(f.x - t.origin.x, f.z - t.origin.z) > host.radius) { cancel(PARTY_TRAVEL_TEXT.moved); return; }
      if (now - t.at > PARTY_READY_TIMEOUT_MS) { cancel(PARTY_TRAVEL_TEXT.late); return; }
      const tally = tripTally(host.gathered(), t.at);
      const count = tripCountText(tally);
      if (count !== t.count) { t.count = count; waitLabel(t, now); }
      for (const n of tally.ready) if (!t.heard.has(`r:${n}`)) { t.heard.add(`r:${n}`); host.say(`${n} is ready to travel. (${tripCountText(tally)})`); }
      for (const n of tally.declined) if (!t.heard.has(`d:${n}`)) { t.heard.add(`d:${n}`); host.say(`${n} stays behind.`); }
      if (!tripSetsOut(tally) || host.busy()) return;
      const refusal = host.refusal() ?? (host.canAfford(t.computed) ? null : fareText(t.computed, false));
      if (refusal) { cancel(offWith(refusal)); return; }
      t.go = Math.max(t.at, Math.round(now));
      host.poseDirty();
      const line = tally.ready.length ? `The party sets out for ${t.name}.` : `No one else is coming. You set out for ${t.name} alone.`;
      host.say(line);
      host.mid(line);
      return;
    }
    if (!t.started) {
      if (!t.goSent && now - t.go < PARTY_TRIP_GO_MS) return;
      // Ask the door's refusals again as the journey begins: the leader may have stepped through a door since `go`,
      // and fastTravelTo checks none of them.
      const why = !host.outdoors() || !host.alive() ? PARTY_TRAVEL_TEXT.off : host.refusal();
      if (why) { trip = null; host.poseDirty(); host.say(offWith(why)); return; }
      t.started = true;
      Promise.resolve(host.travel(t.pick, t.opts, t.computed)).then((went) => {
        if (went) { t.arrived = true; return; }
        if (trip === t) trip = null;
        host.say(PARTY_TRAVEL_TEXT.off);
      });
      return;
    }
    // Keep the round on my pose until my own journey arrives, or followers read a leader who did not set out.
    if (t.arrived && now - t.go > TRIP_FOLLOW_MS) trip = null;
  }

  function answer(at, yes) {
    const round = roundOf(leaderRow());
    if (!round || round.at !== at || round.go != null) { host.say(PARTY_TRAVEL_TEXT.off); return PARTY_TRAVEL_TEXT.off; }
    const dest = host.placeName(round);
    let why = null;
    if (yes) {
      why = host.refusal();
      if (!why) { const fare = host.fare(round, tripOptionsOf(round.o)); if (!fare.afford) why = fareText(fare.computed, false); }
    }
    let line;
    if (yes && !why) {
      vote = at; decline = null; stay = null;
      line = `You are ready to travel to ${dest}.`;
    } else {
      decline = at; vote = null; stay = { x: round.x, y: round.y };
      line = why ? `${why} ${PARTY_TRAVEL_TEXT.stay}` : PARTY_TRAVEL_TEXT.stay;
    }
    host.say(line);
    host.poseDirty();
    return line;
  }

  function memberTick(lead) {
    if (follow) { followTick(lead); return; }
    const round = roundOf(lead);
    if (promptFor != null && promptFor !== 'leader' && promptFor !== round?.at) { closePrompt(); host.say(PARTY_TRAVEL_TEXT.called); }
    if (!round) {
      if (vote != null) host.say(PARTY_TRAVEL_TEXT.called);
      vote = null; decline = null; near = null;
      return;
    }
    if (vote != null && vote !== round.at) vote = null;
    if (decline != null && decline !== round.at) decline = null;
    const dest = host.placeName(round);
    if (round.go == null) {
      // Gathered is lost only by walking away: the hub link and the world link have no order, so the leader's body
      // can leave my scene before the set-out pose arrives.
      const f = host.feet();
      if (host.nearLeader(lead)) { near = round.at; nearFrom = f; }
      else if (near !== round.at || !nearFrom || Math.hypot(f.x - nearFrom.x, f.z - nearFrom.z) > host.radius) near = null;
      if (near === null || asked === round.at || vote === round.at || decline === round.at || !host.alive()) return;
      // A box over the open Party tab pauses the game and hides the tab, so the tab's own buttons ask instead.
      if (host.tabOpen?.()) return;
      if (host.busy()) {
        if (told !== round.at) { told = round.at; host.say(`${lead.name || 'The leader'} wants the party to travel to ${dest}. Type /travel to come along.`); }
        return;
      }
      asked = round.at;
      const fare = host.fare(round, tripOptionsOf(round.o));
      const at = round.at;
      showPrompt(tripAskRows(lead.name, dest, fareText(fare.computed, fare.afford), fare.unwell), at, () => answer(at, true), () => answer(at, false));
      return;
    }
    if (promptFor === round.at) { closePrompt(); host.say(`The party set out for ${dest} without you.`); }
    if (vote !== round.at) return;
    vote = null;
    host.poseDirty();
    if (near !== round.at) { host.say(PARTY_TRAVEL_TEXT.lost); return; }
    follow = {
      at: round.at, x: round.x, y: round.y, o: round.o, acct: lead.acct, name: lead.name, since: host.clock(),
      from: { px: lead.p.px, py: lead.p.py },
    };
    followRefused = null;
    host.say(`The party sets out for ${dest}. You follow ${lead.name || 'the leader'}.`);
  }

  function followTick(lead) {
    const f = follow;
    const p = lead && lead.acct === f.acct && memberPresent(lead) ? lead.p : null;
    const there = !!p && p.px === f.x && p.py === f.y;
    const atDeparture = !!p && p.px === f.from.px && p.py === f.from.py;
    // The round stays on the leader pose until their journey ends (leaderTick). A round gone from it means the
    // journey is over, or never began if they still stand where they set out.
    const roundLeft = !!p && p.tv?.at !== f.at;
    if (roundLeft && atDeparture && !there) { follow = null; host.say(`${f.name || 'The leader'} did not set out. ${PARTY_TRAVEL_TEXT.off}`); return; }
    const waited = host.clock() - f.since;
    if (host.busy()) {
      if (waited >= 2 * TRIP_FOLLOW_MS) leaveBehind(f);
      return;
    }
    const arrived = !!besideTargetOf(p, f.x, f.y) || (there && p.in !== 0);
    // While the leader's seat is here and carries the round, their journey is still under way, however slow.
    // Only a seat gone quiet is given up on after TRIP_FOLLOW_MS.
    const seatQuiet = !p && waited >= TRIP_FOLLOW_MS;
    if (!arrived && !roundLeft && !seatQuiet) return;
    // Most door refusals here pass (an enemy, a door, the sun), so the follow waits them out until the deadline.
    // The door's `off` and an unaffordable fare still end the follow.
    const refusal = host.refusal();
    const waitsOut = !!refusal && refusal !== PARTY_TRAVEL_TEXT.off;
    if (waitsOut && waited >= 2 * TRIP_FOLLOW_MS) {
      leaveBehind(f);
      return;
    }
    if (waitsOut) {
      if (refusal !== followRefused) host.say(`${refusal} ${t('party.travel.followOnceAble', 'You will follow {leader} once you can.', { leader: f.name || t('party.travel.theLeader', 'the leader') })}`);
      followRefused = refusal;
      return;
    }
    follow = null;
    const to = arrived || !roundLeft ? { x: f.x, y: f.y } : { x: p.px, y: p.py };
    journey(to, tripOptionsOf(f.o), f.acct, f.name);
  }

  function leaveBehind(f) {
    follow = null;
    offerDue = false;
    host.say(`The party went on without you. Travel to ${f.name || 'your leader'} from the Party tab, or type /leader.`);
  }

  function watch(lead) {
    if (!lead || !memberPresent(lead)) return;
    const p = lead.p;
    const now = host.clock();
    if (!leaderSeen || leaderSeen.acct !== lead.acct) {
      leaderSeen = { acct: lead.acct, px: p.px, py: p.py };
      offerDue = true; settledAt = now;
    } else if (p.px !== leaderSeen.px || p.py !== leaderSeen.py) {
      if (leaderJourneyed(leaderSeen, p)) offerDue = true;
      leaderSeen.px = p.px; leaderSeen.py = p.py; settledAt = now;
    }
    if (!offerDue || now - settledAt < LEADER_SETTLE_MS || follow || host.moving()) return;
    offerDue = false;
    const here = host.here();
    if (bound && here.x === bound.x && here.y === bound.y) bound = null;
    if (p.px === here.x && p.py === here.y) return;
    if (stay && stay.x === p.px && stay.y === p.py) return;
    if (bound && bound.x === p.px && bound.y === p.py) return;
    if (host.busy() || offerLeader() !== true) host.say(`${lead.name || 'Your leader'} is at ${host.placeName({ x: p.px, y: p.py }, p.loc)}. Travel to them from the Party tab, or type /leader.`);
  }

  function respondTo(yes) {
    const lead = leaderRow();
    const round = roundOf(lead);
    if (!round || round.go != null) return { line: 'There is no journey to get ready for. /leader travels to your leader.' };
    if (near !== round.at && !host.nearLeader(lead)) return { line: `Gather with ${lead.name || 'the leader'} to travel with the party.` };
    if (promptFor === round.at) closePrompt();
    asked = round.at;
    return { line: answer(round.at, yes == null ? vote !== round.at : !!yes), said: true };
  }

  function reset() {
    if (prompt) closePrompt();
    if (follow) host.say(PARTY_TRAVEL_TEXT.off);
    trip = null; vote = null; decline = null; near = null; nearFrom = null; follow = null; stay = null; bound = null; leaderSeen = null;
    offerDue = false;
  }

  return {
    tick() {
      if (mapPending && !host.busy()) { mapPending = false; host.openMap(); }
      const s = social();
      if (!s) return;
      const now = host.clock();
      if (now - tickAt < PARTY_TRIP_TICK_MS) return;
      tickAt = now;
      if (!s.party) { reset(); return; }
      leaderTick();
      if (s.leads()) company = host.gathered().length > 0;
      const lead = leaderRow();
      memberTick(lead);
      watch(lead);
    },
    propose,
    mapOffer() {
      const s = social();
      if (!s?.party || s.leads() || host.clock() < mapQuietUntil) return false;
      return offerLeader({ fromMap: true }) === true;
    },
    command(name) {
      const s = social();
      if (!s?.party) return PARTY_TRAVEL_TEXT.noParty;
      if (name === 'leader') { const r = offerLeader(); return r === true ? null : r; }
      if (s.leads()) {
        if (trip && trip.go == null) { trip = null; host.poseDirty(); host.mid('You call off the journey.'); return 'You call off the journey.'; }
        return 'Choose a destination on the travel map. The party gathered with you is asked to come along.';
      }
      const r = respondTo(null);
      return r.said ? null : r.line;
    },
    respond(yes) {
      const s = social();
      if (!s?.party) return PARTY_TRAVEL_TEXT.noParty;
      if (s.leads()) return null;
      return respondTo(!!yes).line;
    },
    status() {
      const s = social();
      if (!s?.party) return null;
      if (s.leads()) {
        const t = trip;
        if (t && !t.arrived) return { role: 'leader', round: { dest: t.name, count: t.count ?? '', set: t.go != null } };
        return { role: 'leader', round: null, outdoors: host.outdoors(), hub: host.relayOk(), gathered: company, held: !!t };
      }
      const lead = leaderRow();
      const name = lead?.name || 'your leader';
      const round = roundOf(lead);
      const open = round && round.go == null ? round : null;
      const p = lead && memberPresent(lead) ? lead.p : null;
      const here = host.here();
      return {
        role: 'member', leader: name,
        round: open ? { dest: host.placeName(open), ready: vote === open.at, staying: decline === open.at, gathered: near === open.at } : null,
        following: !!follow,
        away: !!p && !host.journeying() && leaderJourneyed({ px: here.x, py: here.y }, p),
        outdoors: host.outdoors(),
      };
    },
    openMap: () => host.openMap(),
    poseFields() {
      return {
        ...(trip && social()?.leads?.() ? { tv: { x: trip.x, y: trip.y, o: trip.o, at: trip.at, go: trip.go } } : {}),
        ...(vote != null ? { tr: vote } : {}),
        ...(decline != null ? { td: decline } : {}),
      };
    },
    sent(pose) { if (trip && pose?.tv?.go != null) trip.goSent = true; },
    reset,
    get state() { return { trip, vote, decline, follow, near, asked, promptFor, mapPending, stay }; },
  };
}
