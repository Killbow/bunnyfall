// @ts-check
export const SEA_HELM = Object.freeze({
  deadDeg: 4,
  laneDeg: 20,
  // No-go cones where the mod's sail power toward the mark is best: with a lateen, and with square sails alone.
  noGoFore: 35,
  noGoSquare: 68,
  calm: 0.25,
  stallMps: 0.35,
  stallS: 8,
  oarsS: 20,
  rowInM: 120,
  avoidM: 120,
  avoidS: 13,
  // The mod turns a boat under sail by the way it makes, so a larger turn onto the course is rowed.
  sailTurnMax: 30,
});

export const seaHelmReach = (way) => Math.max(SEA_HELM.avoidM, Math.max(0, way) * SEA_HELM.avoidS);
// Land seen ahead keeps its reach until cleared, or slowing to turn would shrink it and she would run back at it.
export const seaHelmLook = (st, way) => Math.max(seaHelmReach(way), st?.reach ?? 0);

export const foldDeg = (d) => { const a = ((d % 360) + 540) % 360 - 180; return a === -180 ? 180 : a; };
export const headingOf = (x, z) => (Math.atan2(x, z) * 180) / Math.PI;

export const createSeaHelm = () => ({ tack: 0, stall: 0, oars: 0, reach: 0 });

/**
 * @param {{ tack: number, stall: number, oars: number, reach?: number }} st
 * @param {{ heading: number, bearing: number, wind: number[], hasSails: boolean, squareOnly?: boolean, sailsUp: boolean,
 *   canSail: boolean, way: number, dt: number, landfall?: boolean, landAhead?: number, freer?: number, crewed?: boolean,
 *   oarWay?: number, sailWay?: number, free?: boolean, markAhead?: number, hullAhead?: number }} q
 * @returns {{ turn: -1|0|1, sails: 'raise'|'lower'|null, row: boolean, course: number }}
 */
export function seaHelmStep(st, q) {
  const H = SEA_HELM;
  const windLen = Math.hypot(q.wind[0] ?? 0, q.wind[1] ?? 0);
  const ahead = q.landAhead ?? Infinity;
  const reach = seaHelmLook(st, q.way);
  // A hull ahead turns her off on every leg, a landfall's too; the land a landfall runs into is its shore.
  const avoiding = (!q.landfall && ahead <= reach) || (q.hullAhead ?? Infinity) <= reach;
  // Her bow clear, she holds the heading that cleared the land while the mark's line still runs onto it.
  const blocked = !avoiding && (q.markAhead ?? Infinity) <= reach;
  st.reach = avoiding || blocked ? reach : 0;
  const rowingIn = !!q.landfall && ahead <= H.rowInM;
  if (st.oars > 0) st.oars = Math.max(0, st.oars - q.dt);
  // A crew rows for free, so a crewed boat rows whenever its oars beat its sails; a lone rower tires, so it sails.
  const crewRows = !!q.crewed && (q.oarWay ?? 0) >= (q.sailWay ?? 0);
  const sailable = q.hasSails && (q.free ? windLen > 0 : windLen >= H.calm) && !rowingIn && !avoiding && !crewRows;
  let course = foldDeg(q.bearing);
  if (sailable) {
    const eye = headingOf(-(q.wind[0] ?? 0), -(q.wind[1] ?? 0));
    const noGo = q.free ? 0 : q.squareOnly ? H.noGoSquare : H.noGoFore;
    const off = foldDeg(q.bearing - eye);
    if (Math.abs(off) < noGo) {
      if (st.tack === 0) st.tack = off >= 0 ? 1 : -1;
      else if (st.tack * off < -H.laneDeg) st.tack = -st.tack;
      course = foldDeg(eye + st.tack * noGo);
    } else st.tack = 0;
  } else st.tack = 0;
  if (avoiding) course = foldDeg(q.heading + (q.freer ?? 1) * 90);
  else if (blocked) course = foldDeg(q.heading);
  const err = foldDeg(course - q.heading);
  if (q.sailsUp && q.way < H.stallMps && Math.abs(err) <= H.sailTurnMax) {
    st.stall += q.dt;
    if (st.stall >= H.stallS) { st.stall = 0; st.oars = H.oarsS; }
  } else st.stall = 0;
  const sailsWanted = sailable && st.oars <= 0 && Math.abs(err) <= H.sailTurnMax;
  const sails = sailsWanted && !q.sailsUp && q.canSail ? 'raise' : !sailsWanted && q.sailsUp ? 'lower' : null;
  const turn = err > H.deadDeg ? 1 : err < -H.deadDeg ? -1 : 0;
  // Sails wanted that cannot be raised, such as with a node over the shore, are rowed off it.
  return { turn, sails, row: !sailsWanted || (!q.sailsUp && !q.canSail), course };
}

/** @param {{ Sails?: any[], SailsSquare?: any[] }} boat */
export const squareOnly = (boat) => (boat?.Sails?.length ?? 0) > 0 && (boat?.SailsSquare?.length ?? 0) === (boat?.Sails?.length ?? 0);
