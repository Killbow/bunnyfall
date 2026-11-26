// @ts-check
import { t } from '../../ui/textManager.js';
import { registerModSaveData } from '../../saves/modSaveData.js';
import { MINUTES_PER_DAY } from '../../world/gameDate.js';
import { REGION_NAMES } from '../../formats/mapsFile.js';
import { goldAmount, deductGoldPieces } from '../../justice/court.js';
import { awakenedVampirism, spendVitae, beastStageNow } from './vitae.js';
import { BEAST } from './bloodLaw.js';
import { clanOfRegion, clanName, clanStrikeWeight, CLANS } from './clanLaw.js';
import { setHunts, huntedBy } from './courtLeaf.js';
import { startNamedRacialQuest, racialQuestLive } from '../../afflictions/racialQuests.js';

// Masquerade heat and Court records are saved per character under this mod save key; renaming it orphans saves.
export const MASQUERADE_SAVE_VENDOR = 'Bunnyfall Masquerade';
export const BREACH_HEAT = Object.freeze({ cried: 8, seen: 15, body: 10, murder: 30, taken: 6, freed: 10, power: 8 });
const STRIKING = new Set(['seen', 'body', 'murder', 'freed']);
export const HEAT_COOL_PER_DAY = 10;
export const TIER_FLOOR = Object.freeze([0, 25, 50, 75]);
export const TITHE_PER_STRIKE = 100;
export const VITAE_PER_HUNDRED = 8;
export const HUNT_STRIKES = 3;
export const QUIET_DAYS = 7;
export const PENANCE_QUEST = 'QLVA02';
export const COURT_WORK_QUEST = 'QLVA03';
export const HUNTER_CHANCE = Object.freeze([0, 8, 18, 30]);
export const ASSASSIN_CHANCE = 15;
export const AMBUSH_GAP = Object.freeze({ hunter: 180, assassin: 240 });

/**
 * @typedef {{ strikes: number, owed: number, hunt: boolean, quietSince: number }} CourtRec
 */
const fresh = () => ({ heat: /** @type {Record<string, number>} */ ({}), heatAt: /** @type {number|null} */ (null),
  courts: /** @type {Record<string, CourtRec>} */ ({}), penance: /** @type {number|null} */ (null), work: /** @type {number|null} */ (null),
  ambushAt: /** @type {Record<string, number>} */ ({}), said: /** @type {Record<string, number>} */ ({}) });
let _s = fresh();
const _lines = [];
const note = (s) => { if (s) _lines.push(s); };
export const takeMasqueradeLines = () => _lines.splice(0);
const syncHunts = () => setHunts(Object.entries(_s.courts).filter(([, c]) => c.hunt).map(([k]) => Number(k)));

export const regionName = (r) => String(REGION_NAMES[r] ?? t('masq.someRegion', 'the region'));
/** @param {number} heat */
export function tierOf(heat) {
  let n = 0;
  for (let i = 1; i < TIER_FLOOR.length; i++) if (heat >= TIER_FLOOR[i]) n = i;
  return n;
}
/** @param {number} tier */
export function tierName(tier) {
  return [t('masq.tier.quiet', 'Quiet'), t('masq.tier.uneasy', 'Uneasy'), t('masq.tier.suspicious', 'Suspicious'), t('masq.tier.hunted', 'Hunted')][tier] ?? '';
}
const TIER_LINES = [
  '',
  () => t('masq.rise.uneasy', 'People in {region} whisper of pale strangers. Lock your doors, they say.'),
  () => t('masq.rise.suspicious', '{region} is suspicious now. Witch hunters ask questions in the taverns.'),
  () => t('masq.rise.hunted', '{region} hunts its vampires. The witch hunters are out every night.'),
];

/** @param {number} now */
function cool(now) {
  if (_s.heatAt == null) { _s.heatAt = now; return; }
  const days = Math.max(0, now - _s.heatAt) / MINUTES_PER_DAY;
  if (!(days > 0)) return;
  _s.heatAt = now;
  for (const [r, h] of Object.entries(_s.heat)) {
    const v = Math.max(0, h - days * HEAT_COOL_PER_DAY);
    if (v <= 0) { delete _s.heat[r]; delete _s.said[r]; } else _s.heat[r] = v;
    if (v > 0 && tierOf(v) < (_s.said[r] ?? 0)) _s.said[r] = tierOf(v);
  }
}
/** @param {number} region @param {number} now */
export function heatOf(region, now) { cool(now); return Math.round(_s.heat[region] ?? 0); }
/** @param {number} now */
export function heatList(now) {
  cool(now);
  return Object.entries(_s.heat).map(([r, h]) => ({ region: Number(r), heat: Math.round(h), tier: tierOf(h) })).sort((a, b) => b.heat - a.heat);
}
/** @param {number} region @param {number} now */
export const watcherChance = (region, now) => tierOf(heatOf(region, now)) * 8;

