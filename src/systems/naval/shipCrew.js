// @ts-check
import { srand, getSeed, setSeed } from '../../formats/dfRandom.js';
import { fullName, getNameBankOfRegion, GENDERS } from '../../characters/nameHelper.js';
import { REGION_NAMES } from '../../formats/mapsFile.js';
import { mulberry32 } from '../../combat/bloodArt.js';
import { MOBILE } from './navalBoarding.js';

export const MORALE_START = 60;
export const MORALE_MAX = 100;
export const MORALE_EVENT = Object.freeze({ win: 10, prize: 6, plunder: 3, grog: 15, handLost: -3, wrecked: -15, knocked: -4 });
export const LOSSES_CAP = -15;
// A hand lost within LOSSES_WINDOW_S of the last loss counts toward the same fight's LOSSES_CAP.
export const LOSSES_WINDOW_S = 60;
export const SEA_DECAY_S = 150;
export const PORT_RISE_S = 20;
export const PORT_CAP = 75;
export const HIGH_SPIRITS = 80;
export const LOW_SPIRITS = 20;
export const SING_MIN = 30;
export const MORALE_RELOAD = 0.12;
export const MORALE_MEND = 0.25;
export const GUNS_RELOAD = 0.88;

export const CREW_ORDERS = Object.freeze({ guns: 'guns', rail: 'rail', repair: 'repair', stand: 'stand' });
export const ORDER_TEXT = Object.freeze({
  guns: Object.freeze({ label: 'Man the guns', said: 'Guns manned, Captain!' }),
  rail: Object.freeze({ label: 'All hands to the rail', said: 'All hands to the rail!' }),
  repair: Object.freeze({ label: 'Make repairs', said: 'Carpenter\'s crew to work!' }),
  stand: Object.freeze({ label: 'Stand down', said: 'Aye, Captain. Standing down.' }),
});

export const ROLES = Object.freeze(['Bosun', 'Gunner', 'Carpenter', 'Lookout', 'Cook', 'Deckhand']);
export const LOOKOUT_ROLE = 'Lookout';
export const FIRST_MATE = 'First Mate';
export const CREW_ROLES = Object.freeze([FIRST_MATE, ...ROLES]);

export const SPIRITS = Object.freeze([
  Object.freeze({ at: 85, key: 'roaring', label: 'Roaring' }),
  Object.freeze({ at: 65, key: 'high', label: 'High' }),
  Object.freeze({ at: 45, key: 'steady', label: 'Steady' }),
  Object.freeze({ at: 25, key: 'low', label: 'Low' }),
  Object.freeze({ at: 0, key: 'grim', label: 'Grim' }),
]);
/** @param {number} m */
export const spiritsOf = (m) => SPIRITS.find((s) => m >= s.at) ?? SPIRITS[SPIRITS.length - 1];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const moraleFactor = (m) => clamp((m - 50) / 50, -1, 1);
export const reloadScaleOf = (m, order = null) => (1 - MORALE_RELOAD * moraleFactor(m)) * (order === CREW_ORDERS.guns ? GUNS_RELOAD : 1);
export const mendScaleOf = (m) => 1 + MORALE_MEND * moraleFactor(m);
export const handsBonusOf = (m, order = null) => (m >= HIGH_SPIRITS ? 1 : 0) - (m <= LOW_SPIRITS ? 1 : 0) + (order === CREW_ORDERS.rail ? 1 : 0);

export const MORALE_LINES = Object.freeze({
  high: Object.freeze([
    'Best crew on the Iliac Bay, and don\'t you forget it!', 'Captain\'s luck is holding.', 'I\'d follow this ship to Oblivion.',
    'A fine voyage, this.', 'Another prize like the last and I\'ll buy a farm.', 'Sing up, lads!',
  ]),
  low: Object.freeze([
    'How long since we saw port?', 'My bones ache for a tavern bench.', 'Hardtack again...', 'This voyage will be the death of us.',
    'Hope the captain knows what they\'re doing.', 'I miss dry land.',
  ]),
  repair: Object.freeze([
    'Pitch here!', 'Hand me that plank.', 'Mind the caulking iron!', 'It\'ll hold, give it time.', 'More oakum!', 'Patch that sail!',
  ]),
  guns: Object.freeze(['Guns manned!', 'Powder ready!', 'Shot in, rammed home!', 'Waiting on your word, Captain!']),
  rail: Object.freeze(['All hands to the rail!', 'Blades out, lads!', 'Nobody sets foot on our deck!']),
});

