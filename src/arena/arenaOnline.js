// @ts-check
// The online arena on this screen: the hall socket, the bout rooms, the account board, and the hourly exhibition.
// The relay referees and the account service keeps the records; nothing here decides a bout.
import { foldHall, HALL_EMPTY, verdictOfWord } from '../net/arenaLink.js';
import { arenaBoutRoom, ARENA_HALL, ARENA_NO_TEXT, ARENA_HIT, arenaLadderOf, arenaExhibitionRoom, bannerClaim, ARENA_EX_BANNERS,
  arenaPrivateRoom, arenaPrivateCode, arenaPrivateCodeOf, privateCodeTyped, ARENA_PRIVATE_CODE_RE } from '../net/arenaLaw.js';
import { exhibitionFor, exhibitionBoutId, EXHIBITION_KEPT_HOURS } from '../net/arenaExhibition.js';
import { arenaBoutSeed } from '../net/arenaBrain.js';
import { createArenaClaims, arenaClaimVerdict } from '../net/arenaClaims.js';
import { ARENA_TEXT } from './arenaText.js';
import { nextLadderBout } from './arenaLadder.js';
import { accountRefusalText } from '../net/accountClient.js';
import { readArenaReceipt } from '../net/arenaReceipt.js';
import { BOUT_PHASES } from './arenaBout.js';
import { SEAT_NOTICE } from '../net/oneSeat.js';

export const BOARD_STALE_MS = 20_000;
export const HALL_IDLE_MS = 60_000;
export const BOUT_ARRIVE_MS = 60_000;
export const LIVE_ASK_MS = 8000;
export const CLIMB_WAIT_MS = 15_000;
export const OWED_KEEP_MS = 10 * 60_000;
export const EX_WAIT_MS = 20_000;
export const EX_RETRY_MS = 30_000;

const FOUGHT = new Set(BOUT_PHASES.slice(BOUT_PHASES.indexOf('fight')));

