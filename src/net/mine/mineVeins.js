// @ts-check
// BUNNYFALL (2026-11-25, caverns): the cave veins of a mine, a few on each chamber's walls. Shared by the client, the relay
// and the account service (ruling R2): it hashes with gateHash and imports no client module. Pure: the same
// (mineId, reset) gives the same veins on every machine, so the service knows a vein is real without a word from anyone.
//
// A vein is a node, `cvein:<mine>:<reset>:<slot>`, slots numbered in one running order over the whole mine: section,
// chamber, then vein, slot 0 first. A vein stands on one of its chamber's wall slots, never within 2 m of a hole (ruling
// R1; the layout keeps holes 3 m off every wall slot, so the check holds by itself and is kept as a guard).
import { gateHash } from '../gateLaw.js';
import { minedMaterial } from '../professionLaw.js';
import { mineLayout, mineOresAt, mineIsRich, MINE_RICH_ORES } from './mineLayout.js';

/** The weekly reset's number runs 0 to this (a key's reset is up to five digits). */
export const MINE_RESET_MAX = 99999;
/** Cave veins an account may mine in a UTC day. */
export const MINE_VEINS_PER_DAY = 150;
/** Veins a chamber holds (inclusive). */
export const MINE_VEINS_PER_CHAMBER = Object.freeze([3, 5]);
/** The most veins a mine holds, so a slot is one or two digits as every node kind's is. A mine of many chambers loses its
 *  last chambers' veins past this (a mine of 4 to 6 sections of 2 to 4 chambers can ask up to 120). */
export const MINE_VEINS_MAX = 99;
/** A vein keeps this far from every hole. */
export const VEIN_HOLE_M = 2;

const VEIN_SALT = 0x7e1;   // the veins' own salt beside the layout's, so a vein's roll is not a layout roll

/** A cave vein's node id. */
export const cveinKey = (/** @type {{ mine: number, reset: number, slot: number }} */ { mine, reset, slot }) => `cvein:${mine}:${reset}:${slot}`;

/**
 * @typedef {{ slot: number, chamber: string, at: number[], n: number[], tier: number, material: string }} MineVein
 */

/**
 * The veins of a layout, in slot order.
 * @param {import('./mineLayout.js').MineLayout} layout
 * @returns {MineVein[]}
 */
export function mineVeins(layout) {
  const { mineId, reset } = layout;
  const rich = mineIsRich(mineId, reset);
  const last = layout.sections.length - 1;
  /** @type {MineVein[]} */
  const out = [];
  for (let s = 0; s < layout.sections.length && out.length < MINE_VEINS_MAX; s++) {
    const section = layout.sections[s];
    const ores = rich && s === last ? [...mineOresAt(section.i), ...MINE_RICH_ORES] : mineOresAt(section.i);
    for (let c = 0; c < section.chambers.length && out.length < MINE_VEINS_MAX; c++) {
      const chamber = section.chambers[c];
      let k = 0;
      const roll = () => gateHash(mineId, reset, VEIN_SALT, section.i, c, k++) / 4294967296;
      const [lo, hi] = MINE_VEINS_PER_CHAMBER;
      const want = lo + Math.floor(roll() * (hi - lo + 1));
      const free = chamber.walls.filter((w) => chamber.holes.every((h) => Math.hypot(h.at[0] - w.at[0], h.at[2] - w.at[2]) >= VEIN_HOLE_M));
      for (let v = 0; v < want && free.length && out.length < MINE_VEINS_MAX; v++) {
        const wall = free.splice(Math.floor(roll() * free.length), 1)[0];
        const material = ores[Math.floor(roll() * ores.length)];
        out.push({ slot: out.length, chamber: chamber.id, at: wall.at.slice(), n: [wall.n[0], 0, wall.n[2]], tier: minedMaterial(material)?.tier ?? 1, material });
      }
    }
  }
  return out;
}

/**
 * One vein of a mine, or null for a slot the mine has none at.
 * @param {number} mineId
 * @param {number} reset
 * @param {number} slot
 * @returns {MineVein|null}
 */
export const mineVeinOf = (mineId, reset, slot) => mineVeins(mineLayout(mineId, reset))[slot] ?? null;