export const serviceOf = (h) => Math.max(0, (h?.fights ?? 0) | 0) + 2 * Math.max(0, (h?.boardings ?? 0) | 0) + Math.max(0, (h?.prior ?? 0) | 0);
export const VETERANCY = Object.freeze([
  Object.freeze({ tier: 0, at: 0, key: 'green', label: 'Green' }),
  Object.freeze({ tier: 1, at: 4, key: 'seasoned', label: 'Seasoned' }),
  Object.freeze({ tier: 2, at: 12, key: 'veteran', label: 'Veteran' }),
  Object.freeze({ tier: 3, at: 30, key: 'oldsalt', label: 'Old Salt' }),
]);
export function veteranOf(h) {
  const s = serviceOf(h);
  let v = VETERANCY[0];
  for (const r of VETERANCY) if (s >= r.at) v = r;
  return v;
}
export const SEASONED_HIRE = VETERANCY[1].at;
export const POST_WORTH = Object.freeze({
  Gunner: Object.freeze({ kind: 'reload', base: 0.04, per: 0.03 }),
  Carpenter: Object.freeze({ kind: 'mend', base: 0.15, per: 0.1 }),
  Lookout: Object.freeze({ kind: 'sight', base: 0.1, per: 0.1 }),
  Cook: Object.freeze({ kind: 'wear', base: 0.25, per: 0.25 }),
  Bosun: Object.freeze({ kind: 'way', base: 0.01, per: 0.01 }),
  'First Mate': Object.freeze({ kind: 'hands', hands: Object.freeze([0, 0, 1, 2]) }),
});
export const postWorth = (role, tier) => {
  const p = /** @type {Record<string, any>} */ (POST_WORTH)[role];
  if (!p) return 0;
  const t = Math.max(0, Math.min(VETERANCY.length - 1, tier | 0));
  return p.kind === 'hands' ? p.hands[t] : Math.round((p.base + p.per * t) * 10000) / 10000;
};
/**
 * @param {{ name: string, role: string, fights?: number, boardings?: number }[]} hands
 * @param {Set<string>|null} [away]
 */
export function postsOf(hands, away = null) {
  /** @type {Record<string, { name: string, tier: number, label: string }>} */
  const out = {};
  for (const h of hands ?? []) {
    if (!h || !POST_WORTH[h.role] || away?.has(h.name)) continue;
    const v = veteranOf(h);
    if (!out[h.role] || v.tier > out[h.role].tier) out[h.role] = { name: h.name, tier: v.tier, label: v.label };
  }
  return out;
}
/**
 * @param {{ name: string, role: string, fights?: number, boardings?: number }[]} hands
 * @param {Set<string>|null} [away]
 */
export function crewWorth(hands, away = null) {
  const posts = postsOf(hands, away);
  const w = (role) => (posts[role] ? postWorth(role, posts[role].tier) : 0);
  return {
    reload: 1 - w('Gunner'), mend: 1 + w('Carpenter'), sight: 1 + w('Lookout'), wear: 1 + w('Cook'), way: 1 + w('Bosun'),
    hands: w('First Mate'), posts,
  };
}
export const NO_WORTH = Object.freeze({ reload: 1, mend: 1, sight: 1, wear: 1, way: 1, hands: 0, posts: Object.freeze({}) });
export function postWords(role, tier) {
  const w = postWorth(role, tier), pc = (x) => `${Math.round(x * 100)}%`;
  if (!w) return '';
  if (role === 'Gunner') return `the guns reload ${pc(w)} quicker`;
  if (role === 'Carpenter') return `the crew repairs ${pc(w)} faster`;
  if (role === 'Lookout') return `the lookout sees ${pc(w)} further`;
  if (role === 'Cook') return `spirits last ${pc(w)} longer at sea`;
  if (role === 'Bosun') return `${pc(w)} more way under sail`;
  if (role === 'First Mate') return `${w} more ${w === 1 ? 'hand' : 'hands'} over the rail`;
  return '';
}

