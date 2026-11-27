// @ts-check

export const GOTHWAY_RE = /^gothway garden$/i;
export const isGothwayGarden = (name) => GOTHWAY_RE.test(String(name ?? '').trim());

export const ROAD_WEIGHT = 15;
export const NORTH_IN_M = 5;
export const NORTH_ASIDE_M = 1.5;
// Spots are in the location frame (x east, z north, meters), and north is the grid's last rows.
export function gothwayNorthSpots(weightAt, w, h, cell) {
  const band = Math.max(2, Math.round(8 / cell));
  const runs = (want) => {
    const out = [];
    let start = -1;
    for (let gx = 0; gx <= w; gx++) {
      let ok = false;
      if (gx < w) for (let k = 0; k < band; k++) { const wt = weightAt(gx, h - 1 - k); if (want(wt)) { ok = true; break; } }
      if (ok && start < 0) start = gx;
      if (!ok && start >= 0) { out.push([start, gx - 1]); start = -1; }
    }
    return out;
  };
  let found = runs((wt) => wt >= ROAD_WEIGHT).filter(([a, b]) => b - a + 1 >= 2);
  if (!found.length) found = runs((wt) => wt > 0).filter(([a, b]) => b - a + 1 >= 3);
  if (!found.length) return null;
  const mid = (w - 1) / 2;
  found.sort((p, q) => Math.abs((p[0] + p[1]) / 2 - mid) - Math.abs((q[0] + q[1]) / 2 - mid));
  const [a, b] = found[0];
  const z = h * cell - NORTH_IN_M;
  const spot = (gx, side) => {
    let x = gx * cell + cell / 2;
    const gz = Math.min(h - 1, Math.floor(z / cell));
    for (let k = 0; k < 6 && weightAt(Math.floor(x / cell), gz) === 0; k++) x += side === 'west' ? cell : -cell;
    return { x, z, yawDeg: 0, side };
  };
  const aside = Math.max(1, Math.round(NORTH_ASIDE_M / cell));
  return [spot(a - aside, 'west'), spot(b + aside, 'east')];
}
