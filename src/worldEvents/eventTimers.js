// @ts-check
// A row's `shut` flag marks a live event nobody can join any more; the Timers window lists it and `eventBoard.js`
// leaves it out.
import { gateAt, gateTimes, gatePhase, GATE_EVERY_DAYS, gameDayAt, GATE_DAY_MINUTES } from '../net/gateLaw.js';
import { wallMsForClassicMinutes } from '../net/wire.js';
import { seatWeekOf, seatWeekStartMs, seatPhaseOf, SEAT_RECKONING_MS, seasonOf, seatSeasonName, battleLengthMs, SIGN_CLOSES_MS, guildWords } from '../net/townSeatLaw.js';
import { serpentAt, serpentTimes, serpentPhase, serpentBossOf, SERPENT_EVERY_DAYS } from '../net/serpentLaw.js';
import { sdPhase, SD_COLLAPSE_MS } from '../net/sdLaw.js';
import { egTimes } from '../net/eliteGates/egLaw.js';
import { arenaSeasonOf, arenaSeasonEndsS } from '../net/arenaLaw.js';
import { ketchVoyageAt } from '../net/ketch/ketchLaw.js';
import { t } from '../ui/textManager.js';
import { contentOn } from '../mods/contentOff.js';

const OFF_KINDS = Object.freeze({ gate: 'dagonBreaches', serpent: 'seaSerpent', super: 'abyssDungeons', ketch: 'skyKetch', star: 'witchesFestival', eg: 'eliteBreach' });

const DAY_MS = 86_400_000;

export const TIMER_GROUPS = Object.freeze([
  Object.freeze({ id: 'world', kinds: Object.freeze(['gate', 'serpent', 'super', 'star', 'ketch']) }),
  Object.freeze({ id: 'spire', kinds: Object.freeze(['elite']) }),
  Object.freeze({ id: 'raids', kinds: Object.freeze(['raid']) }),
  Object.freeze({ id: 'seats', kinds: Object.freeze(['seat', 'battle']) }),
  Object.freeze({ id: 'resets', kinds: Object.freeze(['reset']) }),
]);
export const timerGroupOf = (kind) => TIMER_GROUPS.find((g) => g.kinds.includes(kind))?.id ?? 'resets';
/**
 * @template {{ kind: string, live: boolean }} R
 * @param {ReadonlyArray<R>|null|undefined} rows
 * @returns {Array<{ id: string, rows: R[], live: number }>}
 */
export function timerGroups(rows) {
  return TIMER_GROUPS.map((g) => {
    const of = (rows ?? []).filter((r) => timerGroupOf(r.kind) === g.id);
    return { id: g.id, rows: of, live: of.filter((r) => r.live).length };
  }).filter((g) => g.rows.length);
}

const BATTLE_TITLE = Object.freeze({ siege: (n) => `Siege of ${n}`, tourney: (n) => `Tourney at ${n}`, revolt: (n) => `Revolt at ${n}` });

const capital = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function ketchRows(now, coming, live) {
  const kv = ketchVoyageAt(now), kWhere = t('ketch.timers.where', 'Over Daggerfall');
  if (kv.phase === 'away') coming(`ketch:${kv.n}`, 'ketch', t('ketch.timers.sighted', 'The Sky-Ketch is sighted'), kv.sightAt, kWhere, t('ketch.timers.sightedSub', 'It stays east of the city for seven hours'));
  else if (kv.phase === 'sighted') coming(`ketch:${kv.n}`, 'ketch', t('ketch.timers.arrives', 'The Sky-Ketch arrives'), kv.at, kWhere, t('ketch.timers.arrivesSub', 'Its anchor-lift comes down when this runs out'));
  else if (kv.phase === 'docked') live(`ketch:${kv.n}`, 'ketch', t('ketch.timers.station', 'The Sky-Ketch keeps station'), kv.departAt, kWhere, t('ketch.timers.stationSub', 'Its anchor-lift is down in the fields east of the city until this runs out'));
  else live(`ketch:${kv.n}`, 'ketch', t('ketch.timers.departing', 'The Sky-Ketch weighs anchor'), kv.endAt, kWhere, t('ketch.timers.departingSub', 'The crews aboard have until this runs out'));
}

