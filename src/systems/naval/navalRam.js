// @ts-check
// RAM-RETURN (2026-10-26, the owner: "So players are complaining about ship ramming being removed. So I would like to
// reintegrate it in a thoughtful way. The major issue was that you could easily instability ships just by ramming";
// bible/03-World/Naval-Refit.md RAM-RETURN) - THE RAM'S LAW, bounded. The port's own; pure. The naval host's module
// (scenes/naval/navalRams.js) finds the stems and lands the blows; this says what a ram does.
//
// WHY IT WAS RETIRED (BOARD-MAGNET): a ram dealt RAM_DAMAGE (14) a metre a second of closing way, a galley's three times
// that, with no bound - a Large Galley at 7 m/s dealt 294, past a Pirate Sloop's whole hull (264), and a storm's way
// (38.9 m/s) dealt 545 from a plain stem. Only one captain's galley on another's sound ship stopped at her strike (AUDIT
// NAV2 F26); the player's ram and a galley's on the player's boat did not. And RAM-BOARD's foul made a sound ship
// boardable the moment a stem touched her. So one ram sank a ship, or took her whole.
//
// WHAT A RAM IS NOW. A stem driven into a hull at RAM_SPEED or more of closing way deals a SHARE OF THE LESSER HULL of the
// two - RAM_SHARE for a plain stem, GALLEY_SHARE for a galley's ram, built to it - scaled by
//   PACE   the closing way over RAM_FULL_SPEED (a whole ram at a fighting way, never more past it: a storm's way rams as
//          hard as a fair day's), and
//   ANGLE  how square the stem meets her keel (`ramSquare`): square into her side the whole blow, along her side or into
//          her bow or stern RAM_GLANCE of it.
// The lesser hull is the bound on both sides: a big ship's stem takes a share of the small ship it strikes, and a small
// stem strikes a big ship with no more than its own weight. Whatever the blow, it never takes a hull UNDER STRUCK_AT of
// its whole (`ramRoom`): a ram brings a fighting ship to strike her colours and no further - her prize is the grapples'
// (navalBoarding.js, BOARD-MAGNET), her sinking the guns'. A ship whose colours are down is not rammed at all.
// The rammer takes RAM_RECOIL of the blow back - BOW_RECOIL times it on a stem not built to ram, a GALLEY_RAM-th of it on
// a galley's - reckoned on the blow as it struck (the timbers met as hard, whatever her room), and never past her own
// strike (`recoilRoom`): neither ram nor recoil ever finishes a hull. RAM-BOARD's foul does not come back: a sound ship
// is boarded once she has struck, as BOARD-MAGNET has it.

import { STRUCK_AT, ballMen } from './navalDamage.js';

/** The least closing way (m/s) a stem strikes at - under it two hulls bump, and the collider keeps them apart. */
export const RAM_SPEED = 1.6;
/** The closing way (m/s) that drives a ram home whole (a Small Ship's fighting way under HELM-WAY is 8.2) - past it, no
 *  more: a ram is bounded by the hulls, never by the wind. */
export const RAM_FULL_SPEED = 8;
/** The most of the lesser hull one ram takes - a plain stem's, and a galley's ram's. From whole to her strike (three
 *  quarters of her hull) is five plain rams square on, three of a galley's. */
export const RAM_SHARE = 0.15;
export const GALLEY_SHARE = 0.3;
/** What a ram along her side, or into her bow or stern, deals of one square into her side. */
export const RAM_GLANCE = 0.4;
/** The blow's share the rammer takes back - BOW_RECOIL times it on a stem not built to ram, a GALLEY_RAM-th of it on a
 *  galley's (AUDIT NAV1's numbers). */
export const RAM_RECOIL = 0.3;
export const BOW_RECOIL = 2;
export const GALLEY_RAM = 3;
/** The men a ram takes: one for every RAM_A_MAN of hull it deals - what the wire says (`ramMenSaid`) - and, where she is
 *  stood, over her crew's toughness on the `roll`, as a ball's (navalDamage.js ballMen). */
export const RAM_A_MAN = 40;
/** AUDIT NAV1 (the helm): the stem (the hull's own bowZ) strikes within RAM_REACH (m) of the other's box, at the way she
 *  came in with - the most of the last RAM_MEMORY_S (s), as the collider takes a bow's way off at the planking it meets. */
export const RAM_REACH = 1.2;
export const RAM_MEMORY_S = 0.6;
/** One ram a ship a stretch (s). */
export const RAM_COOLDOWN_S = 3;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** How square a stem along `stem` meets a keel along `keel` (both flat units, [x, y, z]): 1 into her side, 0 along it or
 *  bow to bow - the sine of the angle between them. */
export const ramSquare = (stem, keel) => clamp(Math.abs(stem[0] * keel[2] - stem[2] * keel[0]), 0, 1);

/**
 * The blow of a ram (whole hull points), before her room: none under RAM_SPEED of `closing` way; else the stem's share of
 * the lesser of the two whole hulls (`mine` the rammer's, `hers` the struck ship's), times the pace and the angle.
 * @param {{ closing: number, square: number, mine: number, hers: number, galley?: boolean }} ram
 */
export function ramBlow({ closing, square, mine, hers, galley = false }) {
  if (!(closing >= RAM_SPEED)) return 0;
  const pace = Math.min(1, closing / RAM_FULL_SPEED);
  const angle = RAM_GLANCE + (1 - RAM_GLANCE) * clamp(Number(square) || 0, 0, 1);
  const lesser = Math.max(0, Math.min(Number(mine) || 0, Number(hers) || 0));
  return Math.round((galley ? GALLEY_SHARE : RAM_SHARE) * lesser * pace * angle);
}

/** The hull a ram (or its recoil) may still take from `damage` (navalDamage.js createShipDamage): down to STRUCK_AT of
 *  her whole and no further - a ship of the sea's strikes there - and none from a hull already at it or under. */
export const ramRoom = (damage) => Math.max(0, Math.ceil(damage.hull - damage.maxHull * STRUCK_AT));
/** The hull a ram's recoil may take from the rammer's `damage`: a whole point short of her room, so her own ram never
 *  brings her to strike (her hull stays over STRUCK_AT of its whole). */
export const recoilRoom = (damage) => Math.max(0, ramRoom(damage) - 1);

/** What the rammer takes back of a `blow` (whole hull points, before the brace and the room). */
export const ramRecoil = (blow, galley = false) => Math.round(blow * RAM_RECOIL * (galley ? 1 / GALLEY_RAM : BOW_RECOIL));

/** The men a ram that `dealt` hull takes, as the wire says them (before her toughness). */
export const ramMenSaid = (dealt) => Math.round(dealt / RAM_A_MAN);
/** The whole men a ram that `dealt` hull takes, over her crew's toughness `tough` on the `roll`. */
export const ramMen = (dealt, roll, tough) => ballMen(dealt / RAM_A_MAN, roll, tough);