/**
 * @param {number} i
 * @param {number} mobile
 * @param {Map<string, number>} held
 */
const roleOf = (i, mobile, held) => (i === 0 ? FIRST_MATE : mobile === MOBILE.Bard ? 'Bard' : ROLES.reduce((best, r) => ((held.get(r) ?? 0) < (held.get(best) ?? 0) ? r : best), ROLES[0]));

/**
 * @param {number} seed
 * @param {number} hire
 * @param {'male'|'female'} gender
 * @param {number} regionIndex
 */
export function handName(seed, hire, gender, regionIndex = 17) {
  // Seeded by the boat and the hire number, so a hand's name never changes.
  const s = (Math.imul((seed >>> 0) ^ 0x7a3d, 0x9e3779b1) + Math.imul(hire + 1, 0x85ebca6b)) >>> 0;
  // Names draw from the shared classic random stream, so its seed is restored afterward.
  const saved = getSeed();
  try {
    srand(s || 1);
    const bank = getNameBankOfRegion(regionIndex >= 0 && regionIndex < REGION_NAMES.length ? regionIndex : 17);
    return fullName(bank, gender === 'female' ? GENDERS.Female : GENDERS.Male);
  } finally { setSeed(saved); }
}

/** @param {{ seed: number, regionIndex?: number, record?: any }} o */
export function createShipCrew({ seed, regionIndex = 17, record = null }) {
  /** @type {{ name: string, role: string, mobile: number, gender: 'male'|'female', fights: number, boardings: number, prior: number, hall?: string, lift?: number }[]} */
  let hands = [];
  let morale = MORALE_START, hires = 0, seaT = 0, portT = 0, losses = 0, lossT = 0;
  let grogDay = null;
  /** @type {string} */
  let order = CREW_ORDERS.stand;
  if (record && typeof record === 'object') {
    const m = Number(record.morale);
    morale = Number.isFinite(m) ? clamp(m, 0, MORALE_MAX) : MORALE_START;
    hires = Number.isInteger(record.hires) && record.hires >= 0 ? record.hires : 0;
    if (Array.isArray(record.hands)) {
      hands = record.hands.filter((h) => h && typeof h.name === 'string').slice(0, 64).map((h) => ({
        name: h.name, role: typeof h.role === 'string' ? h.role : 'Deckhand', mobile: Number.isInteger(h.mobile) ? h.mobile : MOBILE.Warrior,
        gender: h.gender === 'female' ? 'female' : 'male', fights: Math.max(0, h.fights | 0), boardings: Math.max(0, h.boardings | 0),
        prior: clamp(h.prior | 0, 0, VETERANCY[VETERANCY.length - 1].at),
        ...(typeof h.hall === 'string' && h.hall ? { hall: h.hall } : {}),
        ...(Number.isFinite(h.lift) && h.lift > 0 ? { lift: Math.min(MORALE_MAX, h.lift) } : {}),
      }));
    }
    hires = Math.max(hires, hands.length);
    if (typeof record.order === 'string' && /** @type {string[]} */ (Object.values(CREW_ORDERS)).includes(record.order)) order = record.order;
    if (Number.isFinite(record.grogDay)) grogDay = record.grogDay;
  }
  const rng = mulberry32(((seed >>> 0) ^ 0x3c7e11) >>> 0);
  const bump = (d) => { morale = clamp(morale + d, 0, MORALE_MAX); };

  return {
    get morale() { return morale; },
    get order() { return order; },
    get hands() { return hands; },
    spirits: () => spiritsOf(morale),
    /**
     * @param {{ mobile: number, gender: string }[]} roster
     * @param {{ service?: number }} [o]
     */
    sync(roster, { service = 0 } = {}) {
      const fell = [], joined = [];
      const start = Math.max(0, Math.min(VETERANCY[VETERANCY.length - 1].at, service | 0));
      while (hands.length > roster.length) fell.push(hands.pop());
      for (let i = hands.length; i < roster.length; i++) {
        const r = roster[i];
        /** @type {'male'|'female'} */
        const gender = r.gender === 'female' ? 'female' : 'male';
        const held = new Map();
        for (const x of hands) held.set(x.role, (held.get(x.role) ?? 0) + 1);
        const h = { name: handName(seed, hires++, gender, regionIndex), role: roleOf(i, r.mobile, held), mobile: r.mobile, gender, fights: 0, boardings: 0, prior: start };
        hands.push(h);
        joined.push(h);
      }
      return { fell, joined };
    },
    /** @param {number} i */
    nameOf: (i) => hands[i]?.name ?? null,
    /**
     * @param {string} name
     * @param {string} role
     */
    assign(name, role) {
      const h = hands.find((x) => x.name === name);
      if (!h) return { ok: false, text: 'There\'s no crew member by that name aboard.' };
      const bard = role === 'Bard' && h.mobile === MOBILE.Bard;
      if (!/** @type {readonly string[]} */ (CREW_ROLES).includes(role) && !bard) return { ok: false, text: 'There\'s no such post on this ship.' };
      if (role === LOOKOUT_ROLE && h.mobile === MOBILE.Bard) return { ok: false, text: `${h.name} leads the songs and doesn't keep lookout.` };
      if (h.role === role) return { ok: true, text: `${h.name} is already the ${role}.` };
      if (role === FIRST_MATE) for (const o of hands) if (o !== h && o.role === FIRST_MATE) o.role = 'Deckhand';
      h.role = role;
      return { ok: true, text: `${h.name} is now the ${role}.` };
    },
    /**
     * @param {{ name: string, role: string, mobile: number, gender: string, fights?: number, boardings?: number, hall?: string }} r
     * @param {number} [lift]
     */
    enlist(r, lift = 0) {
      if (!r || typeof r.name !== 'string' || !r.name || hands.some((h) => h.name === r.name)) return null;
      const bard = r.role === 'Bard' && r.mobile === MOBILE.Bard;
      const role = /** @type {readonly string[]} */ (CREW_ROLES).includes(r.role) || bard ? r.role : 'Deckhand';
      if (role === FIRST_MATE) for (const o of hands) if (o.role === FIRST_MATE) o.role = 'Deckhand';
      /** @type {'male'|'female'} */
      const gender = r.gender === 'female' ? 'female' : 'male';
      /** @type {{ name: string, role: string, mobile: number, gender: 'male'|'female', fights: number, boardings: number, prior: number, hall?: string, lift?: number }} */
      const h = { name: r.name, role, mobile: Number.isInteger(r.mobile) ? r.mobile : MOBILE.Warrior, gender, fights: Math.max(0, r.fights | 0), boardings: Math.max(0, r.boardings | 0), prior: 0 };
      if (typeof r.hall === 'string' && r.hall) h.hall = r.hall;
      hands.push(h);
      hires = Math.max(hires + 1, hands.length);
      // The hand keeps the morale he actually added and release takes it back, so hiring and paying off gains none.
      if (Number.isFinite(lift) && lift > 0) {
        const was = morale;
        bump(lift);
        if (morale > was) h.lift = morale - was;
      }
      return h;
    },
    /** @param {string} name */
    release(name) {
      const i = hands.findIndex((h) => h.name === name);
      if (i < 0) return null;
      const h = hands.splice(i, 1)[0];
      if (Number.isFinite(h.lift) && h.lift > 0) bump(-h.lift);
      return h;
    },
    /** @param {number} i */
    calledOf: (i) => (hands[i] ? `${hands[i].name}, ${hands[i].role}` : null),
    /**
     * @param {string} kind
     * @param {number} [n]
     */
    event(kind, n = 1) {
      if (kind === 'handLost') {
        if (!Number.isFinite(n)) return;
        if (lossT > LOSSES_WINDOW_S) losses = 0;
        lossT = 0;
        const d = Math.max(LOSSES_CAP - losses, MORALE_EVENT.handLost * Math.max(0, n));
        losses += d;
        bump(d);
        return;
      }
      if (kind === 'win') for (const h of hands) h.fights++;
      if (kind === 'boarding') { for (const h of hands) h.boardings++; return; }
      const d = MORALE_EVENT[kind];
      if (typeof d === 'number') bump(d);
    },
    fightOver() { losses = 0; },
    /**
     * @param {number} dt
     * @param {{ atSea?: boolean, inPort?: boolean, wear?: number }} where
     */
    tick(dt, { atSea = false, inPort = false, wear = 1 } = {}) {
      if (!(dt > 0)) return;
      lossT += dt;
      if (inPort) {
        seaT = 0;
        if (morale < PORT_CAP) { portT += dt; const k = Math.floor(portT / PORT_RISE_S); if (k > 0) { portT -= k * PORT_RISE_S; morale = Math.min(PORT_CAP, morale + k); } } else portT = 0;
      } else if (atSea) {
        portT = 0;
        seaT += dt / (Number(wear) > 1 ? Number(wear) : 1); const k = Math.floor(seaT / SEA_DECAY_S); if (k > 0) { seaT -= k * SEA_DECAY_S; bump(-k); }
      }
    },
    /** @param {string} o */
    give(o) {
      if (!/** @type {string[]} */ (Object.values(CREW_ORDERS)).includes(o)) return false;
      order = o;
      return true;
    },
    line() {
      /** @type {readonly string[] | undefined} */
      const work = order !== CREW_ORDERS.stand ? /** @type {Record<string, readonly string[]>} */ (MORALE_LINES)[order] : undefined;
      if (work) return work[Math.floor(rng() * work.length)];
      const s = morale >= 70 ? MORALE_LINES.high : morale <= 35 ? MORALE_LINES.low : null;
      if (!s || rng() >= 1 / 3) return null;
      return s[Math.floor(rng() * s.length)];
    },
    sings: () => morale >= SING_MIN,
    grogOn: (day) => day != null && grogDay === day,
    drankGrog(day) { if (Number.isFinite(day)) grogDay = day; },
    snapshot: () => ({ morale: Math.round(morale * 10) / 10, hires, hands: hands.map((h) => ({ ...h })), order, grogDay }),
  };
}

