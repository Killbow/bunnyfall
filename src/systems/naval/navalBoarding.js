// @ts-check
import { wrapAngle } from '../../world/mat4.js';
import { hullBuild, hullMid, flatHull, hullOverlap } from './navalShips.js';

export const BOARD_RANGE = 32;
export const GRAPPLE_S = 2.2;
export const BERTH_GAP = 2.2;
// Collider half widths can swell past the deck beam, so a berth also keeps this gap between the widest points.
export const HULL_CLEAR = 0.5;
export const HAUL_SPEED = 30;
export const HAUL_TURN = (120 * Math.PI) / 180;
export const HAUL_MAX_S = 6;
export const MUSTER_MIN = 3;
export const MUSTER_MAX = 12;
export const CREW_PER_HAND = 6;
export const HANDS_MAX = 4;
export const SURRENDER_SHARE = 0.7;
export const ABANDON_RANGE = 160;
export const REPEL_PARTY = Object.freeze({ min: 3, max: 6 });

// Daggerfall MobileTypes ids, as the quest enemy table lists them.
export const MOBILE = Object.freeze({
  Spellsword: 129, BattleMage: 130, Healer: 132, Nightblade: 133, Bard: 134, Rogue: 136, Thief: 138, Assassin: 139,
  Monk: 140, Archer: 141, Ranger: 142, Barbarian: 143, Warrior: 144, Knight: 145,
});
export const MUSTERS = Object.freeze({
  pirate: Object.freeze({ men: Object.freeze([MOBILE.Rogue, MOBILE.Barbarian, MOBILE.Thief, MOBILE.Rogue, MOBILE.Archer, MOBILE.Nightblade, MOBILE.Barbarian, MOBILE.Assassin]), captain: MOBILE.Spellsword }),
  merchant: Object.freeze({ men: Object.freeze([MOBILE.Warrior, MOBILE.Archer, MOBILE.Monk, MOBILE.Warrior, MOBILE.Bard]), captain: MOBILE.Ranger }),
  navy: Object.freeze({ men: Object.freeze([MOBILE.Knight, MOBILE.Warrior, MOBILE.Archer, MOBILE.Warrior, MOBILE.BattleMage, MOBILE.Knight]), captain: MOBILE.Knight }),
});
export const HAND = MOBILE.Warrior;
// The raid quests' `_ally_` crew symbol, by its inner name.
export const RAID_CREW = 'ally';

export const WA_SMALLRAID = 'WAQ_SHIP_SMALLRAID';
export const WA_ATTACK_PIRATE = 'WAQ_SHIP_ATTACK_PIRATE';
export const raidQuestOf = (shipClass) => (shipClass?.flagship ? WA_ATTACK_PIRATE : WA_SMALLRAID);
// Inner task names that win each raid quest: the pirate attack's `_winner_` and the small raid's three wave endings.
export const RAID_WIN_TASKS = Object.freeze(['winner', 'endquestproper', 'endquestproper2', 'endquestproper5']);
export function raidQuestWon(quest) {
  const tasks = quest?.tasks;
  if (!tasks?.get) return false;
  return RAID_WIN_TASKS.some((name) => tasks.get(name)?.getTriggerValue?.() === true);
}
// The pirate attack quest starts its `_retreat_` clock but leaves its effect unwritten, so a triggered retreat
// makes the boarders cast off and ends the raid here.
export const RAID_RETREAT_TASKS = Object.freeze(['retreat']);
export function raidQuestRetreated(quest) {
  const tasks = quest?.tasks;
  if (!tasks?.get || raidQuestWon(quest)) return false;
  return RAID_RETREAT_TASKS.some((name) => tasks.get(name)?.getTriggerValue?.() === true);
}

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** @param {{ boarded?: boolean, damage: { state: string } }} ship */
export const boardableState = (ship) => !!ship && !ship.boarded && ship.damage.state === 'struck';

/** @returns {{ captain: number, men: number[] }} */
export function musterOf(shipClass, crewShare = 1) {
  const m = MUSTERS[shipClass.faction] ?? MUSTERS.pirate;
  const n = clamp(Math.round(shipClass.boarders * clamp(crewShare, 0, 1)), MUSTER_MIN, MUSTER_MAX);
  const men = [];
  for (let i = 0; i < n - 1; i++) men.push(m.men[i % m.men.length]);
  return { captain: m.captain, men };
}

// One team per crew, so a muster of mixed classes never turns on itself under infighting.
export const CREW_TEAMS = Object.freeze({ pirate: 'Criminals', merchant: 'KnightsAndMages', navy: 'KnightsAndMages' });
export const crewTeamOf = (shipClass) => CREW_TEAMS[shipClass?.faction] ?? CREW_TEAMS.pirate;

export const handsOf = (crew, crewed) => (crewed ? clamp(Math.floor(crew / CREW_PER_HAND), 0, HANDS_MAX) : 0);

export const repelPartyOf = (shipClass) => clamp(Math.round(shipClass.boarders / 3), REPEL_PARTY.min, REPEL_PARTY.max);

/** @param {number[]} pos @param {number} yaw @param {number} hull */
export function berthHull(pos, yaw, hull) {
  const b = hullBuild(hull);
  return { pos, yaw, beam: b.beam, halfWidth: b.halfWidth, midZ: hullMid(b) };
}

