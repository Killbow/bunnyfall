// @ts-check
// The party ashore as pure state: which named hands walk with the player, which rest aboard after a knockout, and
// the health and pack each carries between places.
import { entityMaxEncumbrance, maxEncumbrance } from '../../combat/formulas.js';
import { companionsWithYou, COMPANION_SLOTS } from '../../characters/companionSlots.js';
import { wildHere, wildZoneKind, WILD_TEXT } from '../../world/wildZone.js';
import { ETHER_KIND } from '../../world/wild/etherWild.js';

export const COMPANION_MAX = 2;
export const PACK_DEFAULT_STRENGTH = 50;
export const packCapacityKg = (entity) => (Number(entity?.stats?.strength) > 0 ? entityMaxEncumbrance(entity) : maxEncumbrance(PACK_DEFAULT_STRENGTH));
export const REST_MIN = 8 * 60;
export const COMPANION_WHY = Object.freeze({ full: 'two ashore already', resting: 'resting aboard', uncrewed: 'no crew', slots: 'no room at your side' });
export const COMPANION_TEXT = Object.freeze({ take: 'Take ashore', back: 'Send back aboard', ashore: 'ashore', resting: 'resting' });

// Inside the open zone (but not at sea), a companion never goes back aboard. A pack given up there stays with
// the player, since a death there drops the companion's pack with the player's.
/** @param {string} name @param {((text: string, s?: number) => void) | null | undefined} say */
export function heldAtSide(name, say) {
  if (!wildHere() || wildZoneKind() === ETHER_KIND) return false;
  say?.(WILD_TEXT.companionStays(name), 3);
  return true;
}
export const packStaysAshore = () => wildHere() && wildZoneKind() !== ETHER_KIND;

/** @typedef {{ boat: number, name: string, role: string, mobile: number, gender: 'male'|'female', health: number|null, maxHealth: number|null, items: any[] }} Companion */
/** @typedef {{ boat: number, name: string, until: number }} Resting */

const isName = (s) => typeof s === 'string' && s.length > 0 && s.length <= 80;
const isBoat = (b) => Number.isSafeInteger(b) && b > 0;
const same = (a, boat, name) => a.boat === boat && a.name === name;

/**
 * @param {any} [record]
 * @param {{ serialize: (items: any[]) => any[], deserialize: (data: any[]) => any[] } | null} [codec]
 */
