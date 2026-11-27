// @ts-check

import { ChoiceWindow } from '../ui/talkWindow.js';
import { ActionTextBox } from '../ui/actionText.js';
import { recruiterChoice, quitAsk, heraldChoice as heraldChoiceOf } from './arenaHerald.js';
import { joinBanner, quitBanner, rollLeague } from './arenaLeague.js';
import { ARENA_TEXT } from './arenaText.js';
import { bookmakerChoice, stakeChoice, placeWager, settleBook, bookVerdict, collectWinnings, oddsText, exhibitionOdds, priceFor } from './arenaBook.js';
import { exhibitionFor } from './arenaLadder.js';
import { fighterIdentity } from './arenaFighters.js';
import { totalGoldAmount, deductGold, addGold } from '../justice/court.js';
import { arenaBoard, hallLinesOnline, hallPlaques } from './arenaBoard.js';
import { PLAQUE_MAX } from '../world/arenaPlaques.js';
import { arenaReplaysRestore } from './arenaReplay.js';
import { nextLadderBout, arenaLadderRestore } from './arenaLadder.js';
import { FIGHT_HEALTH_MIN } from './arenaHerald.js';
import { createArenaOverlay, closeArenaDoor } from '../ui/arenaDoor.js';
import { bookRestore, houseOutcome } from './arenaBook.js';
import { bookSaw } from './arenaBook.js';

export const AT_GATE_M = 60;
export const nearArenaGate = (feet, herald) => !!feet && !!herald && Math.hypot(feet[0] - herald[0], feet[2] - herald[2]) <= AT_GATE_M;

export const RECRUITER_BANNER = Object.freeze({ redRecruiter: 'red', blueRecruiter: 'blue' });

// The join rules mirror arenaTeam in server-account/src/arena.js, so this never offers what the service refuses.
/** @param {{ banner: 'red'|'blue', board: any, guest?: boolean, window?: boolean, wait?: string|null }} o */
export function recruiterChoiceOnline({ banner, board, guest = false, window = true, wait = null }) {
  const R = ARENA_TEXT.recruiter, T = ARENA_TEXT.teams, O = ARENA_TEXT.online;
  const other = banner === 'red' ? 'blue' : 'red';
  const lines = [...R.greet[banner], ''];
  let why = null;
  if (!board) { lines.push(wait ?? O.rollWait); why = 'wait'; }
  else {
    const me = board.me ?? {}, st = board.team?.standings ?? { red: 0, blue: 0 };
    lines.push(`${O.seasonLine(board.season, board.day)}.`);
    lines.push(T.standing(st.red ?? 0, st.blue ?? 0));
    if (me.banner === banner) {
      why = 'already';
      lines.push(R.yours(T.the[banner]), T.given(me.points ?? 0));
      if (board.team?.laurel === banner) lines.push(T.laurelYou);
    } else if (me.banner) { why = 'other'; lines.push(R.theirs(T.the[me.banner])); }
    else if (me.left && me.left !== banner && Number(me.leftSeason) >= board.season) { why = 'season'; lines.push(R.wait(T.the[other])); }
    else if (guest) { why = 'guest'; lines.push(O.guestBanner); }
    else { lines.push(R.pitch, R.rule); }
  }
  const options = [];
  if (!why) options.push({ code: 'KeyJ', label: R.join(T.the[banner]), act: 'join' });
  if (why === 'already') options.push({ code: 'KeyQ', label: R.quit(T.the[banner]), act: 'quit' });
  if (window) options.push({ code: 'KeyA', label: R.window, act: 'window' });
  options.push({ code: 'KeyL', label: R.leave, act: 'leave' });
  options.push({ code: 'Escape', label: null, act: 'leave' });
  return { lines, options };
}

/**
 * @param {{
 *   playerEntity: any, gameMinutes: () => number, showOverlay: (w: any) => void, say?: (line: string) => void,
 *   openWindow?: ((page?: string) => any) | null, liveHour?: () => (number|null), begun?: () => boolean,
 *   heraldAct?: (a: string) => void, atGate?: () => boolean, onSand?: () => ({ a: string, b: string } | null),
 *   online?: () => any,
 * }} deps
 */
