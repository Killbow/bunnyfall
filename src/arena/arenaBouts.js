// @ts-check

import {
  newBout, boutTick, boutHit, boutMiss, boutFell, boutYield, boutPos, boutHealth, boutAtMarks, takeBoutEvents, boutLive, boutOver, boutFighter,
  fighterShare, boutPurse, sideNames, otherNames, YIELD_SHARE,
  boutBefore,
} from './arenaBout.js';
import { BOUT_LEFT } from './arenaBook.js';
import { stripSandBarred, restoreSandHeld, SAND_CEILING_M } from './arenaKit.js';
import { makeBlow, setLiveBlow, BLOW_COLOR, BLOW } from '../ai/foeBlows.js'; import { tacticsNow } from '../ai/tacticsClock.js';
import { newCrowd, crowdHear, crowdTick, crowdBark, crowdCount, crowdFlipFps, crowdHop, verdictThrows, seatPeople, THROWN_FLOWERS, THROWN_REFUSE } from './arenaCrowd.js';
import { fighterIdentity, boutMarks, boutGateOf } from './arenaFighters.js';
import { EXHIBITION_PURSE, ladderAfter, arenaLadderRestore, arenaHash, seededRng, ladderTitle } from './arenaLadder.js';
import { ARENA_TEXT } from './arenaText.js';
import { markQuiver, refundQuiver } from './arenaQuiver.js';
import { startShotTally, stopShotTally } from '../combat/shotTally.js';
import { arenaScoreFor } from './arenaScore.js';
import { crowdSeats, pickSeats, RING_R } from '../world/arenaFloor.js';
import { arenaHudModel } from '../ui/arenaHud.js';
import { rollLeague, leagueAfterBout, laurelWorn, laurelBanner, LAUREL_FAVOUR } from './arenaLeague.js';
import { mirrorOf, mirrorEvents, mirrorHealth, walkAt, walkDone } from '../net/arenaLink.js';
import { ARENA_PUPPET_OWNER, ARENA_CHEER_MS, ARENA_FLOOR_CENTRE } from '../net/arenaLaw.js';
import { crowdShout } from './arenaCrowd.js';
import { crowdHalves, crowdHalfOf, crowdWash } from './arenaCrowd.js';
import { drawnFlat } from '../characters/nudeFlats.js';
import { newRecording, recordTick, recordStrike, recordEvent, finishRecording, keepReplay, replayOk, replayFeed, replayId, replayBoutId, playerMobileOf } from './arenaReplay.js';
import { noteAct } from '../systems/questlines/qlActs.js';

// Stands in for a critical strike only when no attack resolution was reported for the blow.
export const CRIT_SHARE = 0.15;
export const RESOLUTION_MS = 400;
export const MARK_ARRIVE_M = 0.6;
export const WALK_PACE = 0.7;
// TEXTURE.185 draws the court nobles at scale +128 for the castle hall; the stands use the -128 court scale.
export const CROWD_SCALE = Object.freeze({ 185: -128 });
export const YOU = 'you';
export const LEAVE_AFTER_MS = 2500;
export const CROWD_STAYS_MS = 25_000;
export const NEAR_M = 40;
export const FAR_M = 140;
export const BARK_SHOWN_MS = 2400;
export const THROW_MS = 900;
export const CITY_SNAP_M = 3;
export { ARENA_PUPPET_OWNER };
// The relay allowance plus wire slack, so this screen never lets through a cheer that the relay then drops.
export const CHEER_SLACK_MS = 250;
export const CHEER_GAP_MS = ARENA_CHEER_MS + CHEER_SLACK_MS;

/**
 * @param {{
 *   now?: () => number, rng?: () => number,
 *   playerEntity: any, setPlayerBout?: (b: any) => void,
 *   say?: (line: string) => void, bark?: (line: string) => void, notice?: (lines: string[]) => void,
 *   sound?: { cue: (list: any[], near?: number) => void, bed: (mood: number, near?: number) => void, stop: () => void } | null,
 *   drawHud?: (model: any, o?: any) => void,
 *   renderer?: any, getTexture?: (archive: number) => Promise<any>, uploadRecordFrame?: (a: number, r: number, f: number) => void,
 *   pay?: (gold: number) => void, heal?: () => void, crime?: () => void, ladderChanged?: (ladder: any, out: any) => void,
 *   gameMinutes?: () => number, exhibitionVerdict?: (hour: number, side: number|null|string) => void,
 * }} deps
 */