// `lie` keeps the side and heading chosen when the lines went over, so a turning anchor never flips her mid-haul.
/**
 * @param {{ pos: number[], yaw: number, beam: number, halfWidth?: number, midZ?: number }} anchor
 * @param {{ pos: number[], yaw: number, beam: number, halfWidth?: number, midZ?: number }} ship
 * @param {{ side: 1|-1, same: boolean } | null} [lie]
 * @returns {{ pos: number[], yaw: number, side: 1|-1, same: boolean }}
 */
export function berthPose(anchor, ship, lie = null) {
  const f = [Math.sin(anchor.yaw), 0, Math.cos(anchor.yaw)], r = [f[2], 0, -f[0]];
  const d = [ship.pos[0] - anchor.pos[0], 0, ship.pos[2] - anchor.pos[2]];
  const side = lie?.side ?? (d[0] * r[0] + d[2] * r[2] >= 0 ? 1 : -1);
  const same = lie?.same ?? Math.cos(ship.yaw - anchor.yaw) >= 0;
  const yaw = same ? anchor.yaw : anchor.yaw + Math.PI;
  const off = side * Math.max(anchor.beam + ship.beam + BERTH_GAP, (anchor.halfWidth ?? anchor.beam) + (ship.halfWidth ?? ship.beam) + HULL_CLEAR);
  const along = (anchor.midZ ?? 0) - (same ? 1 : -1) * (ship.midZ ?? 0);
  return {
    pos: [anchor.pos[0] + r[0] * off + f[0] * along, ship.pos[1], anchor.pos[2] + r[2] * off + f[2] * along],
    yaw: wrapAngle(yaw),
    side, same,
  };
}

export const haulBrake = (v, most = Infinity) => Math.min(most, Math.max(0, Number(v) || 0) / GRAPPLE_S);

/**
 * @param {{ pos: number[], yaw: number }} at
 * @param {{ pos: number[], yaw: number }} to
 * @param {number} t
 * @param {number} dt
 * @param {{ pos: number[], yaw: number, hull: number }} anchor
 * @param {number} hull
 */
export function drawHaul(at, to, t, dt, anchor, hull) {
  if (!(dt > 0)) return at;
  const left = Math.max(GRAPPLE_S - t, dt);
  const f = [Math.sin(anchor.yaw), Math.cos(anchor.yaw)], r = [f[1], -f[0]];
  const local = (p) => { const x = p[0] - anchor.pos[0], z = p[2] - anchor.pos[2]; return [x * r[0] + z * r[1], x * f[0] + z * f[1]]; };
  const [a0, l0] = local(at.pos), [a1, l1] = local(to.pos);
  let step = Math.min((Math.abs(a1 - a0) + Math.abs(l1 - l0)) / left, HAUL_SPEED) * dt;
  const da = clamp(a1 - a0, -step, step);
  step -= Math.abs(da);
  const a = a0 + da, l = l0 + clamp(l1 - l0, -step, step);
  const dy = wrapAngle(to.yaw - at.yaw);
  const yaw = wrapAngle(at.yaw + Math.sign(dy) * Math.min(Math.abs(dy), (Math.abs(dy) * dt) / left, HAUL_TURN * dt));
  let pos = [anchor.pos[0] + r[0] * a + f[0] * l, at.pos[1], anchor.pos[2] + r[1] * a + f[1] * l];
  const grown = flatHull(anchor.pos, anchor.yaw, anchor.hull);
  grown.hl += HULL_CLEAR; grown.hw += HULL_CLEAR;
  for (let i = 0; i < 4; i++) {
    const push = hullOverlap(flatHull(pos, yaw, hull), grown);
    if (!push) break;
    pos = [pos[0] + push[0], pos[1], pos[2] + push[1]];
  }
  return { pos, yaw };
}
const lies = (at, to) => Math.hypot(at.pos[0] - to.pos[0], at.pos[2] - to.pos[2]) < 1e-3 && Math.abs(wrapAngle(at.yaw - to.yaw)) < 1e-4;

/** @param {{ captainDown: boolean, down: number, total: number }} tally */
export function boardingWon({ captainDown, down, total }) {
  if (total <= 0) return true;
  if (down >= total) return true;
  return captainDown && down / total >= SURRENDER_SHARE;
}

export function createBoarding({ kind, shipId, from, to, hull = 0 }) {
  const b = { kind, shipId, phase: 'grapple', t: 0, from, to, hull, at: { pos: [...from.pos], yaw: from.yaw }, arrived: false, quest: null, foes: [], hands: [], outcome: null };
  return Object.assign(b, {
    haul(to, anchor, dt) {
      b.to = to;
      const d = Math.max(0, dt);
      b.at = !anchor || b.t + d >= HAUL_MAX_S ? { pos: [...to.pos], yaw: to.yaw } : drawHaul(b.at, to, b.t, d, anchor, b.hull);
      b.arrived = lies(b.at, to);
      return b.at;
    },
    step(dt) {
      if (b.phase !== 'grapple') return null;
      b.t += Math.max(0, dt);
      // The epsilon absorbs float drift in a clock summed frame by frame.
      if ((b.t >= GRAPPLE_S - 1e-9 && b.arrived) || b.t >= HAUL_MAX_S) { b.phase = 'fight'; return 'fight'; }
      return null;
    },
    win() { if (b.phase === 'fight') { b.phase = 'prize'; b.outcome = 'won'; } },
    abandon() { if (b.phase === 'fight' || b.phase === 'grapple') { b.phase = 'done'; b.outcome = 'abandoned'; } },
    done() { b.phase = 'done'; b.outcome ??= 'done'; },
    offset(o) { for (const p of [b.from, b.to, b.at]) for (let i = 0; i < 3; i++) p.pos[i] += o[i]; },
  });
}
