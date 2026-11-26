// @ts-check

/**
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 */
function line(a, b) {
  const out = [a]; let x = a.x, y = a.y;
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), sx = a.x < b.x ? 1 : -1, sy = a.y < b.y ? 1 : -1;
  let err = dx - dy;
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    out.push({ x, y });
  }
  return out;
}

/**
 * @param {any} plan
 * @param {() => { isWater: (x: number, y: number) => boolean, openBlocked: (ax: number, ay: number, bx: number, by: number, fromPeak: boolean) => boolean, peakAt: (x: number, y: number) => boolean }} ground
 */
export function freePull(plan, ground) {
  if (!plan?.pixels || plan.pixels.length < 3 || plan.kinds?.some((k) => k !== 'open')) return plan;
  const g = ground();
  const clear = (a, b) => {
    const pts = line(a, b);
    for (let i = 1; i < pts.length; i++) {
      if (g.isWater(pts[i].x, pts[i].y)) return false;
      if (g.openBlocked(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y, i === 1 && g.peakAt(a.x, a.y))) return false;
    }
    return true;
  };
  const px = plan.pixels, keep = [px[0]];
  let i = 0;
  while (i < px.length - 1) {
    let j = px.length - 1;
    while (j > i + 1 && !clear(px[i], px[j])) j--;
    keep.push(px[j]);
    i = j;
  }
  return keep.length >= px.length ? plan : { ...plan, pixels: keep, kinds: keep.slice(1).map(() => 'open') };
}