export function createArenaBouts(deps) {
  const now = deps.now ?? (() => performance.now());
  // Local bouts run on a clock that skips time the world did not run (an open window, a hidden tab), so the
  // limit and the tempers pause with it. Relay bouts and replays keep the real clock.
  let heldMs = 0, lastReal = NaN, lastLaw = -Infinity;
  const lawNow = () => (lastLaw = Math.max(lastLaw, now() - heldMs));
  const clockOf = (C) => (C?.relay ? now() : lawNow());
  const rng = deps.rng ?? Math.random;
  const P = deps.playerEntity;
  // A bout dismissed before its heal keeps its quiver mark: a session let-go dismisses first and heals after.
  let quiver = null;
  function markMine(C) { quiver = { C, mark: markQuiver(P?.items), shots: null }; startShotTally(P?.items); }
  function refundMine(C) {
    const q = quiver;
    if (!q || (C ? q.C !== C : !q.shots)) return 0;
    quiver = null;
    const n = refundQuiver(P?.items, q.mark, q.shots ?? stopShotTally());
    if (n > 0) deps.say?.(ARENA_TEXT.ammoBack(n));
    return n;
  }
  let stage = null;
  let cur = null;
  let pending = null;
  let intrusions = 0;
  let realmOf = null;
  const realmNow = () => { try { return realmOf?.() ?? null; } catch { return null; } };

  function setStage(s) {
    if (s === stage) return;
    if (cur && cur.stage !== s) dismiss();
    stage = s ?? null;
    if (stage && pending && pending.where === stage.kind) { const p = pending; pending = null; begin(p); }
  }
  function ask(p) { pending = p; if (stage && stage.kind === p.where) { pending = null; begin(p); } }
  const begin = (p) => (p.relayEx ? startExhibitionRelay(p.relayEx) : p.relay ? startRelay(p.relay) : start(p));

  const floorFeet = (xz) => { const c = stage.centre(); return [c[0] + xz[0], c[1], c[2] + xz[1]]; };
  const yawTo = (from, to) => Math.atan2(to[0] - from[0], to[1] - from[1]);

  function start(p) {
    if (!stage) return null;
    dismiss();
    const t = lawNow();
    const ladder = p.kind === 'ladder' || p.kind === 'practice';
    const practice = p.kind === 'practice';
    const seed = ladder ? arenaHash(Math.floor(t) & 0x7fffffff, 7) : p.ex.seed;
    const opps = ladder ? p.next.opponents : p.ex.opponents;
    const free = ladder && !!p.next.free;
    const id = practice ? `practice:${seed}` : ladder ? `ladder:${p.next.tier}:${p.next.bout}:${seed}` : `ex:${p.ex.hour}`;
    const specs = opps.map((o, i) => ({ ...o, i, side: free ? i + 1 : ladder ? 1 : i }));
    const sides = free ? specs.length + 1 : 2;
    const perSide = Array(sides).fill(0);
    if (ladder) perSide[0] = 1;
    for (const s of specs) perSide[s.side]++;
    const k = stage.markScale ?? 1, ax = stage.axis;
    const marks = boutMarks(sides, perSide).map((side) => side.map(([x, z]) => (ax ? [(x * ax[0] - z * ax[1]) * k, (x * ax[1] + z * ax[0]) * k] : [x * k, z * k])));
    const used = Array(sides).fill(0);
    if (ladder) used[0] = 1;
    const fighters = [];
    const tags = new Map();
    const hooks = (fid) => ({
      hurt: (foe, dmg, o) => hurtFoe(fid, foe, dmg, o),
      floor: (foe) => floorFoe(fid, foe),
      intrude: (foe) => intrude(fid, foe),
    });
    for (const s of specs) {
      const fid = `f${s.i}`;
      const who = fighterIdentity(seed, s.i, s.mobile);
      const mark = marks[s.side][used[s.side]++];
      tags.set(fid, { id, side: s.side, out: false, hold: true, hooks: hooks(fid) });
      fighters.push({ id: fid, name: who.name, side: s.side, maxHealth: 1, temper: who.temper, ai: true, home: who.home, epithet: who.epithet, spec: s, who, mark });
    }
    if (ladder) fighters.unshift({ id: YOU, name: P?.name || 'You', side: 0, maxHealth: Math.max(1, P?.maxHealth | 0), health: Math.max(1, P?.health | 0), temper: 0, ai: false, home: '', epithet: ladderTitle(P?.arenaLadder) ?? '', mark: marks[0][0] });
    cur = {
      kind: p.kind, id, seed, stage, ladder, next: ladder ? p.next : null, ex: ladder ? null : p.ex, fighters: new Map(), tags, marks,
      roster: fighters, b: null, crowd: null, you: ladder ? YOU : null, playerTag: ladder ? { id, side: 0, out: false, hold: true, kit: true } : null,
      practice, quiet: practice, ring: stage.radius ?? RING_R, lastBlow: new Map(), walking: new Set(),
      lastHealth: P?.health ?? 0, lastSheathed: null, verdictAt: NaN, doneAt: NaN, paid: false, said: false, crowdSeats: null,
      crowdBatches: [], throws: [], spawning: 0, title: false, startedAt: t, bark: '', barkAt: -Infinity, ringed: null,
      teams: boutTeams(ladder, practice, fighters),
    };
    if (ladder) { deps.setPlayerBout?.(cur.playerTag); markMine(cur); }
    const C = cur;
    for (const f of fighters) {
      if (!f.ai) continue;
      const from = stage.gates === false ? f.mark : boutGateOf(f.mark);
      const feet = floorFeet(from);
      C.spawning++;
      Promise.resolve(stage.spawn(f.spec.mobile, feet, { level: f.spec.level, elite: !!f.spec.elite, gender: f.who.gender, yaw: yawTo(from, f.mark[0] === from[0] && f.mark[1] === from[1] ? [0, 0] : f.mark), bout: tags.get(f.id) }))
        .then((foe) => {
          C.spawning--;
          // Remove the body from the stage it spawned on; the host stage may have changed since.
          if (cur !== C || !foe) { if (foe) (C.stage ?? stage)?.remove?.(foe); if (cur === C && !foe) dismiss(); return; }
          C.fighters.set(f.id, foe);
          if (foe.entity) { foe.entity.bout = tags.get(f.id); foe.entity.items = []; foe.entity.pacifyImmune = true; }
          f.maxHealth = Math.max(1, foe.entity?.maxHealth ?? foe.entity?.health ?? 1);
          f.health = Math.max(1, foe.entity?.health ?? f.maxHealth);
          if (foe.ai) { foe.ai.isHostile = !!C.ladder; foe.ai.target = null; foe.ai.yaw = yawTo(f.mark, [0, 0]); }
          if (C.spawning === 0) beginLaw(C);
        })
        .catch(() => { C.spawning--; if (cur === C) dismiss(); });
    }
    return cur;
  }

  function beginLaw(C) {
    const t = lawNow();
    const c = stage.centre();
    C.b = newBout({
      id: C.id, kind: C.practice ? 'practice' : C.ladder ? (C.next.grand ? 'grand' : C.next.champion ? 'champion' : C.next.free ? 'melee' : 'ladder') : 'exhibition',
      fighters: C.roster.map((f) => ({ id: f.id, name: f.name, side: f.side, maxHealth: f.maxHealth, health: f.health, temper: f.temper, ai: f.ai, home: f.home, epithet: f.epithet })),
      ring: { centre: [c[0], c[2]], radius: C.ring }, now: t, tier: C.ladder ? C.next.tier : C.ex.tier, label: C.ladder ? C.next.label : '',
    });
    C.crowd = newCrowd({ fighters: C.roster.map((f) => ({ id: f.id, home: f.home, ai: f.ai })), beasts: C.ladder ? !!C.next.beasts : !!C.ex.beasts });
    laurelFavour(C);
    if (!C.quiet) buildCrowd(C);
    beginRecording(C, t);
  }
  function beginRecording(C, t) {
    if (!C.ladder || C.practice || C.relay || !C.b) return;
    const sides = crowdHalves(C.b.fighters, C.teams);
    C.rec = newRecording({
      t0: t, next: C.next, sides, at: deps.gameMinutes?.() ?? 0,
      fighters: C.b.fighters.map((f) => {
        const r = C.roster.find((x) => x.id === f.id);
        return { id: f.id, name: f.name, side: f.side, mobile: f.ai ? r?.spec?.mobile : playerMobileOf(P), gender: f.ai ? r?.who?.gender : P?.gender, home: f.home, epithet: f.epithet, health: f.health, maxHealth: f.maxHealth };
      }),
    });
  }
  function recordFrame(C, t, o) {
    if (!C.rec || !stage) return;
    const c = stage.centre();
    const poses = C.rec.ids.map((id) => {
      if (id === YOU) return o.playerFeet ? [o.playerFeet[0] - c[0], o.playerFeet[2] - c[2], o.playerYaw ?? 0] : null;
      const foe = C.fighters.get(id);
      return foe?.ai?.feet ? [foe.ai.feet[0] - c[0], foe.ai.feet[2] - c[2], foe.ai.yaw ?? 0] : null;
    });
    recordTick(C.rec, t, poses, C.rec.ids.map((id) => { const f = boutFighter(C.b, id); return f ? [f.health, f.maxHealth] : null; }));
  }
  function keepRecording(C) {
    const rec = C.rec && C.b?.result ? finishRecording(C.rec, C.b.result) : null;
    C.rec = null;
    const row = P?.arenaLeague?.bouts?.[0];
    if (rec && row && Number.isFinite(row.at) && row.tier === rec.next?.tier) rec.at = row.at;
    if (rec && P) P.arenaReplays = keepReplay(P.arenaReplays, rec);
  }
  function askReplay(rec) {
    if (!replayOk(rec)) return false;
    const banners = {};
    rec.f.forEach((f, i) => { const b = rec.sides[f.s]; if (b) banners[replayId(i)] = b; });
    ask({
      where: 'floor',
      relay: {
        o: replayBoutId(rec), kind: 'pve', me: '', next: rec.next ? { ...rec.next, purse: 0 } : null, sides: rec.sides, banners,
        names: (i) => (rec.f[i] ? { name: rec.f[i].n, home: rec.f[i].h, epithet: rec.f[i].e, gender: rec.f[i].g } : null),
        send: { cheer: () => true },
        replay: { rec, feed: null },
      },
    });
    return true;
  }
  function replayFrame(C, t) {
    const R = C.relay?.replay;
    if (!R || !stage) return;
    if (!R.feed) {
      R.feed = replayFeed(R.rec, { t0: t, centre: stage.centre(), o: C.relay.o });
      if (!R.feed) { dismiss(); return; }
      for (const w of R.feed.first) relayWord(w);
      relayWord(R.feed.st);
    }
    for (const w of R.feed.due(t)) {
      if (w.k !== 'call') { relayWord(w); continue; }
      if (C.crowd) deps.sound?.cue(crowdHear(C.crowd, { k: 'call' }, { now: t }), 1);
      const nx = C.next;
      deps.say?.(nx ? ARENA_TEXT.replay.call(nx.tierName, nx.grand ? ARENA_TEXT.grandLabel : nx.champion ? ARENA_TEXT.champLabel : nx.label) : ARENA_TEXT.replay.callBare);
    }
    for (const [id, foe] of C.fighters) {
      const i = Number(String(id).slice(1));
      if (foe._pup && !foe._pup.moving && Number.isInteger(i)) foe._pup.yaw = R.feed.yawAt(i, t);
    }
  }

  function boutTeams(ladder, practice, fighters) {
    /** @type {Record<string, string>} */
    const out = {};
    if (practice) return out;
    if (ladder) { const R = realmNow(), team = R ? R.banner : leagueNow()?.team; if (team) out[YOU] = team; return out; }
    for (const f of fighters) out[f.id] = f.side === 0 ? 'red' : 'blue';
    return out;
  }
  const leagueNow = () => { const gm = deps.gameMinutes?.(); return P && Number.isFinite(gm) ? rollLeague(P.arenaLeague, gm) : null; };
  function laurelFavour(C) {
    if (C.practice) return;
    const R = realmNow();
    if (R) { laurelOf(C, R.laurel, C.ladder ? { [YOU]: R.banner } : C.teams); return; }
    const gm = deps.gameMinutes?.();
    if (!P || !Number.isFinite(gm)) return;
    if (C.ladder) { if (laurelWorn(P.arenaLeague, gm)) C.crowd.favour[YOU] = Math.min(1, (C.crowd.favour[YOU] ?? 0) + LAUREL_FAVOUR); return; }
    laurelOf(C, laurelBanner(P.arenaLeague, gm), C.teams);
  }
  // The host asks while it builds the floor instance: after the bout is asked and before its stage exists.
  function floorBanners() {
    const p = pending?.where === 'floor' ? pending : null;
    const none = { west: null, east: null };
    if (!p) return none;
    const ok = (b) => (b === 'red' || b === 'blue' ? b : null);
    if (p.relayEx) return { west: 'red', east: 'blue' };
    if (p.relay) {
      const r = p.relay;
      if (Array.isArray(r.sides)) return { west: ok(r.sides[0]), east: ok(r.sides[1]) };
      const out = { west: null, east: null };
      const put = (id, b) => { const m = /^p([01])$/.exec(String(id)); if (m && ok(b)) out[m[1] === '0' ? 'west' : 'east'] = ok(b); };
      for (const [id, b] of Object.entries(r.banners ?? {})) put(id, b);
      if (r.me) put(r.me, realmNow()?.banner);
      return out;
    }
    if (p.kind === 'exhibition') return { west: 'red', east: 'blue' };
    if (p.kind === 'ladder') { const R = realmNow(); return { west: ok(R ? R.banner : leagueNow()?.team), east: null }; }
    return none;
  }
  function laurelOf(C, won, teams) {
    if (won !== 'red' && won !== 'blue') return;
    for (const [id, team] of Object.entries(teams)) if (team === won && C.b?.fighters.some((f) => f.id === id)) C.crowd.favour[id] = Math.min(1, (C.crowd.favour[id] ?? 0) + LAUREL_FAVOUR);
  }

  function hurtFoe(fid, foe, dmg, { fromPlayer = false, striker = null } = {}) {
    const C = cur;
    // The player fights in no exhibition, so undo the blow first. The damage door reads the floor after this hook.
    if (fromPlayer && C && !C.ladder && foe?.entity) { foe.entity.health = Math.min(foe.entity.maxHealth ?? foe.entity.health, foe.entity.health + dmg); return; }
    if (!C?.b) return;
    const t = lawNow();
    if (!boutLive(C.b)) {
      if (foe?.entity) foe.entity.health = Math.min(foe.entity.maxHealth ?? foe.entity.health, foe.entity.health + dmg);
      return;
    }
    const from = fromPlayer ? (C.ladder ? YOU : null) : idOf(C, striker);
    if (!from) { boutHealth(C.b, fid, foe?.entity?.health ?? 0); return; }
    // A fighter already out strikes nothing; undo the blow so the door does not fell its target.
    if (boutFighter(C.b, from)?.out) { if (foe?.entity) foe.entity.health = Math.min(foe.entity.maxHealth ?? foe.entity.health, foe.entity.health + dmg); return; }
    const f = boutFighter(C.b, fid);
    boutHit(C.b, { from, to: fid, dmg, health: foe?.entity?.health, crit: critOf(C, fid, dmg, f?.maxHealth ?? 1, t), now: t });
  }
  function critOf(C, to, dmg, maxHealth, t) {
    const r = C.lastBlow.get(to);
    if (r && t - r.at <= RESOLUTION_MS) { C.lastBlow.delete(to); return r.critical; }
    return dmg >= maxHealth * CRIT_SHARE;
  }
  const idOfEntity = (C, ent) => {
    if (!ent) return null;
    if (C.ladder && ent === P) return YOU;
    for (const [id, foe] of C.fighters) if (foe.entity === ent) return id;
    return null;
  };
  function attackResolved(r) {
    const C = cur;
    if (C?.relay) return;
    if (!C?.b || !boutLive(C.b) || !r) return;
    const from = idOfEntity(C, r.attacker), to = idOfEntity(C, r.target);
    if (!from || !to || from === to) return;
    const a = boutFighter(C.b, from), b = boutFighter(C.b, to);
    if (!a || !b || a.side === b.side) return;
    const t = lawNow();
    if (from !== YOU) recordStrike(C.rec, t, from);
    if (!(r.damage > 0)) boutMiss(C.b, { from, now: t });
    else { C.lastBlow.set(to, { critical: !!r.critical, at: t }); if (to === YOU) C.hitMe = { from, at: t }; }
  }
  // Hosts return before the damage roll on a dodge, so attackResolved never hears it; the miss is counted here.
  function blowDodged(ai) {
    const C = cur;
    if (!ai || C?.relay || !C?.b || !boutLive(C.b)) return;
    let from = null;
    for (const [fid, foe] of C.fighters) if (foe.ai === ai) { from = fid; break; }
    const a = from ? boutFighter(C.b, from) : null;
    if (!a || a.out) return;
    const t = lawNow();
    recordStrike(C.rec, t, from);
    boutMiss(C.b, { from, now: t });
  }
  function playerSwing(struck) {
    const C = cur;
    if (C?.relay) {
      if (!C.you || !C.b || !boutLive(C.b) || struck > 0) return;
      const me = boutFighter(C.b, C.you);
      const foe = C.b.fighters.find((f) => !f.out && me && f.side !== me.side);
      if (me && !me.out && foe) C.relay.send?.hit?.({ k: 'hit', i: foe.id, d: 0, r: 0 });
      return;
    }
    if (C?.ladder && C.b && boutLive(C.b)) recordStrike(C.rec, lawNow(), YOU);
    if (!C?.ladder || !C.b || !boutLive(C.b) || struck > 0) return;
    const you = boutFighter(C.b, YOU);
    if (you && !you.out) boutMiss(C.b, { from: YOU, now: lawNow() });
  }
  function floorFoe(fid, foe) {
    const C = cur;
    if (!C?.b) return;
    if (!boutLive(C.b)) { if (foe?.entity) foe.entity.health = Math.max(foe.entity.health, 1); return; }
    boutFell(C.b, fid, lawNow());
    standDown(foe);
  }
  function intrude(fid, foe) {
    const C = cur;
    if (!C) return;
    if (C.ladder && C.b && !boutLive(C.b) && !boutOver(C.b)) { deps.say?.(ARENA_TEXT.herald.waitWord); return; }
    if (C.ladder) return;
    intrusions++;
    if (intrusions === 1) deps.say?.(ARENA_TEXT.herald.intrude);
    else { deps.say?.(ARENA_TEXT.herald.intrudeCrime); deps.crime?.(); }
  }
  const idOf = (C, foe) => { if (!foe) return null; for (const [id, f] of C.fighters) if (f === foe) return id; return null; };
  function standDown(foe) {
    if (!foe) return;
    if (foe.entity?.bout) foe.entity.bout.out = true;
    if (foe.ai) { foe.ai.target = null; foe.ai.secondaryTarget = null; foe.ai.isHostile = false; }
  }

  function playerSpare() {
    const C = cur;
    if (C?.relay) return C.you && C.b && boutLive(C.b) ? { spare: () => {} } : null;
    // Hold the player from the word until the heal ends, since arrows, spells, and poison can land after the fight.
    if (!C?.ladder || !C.b || boutBefore(C.b) || C.b.phase === 'done') return null;
    return { spare: () => { if (cur === C && C.b && boutLive(C.b)) { boutFell(C.b, YOU, lawNow()); } } };
  }
  const holds = () => !!cur?.ladder && !!cur.b && cur.b.phase !== 'done';

  function frame(dt, o = {}) {
    const real = now();
    if (Number.isFinite(lastReal)) heldMs += real - lastReal - Math.max(0, Number(dt) || 0) * 1000;
    lastReal = real;
    const C = cur;
    const t = clockOf(C);
    if (C?.relay?.replay) replayFrame(C, t);
    if (C?.relay) { relayFrame(C, dt, o, t); return; }
    if (!C || !C.b) { deps.drawHud?.(null, { hidden: true }); return; }
    const c = stage?.centre?.() ?? null;
    const near = c && o.playerFeet ? nearOf(Math.hypot(o.playerFeet[0] - c[0], o.playerFeet[2] - c[2])) : (C.stage?.kind === 'floor' ? 1 : 0);
    for (const [fid, foe] of C.fighters) {
      const tag = C.tags.get(fid);
      // A vanished body is no fall: something outside the bout removed it, so a ladder bout is void.
      if (foe.dead) {
        if (boutLive(C.b) && !boutFighter(C.b, fid)?.out) { if (!C.ex && !boutFighter(C.b, YOU)?.out) { voidBout(C); return; } boutFell(C.b, fid, t); }
        continue;
      }
      if (foe.ai?.feet) boutPos(C.b, fid, [foe.ai.feet[0], foe.ai.feet[2]]);
      if (tag) tag.hold = !boutLive(C.b);
      if (C.walking.has(fid) && arrived(C, fid, foe)) {
        C.walking.delete(fid);
        if (foe.ai) { foe.ai.walkGoal = null; foe.ai.yaw = yawTo(markOf(C, fid), [0, 0]); }
        if (C.b.phase === 'walk') boutAtMarks(C.b, fid, t);
      }
    }
    if (C.playerTag) C.playerTag.hold = !boutLive(C.b);
    if (C.ladder && P) {
      if (boutLive(C.b)) stripSandBarred(P);
      const h = P.health ?? 0;
      if (boutLive(C.b) && h < C.lastHealth) {
        const from = attackerOfMe(C, o.playerFeet);
        if (from) boutHit(C.b, { from, to: YOU, dmg: C.lastHealth - h, health: h, crit: critOf(C, YOU, C.lastHealth - h, P.maxHealth || 1, t), now: t });
        else boutHealth(C.b, YOU, h);
      } else if (h !== C.lastHealth) boutHealth(C.b, YOU, h);
      C.lastHealth = h;
      if (o.playerFeet) boutPos(C.b, YOU, [o.playerFeet[0], o.playerFeet[2]]);
      const you = boutFighter(C.b, YOU);
      if (o.sheathed != null) {
        if (C.lastSheathed === false && o.sheathed === true && boutLive(C.b) && you && !you.out) {
          const no = boutYield(C.b, YOU, t);
          if (no === 'early' && fighterShare(you) > YIELD_SHARE) deps.say?.(ARENA_TEXT.refuse.yieldEarly);
        }
        C.lastSheathed = !!o.sheathed;
      }
    }
    boutTick(C.b, t, rng);
    for (const e of takeBoutEvents(C.b)) { recordEvent(C.rec, e); hear(C, e, t, near); }
    recordFrame(C, t, o);
    for (const tag of C.tags.values()) tag.hold = !boutLive(C.b);
    if (C.playerTag) C.playerTag.hold = !boutLive(C.b);
    crowdTick(C.crowd, dt);
    if (!C.quiet) deps.sound?.bed(C.crowd.mood, near);
    for (const f of C.b.fighters) {
      const foe = C.fighters.get(f.id);
      if (foe && (f.out || boutOver(C.b))) { standDown(foe); if (C.tags.get(f.id)) C.tags.get(f.id).out = !!f.out || boutOver(C.b); }
    }
    if (C.playerTag && (boutOver(C.b) || boutFighter(C.b, YOU)?.out)) C.playerTag.out = true;
    if (C.b.phase === 'done' && !Number.isFinite(C.doneAt)) { C.doneAt = t; keepRecording(C); }
    if (Number.isFinite(C.doneAt) && t - C.doneAt >= LEAVE_AFTER_MS && C.fighters.size) {
      for (const foe of C.fighters.values()) (C.stage ?? stage)?.remove?.(foe);
      C.fighters.clear();
      deps.setPlayerBout?.(null);
    }
    if (Number.isFinite(C.doneAt) && t - C.doneAt >= CROWD_STAYS_MS && C.stage?.kind === 'city') { dismiss(); return; }
    const bark = t - C.barkAt < BARK_SHOWN_MS ? C.bark : '';
    deps.drawHud?.(near > 0 ? arenaHudModel(C.b, C.crowd, t, { you: C.you, stamina: o.stamina ?? null, bark, quiet: C.quiet, teams: C.teams }) : null, { hidden: !!o.hidden, touch: !!o.touch });
    crowdFrame(C, t);
  }
  const nearOf = (d) => (d <= NEAR_M ? 1 : d >= FAR_M ? 0 : 1 - (d - NEAR_M) / (FAR_M - NEAR_M));
  const markOf = (C, fid) => C.roster.find((f) => f.id === fid)?.mark ?? [0, 0];
  function arrived(C, fid, foe) {
    if (!foe.ai?.feet) return true;
    if (foe.ai.walkArrived) return true;
    const m = floorFeet(markOf(C, fid));
    return Math.hypot(foe.ai.feet[0] - m[0], foe.ai.feet[2] - m[2]) <= MARK_ARRIVE_M;
  }
  function walkIn(C, fid) {
    const foe = C.fighters.get(fid);
    if (!foe?.ai || C.walking.has(fid)) return;
    C.walking.add(fid);
    if (arrived(C, fid, foe)) return;
    if (typeof foe.ai.walkTo === 'function') foe.ai.walkTo(floorFeet(markOf(C, fid)), { pace: WALK_PACE });
  }
  function attackerOfMe(C, feet) {
    const told = C.hitMe;
    C.hitMe = null;
    if (told && lawNow() - told.at <= RESOLUTION_MS && !boutFighter(C.b, told.from)?.out) return told.from;
    let best = null, bd = Infinity;
    for (const [fid, foe] of C.fighters) {
      const f = boutFighter(C.b, fid);
      if (!f || f.out || f.side === 0 || !foe.ai?.feet) continue;
      const tgt = foe.ai.target;
      const d = feet ? Math.hypot(foe.ai.feet[0] - feet[0], foe.ai.feet[2] - feet[2]) : 0;
      const k = (tgt && tgt.isPlayer ? 0 : 50) + d;
      if (k < bd) { bd = k; best = fid; }
    }
    return best;
  }

  function hear(C, e, t, near) {
    const title = C.ladder && !!C.next?.champion && C.b.result?.side === (C.relay ? boutFighter(C.b, C.you)?.side : 0);
    const cues = crowdHear(C.crowd, e, { share: (id) => { const f = boutFighter(C.b, id); return f ? fighterShare(f) : 1; }, title, now: t });
    if (!C.quiet) {
      deps.sound?.cue(cues, near);
      if (near > 0.3) { const line = crowdBark(C.crowd, e, t, rng); if (line) { C.bark = line; C.barkAt = t; deps.bark?.(line); } }
    }
    const say = (line) => { if (near > 0.3) deps.say?.(line); };
    switch (e.k) {
      case 'call':
        if (C.relay && !C.next && !C.ex) { say(C.relay.casual ? ARENA_TEXT.call.casual : ARENA_TEXT.call.players); break; }
        say(C.practice ? ARENA_TEXT.undercroft.practiceCall : C.ladder ? (C.next.grand ? ARENA_TEXT.call.grand : C.next.champion ? ARENA_TEXT.call.champion(C.next.tierName) : C.next.free ? ARENA_TEXT.call.melee : ARENA_TEXT.call.ladder(C.next.tierName, C.next.label)) : ARENA_TEXT.call.exhibition);
        break;
      case 'crier': {
        const f = boutFighter(C.b, e.a);
        if (f) say(ARENA_TEXT.call.fighter(`${f.name}, ${f.epithet || ''}`.replace(/, $/, ''), f.ai ? f.home : ''));
        if (f?.ai && !C.relay) walkIn(C, f.id);
        break;
      }
      case 'walk':
        say(ARENA_TEXT.call.marks);
        if (C.relay) break;
        for (const f of C.b.fighters) {
          if (!f.ai) { boutAtMarks(C.b, f.id, t); continue; }
          walkIn(C, f.id);
          const foe = C.fighters.get(f.id);
          if (!foe || arrived(C, f.id, foe)) { C.walking.delete(f.id); boutAtMarks(C.b, f.id, t); }
        }
        break;
      case 'count':
        for (const fid of C.walking) { const foe = C.fighters.get(fid); if (foe?.ai) { foe.ai.walkGoal = null; foe.ai.yaw = yawTo(markOf(C, fid), [0, 0]); } }
        C.walking.clear();
        say(ARENA_TEXT.count[3 - (e.n ?? 3)]);
        break;
      case 'fight': say(ARENA_TEXT.count[3]); break;
      case 'verdict': if (C.relay) relayVerdict(C, t); else verdict(C, t); break;
      case 'heal': heal(C); break;
      default: break;
    }
  }

  function verdict(C, t) {
    const r = C.b.result;
    C.verdictAt = t;
    if (!r) return;
    const V = ARENA_TEXT.verdict;
    const w = r.side === null ? '' : sideNames(C.b, r.side), l = r.side === null ? '' : otherNames(C.b, r.side);
    const line = r.side === null ? V.draw : r.how === 'judges' ? V.judges(w) : r.how === 'yield' ? V.yield(w, l) : r.how === 'ringout' ? V.ringout(w, l) : V.fall(w, l);
    deps.say?.(line);
    const throws = verdictThrows(C.crowd, r.winners, r.losers);
    throwAt(C, r.winners, throws.flowers, THROWN_FLOWERS);
    throwAt(C, [...r.losers, ...r.winners], throws.refuse, THROWN_REFUSE);
    if (C.practice) {
      const U = ARENA_TEXT.undercroft;
      deps.notice?.([line, r.side === null ? U.practiceDraw : r.side === 0 ? U.practiceWon : U.practiceLost]);
    } else if (C.ladder) {
      const won = r.side === 0;
      if (won) noteAct('arena-won');
      const purse = won ? boutPurse(C.next.purse, C.crowd.favour[YOU] ?? 0) : 0;
      if (won && purse > 0 && !C.paid) { C.paid = true; deps.pay?.(purse); }
      const fav = C.crowd.favour[YOU] ?? 0;
      const pline = !won ? ARENA_TEXT.purse.lost : C.next.repeat ? ARENA_TEXT.purse.repeat : fav >= 0.25 ? ARENA_TEXT.purse.favoured(purse) : fav <= -0.25 ? ARENA_TEXT.purse.hated(purse) : ARENA_TEXT.purse.won(purse);
      const before = arenaLadderRestore(P?.arenaLadder);
      const out = ladderAfter(before, { won, how: r.side === null ? 'draw' : (boutFighter(C.b, YOU)?.out ?? r.how), purse });
      if (P) P.arenaLadder = out.ladder;
      const lines = [line, pline];
      if (out.grand) lines.push(V.grand(P?.name || 'You'));
      else if (out.title) lines.push(V.tier(P?.name || 'You', ARENA_TEXT.tiers[C.next.tier]));
      if (out.tierUp) lines.push(ARENA_TEXT.ladder.tierUp(ARENA_TEXT.tiers[out.ladder.tier]));
      else if (out.runLost) lines.push(ARENA_TEXT.ladder.runLost(ARENA_TEXT.tiers[out.ladder.tier]));
      else if (won && !C.next.champion) lines.push(out.ladder.won >= 3 ? ARENA_TEXT.ladder.champOpen(ARENA_TEXT.tiers[out.ladder.tier]) : ARENA_TEXT.ladder.boutWon(out.ladder.won));
      const gm = deps.gameMinutes?.();
      if (P && Number.isFinite(gm)) {
        const opp = C.roster.filter((f) => f.ai).map((f) => f.name).join(', ');
        const league = leagueAfterBout(P.arenaLeague, { gameMinutes: gm, tier: C.next.tier, label: C.next.label, opp, won, how: r.side === null ? 'draw' : won ? r.how : (boutFighter(C.b, YOU)?.out ?? r.how), purse, repeat: !!C.next.repeat, champion: C.next.champion, grand: C.next.grand });
        P.arenaLeague = league;
        const pts = league.bouts[0]?.points ?? 0;
        if (pts > 0 && league.team) lines.push(ARENA_TEXT.ladder.points(pts, ARENA_TEXT.teams.the[league.team]));
      }
      deps.ladderChanged?.(out.ladder, out);
      deps.notice?.(lines);
    } else {
      if (r.side !== null) { C.bark = ARENA_TEXT.purse.won(EXHIBITION_PURSE); C.barkAt = t; }
      deps.exhibitionVerdict?.(C.ex.hour, r.side);
    }
  }
  function voidBout(C) {
    deps.say?.(ARENA_TEXT.verdict.void);
    if (C.ladder) { deps.heal?.(); refundMine(C); }
    dismiss();
  }
  function kitBout(C) { return C?.relay ? C.relay.kind === 'pve' && !!C.you : !!C?.ladder; }
  function heal(C) {
    if (C.relay) { if (C.you) { deps.heal?.(); deps.say?.(ARENA_TEXT.healed); refundMine(C); restoreSandHeld(P); } return; }
    if (C.ladder) { deps.heal?.(); deps.say?.(ARENA_TEXT.healed); refundMine(C); restoreSandHeld(P); C.lastHealth = P?.health ?? C.lastHealth; }
    for (const foe of C.fighters.values()) if (foe.entity) foe.entity.health = foe.entity.maxHealth ?? foe.entity.health;
  }

  async function buildCrowd(C) {
    const r = deps.renderer;
    if (!r?.createBillboardBatch || !deps.getTexture || !stage?.heightAt) return;
    const c = stage.centre();
    const seats = crowdSeats((x, z) => { const h = stage.heightAt(c[0] + x, c[2] + z); return Number.isFinite(h) ? h - c[1] : null; });
    const nx = C.next;
    const n = crowdCount({ kind: nx ? 'ladder' : 'exhibition', tier: nx ? nx.tier : C.ex?.tier ?? 0, champion: !!nx?.champion, grand: !!nx?.grand });
    const sat = seatPeople(pickSeats(seats, n, seededRng(arenaHash(C.seed, 3))), seededRng(arenaHash(C.seed, 4)));
    const halves = crowdHalves(C.b?.fighters ?? C.roster, C.teams);
    const split = !!(halves[0] || halves[1]);
    const groups = new Map();
    for (const s of sat) {
      const side = split ? crowdHalfOf(s.x) : 0;
      const [archive, record] = drawnFlat(s.archive, s.record);
      const k = `${archive}:${record}:${s.phase < 0.5 ? 0 : 1}:${side}`;
      if (!groups.has(k)) groups.set(k, { archive, record, half: s.phase < 0.5 ? 0 : 1, tint: split ? crowdWash(halves[side]) : null, at: [] });
      groups.get(k).at.push([s.x, s.y, s.z]);
    }
    const batches = [];
    for (const g of groups.values()) {
      let tex;
      try { tex = await deps.getTexture(g.archive); } catch { continue; }
      // The bout can end while a texture loads; destroy the batches already made so their GPU buffers are not lost.
      if (cur !== C) { for (const x of batches) r.destroyBillboardBatch?.(x.batch); return; }
      const size = sizeOf(tex, g.record, CROWD_SCALE[g.archive]);
      const frames = Math.max(1, tex?.getFrameCount?.(g.record) ?? 1);
      const batch = r.createBillboardBatch(g.archive, g.record, size, g.at);
      if (g.tint) batch.tint = g.tint;
      batches.push({ batch, archive: g.archive, record: g.record, frames, half: g.half, origin: [0, 0, 0], size, uploaded: new Set() });
    }
    if (cur !== C) { for (const x of batches) r.destroyBillboardBatch?.(x.batch); return; }
    C.crowdBatches = batches;
  }
  const sizeOf = (tex, record, scale = null) => {
    try { const s = tex.getSize(record), k = scale == null ? tex.getScale(record) : { width: scale, height: scale }; return { w: (s.width + Math.trunc(s.width * (k.width / 256))) * 0.025, h: (s.height + Math.trunc(s.height * (k.height / 256))) * 0.025 }; } catch { return { w: 1.1, h: 1.95 }; }
  };
  function crowdFrame(C, t) {
    if (!C.crowdBatches.length || !stage) return;
    const c = stage.centre();
    const fps = crowdFlipFps(C.crowd.mood);
    const hop = crowdHop(C.crowd, t);
    for (const x of C.crowdBatches) {
      x.origin[0] = c[0]; x.origin[1] = c[1] + (x.half ? hop : hop * 0.6); x.origin[2] = c[2];
      x.batch.origin = x.origin;
      if (x.frames > 1) {
        const f = Math.floor((t / 1000) * fps + x.half * 0.5 * x.frames) % x.frames;
        if (!x.uploaded.has(f)) { x.uploaded.add(f); deps.uploadRecordFrame?.(x.archive, x.record, f); }
        x.batch.record = `${x.record}#${f}`;
      }
    }
    for (const th of C.throws) {
      const k = Math.min(1, (t - th.at) / THROW_MS);
      const y = th.from[1] + (th.to[1] - th.from[1]) * k + Math.sin(Math.PI * k) * 3;
      th.origin[0] = c[0] + th.from[0] + (th.to[0] - th.from[0]) * k; th.origin[1] = c[1] + y; th.origin[2] = c[2] + th.from[2] + (th.to[2] - th.from[2]) * k;
      th.batch.origin = th.origin;
    }
  }
  async function throwAt(C, ids, count, kinds) {
    const r = deps.renderer;
    if (!(count > 0) || !r?.createBillboardBatch || !deps.getTexture || !C.crowdBatches.length) return;
    const c = stage.centre();
    const dice = seededRng(arenaHash(C.seed, 9 + count));
    const at = ids.map((id) => C.fighters.get(id)?.ai?.feet ?? null).filter(Boolean).map((f) => [f[0] - c[0], f[2] - c[2]]);
    for (let i = 0; i < count; i++) {
      const [archive, record] = kinds[Math.floor(dice() * kinds.length)];
      let tex;
      try { tex = await deps.getTexture(archive); } catch { return; }
      if (cur !== C) return;
      const size = sizeOf(tex, record);
      const small = { w: size.w * 0.6, h: size.h * 0.6 };
      const a = dice() * Math.PI * 2, r0 = 22 + dice() * 6;
      const target = at.length ? at[Math.floor(dice() * at.length)] : [0, 0];
      const to = [target[0] + (dice() - 0.5) * 5, 0, target[1] + (dice() - 0.5) * 5];
      const batch = r.createBillboardBatch(archive, record, small, [[0, 0, 0]]);
      C.throws.push({ batch, from: [Math.cos(a) * r0, 8, Math.sin(a) * r0], to, at: clockOf(C) + dice() * 600, origin: [0, 0, 0] });
    }
  }
  function batches() {
    if (!cur) return [];
    const out = [];
    for (const x of cur.crowdBatches) out.push(x.batch);
    for (const th of cur.throws) out.push(th.batch);
    return out;
  }

  /**
   * @param {{ o: string, kind: 'pvp'|'pve', me?: string, next?: any, send?: { hit?: (w: any) => boolean, yield?: () => boolean, cheer?: (dir: number) => boolean },
   *   names?: (i: number, mobile: number) => any, onEnd?: (r: any) => void, struck?: (d: number) => void, myHealth?: (hp: number, max: number) => void,
   *   banners?: Record<string, string|null>, owe?: (gold: number, pay: (g: number) => void) => void }} p
   */
  function startRelay(p) {
    if (!stage) { pending = { where: 'floor', relay: p }; return null; }
    dismiss();
    const t = now();
    cur = {
      kind: 'relay', relay: p, id: p.o, seed: 0, stage, ladder: !!p.me, next: p.next ?? null, ex: null, fighters: new Map(), tags: new Map(), marks: [],
      roster: [], b: null, crowd: null, you: p.me || null, playerTag: null, practice: false, quiet: false, ring: stage.radius ?? RING_R,
      lastBlow: new Map(), walking: new Set(), lastHealth: P?.health ?? 0, lastSheathed: null, verdictAt: NaN, doneAt: NaN, paid: false,
      said: false, crowdSeats: null, crowdBatches: [], throws: [], spawning: 0, title: false, startedAt: t, bark: '', barkAt: -Infinity,
      ringed: null, teams: {}, clock: { off: null }, mv: new Map(), M: null, spawned: false,
      cheerAt: -Infinity, ownShout: null,
    };
    return cur;
  }
  function relayBanners(C) {
    // An exhibition keeps its own red and blue sides, which this function would otherwise overwrite.
    if (C.ex) return;
    const R = realmNow();
    /** @type {Record<string, string>} */
    const out = {};
    for (const [id, b] of Object.entries(C.relay.banners ?? {})) if (b === 'red' || b === 'blue') out[id] = b;
    // A private session fixes its own sides, so the realm banner does not override them.
    if (C.you && !C.relay.fixed && (R?.banner === 'red' || R?.banner === 'blue')) out[C.you] = R.banner;
    C.teams = out;
    laurelOf(C, C.relay.fixed ? null : R?.laurel ?? null, out);
  }
  function cheer(dir) {
    const C = cur;
    if (!C?.relay || C.you || !C.b || !C.crowd || boutOver(C.b) || (dir !== 1 && dir !== -1)) return false;
    const t = now();
    if (t - C.cheerAt < CHEER_GAP_MS) return false;
    if (C.relay.send?.cheer?.(dir) !== true) return false;
    C.cheerAt = t;
    C.ownShout = { c: dir, at: t };
    deps.sound?.cue(crowdShout(C.crowd, dir, 1, t), 1);
    return true;
  }
  const cheerDoor = (dir) => cheer(dir);
  function relayWord(w) {
    const C = cur;
    if (!C?.relay || !w) return false;
    const t = now();
    const near = C.near ?? 1;
    if (w.k === 'st') {
      if (w.o !== C.relay.o) return false;
      const first = !C.M;
      C.M = mirrorOf(w, t, { prev: C.M, off: C.clock.off ?? 0, names: C.relay.names ?? (() => null) });
      C.b = C.M.b; C.seed = C.M.seed; C.you = C.M.me || null; C.ladder = !!C.you;
      if (first) {
        C.crowd = newCrowd({ fighters: C.b.fighters.map((f) => ({ id: f.id, home: f.home, ai: f.ai })), beasts: !!C.next?.beasts });
        relayBanners(C);
        if (C.you) { C.playerTag = { id: C.relay.o, side: C.b.fighters.find((f) => f.id === C.you)?.side ?? 0, out: false, hold: true, ...(kitBout(C) ? { kit: true } : {}) }; deps.setPlayerBout?.(C.playerTag); markMine(C); }
        buildCrowd(C);
        for (const a of C.M.ai) spawnPuppet(C, a);
      }
      return true;
    }
    if (!C.b) return w.k === 'mv' ? (C.mv.set(w.i, w), true) : false;
    switch (w.k) {
      case 'ev': for (const e of mirrorEvents(C.M, w.e, t, C.clock)) hear(C, e, t, near); break;
      case 'hp': {
        const mine = mirrorHealth(C.M, w.h);
        if (mine && P) {
          const [hp, max] = mine;
          const h = Math.max(1, Math.round((hp / Math.max(1, max)) * Math.max(1, P.maxHealth ?? 1)));
          // Once the healers come, no relay word lowers the player's health; a word that raises it still applies.
          const healed = C.b.phase === 'heal' || C.b.phase === 'done';
          if (!(healed && h < (P.health ?? h))) {
            if (h < (P.health ?? h)) C.relay.struck?.(Math.round((P.health ?? h) - h));
            C.relay.myHealth?.(h, P.maxHealth ?? h);
            C.lastHealth = h;
          }
        }
        break;
      }
      case 'mv': C.mv.set(w.i, w); break;
      case 'atk': {
        const foe = C.fighters.get(w.i);
        // A telegraphed blow swings at its landing in relayFrame, not at the word, so the ground mark fills first.
        if (foe?._pup) { if (!w.s) foe._pup.strike = 'melee'; foe._pup.yaw = Math.atan2(w.x - (foe.ai?.feet?.[0] ?? w.x), w.z - (foe.ai?.feet?.[2] ?? w.z)); }
        if (w.s && foe?.ai?.feet) {
          const land = relayLandLocal(C, w, t);
          const p = relayToStage(C, w.ox, w.oz);
          const blow = makeBlow(w.s, [p[0], foe.ai.feet[1], p[1]], w.yw, tacticsNow() + (land - t) / 1000 - BLOW[w.s].windup, BLOW_COLOR);
          blow.sand = true;
          setLiveBlow(foe.ai, blow);
          foe._swingAt = land;
        }
        break;
      }
      case 'blow': break;
      case 'cr': {
        // The local crowd heard the player's own shout at the press, so its echo is heard only for the others.
        const own = C.ownShout && C.ownShout.c === w.c && t - C.ownShout.at <= ARENA_CHEER_MS;
        if (own) C.ownShout = null;
        const n = own ? w.n - 1 : w.n;
        if (n > 0) deps.sound?.cue(crowdShout(C.crowd, w.c, n, t), near);
        break;
      }
      default: return false;
    }
    return true;
  }
  function spawnPuppet(C, a) {
    const mv = C.mv.get(a.id);
    const at = mv ? relayToStage(C, mv.x, mv.z) : null;
    const c = stage.centre();
    const feet = at ? [at[0], c[1], at[1]] : [c[0], c[1], c[2]];
    const who = C.b.fighters.find((f) => f.id === a.id);
    const tag = { id: C.relay.o, side: who?.side ?? 1, out: false, hold: true, hooks: C.ex ? { intrude: (foe) => intrude(a.id, foe) } : {} };
    C.tags.set(a.id, tag);
    C.spawning++;
    Promise.resolve(stage.spawn(a.mobile, feet, { level: null, elite: C.relay.kind === 'pve' && !!C.relay.next?.champion, gender: C.relay.names?.(a.i, a.mobile)?.gender, yaw: Math.atan2(c[0] - feet[0], c[2] - feet[2]), bout: tag, mirror: true }))
      .then((foe) => {
        C.spawning--;
        if (cur !== C || !foe) { if (foe) (C.stage ?? stage)?.remove?.(foe); return; }
        foe._ownFrom = ARENA_PUPPET_OWNER; foe._ownI = a.i;
        foe._pup = { feet: [...foe.ai.feet], yaw: foe.ai.yaw ?? 0, moving: false, strike: null, target: '', cast: null };
        if (foe.entity) { foe.entity.bout = tag; foe.entity.items = []; }
        if (foe.ai) { foe.ai.isHostile = false; foe.ai.target = null; }
        C.fighters.set(a.id, foe);
      })
      .catch(() => { C.spawning--; });
  }
  function relayLandLocal(C, w, t) {
    const wind = (BLOW[w.s]?.windup ?? 0) * 1000;
    return Number.isFinite(w.at) ? Math.max(t, Math.min(t + wind, w.at - (C.clock.off ?? 0))) : t + wind;
  }
  function relayFrame(C, dt, o, t) {
    if (!C.b) { deps.drawHud?.(null, { hidden: true }); return; }
    for (const foe of C.fighters.values()) {
      if (foe._swingAt == null || t < foe._swingAt) continue;
      foe._swingAt = null;
      if (foe._pup) foe._pup.strike = 'melee';
      else if (foe.attack) { foe.attack.firedRanged = false; foe.attack.swingSeq = (foe.attack.swingSeq | 0) + 1; }
    }
    if (C.you && P && kitBout(C) && boutLive(C.b)) stripSandBarred(P);
    const off = C.clock.off ?? 0;
    const c = stage?.centre?.() ?? null;
    const near = C.near = C.stage?.kind === 'city' ? (c && o.playerFeet ? nearOf(Math.hypot(o.playerFeet[0] - c[0], o.playerFeet[2] - c[2])) : 0) : 1;
    if (C.stage?.kind === 'city') cityBodiesFrame(C, t, off);
    for (const [id, foe] of C.fighters) {
      const mv = C.mv.get(id);
      if (!mv || !foe._pup || !c) continue;
      const w = walkAt(mv, t, off);
      const p = w ? relayToStage(C, w[0], w[1]) : null;
      if (!p) continue;
      foe._pup.feet[0] = p[0]; foe._pup.feet[2] = p[1];
      if (Number.isFinite(foe.ai?.feet?.[1])) foe._pup.feet[1] = foe.ai.feet[1];
      foe._pup.moving = !walkDone(mv, t, off);
      if (foe._pup.moving) foe._pup.yaw = Math.atan2(mv.tx - mv.x, mv.tz - mv.z);
      const f = boutFighter(C.b, id);
      if (f?.out) { foe._pup.moving = false; standDown(foe); }
    }
    const you = C.you ? boutFighter(C.b, C.you) : null;
    if (you && o.sheathed != null) {
      if (C.lastSheathed === false && o.sheathed === true && boutLive(C.b) && !you.out) {
        if (fighterShare(you) > YIELD_SHARE) deps.say?.(ARENA_TEXT.refuse.yieldEarly);
        else C.relay.send?.yield?.();
      }
      C.lastSheathed = !!o.sheathed;
    }
    if (C.playerTag) { C.playerTag.hold = !boutLive(C.b); if (you?.out || boutOver(C.b)) C.playerTag.out = true; }
    crowdTick(C.crowd, dt);
    deps.sound?.bed(C.crowd.mood, near);
    if (C.b.phase === 'done' && !Number.isFinite(C.doneAt)) C.doneAt = t;
    if (Number.isFinite(C.doneAt) && t - C.doneAt >= LEAVE_AFTER_MS && C.fighters.size) {
      for (const foe of C.fighters.values()) (C.stage ?? stage)?.remove?.(foe);
      C.fighters.clear();
      deps.setPlayerBout?.(null);
    }
    if (Number.isFinite(C.doneAt) && t - C.doneAt >= CROWD_STAYS_MS && C.stage?.kind === 'city') { dismiss(); return; }
    const bark = t - C.barkAt < BARK_SHOWN_MS ? C.bark : '';
    const stands = C.you || typeof C.relay.send?.cheer !== 'function' ? null : { ready: t - C.cheerAt >= CHEER_GAP_MS };
    deps.drawHud?.(near > 0 ? arenaHudModel(C.b, C.crowd, t, { you: C.you, stamina: o.stamina ?? null, bark, quiet: false, teams: C.teams, stands }) : null, { hidden: !!o.hidden, touch: !!o.touch, cheer: stands ? cheerDoor : null });
    crowdFrame(C, t);
  }
  function relayVerdict(C, t) {
    const r = C.b.result;
    C.verdictAt = t;
    if (!r) return;
    const V = ARENA_TEXT.verdict;
    const w = r.side === null ? '' : sideNames(C.b, r.side), l = r.side === null ? '' : otherNames(C.b, r.side);
    const line = r.side === null ? V.draw : r.how === 'judges' ? V.judges(w) : r.how === 'yield' ? V.yield(w, l) : r.how === 'ringout' ? V.ringout(w, l) : r.how === 'forfeit' ? V.forfeit(w, l) : V.fall(w, l);
    deps.say?.(line);
    const throws = verdictThrows(C.crowd, r.winners, r.losers);
    throwAt(C, r.winners, throws.flowers, THROWN_FLOWERS);
    throwAt(C, [...r.losers, ...r.winners], throws.refuse, THROWN_REFUSE);
    const mine = C.you ? boutFighter(C.b, C.you) : null;
    const won = !!mine && r.side === mine.side;
    if (won && C.relay.kind === 'pve') noteAct('arena-won');
    const lines = [line];
    if (C.relay.kind === 'pve' && mine) {
      const purse = won ? boutPurse(C.next?.purse ?? 0, C.crowd.favour[C.you] ?? 0) : 0;
      // Online the purse waits for the account service, so a win the realm refuses pays nothing.
      if (won && purse > 0 && !C.paid) { C.paid = true; if (C.relay.owe) C.relay.owe(purse, (g) => deps.pay?.(g)); else deps.pay?.(purse); }
      lines.push(!won ? ARENA_TEXT.purse.lost : C.next?.repeat ? ARENA_TEXT.purse.repeat : ARENA_TEXT.purse.won(purse));
      if (won && C.next?.grand) lines.push(V.grand(P?.name || 'You'));
      else if (won && C.next?.champion) lines.push(V.tier(P?.name || 'You', ARENA_TEXT.tiers[C.next.tier]));
    }
    C.relay.onEnd?.({ won, side: r.side, how: r.how, lines });
    if (mine) deps.notice?.(lines);
  }

  /**
   * @param {{ o: string, ex: any, names?: (i: number, mobile: number) => any, onEnd?: (r: any) => void, send?: { cheer?: (dir: number) => boolean } }} p
   */
  function startExhibitionRelay(p) {
    const ex = p.ex;
    const C = startRelay(/** @type {any} */ ({
      ...p, kind: 'ex', me: '', next: null, send: { cheer: p.send?.cheer },
      onEnd: (r) => {
        if (cur === C && r.side !== null) { C.bark = ARENA_TEXT.purse.won(EXHIBITION_PURSE); C.barkAt = now(); }
        deps.exhibitionVerdict?.(ex.hour, r.side);
        p.onEnd?.(r);
      },
    }));
    if (!C) return null;
    C.ex = ex;
    C.teams = { a0: 'red', a1: 'blue' };
    return C;
  }
  function exhibitionWord(w) {
    const C = cur;
    if (!C?.relay || !C.ex) return relayWord(w);
    const first = w?.k === 'st' && !C.M && w.o === C.relay.o;
    const ok = relayWord(w);
    if (first && C.crowd) {
      if (C.ex.beasts && !C.crowd.beasts) C.crowd = newCrowd({ fighters: C.b.fighters.map((f) => ({ id: f.id, home: f.home, ai: f.ai })), beasts: true });
      laurelFavour(C);
    }
    if (ok && w.k === 'atk' && C.stage?.kind === 'city') {
      const foe = C.fighters.get(w.i);
      if (foe?.attack && foe.ai?.feet) {
        const [tx, tz] = relayToStage(C, w.x, w.z);
        foe.ai.walkGoal = null;
        foe.ai.yaw = Math.atan2(tx - foe.ai.feet[0], tz - foe.ai.feet[2]);
        if (w.s) foe._swingAt = relayLandLocal(C, w, now());
        else { foe.attack.firedRanged = false; foe.attack.swingSeq = (foe.attack.swingSeq | 0) + 1; }
      }
    }
    return ok;
  }
  function relayToStage(C, x, z) {
    if (C.stage?.kind !== 'city') return [x, z];
    const c = C.stage.centre();
    return [c[0] + (x - ARENA_FLOOR_CENTRE[0]), c[2] + (z - ARENA_FLOOR_CENTRE[2])];
  }
  function cityBodiesFrame(C, t, off) {
    for (const [id, foe] of C.fighters) {
      const ai = foe.ai, mv = C.mv.get(id);
      if (!ai?.feet || !mv) continue;
      if (boutFighter(C.b, id)?.out) { ai.walkGoal = null; standDown(foe); continue; }
      const w = walkAt(mv, t, off);
      if (!w) continue;
      const [px, pz] = relayToStage(C, w[0], w[1]);
      const f = ai.feet;
      if (Math.hypot(px - f[0], pz - f[2]) > CITY_SNAP_M) { f[0] = px; f[2] = pz; ai.walkGoal = null; continue; }
      if (!walkDone(mv, t, off)) {
        const [gx, gz] = relayToStage(C, mv.tx, mv.tz);
        if (!ai.walkGoal || Math.hypot(ai.walkGoal[0] - gx, ai.walkGoal[2] - gz) > MARK_ARRIVE_M) ai.walkTo?.([gx, f[1], gz], { pace: 1 });
      } else if (!ai.walkGoal && Math.hypot(px - f[0], pz - f[2]) > MARK_ARRIVE_M) ai.walkTo?.([px, f[1], pz], { pace: WALK_PACE });
    }
  }

  function dismiss() {
    const C = cur;
    if (!C) return;
    cur = null;
    // An exhibition left after its word still tells the book its result or BOUT_LEFT, so leaving voids no wager.
    if (C.ex && !C.relay && C.b && !boutBefore(C.b) && !Number.isFinite(C.verdictAt)) deps.exhibitionVerdict?.(C.ex.hour, C.b.result ? C.b.result.side : BOUT_LEFT);
    for (const foe of C.fighters.values()) C.stage?.remove?.(foe);
    C.fighters.clear();
    for (const x of C.crowdBatches) deps.renderer?.destroyBillboardBatch?.(x.batch);
    for (const th of C.throws) deps.renderer?.destroyBillboardBatch?.(th.batch);
    C.crowdBatches = []; C.throws = [];
    deps.setPlayerBout?.(null);
    restoreSandHeld(P);
    if (quiver && !quiver.shots) { const shots = stopShotTally() ?? new Map(); if (quiver.C === C) quiver.shots = shots; else quiver = null; }
    else if (quiver && quiver.C !== C) quiver = null;
    deps.sound?.stop();
    deps.drawHud?.(null, { hidden: true });
    intrusions = 0;
  }

  return {
    refundQuiver: () => refundMine(null),
    setStage, ask, start, dismiss, frame, batches, playerSpare, holds, attackResolved, playerSwing, blowDodged,
    startRelay, relayWord,
    cheer,
    floorBanners,
    askReplay,
    replaying: () => !!(cur?.relay?.replay ?? pending?.relay?.replay),
    setRealm: (fn) => { realmOf = typeof fn === 'function' ? fn : null; },
    startExhibitionRelay, exhibitionWord,
    relay: () => (cur?.relay ? { o: cur.relay.o, me: cur.you ?? '', kind: cur.relay.kind } : null),
    ring: () => {
      if (!holds() || !stage || cur.stage !== stage) return null;
      const c = stage.centre();
      const r = (cur.ringed ??= { centre: [0, 0, 0], radius: cur.ring ?? RING_R, ...(kitBout(cur) ? { ceilAbove: SAND_CEILING_M } : {}) });
      r.centre[0] = c[0]; r.centre[1] = c[1]; r.centre[2] = c[2];
      return r;
    },
    scoreWant: (t = clockOf(cur)) => (cur?.b && !cur.quiet ? arenaScoreFor(cur.b.phase, cur.verdictAt, t) : null),
    bout: () => cur?.b ?? null,
    crowd: () => cur?.crowd ?? null,
    kind: () => cur?.kind ?? null,
    stageKind: () => cur?.stage?.kind ?? null,
    pending: () => pending,
    onSand: () => (cur?.b && !boutOver(cur.b) ? { a: sideNames(cur.b, cur.b.fighters[0].side), b: otherNames(cur.b, cur.b.fighters[0].side) } : null),
    hour: () => cur?.ex?.hour ?? null,
  };
}