/** @param {number} clan @param {number} now */
function courtOf(clan, now) {
  const k = String(clan);
  _s.courts[k] ??= { strikes: 0, owed: 0, hunt: false, quietSince: now };
  return _s.courts[k];
}
/** @param {number} clan */
export const courtState = (clan) => _s.courts[String(clan)] ?? { strikes: 0, owed: 0, hunt: false, quietSince: 0 };

/**
 * @param {any} entity
 * @param {number} region
 * @param {keyof typeof BREACH_HEAT} kind
 * @param {number} now
 */
export function noteBreach(entity, region, kind, now) {
  const entry = awakenedVampirism(entity);
  if (!entry || !Number.isInteger(region) || region < 0) return 0;
  cool(now);
  const starving = beastStageNow(entity, now) >= BEAST.Starving && (kind === 'seen' || kind === 'murder');
  const add = (BREACH_HEAT[kind] ?? 0) * (starving ? 2 : 1);
  const h = Math.min(100, (_s.heat[region] ?? 0) + add);
  _s.heat[region] = h;
  const tier = tierOf(h);
  if (tier > (_s.said[region] ?? 0)) { _s.said[region] = tier; note(/** @type {(() => string) | null} */ (TIER_LINES[tier])?.()?.replace('{region}', regionName(region)) ?? ''); }
  const clan = clanOfRegion(region);
  if (clan != null && STRIKING.has(kind)) {
    const c = courtOf(clan, now);
    const w = clanStrikeWeight(entry.clan) * (starving ? 2 : 1);
    c.strikes += w;
    c.owed += TITHE_PER_STRIKE * w;
    c.quietSince = now;
    const own = clan === entry.clan;
    if (!c.hunt && (c.strikes >= HUNT_STRIKES || kind === 'murder')) {
      c.hunt = true;
      syncHunts();
      note(own
        ? t('masq.hunt.own', 'The {clan} Court has declared a Blood Hunt on you. Its assassins will come by night, and your clan withholds its gifts until you ask the Court for penance.', { clan: clanName(clan) })
        : t('masq.hunt.rival', 'The {clan} Court, whose land this is, has declared a Blood Hunt on you. Its assassins will come by night.', { clan: clanName(clan) }));
    } else if (!c.hunt) {
      note(t('masq.strike', 'Word of it reaches the {clan} Court. Strike {n} of {max}; a tithe of {gold} gold is owed.', { clan: clanName(clan), n: c.strikes, max: HUNT_STRIKES, gold: c.owed }));
    }
  }
  return add;
}

/** @param {any} entity @param {number} now @param {(line: string) => void} [say] */
export function masqueradeRound(entity, now, say = () => {}) {
  if (!awakenedVampirism(entity)) return;
  cool(now);
  for (const c of Object.values(_s.courts)) {
    if (c.strikes > 0 && !c.hunt && now - c.quietSince >= QUIET_DAYS * MINUTES_PER_DAY) { c.strikes--; c.quietSince = now; }
  }
  for (const line of takeMasqueradeLines()) say(line);
}

