// @ts-check

import { ARENA_TEXT } from './arenaText.js';
import { exhibitionFor, nextExhibitionHour, nextLadderBout, ladderTitle } from './arenaLadder.js';
import { rollLeague, leagueStandings, joinRefusal, laurelWorn, otherBanner } from './arenaLeague.js';

export const FIGHT_HEALTH_MIN = 0.5;

/**
 * @param {{ gameMinutes: number, cityBout?: { a: string, b: string } | null, ladder?: any, healthShare?: number, window?: boolean, league?: any, replays?: number, fought?: boolean }} o
 */
export function heraldChoice({ gameMinutes, cityBout = null, ladder = null, healthShare = 1, window = true, league = null, replays = 0, fought = false }) {
  const H = ARENA_TEXT.herald;
  const lines = [];
  const hour = Math.floor(Math.max(0, gameMinutes) / 60);
  lines.push(H.greet[hour % H.greet.length]);
  lines.push('');
  const ex = exhibitionFor(gameMinutes);
  // No Watch once the hour's bout had its word here, since watching would restart it with both fighters whole.
  const canWatch = !fought && (!!cityBout || !!ex?.open);
  if (cityBout) { lines.push(H.onNow(cityBout.a, cityBout.b)); if (fought) lines.push(H.underWay); }
  else if (!canWatch) { lines.push(H.noWatch); lines.push(H.nextAt(nextExhibitionHour(gameMinutes))); }
  const next = nextLadderBout(ladder);
  const fit = healthShare >= FIGHT_HEALTH_MIN;
  if (!next) lines.push(H.ladderDone);
  else {
    lines.push(H.ladderNext(next.tierName, next.label));
    if (!fit) lines.push(H.noFight);
  }
  const title = ladderTitle(ladder);
  if (title) lines.push(H.title(title));
  const team = league ? rollLeague(league, gameMinutes).team : null;
  if (team) lines.push(laurelWorn(league, gameMinutes) ? ARENA_TEXT.teams.laurelYou : ARENA_TEXT.teams.under(ARENA_TEXT.teams.the[team]));
  if (replays > 0) lines.push(ARENA_TEXT.replay.heraldLine);
  const options = [];
  if (canWatch) options.push({ code: 'KeyW', label: H.watch, act: 'watch' });
  if (next && fit) options.push({ code: 'KeyF', label: H.fight, act: 'fight' });
  if (replays > 0) options.push({ code: 'KeyR', label: ARENA_TEXT.replay.herald, act: 'replay' });
  if (window) options.push({ code: 'KeyA', label: H.window, act: 'window' });
  options.push({ code: 'KeyH', label: H.hall, act: 'hall' });
  options.push({ code: 'KeyL', label: H.leave, act: 'leave' });
  options.push({ code: 'Escape', label: null, act: 'leave' });
  return { lines, options, exhibition: ex, next };
}

/** @param {{ banner: 'red'|'blue', league: any, gameMinutes: number, window?: boolean }} o */
export function recruiterChoice({ banner, league, gameMinutes, window = true }) {
  const R = ARENA_TEXT.recruiter, T = ARENA_TEXT.teams;
  const me = T.the[banner];
  const L = rollLeague(league, gameMinutes);
  const st = leagueStandings(L, gameMinutes);
  const lines = [...R.greet[banner], ''];
  lines.push(`${cap(T.season(st.season))}, ${T.seasonDay(st.day)}.`);
  lines.push(T.standing(st.red, st.blue));
  const why = joinRefusal(L, banner, gameMinutes);
  if (why === 'already') { lines.push(R.yours(me)); lines.push(T.given(st.given)); if (laurelWorn(L, gameMinutes)) lines.push(T.laurelYou); }
  else if (why === 'other') lines.push(R.theirs(T.the[otherBanner(banner)]));
  else if (why === 'season') lines.push(R.wait(T.the[otherBanner(banner)]));
  else { lines.push(R.pitch); lines.push(R.rule); }
  const options = [];
  if (!why) options.push({ code: 'KeyJ', label: R.join(me), act: 'join' });
  if (why === 'already') options.push({ code: 'KeyQ', label: R.quit(me), act: 'quit' });
  if (window) options.push({ code: 'KeyA', label: R.window, act: 'window' });
  options.push({ code: 'KeyL', label: R.leave, act: 'leave' });
  options.push({ code: 'Escape', label: null, act: 'leave' });
  return { lines, options };
}
export function quitAsk(banner) {
  const R = ARENA_TEXT.recruiter;
  return {
    lines: [R.askQuit(ARENA_TEXT.teams.the[banner])],
    options: [{ code: 'KeyY', label: R.yes, act: 'quit' }, { code: 'KeyN', label: R.no, act: 'stay' }, { code: 'Escape', label: null, act: 'stay' }],
  };
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