export function createArenaGate(deps) {
  const P = deps.playerEntity;
  const openWindow = deps.openWindow === undefined ? (page) => { const ov = windowOverlay(page); if (ov) deps.showOverlay(ov); return !!ov; } : deps.openWindow;
  const gm = () => Math.floor(Number(deps.gameMinutes()) || 0);
  const say = (line) => deps.say?.(line);
  const league = () => (P.arenaLeague = rollLeague(P.arenaLeague, gm()));
  const choice = (ch, act) => deps.showOverlay(new ChoiceWindow({ lines: ch.lines, options: ch.options.map((o) => ({ code: o.code, label: o.label ?? undefined, action: () => act(o.act, o) })) }));
  const liveHour = () => deps.liveHour?.() ?? null;
  const online = () => { const o = deps.online?.() ?? null; return o?.live?.() || o?.waiting?.() ? o : null; };
  const begun = () => {
    if (deps.begun?.()) return true;
    const ex = exhibitionFor(gm());
    // Online, also count a fight heard begin here: the mirror that deps.begun reads is gone after the healers.
    return !!ex && !!online()?.exhibitionBegun?.(ex.hour);
  };
  const setBook = (book) => { P.arenaLeague = { ...league(), book }; };

  function recruiter(role) {
    const banner = RECRUITER_BANNER[role];
    if (!banner) return false;
    const on = online();
    if (on) return recruiterOnline(on, banner);
    const name = ARENA_TEXT.teams.the[banner];
    const ch = recruiterChoice({ banner, league: league(), gameMinutes: gm(), window: typeof openWindow === 'function' });
    choice(ch, (a) => {
      if (a === 'join') {
        const r = joinBanner(league(), banner, gm());
        P.arenaLeague = r.league;
        if (r.ok) { say(ARENA_TEXT.recruiter.joined(name)); openWindow?.('team'); }
      } else if (a === 'quit') {
        choice(quitAsk(banner), (b) => {
          if (b !== 'quit') return;
          const r = quitBanner(league(), gm());
          P.arenaLeague = r.league;
          if (r.ok) say(ARENA_TEXT.recruiter.quitDone(name));
        });
      } else if (a === 'window') openWindow?.('team');
    });
    return true;
  }
  function recruiterOnline(on, banner) {
    const name = ARENA_TEXT.teams.the[banner];
    const board = on.board?.() ?? null;
    if (!board) on.climb?.();
    const ch = recruiterChoiceOnline({ banner, board, guest: !!on.guest?.(), window: typeof openWindow === 'function', wait: on.shutText?.(ARENA_TEXT.online.rollWait) ?? null });
    choice(ch, (a) => {
      if (a === 'join') void Promise.resolve(on.team(banner)).then((r) => { if (r?.ok) { say(ARENA_TEXT.recruiter.joined(name)); openWindow?.('team'); } });
      else if (a === 'quit') {
        choice(quitAsk(banner), (b) => {
          if (b !== 'quit') return;
          void Promise.resolve(on.team(null)).then((r) => { if (r?.ok) say(ARENA_TEXT.recruiter.quitDone(name)); });
        });
      } else if (a === 'window') openWindow?.('team');
    });
    return true;
  }

  function heraldChoice({ cityBout = null, healthShare = (P.health ?? 0) / Math.max(1, P.maxHealth ?? 1), league = P.arenaLeague } = {}) {
    const on = online();
    const fought = watchRefusal(exhibitionFor(gm())?.hour) != null;
    if (!on) return heraldChoiceOf({ gameMinutes: gm(), cityBout, ladder: arenaLadderRestore(P.arenaLadder), healthShare, league, replays: arenaReplaysRestore(P.arenaReplays).length, fought });
    const climb = on.climb?.() ?? null;
    const ch = heraldChoiceOf({ gameMinutes: gm(), cityBout, ladder: climb, healthShare, league: null, fought });
    if (!climb) {
      const H = ARENA_TEXT.herald;
      const next = ch.next ? H.ladderNext(ch.next.tierName, ch.next.label) : null;
      const wait = on.shutText?.(ARENA_TEXT.online.climbWait) ?? ARENA_TEXT.online.climbWait;
      ch.lines = ch.lines.map((l) => (l === next ? wait : l)).filter((l) => l !== H.noFight);
      ch.options = ch.options.filter((o) => o.act !== 'fight');
      ch.next = null;
    }
    const me = on.board?.()?.me;
    if (me?.banner === 'red' || me?.banner === 'blue') ch.lines.push(on.board().team?.laurel === me.banner ? ARENA_TEXT.teams.laurelYou : ARENA_TEXT.teams.under(ARENA_TEXT.teams.the[me.banner]));
    return ch;
  }
  function hall() {
    const on = online();
    if (!on) return false;
    const show = (b) => deps.showOverlay(new ActionTextBox(b ? hallLinesOnline(b, P.name ?? '') : [ARENA_TEXT.undercroft.hallTitle, '', on.shutText?.(ARENA_TEXT.online.rollWait) ?? ARENA_TEXT.online.rollWait]));
    const b = on.board?.() ?? null;
    if (b) show(b);
    else void Promise.resolve(on.fetchBoard?.() ?? null).then(show, () => show(null));
    return true;
  }
  function plaques() {
    const on = online();
    if (!on) return hallPlaques({ ladder: P.arenaLadder, league: P.arenaLeague, gameMinutes: gm(), name: P.name ?? '', max: PLAQUE_MAX });
    const b = on.board?.() ?? null;
    if (!b) on.refresh?.();
    return b ? hallPlaques({ board: b, max: PLAQUE_MAX }) : [];
  }
  function joined() {
    const on = online();
    if (!on) return !!rollLeague(P.arenaLeague, gm()).team;
    const b = on.board?.() ?? null;
    if (!b) on.refresh?.();
    return !!b?.me?.banner;
  }

  const B = ARENA_TEXT.book;
  function settle() {
    const on = online();
    if (!on) { setBook(settleBook(league().book, gm(), { liveHour: liveHour() }).book); return; }
    if (!on.exhibitions?.()) return;
    let book = league().book;
    const g = gm(), here = liveHour();
    for (const w of bookRestore(book).wagers) {
      if (w.status !== 'open' || w.hour === here || g < (w.hour + 1) * 60 || bookRestore(book).seen.some((x) => x.hour === w.hour)) continue;
      const v = on.exhibitionVerdict(w.hour, g);
      if (v?.house) { const ex = exhibitionFor(w.hour * 60); book = bookVerdict(book, w.hour, ex ? houseOutcome(ex) : null); }
      else if (v) book = bookVerdict(book, w.hour, v.side);
    }
    // -Infinity means no hour is out, so settleBook settles only the verdicts recorded above.
    setBook(settleBook(book, -Infinity).book);
  }
  function watchRefusal(hour) {
    if (hour == null || online()?.exhibitions?.()) return null;
    return (begun() && liveHour() === hour) || bookSaw(league().book, hour) ? ARENA_TEXT.herald.watchSeen : null;
  }
  function verdictSeen(hour, side) {
    setBook(bookVerdict(league().book, hour, side));
    settle();
  }
  function wager(hour, side, stake) {
    const ex = exhibitionFor(gm());
    if (!ex || ex.hour !== hour) return { ok: false, text: B.whyRefused.closed };
    const r = placeWager(league().book, ex, side, stake, { gold: totalGoldAmount(P), begun: begun(), gameMinutes: gm() });
    if (!r.ok) return { ok: false, text: B.whyRefused[r.reason ?? 'closed'] };
    deductGold(P, r.cost);
    setBook(r.book);
    const name = fighterIdentity(ex.seed, side, ex.opponents[side].mobile).name;
    return { ok: true, text: B.taken(r.cost, name, oddsText(priceFor(exhibitionOdds(ex)[side]))) };
  }
  function bookmaker() {
    settle();
    const ch = bookmakerChoice({ league: league(), gameMinutes: gm(), gold: totalGoldAmount(P), begun: begun(), window: typeof openWindow === 'function' });
    choice(ch, (a) => {
      if (a === 'collect') {
        const r = collectWinnings(league().book);
        setBook(r.book);
        if (r.gold > 0) { addGold(P, r.gold); say(B.paid(r.gold)); }
      } else if (a === 'back0' || a === 'back1') {
        const ex = ch.exhibition;
        if (!ex) return;
        const side = a === 'back1' ? 1 : 0;
        const name = fighterIdentity(ex.seed, side, ex.opponents[side].mobile).name;
        const price = oddsText(priceFor(exhibitionOdds(ex)[side]));
        choice(stakeChoice({ name, price, gold: totalGoldAmount(P) }), (b, o) => {
          if (b !== 'stake') return;
          const r = wager(ex.hour, side, o.stake);
          say(r.text);
        });
      } else if (a === 'window') openWindow?.('bouts');
    });
    return true;
  }

  function board() {
    settle();
    return arenaBoard({
      ladder: P.arenaLadder, league: league(), gameMinutes: gm(), name: P.name ?? '', atGate: !!deps.atGate?.(), onSand: deps.onSand?.() ?? null,
      healthShare: (P.health ?? 0) / Math.max(1, P.maxHealth ?? 1), gold: totalGoldAmount(P), liveHour: liveHour(), begun: begun(),
      online: online()?.model() ?? null,
      replays: P.arenaReplays ?? [],
    });
  }
  function windowAct(kind, data = {}) {
    const atGate = !!deps.atGate?.();
    if (kind === 'wager') {
      if (!atGate) return { ok: false, text: ARENA_TEXT.window.whyGate };
      return wager(data.hour, data.side === 1 ? 1 : 0, Math.floor(Number(data.stake) || 0));
    }
    if (kind === 'queue' || kind === 'casual' || kind === 'unqueue' || kind === 'accept' || kind === 'decline' || kind === 'spectate') return online()?.act(kind, data) ?? { ok: false, text: ARENA_TEXT.online.whyOffline };
    if (typeof kind === 'string' && kind.startsWith('priv')) return online()?.act(kind, data) ?? { ok: false, text: ARENA_TEXT.online.whyOffline };
    if (kind === 'replay') {
      if (online()) return { ok: false, text: ARENA_TEXT.replay.offline };
      if (!atGate) return { ok: false, text: ARENA_TEXT.window.whyGate };
      const i = Math.floor(Number(data.i) || 0);
      if (!arenaReplaysRestore(P.arenaReplays)[i]) return { ok: false, text: ARENA_TEXT.replay.gone };
      closeArenaDoor();
      deps.heraldAct?.(`replay:${i}`);
      return { ok: true, text: '' };
    }
    if (kind === 'watch' || kind === 'fight') {
      if (!atGate) return { ok: false, text: ARENA_TEXT.window.whyGate };
      const seen = kind === 'watch' ? watchRefusal(exhibitionFor(gm())?.hour) : null;
      if (seen) return { ok: false, text: seen };
      const on = online();
      const onLadder = on ? on.climb?.() ?? null : P.arenaLadder;
      if (kind === 'fight' && on && !onLadder) return { ok: false, text: on.shutText?.(ARENA_TEXT.online.climbWait) ?? ARENA_TEXT.online.climbWait };
      if (kind === 'fight' && !nextLadderBout(onLadder)) return { ok: false, text: ARENA_TEXT.herald.ladderDone };
      if (kind === 'fight' && (P.health ?? 0) / Math.max(1, P.maxHealth ?? 1) < FIGHT_HEALTH_MIN) return { ok: false, text: ARENA_TEXT.window.whyHurt };
      closeArenaDoor();
      deps.heraldAct?.(kind);
      return { ok: true, text: '' };
    }
    return { ok: false, text: '' };
  }
  function windowOverlay(page = 'bouts') {
    return createArenaOverlay({ page, board: () => board(), act: (k, d) => windowAct(k, d) });
  }

  return { recruiter, bookmaker, wager, settle, verdictSeen, board, windowAct, windowOverlay, heraldChoice, hall, joined, openWindow: (page) => openWindow?.(page) ?? false,
    watchRefusal,
    plaques,
  };
}