/**
 * @param {{ morale: number, hands: { name: string, role: string, fights: number, boardings: number }[] }} crew
 * @param {{ ship?: string, order?: string, ashore?: Set<string>|null }} [o]
 */
export function crewCard(crew, { ship = 'Your ship', order = CREW_ORDERS.stand, ashore = null } = {}) {
  const s = spiritsOf(crew.morale);
  const lines = [`${ship}'s crew - spirits ${s.label} (${Math.round(crew.morale)} of ${MORALE_MAX}).`];
  if (order && order !== CREW_ORDERS.stand) lines.push(`Standing order: ${ORDER_TEXT[order].label}.`);
  if (!crew.hands.length) lines.push('No hands aboard.');
  for (const h of crew.hands) {
    const deeds = [h.fights ? `${h.fights} ${h.fights === 1 ? 'fight' : 'fights'}` : '', h.boardings ? `${h.boardings} ${h.boardings === 1 ? 'boarding' : 'boardings'}` : ''].filter(Boolean).join(', ');
    const v = veteranOf(h);
    lines.push(`${h.name}, ${h.role}${deeds ? ` - ${deeds}` : ''}${v.tier > 0 ? ` - ${v.label}` : ''}${ashore?.has(h.name) ? ' · ashore with you' : ''}`);
  }
  return lines;
}

/**
 * @param {{ crewed: boolean, order?: string }} o
 * @returns {{ id: string, label: string }[]}
 */
export function orderRows({ crewed, order = CREW_ORDERS.stand }) {
  const ids = crewed ? [CREW_ORDERS.guns, CREW_ORDERS.rail, CREW_ORDERS.repair, CREW_ORDERS.stand] : [CREW_ORDERS.repair, CREW_ORDERS.stand];
  return ids.map((id) => ({ id, label: id === order && id !== CREW_ORDERS.stand ? `${ORDER_TEXT[id].label} (standing)` : ORDER_TEXT[id].label }));
}