export function newBoutId(rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  return [...rand(8)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export const hitKindOf = (kind) => (kind === 'arrow' ? ARENA_HIT.Shaft : kind === 'spell' ? ARENA_HIT.Spell : ARENA_HIT.Melee);

/**
 * @param {{
 *   now?: () => number, session: () => any, makeHall: () => any, account: any, store?: any, bouts: any,
 *   lane?: () => boolean, nowS?: () => number,
 *   enterFloor: (kind: string, o: string, side?: number) => Promise<boolean>|boolean, closeWindow?: () => void,
 *   say?: (line: string) => void, notice?: (lines: string[]) => void, names?: (seed: number) => (i: number, mobile: number) => any,
 *   level?: () => number, guest?: () => boolean, signedIn?: () => boolean, struck?: (d: number) => void, myHealth?: (hp: number, max: number) => void,
 *   inBout?: () => boolean, character?: () => (string|null), characterName?: () => (string|null), onRenown?: (data: any) => void,
 *   verdictHeard?: () => void,
 *   standOnMark?: (kind: string) => boolean, leaveFloor?: () => boolean, rand?: (n: number) => Uint8Array, heal?: () => void,
 * }} deps
 */
export function createArenaOnline(deps) {
  const now = deps.now ?? (() => performance.now());
  const nowS = () => Math.floor(deps.nowS?.() ?? Date.now() / 1000);
  const say = (l) => deps.say?.(l);
  const O = ARENA_TEXT.online;
  let hallLink = null;
  /** @type {any} */
  let hall = { ...HALL_EMPTY };
  let hallWantedAt = -Infinity;
  let liveAskedAt = -Infinity;
  let board = null, boardAt = -Infinity, boardAsking = false, boardAgain = false;
  let bout = null;
  let city = null, cityRetryAt = -Infinity;
  let asking = null;
  const askedAt = new Map();
  const exSeen = new Map();
  const exBegun = new Set();
  const owed = new Map();
  const claims = createArenaClaims({
    claim: async (r, c, n) => { const a = await deps.account.claim(r, c, n); answered(r, a); return a; }, store: deps.store ?? null, me: () => deps.account.me?.() ?? null,
    onCounted: (d) => { counted(d); askBoard(true); },
    onGuest: () => say(O.guest),
    character: () => deps.character?.() ?? null, name: () => deps.characterName?.() ?? null, onRenown: (d) => deps.onRenown?.(d),
  });
  const realm = () => (live() ? { banner: board?.me?.banner ?? null, laurel: board?.team?.laurel ?? null } : null);
  deps.bouts?.setRealm?.(realm);

  // Decided by the last welcome and the seat, never by this frame's socket status, so a reconnect never runs the
  // offline rules for a moment.
  const live = () => { const s = deps.session?.(); return !!s && !!s.arenaOk && !s.superseded; };
  // On the online lane the offline arena runs only when the relay said it opens no arena room. Every other state
  // shuts the doors with its own reason: 'seat', 'gone', or 'wait'.
  const shut = () => {
    if (live() || !deps.lane?.()) return null;
    const s = deps.session?.();
    if (!s) return 'wait';
    if (s.superseded) return 'seat';
    if (s.terminal) return 'gone';
    return s.arenaHeard ? null : 'wait';
  };
  const waiting = () => shut() != null;
  const shutText = (/** @type {string} */ line) => { const k = shut(); return k === 'seat' ? SEAT_NOTICE : k === 'gone' ? O.noServer : line; };

  function wantHall() {
    hallWantedAt = now();
    if (hallLink || !live()) return hallLink;
    hallLink = deps.makeHall?.() ?? null;
    if (!hallLink) return null;
    hallLink.onArena = (w) => hallWord(w);
    hallLink.join?.(ARENA_HALL);
    return hallLink;
  }
  function hallWord(w) {
    if ((w.k === 'of' || w.k === 'go') && !live()) return;
    if (w.k === 'live') w = { ...w, l: w.l.map(billExhibition) };
    hall = foldHall(hall, w, now(), 0);
    if (w.k === 'qx' && w.m && w.m !== 'left') say(ARENA_NO_TEXT[w.m] ?? w.m);
    if (w.k === 'of') say(O.offerLine(w.vs.n, w.vs.r ?? '?'));
    if (w.k === 'go') goTo({ o: w.o, kind: 'pvp', side: w.side, vs: w.vs, casual: w.u === 1 });
  }
  const hallSend = (w) => { const l = wantHall(); return !!l && l.sendArena?.(w) === true; };
  function closeHallIfIdle(t) {
    if (!hallLink) return;
    const seeking = hall.queue === 'queued' || hall.queue === 'offer';
    if (!seeking && t - hallWantedAt > HALL_IDLE_MS) { try { hallLink.leave?.(); } catch { } hallLink = null; hall = { ...HALL_EMPTY }; }
  }
  // The relay drops an account from its queue when the hall socket closes, so a new socket sends the word again.
  let hallQ = null;
  function hallRequeue() {
    if (!hallLink || !hallQ) return;
    if (hallLink.status !== 'open') { hallQ.sent = false; return; }
    if (hallQ.sent || (hall.queue !== 'queued' && hall.queue !== 'offer')) return;
    hallQ.sent = hallLink.sendArena?.(hallQ.w) === true;
    if (hallQ.sent && hall.queue === 'offer') hall = { ...hall, queue: 'queued', offer: null };
  }

  // A forced ask during another ask runs again on return, since the one out may predate the write it must show.
  let boardWait = null, boardTriedAt = -Infinity;
  function askBoard(force = false) {
    if (boardAsking) { if (force) boardAgain = true; return boardWait; }
    if (!force && now() - Math.max(boardAt, boardTriedAt) < BOARD_STALE_MS) return null;
    boardAsking = true;
    boardTriedAt = now();
    boardWait = Promise.resolve().then(() => deps.account.board()).then((r) => { if (r?.ok && r.data) { board = r.data; boardAt = now(); } }, () => {})
      .finally(() => { boardAsking = false; if (boardAgain) { boardAgain = false; askBoard(true); } })
      .then(() => board);
    return boardWait;
  }
  function fetchBoard() {
    if (board) return Promise.resolve(board);
    if (!live()) return Promise.resolve(null);
    return askBoard(true) ?? Promise.resolve(board);
  }
  function answered(r, a) {
    const c = readArenaReceipt(r);
    if (!c || c.a !== 'l') return;
    const d = a?.ok ? a.data : null;
    if (d?.ladder && board?.me) board = { ...board, me: { ...board.me, ladder: d.ladder } };
    let won = null;
    if (d?.recorded === true) won = d.won === true && d.repeat !== true;
    else if (d?.why === 'claimed') won = c.r === 1;
    else if (arenaClaimVerdict(a) === 'done' || d?.why === 'guest') won = false;
    if (d?.recorded === false && (d.why === 'order' || d.why === 'reused' || d.why === 'forfeit')) say(O[d.why]);
    if (won === null) return;
    const e = owed.get(c.j) ?? { gold: null, pay: null, won: null, at: now() };
    e.won = won;
    owed.set(c.j, e);
    settleOwed(c.j);
  }
  function owe(o, gold, pay) {
    const e = owed.get(o) ?? { gold: null, pay: null, won: null, at: now() };
    e.gold = gold; e.pay = pay; e.at = now();
    owed.set(o, e);
    settleOwed(o);
  }
  function settleOwed(o) {
    const e = owed.get(o);
    if (!e || e.won === null || e.gold === null) return;
    owed.delete(o);
    if (e.won && e.gold > 0) e.pay?.(e.gold);
  }
  const climbPending = () => {
    const t = now();
    let wait = false;
    for (const [o, e] of owed) {
      if (t - e.at > OWED_KEEP_MS) owed.delete(o);
      else if (e.gold !== null && e.won === null && t - e.at < CLIMB_WAIT_MS) wait = true;
    }
    return wait;
  };
  function climb() {
    if (!live()) return null;
    if (!board) { askBoard(true); return null; }
    if (climbPending()) return null;
    return board.me?.ladder ?? arenaLadderOf([]);
  }
  function counted(d) {
    if (d.kind === 'pvp') {
      if (!d.rated) say(O.unrated);
      else say(d.result === 'won' ? O.pvpWon(d.delta, d.rating) : d.result === 'lost' ? O.pvpLost(-d.delta, d.rating) : O.pvpDraw(d.rating));
    } else if (d.kind === 'ladder') {
      if (d.grand) say(O.grand);
      if (d.points > 0 && d.banner) say(O.points(d.points, ARENA_TEXT.teams.the[d.banner]));
    }
  }

  async function goTo(b) {
    bout = { ...b, room: b.room ?? arenaBoutRoom(b.o), sent: false, seen: false, at: now(), leftAt: null };
    deps.closeWindow?.();
    const me = b.kind === 'watch' ? '' : b.kind === 'pvp' ? `p${b.side ?? 0}` : 'p0';
    if (b.ex) {
      closeCity();
      // Let the other sockets to this room go first: the relay replaces one id twice in a room, and a replaced
      // socket is a lost seat.
      if (asking?.hour === b.ex.hour) closeAsk();
      deps.bouts.ask({ where: 'floor', relayEx: { o: b.o, ex: b.ex, names: deps.names ? deps.names(b.ex.seed) : undefined, send: { cheer: (c) => boutSend({ k: 'ch', c }) } } });
      const ok = await deps.enterFloor('watch', `x${b.ex.hour}`, 0);
      if (!ok) { bout = null; deps.bouts.dismiss?.(); }
      return ok;
    }
    const banners = b.kind === 'pvp' ? { [`p${1 - (b.side ?? 0)}`]: b.vs?.b ?? null } : b.kind === 'watch' ? { ...(b.banners ?? {}) } : {};
    deps.bouts.ask({
      where: 'floor', kind: 'relay',
      relay: {
        o: b.o, kind: b.kind === 'pvp' ? 'pvp' : b.kind === 'watch' ? (b.watchKind ?? 'pvp') : 'pve', me, next: b.next ?? null,
        casual: !!b.casual,
        names: deps.names ? deps.names(arenaBoutSeed(b.o)) : undefined,
        send: { hit: (w) => boutSend({ ...w, k: 'hit' }), yield: () => boutSend({ k: 'yd' }), cheer: (c) => boutSend({ k: 'ch', c }) },
        struck: (d) => deps.struck?.(d), myHealth: (hp, max) => deps.myHealth?.(hp, max),
        onEnd: () => { if (b.casual) say(O.casualEnd); askBoard(true); },
        banners, owe: (gold, pay) => owe(b.o, gold, pay),
      },
    });
    const kind = b.kind === 'watch' ? 'watch' : b.kind === 'pvp' && b.side === 1 ? 'rival' : 'ladder';
    const ok = await deps.enterFloor(kind, b.o, b.side ?? 0);
    if (!ok) { bout = null; deps.bouts.dismiss?.(); }
    return ok;
  }
  function boutSend(w) {
    const s = deps.session?.();
    if (!bout || !s || s.room !== bout.room) return false;
    return s.sendArena?.(w) === true;
  }
  function endBout() {
    if (!bout) return;
    if (deps.bouts.relay?.()?.o === bout.o) deps.bouts.dismiss?.();
    bout = null;
  }
  function word(w, room) {
    if (sess && room === sess.room && sessionWord(w)) return true;
    if (!bout || room !== bout.room) return false;
    if (w.k === 'rc') { claims.add(w.r); return true; }
    const over = w.k === 'no' && (w.m === 'no bout' || w.m === 'void' || w.m === 'no contest');
    if (bout.ex) {
      heardEx(bout.ex.hour, w);
      if (w.k === 'no') { say(ARENA_NO_TEXT[w.m] ?? w.m); if (over) endBout(); return true; }
      return deps.bouts.exhibitionWord?.(w) ?? false;
    }
    if (w.k === 'no') { say(w.m === 'early' ? ARENA_TEXT.refuse.yieldEarly : ARENA_NO_TEXT[w.m] ?? w.m); if (over) { if (bout.priv) letGoPriv(true); else endBout(); } return true; }
    if (w.k === 'st' && bout.kind === 'watch' && !bout.watchKind) bout.watchKind = w.kind;
    return deps.bouts.relayWord?.(w) ?? false;
  }
  function hit({ i, d, kind = 'melee', w = -1, m = 0, q = null }) {
    if (bout?.kind === 'watch') return false;
    return boutSend({ k: 'hit', i, d: Math.max(0, Math.round(Number(d) || 0)), r: hitKindOf(kind), ...(Number.isInteger(w) && w >= -1 ? { w } : {}), ...(Number.isInteger(m) && m >= 0 && m <= 15 ? { m } : {}), ...(Number.isInteger(q) ? { q } : {}) });
  }

  const exhibitions = () => live();
  const exhibitionBout = (ex) => ({ o: exhibitionBoutId(ex.hour), room: arenaExhibitionRoom(ex.hour), kind: 'watch', watchKind: 'ex', ex });
  function billExhibition(e) {
    if (e?.kind !== 'ex') return e;
    const ex = exhibitionFor(e.h * 60);
    const nm = ex && deps.names ? deps.names(ex.seed) : null;
    const bill = (i, side) => ({ n: (ex && nm ? nm(i, ex.opponents[i].mobile)?.name : null) || ARENA_TEXT.window.fighter, b: side?.b ?? ARENA_EX_BANNERS[i] });
    return { ...e, a: bill(0, e.a), b: bill(1, e.b) };
  }
  const myBanner = () => { const b = bannerClaim(board?.me?.banner); return b ? { b } : {}; };
  function heardEx(hour, w) {
    if (w?.k === 'no' && w.m === 'no bout') { if (!exSeen.has(hour)) exSeen.set(hour, { none: true }); return; }
    if ((w?.k === 'st' && FOUGHT.has(w.ph)) || (w?.k === 'ev' && (w.e ?? []).some((e) => FOUGHT.has(e.k)))) exBegun.add(hour);
    const v = verdictOfWord(w);
    if (v) exSeen.set(hour, v);
  }
  const exhibitionBegun = (hour) => exBegun.has(hour);
  function watchCity(ex) {
    if (!live() || !ex || exSeen.has(ex.hour)) return false;
    if (city?.hour === ex.hour) return true;
    if (bout || now() < cityRetryAt) return false;
    closeCity();
    const link = deps.makeHall?.() ?? null;
    if (!link) return false;
    const room = arenaExhibitionRoom(ex.hour);
    const C = city = { hour: ex.hour, o: exhibitionBoutId(ex.hour), room, link, sent: false, heard: false, started: false, at: now() };
    link.onArena = (w, r) => { if (city === C && r === room) cityWord(C, w); };
    link.join?.(room);
    const cheer = (c) => city === C && C.sent && C.link.sendArena?.({ k: 'ch', c }) === true;
    deps.bouts.ask({ where: 'city', relayEx: { o: C.o, ex, names: deps.names ? deps.names(ex.seed) : undefined, send: { cheer } } });
    return true;
  }
  function cityWord(C, w) {
    C.heard = true;
    heardEx(C.hour, w);
    if (w.k === 'no') {
      if (w.m !== 'no bout') cityRetryAt = now() + EX_RETRY_MS;
      closeCity();
      if (deps.bouts.relay?.()?.o === C.o) deps.bouts.dismiss?.();
      return;
    }
    deps.bouts.exhibitionWord?.(w);
  }
  function closeCity() {
    if (!city) return;
    try { city.link.leave?.(); } catch { }
    city = null;
  }
  function watchExhibition(ex) {
    if (!live()) { if (waiting()) say(shutText(O.hallWait)); return false; }
    if (!ex || bout || deps.inBout?.()) return false;
    void goTo(exhibitionBout(ex));
    return true;
  }
  function exhibitionVerdict(hour, gameMinutes) {
    const k = exSeen.get(hour);
    if (k) return k.none ? { house: true } : { side: k.side };
    if (Number(gameMinutes) >= (hour + EXHIBITION_KEPT_HOURS) * 60) return { house: true };
    askVerdict(hour);
    return null;
  }
  function askVerdict(hour) {
    const t = now();
    if (!live() || asking || city?.hour === hour || bout?.ex?.hour === hour || t - (askedAt.get(hour) ?? -Infinity) < EX_RETRY_MS) return;
    const link = deps.makeHall?.() ?? null;
    if (!link) return;
    askedAt.set(hour, t);
    const room = arenaExhibitionRoom(hour);
    const A = asking = { hour, room, link, sent: false, at: t };
    link.onArena = (w, r) => { if (asking === A && r === room) { heardEx(hour, w); if (exSeen.has(hour) || w.k === 'no') closeAsk(); if (exSeen.has(hour)) deps.verdictHeard?.(); } };
    link.join?.(room);
  }
  function closeAsk() {
    if (!asking) return;
    try { asking.link.leave?.(); } catch { }
    asking = null;
  }
  function exTick(t) {
    if (city) {
      const r = deps.bouts.relay?.();
      if (r?.o === city.o) city.started = true;
      else if (city.started) closeCity();
    }
    for (const L of [city, asking]) {
      if (!L) continue;
      const l = L.link;
      if (l.status === 'open' && l.room === L.room) { if (!L.sent) L.sent = l.sendArena?.({ k: 'in', r: 's' }) === true; }
      else L.sent = false;
    }
    if (city && !city.heard && t - city.at > EX_WAIT_MS) {
      const o = city.o;
      closeCity(); cityRetryAt = t + EX_RETRY_MS;
      if (deps.bouts.relay?.()?.o === o) deps.bouts.dismiss?.();
    }
    if (asking && t - asking.at > EX_WAIT_MS) closeAsk();
  }

  let sess = null;
  const SESSION_ENDS = new Set(['closed', 'ended', 'removed', 'no session', 'taken', 'host guest', 'session full', 'locked']);
  const SESSION_SAYS = new Set(['host only', 'not member', 'not here', 'guest fighter', 'same fighter', 'bout on', 'no picks', 'voided', 'has result']);
  let sessLast = null;
  let sessLeftRoom = null;
  async function enterSession(code, host) {
    sess = { code, room: arenaPrivateRoom(code), host, sent: false, seen: false, at: now(), leftAt: null, state: null };
    sessLast = null;
    deps.closeWindow?.();
    say(O.privEntering(code));
    const ok = await deps.enterFloor('watch', `p${code}`, 0);
    if (!ok && sess?.code === code) { sess = null; say(O.privOutdoors); sessLast = { text: O.privOutdoors, code, back: false }; }
    return ok;
  }
  function sessSend(w) {
    const s = deps.session?.();
    return !!sess && !!s && s.room === sess.room && s.sendArena?.(w) === true;
  }
  function leaveSession(leave, text = '') {
    if (bout?.priv) letGoPriv(false);
    if (sess) sessLast = { text, code: sess.code, back: !leave };
    if (leave && sess) sessLeftRoom = sess.room;
    sess = null;
    if (leave) deps.leaveFloor?.();
  }
  function letGoPriv(stay) {
    if (!bout?.priv) return;
    const fought = bout.side != null;
    endBout();
    if (!fought) return;
    deps.heal?.();
    if (stay) { deps.standOnMark?.('watch'); say(O.privToStands); }
  }
  function sessionState(w) {
    sess.state = w;
    if (!sess.said) { sess.said = true; say(w.h === 1 ? O.privHereHost(sess.code) : O.privHereJoined(sess.code, Math.max(0, (Array.isArray(w.m) ? w.m.length : 1) - 1))); } if (bout?.priv && bout.o !== w.o) letGoPriv(true);
    if (!w.o || bout?.o === w.o || w.ph === 'done' || w.ph === 'void') return;
    const side = w.f.indexOf(w.me);
    bout = { o: w.o, room: sess.room, kind: side >= 0 ? 'pvp' : 'watch', watchKind: 'pvp', side: side >= 0 ? side : null, casual: true, priv: true, sent: false, seen: true, at: now(), leftAt: null };
    deps.bouts.ask({
      where: 'floor', kind: 'relay',
      relay: {
        o: w.o, kind: 'pvp', me: side >= 0 ? `p${side}` : '', next: null,
        names: deps.names ? deps.names(arenaBoutSeed(w.o)) : undefined,
        send: { hit: (x) => boutSend({ ...x, k: 'hit' }), yield: () => boutSend({ k: 'yd' }), cheer: (c) => boutSend({ k: 'ch', c }) },
        struck: (d) => deps.struck?.(d), myHealth: (hp, max) => deps.myHealth?.(hp, max),
        onEnd: () => say(O.casualEnd),
        casual: true,
        banners: { p0: 'red', p1: 'blue' },
        fixed: true,
        owe: () => {},
      },
    });
    if (side >= 0) { deps.closeWindow?.(); deps.standOnMark?.(side === 1 ? 'rival' : 'ladder'); say(O.privToSand); }
  }
  function sessionWord(w) {
    if (w.k === 'pss') { sessionState(w); return true; }
    if (w.k !== 'no') return false;
    const text = ARENA_NO_TEXT[w.m] ?? w.m;
    if (SESSION_ENDS.has(w.m)) { say(text); leaveSession(true, text); return true; }
    if (SESSION_SAYS.has(w.m) || (w.m === 'no bout' && !bout)) { say(text); sess.word = text; return true; }
    return false;
  }
  const sessionView = () => (sess ? { in: true, code: sess.code, host: sess.state ? sess.state.h === 1 : !!sess.host, state: sess.state, word: sess.word ?? '' }
    : { in: false, word: sessLast?.text ?? '', back: sessLast?.back ? sessLast.code : '' });
  function sessionAct(kind, data) {
    if (kind === 'privHost' || kind === 'privJoin') {
      if (deps.signedIn?.() === false || deps.session?.()?.status !== 'open') return { ok: false, text: O.privSignIn };
      if (sess) return { ok: false, text: O.privIn };
      if (bout || deps.inBout?.()) return { ok: false, text: O.whyBusy };
      if (hall.queue === 'queued' || hall.queue === 'offer') return { ok: false, text: O.privQueued };
      if (kind === 'privHost') {
        if (deps.guest?.()) return { ok: false, text: ARENA_NO_TEXT['host guest'] };
        const code = arenaPrivateCode((n) => (deps.rand ?? ((k) => globalThis.crypto.getRandomValues(new Uint8Array(k))))(n));
        void enterSession(code, true);
        return { ok: true, text: '' };
      }
      const code = privateCodeTyped(data.code);
      if (!ARENA_PRIVATE_CODE_RE.test(code)) return { ok: false, text: O.privBadCode };
      void enterSession(code, false);
      return { ok: true, text: '' };
    }
    if (!sess) return { ok: false, text: ARENA_NO_TEXT['no session'] };
    if (kind === 'privLeave') {
      if (deps.inBout?.()) return { ok: false, text: O.whyBusy };
      leaveSession(true);
      return { ok: true, text: '' };
    }
    if (sess.state?.h !== 1) return { ok: false, text: ARENA_NO_TEXT['host only'] };
    sess.word = '';
    const w = kind === 'privPick' ? { k: 'ps', a: 'pick', ...(typeof data.r === 'string' ? { r: data.r } : {}), ...(typeof data.b === 'string' ? { b: data.b } : {}) }
      : kind === 'privKick' ? { k: 'ps', a: 'kick', m: String(data.m ?? '') }
        : kind === 'privGo' ? { k: 'ps', a: 'go' } : kind === 'privVoid' ? { k: 'ps', a: 'void' } : kind === 'privClose' ? { k: 'ps', a: 'close' }
          : kind === 'privLock' ? { k: 'ps', a: 'lock', l: data?.l === 0 ? 0 : 1 } : null;
    if (!w) return { ok: false, text: '' };
    return sessSend(w) ? { ok: true, text: '' } : { ok: false, text: O.hallWait };
  }
  function sessionTick(t) {
    const s = deps.session?.();
    // A screen in a session room adopts that session, except a room it chose to leave and is still leaving.
    if (s?.room !== sessLeftRoom) sessLeftRoom = null;
    if (!sess && s?.status === 'open' && s.room !== sessLeftRoom && arenaPrivateCodeOf(s.room)) {
      sess = { code: /** @type {string} */ (arenaPrivateCodeOf(s.room)), room: s.room, host: false, sent: false, seen: true, at: t, leftAt: null, state: null };
    }
    if (!sess) return;
    const inRoom = !!s && s.room === sess.room;
    if (!inRoom || s.status !== 'open') sess.sent = false;
    else if (!sess.sent) {
      const bn = bannerClaim(board?.me?.banner);
      sess.sent = s.sendArena?.({ k: 'ps', a: sess.host && !sess.state ? 'open' : 'join', ...(bn ? { bn } : {}) }) === true;
    }
    if (inRoom) { sess.seen = true; sess.leftAt = null; }
    else if (sess.seen) { if (sess.leftAt == null) sess.leftAt = t; else if (t - sess.leftAt > 5000) leaveSession(false); }
    else if (t - sess.at > BOUT_ARRIVE_MS) sess = null;
  }

  function tick() {
    const t = now();
    claims.tick();
    sessionTick(t);
    // These sockets are presence-less, so nothing else ticks their retry and heartbeat.
    for (const l of [hallLink, city?.link, asking?.link]) { try { l?.tick?.(); } catch { } }
    hallRequeue();
    closeHallIfIdle(t);
    if (hallLink && t - liveAskedAt >= LIVE_ASK_MS && t - hallWantedAt < 2000) { liveAskedAt = t; hallSend({ k: 'ls' }); }
    const s = deps.session?.();
    if (bout && s) {
      const here = s.room === bout.room && s.status === 'open';
      if (!here) bout.sent = false;
      else if (!bout.sent && (bout.kind !== 'pve' || bout.ticket)) {
        const inWord = bout.kind === 'watch' ? { k: 'in', r: 's' }
          : bout.kind === 'pve' ? { k: 'in', r: 'f', tier: bout.tier, bout: bout.bout, lv: Math.max(1, Math.floor(deps.level?.() ?? 1)), ...myBanner(), ...(bout.ticket ? { z: bout.ticket } : {}) }
            : { k: 'in', r: 'f' };
        bout.sent = s.sendArena?.(inWord) === true;
      }
    }
    exTick(t);
    if (bout) {
      const here = !!s && s.room === bout.room;
      if (here) { bout.seen = true; bout.leftAt = null; }
      else if (bout.seen && !deps.inBout?.()) { if (bout.leftAt == null) bout.leftAt = t; else if (t - bout.leftAt > 5000) bout = null; }
      else if (!bout.seen && t - bout.at > BOUT_ARRIVE_MS) bout = null;
    }
  }

  function leaveAll() {
    if (hallLink) { try { hallLink.leave?.(); } catch { } hallLink = null; }
    hall = { ...HALL_EMPTY };
    closeCity();
    closeAsk();
    if (bout?.priv) letGoPriv(false); else endBout();
    sess = null;
  }

  function model() {
    if (!live()) return waiting() ? { board: null, hall: { ...HALL_EMPTY, status: 'off' }, guest: !!deps.guest?.(), busy: false, inSession: false, now: now(), nowS: nowS(), session: null, shutWhy: shutText(O.hallWait), away: shut() === 'wait' ? null : shutText('') } : null;
    wantHall();
    askBoard();
    return { board, hall: { ...hall, status: hallLink?.status === 'open' ? 'open' : 'off' }, guest: !!deps.guest?.(), busy: !!bout || !!deps.inBout?.() || !!sess, inSession: !!sess, now: now(), nowS: nowS(), session: sessionView() };
  }
  function act(kind, data = {}) {
    if (!live()) return { ok: false, text: waiting() ? shutText(O.hallWait) : O.whyOffline };
    if (typeof kind === 'string' && kind.startsWith('priv')) return sessionAct(kind, data);
    if (kind === 'queue' || kind === 'casual') {
      if (sess) return { ok: false, text: O.privIn };
      if (deps.guest?.()) return { ok: false, text: O.whyGuest };
      if (bout || deps.inBout?.()) return { ok: false, text: O.whyBusy };
      const casual = kind === 'casual';
      const q = { k: 'q', lv: Math.max(1, Math.floor(deps.level?.() ?? 1)), ...myBanner(), ...(casual ? { u: 1 } : {}) };
      if (!hallSend(q)) return { ok: false, text: O.hallWait };
      hallQ = { w: q, sent: true };
      hall = { ...hall, casual };
      return { ok: true, text: O.queueState.queued };
    }
    if (kind === 'unqueue') { hallSend({ k: 'x' }); hall = { ...hall, queue: 'idle', offer: null, casual: false }; return { ok: true, text: O.leaveQueue }; }
    if (kind === 'accept' || kind === 'decline') {
      const o = hall.offer?.o;
      if (!o) return { ok: false, text: ARENA_NO_TEXT.lapsed };
      hallSend({ k: kind === 'accept' ? 'y' : 'n', o });
      if (kind === 'decline') hall = { ...hall, queue: 'idle', offer: null };
      return { ok: true, text: kind === 'accept' ? O.accept : O.decline };
    }
    if (kind === 'spectate') {
      if (bout || deps.inBout?.()) return { ok: false, text: O.whyBusy };
      if (typeof data.o !== 'string') return { ok: false, text: O.boutOver };
      const entry = hall.live.find((x) => x.o === data.o);
      if (entry?.kind === 'ex') { const ex = exhibitionFor(entry.h * 60); if (!ex) return { ok: false, text: O.boutOver }; void goTo(exhibitionBout(ex)); return { ok: true, text: '' }; }
      void goTo({ o: data.o, kind: 'watch', watchKind: entry?.kind ?? null, banners: { p0: entry?.a?.b ?? null, p1: entry?.b?.b ?? null } });
      return { ok: true, text: '' };
    }
    return { ok: false, text: '' };
  }
  function fightLadder() {
    if (!live()) return { ok: false, text: waiting() ? shutText(O.climbWait) : O.whyOffline };
    if (bout || deps.inBout?.()) return { ok: false, text: O.whyBusy };
    const L = climb();
    if (!L) return { ok: false, text: O.climbWait };
    // A ladder win the service has not counted holds the next Fight; otherwise the floor opens for a stale step.
    if (claims.ladderKept?.()) { void claims.flush(); return { ok: false, text: O.stillRecording }; }
    const next = nextLadderBout(L);
    if (!next) return { ok: false, text: ARENA_TEXT.herald.ladderDone };
    if (deps.guest?.()) return { ok: false, text: O.guestLadder };
    // The ticket is asked only once the floor is entered, because asking spends the attempt.
    const go = goTo({ o: newBoutId(), kind: 'pve', tier: next.tier, bout: next.bout, next });
    const b = bout;
    void Promise.resolve(go).then((ok) => { if (ok && bout === b) return askTicket(b); return null; });
    return { ok: true, text: '' };
  }
  async function askTicket(b) {
    if (!b || b.kind !== 'pve') return;
    // Asking forfeits every open attempt, so carried receipts are flushed and answered first and a win is counted.
    try { await claims.flush(); await claims.idle?.(); } catch { }
    if (bout !== b) return;
    if (claims.ladderKept?.()) { say(O.stillRecording); endBout(); return; }
    const r = await Promise.resolve(deps.account.attempt?.(b.tier, b.bout, b.o)).catch(() => null);
    if (bout !== b) return;
    const tk = r?.ok ? r.data?.ticket : null;
    if (typeof tk === 'string') { b.ticket = tk; return; }
    if (r && !r.ok && r.error === 'order') askBoard(true);
    say(r && !r.ok && (r.error === 'order' || r.error === 'ladder-needs-account') ? accountRefusalText(r.error) : O.ticketFail);
    endBout();
  }
  async function team(banner) {
    if (!live()) { if (waiting()) say(shutText(O.climbWait)); return null; }
    if (deps.guest?.()) { say(O.guestBanner); return { ok: false, error: 'guest' }; }
    const r = await deps.account.team(banner).catch(() => null);
    if (r && !r.ok && r.error && r.error !== 'no-session') say(accountRefusalText(r.error));
    if (r?.ok && board?.me) {
      const was = board.me.banner ?? null, worn = r.data?.banner === undefined ? banner : r.data.banner;
      board = { ...board, me: { ...board.me, banner: worn ?? null, ...(worn === null && was ? { left: was, leftSeason: board.season } : {}) } };
    }
    askBoard(true);
    return r;
  }

  return {
    live, model, act, fightLadder, team, word, hit, tick, claims,
    waiting,
    shutText,
    climb, fetchBoard, realm,
    refresh: () => { if (live()) askBoard(); },
    guest: () => !!deps.guest?.(),
    exhibitions, watchCity, watchExhibition, exhibitionVerdict,
    exhibitionBegun,
    leaveAll,
    session: () => sess,
    inSession: () => !!sess,
    ladder: () => board?.me?.ladder ?? null,
    board: () => board,
    hall: () => hall,
    bout: () => bout,
    me: () => (bout ? (bout.kind === 'watch' ? '' : bout.kind === 'pvp' ? `p${bout.side ?? 0}` : 'p0') : null),
  };
}