export function createCompanions(record = null, codec = null) {
  const packIn = (data) => { if (!Array.isArray(data) || !data.length) return []; try { const out = codec ? codec.deserialize(data) : data.slice(); return Array.isArray(out) ? out : []; } catch { return []; } };
  const packOut = (items) => { if (!items?.length) return []; try { return codec ? codec.serialize(items) : items.slice(); } catch { return []; } };
  /** @type {Companion[]} */
  let party = [];
  /** @type {Resting[]} */
  let resting = [];
  if (record && typeof record === 'object') {
    for (const c of Array.isArray(record.party) ? record.party : []) {
      if (party.length >= COMPANION_MAX || !c || !isBoat(c.boat) || !isName(c.name) || party.some((p) => same(p, c.boat, c.name))) continue;
      const hp = Number(c.health), max = Number(c.maxHealth);
      party.push({
        boat: c.boat, name: c.name, role: isName(c.role) ? c.role : 'Deckhand', mobile: Number.isInteger(c.mobile) ? c.mobile : 0,
        gender: c.gender === 'female' ? 'female' : 'male',
        health: c.health != null && Number.isFinite(hp) && hp > 0 ? hp : null, maxHealth: c.maxHealth != null && Number.isFinite(max) && max > 0 ? max : null,
        items: packIn(c.items),
      });
    }
    for (const r of Array.isArray(record.resting) ? record.resting : []) {
      if (!r || !isBoat(r.boat) || !isName(r.name) || !Number.isFinite(r.until) || resting.some((o) => same(o, r.boat, r.name))) continue;
      if (party.some((p) => same(p, r.boat, r.name))) continue;
      resting.push({ boat: r.boat, name: r.name, until: r.until });
    }
  }
  const find = (boat, name) => party.find((p) => same(p, boat, name)) ?? null;
  const restOf = (boat, name) => resting.find((r) => same(r, boat, name)) ?? null;

  return {
    get party() { return party; },
    get resting() { return resting; },
    /** @param {number} boat @param {string} name */
    isAshore: (boat, name) => !!find(boat, name),
    /** @param {number} boat @param {string} name */
    of: (boat, name) => find(boat, name),
    /** @param {number} boat @param {{ name: string }} hand @param {number} now @param {boolean} [crewed] */
    why(boat, hand, now, crewed = true) {
      if (!crewed) return COMPANION_WHY.uncrewed;
      const r = restOf(boat, hand.name);
      if (r && now < r.until) return COMPANION_WHY.resting;
      if (party.length >= COMPANION_MAX && !find(boat, hand.name)) return COMPANION_WHY.full;
      // Crew companions and sworn revenants share the same side slots.
      if (!find(boat, hand.name) && companionsWithYou() >= COMPANION_SLOTS) return COMPANION_WHY.slots;
      return null;
    },
    /**
     * @param {number} boat
     * @param {{ name: string, role: string, mobile: number, gender: string }} hand
     * @param {number} now
     */
    take(boat, hand, now) {
      if (!isBoat(boat) || !isName(hand?.name) || find(boat, hand.name) || this.why(boat, hand, now) != null) return null;
      resting = resting.filter((r) => !same(r, boat, hand.name));
      /** @type {Companion} */
      const c = { boat, name: hand.name, role: hand.role, mobile: hand.mobile, gender: hand.gender === 'female' ? 'female' : 'male', health: null, maxHealth: null, items: [] };
      party.push(c);
      return c;
    },
    /** @param {number} boat @param {string} name */
    sendBack(boat, name) {
      const n = party.length;
      party = party.filter((p) => !same(p, boat, name));
      return party.length < n;
    },
    /** @param {number} boat @param {string} name @param {number} now */
    knock(boat, name, now) {
      if (!this.sendBack(boat, name)) return false;
      resting = resting.filter((r) => !same(r, boat, name));
      resting.push({ boat, name, until: now + REST_MIN });
      return true;
    },
    /** @param {number} now */
    wake(now) {
      const woke = resting.filter((r) => now >= r.until);
      if (woke.length) resting = resting.filter((r) => now < r.until);
      return woke;
    },
    /** @param {number} boat @param {string} name @param {number} health @param {number} maxHealth */
    hurt(boat, name, health, maxHealth) {
      const c = find(boat, name);
      if (!c || !Number.isFinite(health) || !Number.isFinite(maxHealth) || maxHealth <= 0) return;
      c.maxHealth = maxHealth;
      c.health = health >= maxHealth ? null : Math.max(1, health);
    },
    /** @param {(boat: number, name: string) => boolean} lives */
    prune(lives) {
      const gone = party.filter((p) => !lives(p.boat, p.name));
      if (gone.length) party = party.filter((p) => lives(p.boat, p.name));
      resting = resting.filter((r) => lives(r.boat, r.name));
      return gone;
    },
    /** @param {number} boat */
    awayOf: (boat) => new Set(party.filter((p) => p.boat === boat).map((p) => p.name)),
    /** @param {number} boat @param {string} name */
    packOf: (boat, name) => find(boat, name)?.items ?? null,
    /** @param {number} boat @param {string} name */
    takePack(boat, name) {
      const c = find(boat, name);
      if (!c?.items?.length) return [];
      const out = c.items.slice();
      c.items.length = 0;
      return out;
    },
    snapshot: () => ({ party: party.map((p) => ({ ...p, items: packOut(p.items) })), resting: resting.map((r) => ({ ...r })) }),
  };
}

/** @param {{ boat: number, crewed: boolean, hands: { name: string, role: string }[], now: number, companions: ReturnType<typeof createCompanions> }} o */
export function companionRows({ boat, crewed, hands, now, companions }) {
  return hands.map((h) => {
    const called = `${h.name}, ${h.role}`;
    if (companions.isAshore(boat, h.name)) return { id: h.name, label: `${COMPANION_TEXT.back}: ${called}`, back: true };
    const why = companions.why(boat, h, now, crewed);
    if (why === COMPANION_WHY.resting) {
      const r = companions.resting.find((x) => same(x, boat, h.name));
      const hours = Math.max(1, Math.ceil(((r?.until ?? now) - now) / 60));
      return { id: h.name, label: `${called}`, disabled: true, why: `${COMPANION_TEXT.resting}, ${hours} ${hours === 1 ? 'hour' : 'hours'}` };
    }
    if (why) return { id: h.name, label: `${called}`, disabled: true, why };
    return { id: h.name, label: `${COMPANION_TEXT.take}: ${called}` };
  });
}

/** @param {number} yaw @param {number} i @param {number} n */
export function companionSlot(yaw, i, n) {
  const back = 1.8, side = n > 1 ? (i === 0 ? -1 : 1) * 1.1 : 0;
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  return [-fx * back + fz * side, -fz * back - fx * side];
}