/** @param {{ now: number, gate?: { place?: string|null, fellAt?: (day: number) => (number|null) } | null, serpent?: { place?: string|null, fellAt?: (day: number) => (number|null) } | null, sd?: { rec: any, name?: string|null, place?: string|null, site?: { cityName?: string, px?: number, py?: number } | null } | null, stars?: Array<{ id: string, kind: string, title: string, where: string|null, detail: string|null, live: boolean, at: number, until: number|null }> | null, elite?: { op: number, rh?: number, h?: number, until?: number|null, end?: string|null } | null, doors?: { board?: () => any } | null, seatsOpen?: boolean, seats?: Array<any> | null, zero?: number | null, region?: string | null, raids?: Array<{ name: string, region?: string, type?: string, startMs: number, endMs: number, done?: boolean }> | null }} src */
export function eventTimerRows(src) {
  const now = Number(src?.now);
  if (!Number.isFinite(now)) return [];
  /** @type {Array<{id: string, kind: string, title: string, where: string|null, detail: string|null, live: boolean, at: number, until: number|null, door?: string, shut?: boolean}>} */
  const rows = [];
  const switchedOff = (kind) => OFF_KINDS[kind] != null && !contentOn(OFF_KINDS[kind]);
  const coming = (id, kind, title, at, where = null, detail = null) => switchedOff(kind) || rows.push({ id, kind, title, where, detail, live: false, at, until: null });
  const live = (id, kind, title, until, where = null, detail = null) => switchedOff(kind) || rows.push({ id, kind, title, where, detail, live: true, at: until, until });

  const t = gateAt(now);
  const fell = src?.gate?.fellAt?.(t.day) ?? null;
  const phase = gatePhase(t, now, fell);
  const place = src?.gate?.place ? `Near ${src.gate.place}` : null;
  // In `gatePhase`, 'sealed' is the risen gate that is not open yet, and 'closed' is the gate shut for the night.
  if (phase === 'quiet') coming(`gate:${t.day}`, 'gate', 'Dagon\'s Breach opens', t.openAt, null, 'Its omen burns in the sky 15 minutes before');
  else if (phase === 'omen' || phase === 'rising' || phase === 'sealed') coming(`gate:${t.day}`, 'gate', 'Dagon\'s Breach opens', t.openAt, place, 'The omen is in the sky');
  else if (phase === 'open') live(`gate:${t.day}`, 'gate', 'Dagon\'s Breach open', t.sealAt, place, 'Seals when this runs out. Get inside');
  else if (phase === 'closed') { live(`gate:${t.day}`, 'gate', 'Dagon\'s Breach sealed', t.wrathAt, place, 'Collapses when this runs out'); rows[rows.length - 1].shut = true; }
  if (phase !== 'quiet') coming(`gate:${t.day + GATE_EVERY_DAYS}`, 'gate', 'Next Dagon\'s Breach opens', gateTimes(t.day + GATE_EVERY_DAYS).openAt);

  const s = serpentAt(now);
  const sPhase = serpentPhase(s, now, src?.serpent?.fellAt?.(s.day) ?? null);
  const sName = serpentBossOf(s.day).name;
  const off = src?.serpent?.place ? `Off ${src.serpent.place}` : null;
  if (sPhase === 'quiet') coming(`serpent:${s.day}`, 'serpent', `${sName} rises`, s.riseAt, null, 'The harbor bells ring 15 minutes before');
  else if (sPhase === 'omen') coming(`serpent:${s.day}`, 'serpent', `${sName} rises`, s.riseAt, off, 'The harbor bells are ringing. Its waters are circled on your map');
  else if (sPhase === 'rising' || sPhase === 'hunt' || sPhase === 'late') live(`serpent:${s.day}`, 'serpent', `${sName} hunts`, s.soundAt, off, 'It dives when this runs out. Sail out to join the hunt');
  if (sPhase !== 'quiet') {
    const nextDay = s.day + SERPENT_EVERY_DAYS;
    coming(`serpent:${nextDay}`, 'serpent', 'Next sea serpent rises', serpentTimes(nextDay).riseAt);
  }

  const sdRec = src?.sd?.rec ?? null;
  const sdNow = sdPhase(sdRec, now);
  const sdName = src?.sd?.name || 'The Abyss Dungeon';
  const sdPlace = src?.sd?.place ?? src?.sd?.site?.cityName ?? null;
  const sdWhere = sdPlace ? `Near ${sdPlace}` : null;
  if (sdNow === 'found') live(`sd:${sdRec.s}`, 'super', `${sdName} stands`, sdRec.until, sdWhere, 'Found. It fades away unbeaten when this runs out');
  else if (sdNow === 'fell') { live(`sd:${sdRec.s}`, 'super', `${sdName} collapses`, sdRec.fellAt + SD_COLLAPSE_MS, sdWhere, 'Its Hour is broken. It collapses when this runs out'); rows[rows.length - 1].shut = true; }
  else if (sdNow === 'gone' && Number.isFinite(sdRec?.next) && sdRec.next > now) coming(`sd:${(sdRec.s ?? 0) + 1}`, 'super', 'An Abyss Dungeon rises', sdRec.next, null, 'Not before this. Watch the Bay for its brass omen');

  for (const r of src?.stars ?? []) if (r?.kind === 'star' && !switchedOff('star') && typeof r.id === 'string' && Number.isFinite(r.at)) rows.push(r);

  ketchRows(now, coming, live);

  const el = src?.elite ?? null;
  if (el && Number.isFinite(el.op) && !el.end) {
    const T = egTimes({ openedAt: el.op }), what = el.rh ? 'Rehearsal' : 'Elite Breach';
    if ((el.h ?? 0) > 0 && Number.isFinite(el.until)) live(`elite:${el.op}`, 'elite', `Hall ${el.h}`, /** @type {number} */ (el.until), null, 'Time left');
    else if (now < T.openAt) coming(`elite:${el.op}`, 'elite', `${what} opens`, T.openAt, null, 'Your company is called');
    else if (now < T.admitUntil) live(`elite:${el.op}`, 'elite', `${what} open`, T.admitUntil, null, 'Answer the call before this runs out');
  }
  if (typeof src?.doors?.board === 'function') {
    const season = arenaSeasonOf(Math.floor(now / 1000));
    coming(`elite:season:${season}`, 'elite', `The Spire's season ${season} ends`, arenaSeasonEndsS(season) * 1000, null, 'Each Descent bracket\'s top ten hold the title Spire Champion through the next season');
    for (const r of rows) if (r.kind === 'elite') r.door = 'board';
  }

  const raidRow = (r) => {
    const where = r.region ? `In ${r.region}` : null;
    const who = r.type ? capital(r.type) : null;
    if (r.startMs > now) coming(`raid:${r.name}:${r.startMs}`, 'raid', `Raid on ${r.name}`, r.startMs, where, who ? `${who} attack` : null);
    else live(`raid:${r.name}:${r.startMs}`, 'raid', `Raid on ${r.name}`, r.endMs, where, who ? `${who} withdraw when this runs out` : null);
  };
  const raids = (src?.raids ?? []).filter((r) => r && Number.isFinite(r.startMs) && Number.isFinite(r.endMs) && r.endMs > now && !r.done);
  const home = src?.region ?? null;
  const elsewhere = [];
  for (const r of raids) (home && r.region === home ? raidRow(r) : elsewhere.push(r));
  if (elsewhere.length) {
    const next = elsewhere.reduce((a, r) => ((r.startMs <= now ? r.endMs : r.startMs) < (a.startMs <= now ? a.endMs : a.startMs) ? r : a));
    const more = elsewhere.length - 1;
    const rest = more ? `${more} more today across the Iliac Bay` : null;
    const under = next.startMs <= now;
    const id = `raids:elsewhere`;
    const title = home ? `Raids elsewhere: ${next.name}` : `Next raid: ${next.name}`;
    if (under) live(id, 'raid', title, next.endMs, next.region ? `In ${next.region}` : null, rest);
    else coming(id, 'raid', title, next.startMs, next.region ? `In ${next.region}` : null, rest);
  }

  // This is the event clock's day that drives bounty hunts and raids, not the calendar date in the sky, which turns
  // every real hour.
  const nextDay = Math.round(wallMsForClassicMinutes((gameDayAt(now) + 1) * GATE_DAY_MINUTES));
  coming('gameday', 'reset', 'New bounty hunts and raids', nextDay, null, 'New hunts on the bounty board and new town raids');

  coming('daily', 'reset', 'Daily reset', (Math.floor(now / DAY_MS) + 1) * DAY_MS, '00:00 UTC',
    `Gathering nodes come back. Daily limits reset for rare hides, Imperial Argents and Court writs${src?.seatsOpen ? ', and the Watch' : ''}`);

  const week = seatWeekOf(now);
  const turningAt = seatWeekStartMs(week + 1);
  const reckoningAt = turningAt - SEAT_RECKONING_MS;
  if (src?.seatsOpen) {
    if (seatPhaseOf(now) === 'muster') coming('reckoning', 'seat', 'The Reckoning', reckoningAt, 'Friday 18:00 UTC', 'Pledges lock until the Turning');
    else live('reckoning', 'seat', 'The Reckoning', turningAt, 'Pledges are locked', 'Ends at the Turning');
    coming('turning', 'seat', 'The Turning', turningAt, 'Sunday 18:00 UTC', 'Seats change hands. The Officers\' writ budget, the weekly caps and the Tides reset');
    const season = seasonOf(week, src?.zero ?? null);
    if (season) {
      const name = seatSeasonName(season.n);
      if (name) coming(`season:${season.n}`, 'seat', `${capital(name)} ends`, seatWeekStartMs(season.end), 'At its last Turning');
    }
  }

  for (const s of src?.seats ?? []) {
    const name = s?.name ?? s?.key ?? 'a seat';
    const b = s?.battle;
    if (b && b.state === 'scheduled' && Number.isFinite(b.startsAt)) {
      const start = b.startsAt * 1000;
      const end = Number.isFinite(b.endsAt) ? b.endsAt * 1000 : start + battleLengthMs({ kind: b.kind, tier: s.tier });
      const title = (BATTLE_TITLE[b.kind] ?? BATTLE_TITLE.siege)(name);
      // The service sends each side as a guild object (`id`, `name`, `tag`, `heraldry`), not a name string.
      const side = (g) => (g && typeof g === 'object' && g.name ? guildWords(g) : (typeof g === 'string' ? g : null));
      const a = side(b.guild), d = side(b.against) ?? side(s?.holder?.guild);
      const sides = a && d ? `${capital(a)} against ${d}` : a ? capital(a) : d ? `Against ${d}` : null;
      // An ended battle adds no row, but the loop still has to reach the Royal Tourney check below.
      if (end > now) {
        if (start > now) coming(`battle:${s.key ?? name}`, 'battle', title, start, sides, `Rosters close ${Math.round(SIGN_CLOSES_MS / 60_000)} minutes before`);
        else live(`battle:${s.key ?? name}`, 'battle', title, end, sides, 'Under way');
      }
    }
    if (s?.holder?.edict === 'royal-tourney') live(`royal:${s.key ?? name}`, 'battle', `Royal Tourney at ${name}`, turningAt, null, 'The champion is named at the Turning');
  }

  return rows.sort((a, b) => (a.live === b.live ? a.at - b.at : a.live ? -1 : 1));
}

// Seconds round up, matching `countdownText` in `net/gateLaw.js`, so this window and the gate banner show the same
// time.
export function timerText(ms) {
  const s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const two = (n) => String(n).padStart(2, '0');
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `${d}d ${two(h)}h`;
  if (h > 0) return `${h}:${two(m)}:${two(sec)}`;
  return `${m}:${two(sec)}`;
}

const WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
export function localWhenText(wallMs, todayMs = Date.now()) {
  const d = new Date(wallMs), t = new Date(todayMs);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
  if (sameDay) return hm;
  return wallMs - todayMs < 6 * DAY_MS ? `${WEEKDAYS[d.getDay()]} ${hm}` : `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${hm}`;
}