/** @param {number} gold */
export const titheInVitae = (gold) => Math.ceil(gold / 100) * VITAE_PER_HUNDRED;
/** @param {any} entity @param {number} clan @param {'gold'|'vitae'} how @param {number} now */
export function payTithe(entity, clan, how, now) {
  const c = courtState(clan);
  if (!(c.owed > 0)) return [t('masq.tithe.none', 'You owe this Court nothing.')];
  if (how === 'gold') {
    if (goldAmount(entity) < c.owed) return [t('masq.tithe.poor', 'You do not have {gold} gold.', { gold: c.owed })];
    deductGoldPieces(entity, c.owed);
  } else if (!spendVitae(entity, titheInVitae(c.owed), now)) return [t('masq.tithe.thin', 'You do not have {n} Vitae to spare.', { n: titheInVitae(c.owed) })];
  const rec = courtOf(clan, now);
  rec.owed = 0;
  rec.strikes = Math.max(0, rec.strikes - 1);
  rec.quietSince = now;
  return [t('masq.tithe.paid', 'The tithe is taken. The {clan} Court is satisfied, for now.', { clan: clanName(clan) })];
}
/** @param {number} clan */
export function askPenance(clan) {
  if (!courtState(clan).hunt) return [t('masq.penance.none', 'This Court has no quarrel that needs penance.')];
  // A penance quest left to lapse clears the record, so the penance may be asked again.
  if (racialQuestLive(PENANCE_QUEST) === false) _s.penance = null;
  if (_s.penance != null || racialQuestLive(PENANCE_QUEST)) return [t('masq.penance.busy', 'You are already doing penance.')];
  if (!startNamedRacialQuest(PENANCE_QUEST)) return [t('masq.penance.wait', 'The Court will send for you. Come back later.')];
  _s.penance = clan;
  return [t('masq.penance.given', 'Penance is given. A witch hunter has learned too much about the {clan}; silence them. A letter will tell you where.', { clan: clanName(clan) })];
}
export function penanceDone() {
  const clan = _s.penance;
  _s.penance = null;
  if (clan == null) return [];
  const c = _s.courts[String(clan)];
  if (c) { c.hunt = false; c.strikes = 0; }
  syncHunts();
  note(t('masq.penance.done', 'The {clan} Court has lifted its Blood Hunt.', { clan: clanName(clan) }));
  return [];
}
/** @param {any} entity @param {number} clan */
export function askCourtWork(entity, clan) {
  const entry = awakenedVampirism(entity);
  if (!entry || entry.clan !== clan) return [t('masq.work.notYours', 'This is not your Court.')];
  if (courtState(clan).hunt) return [t('masq.work.hunted', 'An outcast gets no work from the Court.')];
  if (racialQuestLive(COURT_WORK_QUEST) === false) _s.work = null;
  if (_s.work != null || racialQuestLive(COURT_WORK_QUEST)) return [t('masq.work.busy', 'You already have the Court\'s work.')];
  if (!startNamedRacialQuest(COURT_WORK_QUEST)) return [t('masq.penance.wait', 'The Court will send for you. Come back later.')];
  _s.work = clan;
  return [t('masq.work.given', 'A rogue of a rival bloodline hides in the region. The Court wants them destroyed. A letter will tell you where.')];
}
export function courtWorkDone() {
  const clan = _s.work;
  _s.work = null;
  if (clan == null) return [];
  const c = _s.courts[String(clan)];
  if (c) c.strikes = Math.max(0, c.strikes - 1);
  return [];
}
export function questLapsed(name) {
  if (name === PENANCE_QUEST) _s.penance = null;
  if (name === COURT_WORK_QUEST) _s.work = null;
}

/**
 * @param {any} entity
 * @param {'hunter'|'assassin'} kind
 * @param {number} region
 * @param {number} now
 * @param {() => number} [rolls]
 */
export function ambushDue(entity, kind, region, now, rolls = Math.random) {
  const entry = awakenedVampirism(entity);
  if (!entry) return null;
  if (now - (_s.ambushAt[kind] ?? -Infinity) < AMBUSH_GAP[kind]) return null;
  if (kind === 'hunter') {
    const tier = tierOf(heatOf(region, now));
    if (!tier || Math.floor(rolls() * 100) >= HUNTER_CHANCE[tier]) return null;
    _s.ambushAt[kind] = now;
    return { n: tier };
  }
  const hunting = CLANS.filter((c) => courtState(c).hunt);
  if (!hunting.length || Math.floor(rolls() * 100) >= ASSASSIN_CHANCE) return null;
  _s.ambushAt[kind] = now;
  const clan = hunting[Math.floor(rolls() * hunting.length)];
  return { n: courtState(clan).strikes >= 5 ? 2 : 1, clan };
}
export { huntedBy };

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);
registerModSaveData(MASQUERADE_SAVE_VENDOR, {
  newSaveData: () => fresh(),
  getSaveData: () => JSON.parse(JSON.stringify(_s)),
  restoreSaveData: (r) => {
    const s = fresh();
    if (r && typeof r === 'object') {
      for (const [k, v] of Object.entries(r.heat ?? {})) if (/^\d{1,2}$/.test(k) && Number.isFinite(v)) s.heat[k] = Math.max(0, Math.min(100, v));
      for (const [k, v] of Object.entries(r.said ?? {})) if (/^\d{1,2}$/.test(k) && Number.isInteger(v)) s.said[k] = Math.max(0, Math.min(3, v));
      for (const [k, v] of Object.entries(r.courts ?? {})) {
        if (!CLANS.includes(Number(k)) || !v || typeof v !== 'object') continue;
        s.courts[k] = { strikes: Math.max(0, Math.min(20, num(v.strikes) | 0)), owed: Math.max(0, Math.min(100000, num(v.owed) | 0)), hunt: v.hunt === true, quietSince: num(v.quietSince) };
      }
      s.heatAt = Number.isFinite(r.heatAt) ? r.heatAt : null;
      s.penance = CLANS.includes(r.penance) ? r.penance : null;
      s.work = CLANS.includes(r.work) ? r.work : null;
      for (const k of ['hunter', 'assassin']) if (Number.isFinite(r.ambushAt?.[k])) s.ambushAt[k] = r.ambushAt[k];
    }
    _s = s;
    syncHunts();
  },
  newGame: () => { _s = fresh(); _lines.length = 0; syncHunts(); },
});
