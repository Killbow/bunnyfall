// @ts-check
// Solid boxes a spell conjures, each in its own collider bucket that can be lowered, moved with the floating
// origin, and removed. The push (pushOutOfBox) moves bodies out of the space a new box takes.

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const BOX_INDICES = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
const CLEAR_M = 0.05;

export function boxCorners({ at, f, r, hw, hd, y0, y1 }) {
  const corner = (a, b, y) => [at[0] + r[0] * a + f[0] * b, y, at[2] + r[2] * a + f[2] * b];
  const c = [corner(-hw, -hd, y0), corner(hw, -hd, y0), corner(hw, hd, y0), corner(-hw, hd, y0),
    corner(-hw, -hd, y1), corner(hw, -hd, y1), corner(hw, hd, y1), corner(-hw, hd, y1)];
  return new Float32Array(c.flat());
}

// Call before the box joins the collider, or its own faces block every way out.
export function pushOutOfBox(collider, bodies, { at, f, r, hw, hd, y0, y1 }) {
  const stuck = [];
  for (const c of bodies) {
    const p = c?.ai?.feet;
    if (!c || c.dead || c.puppet || !Array.isArray(p)) continue;
    const rad = c.ai.radius ?? 0.4, h = c.ai.height ?? 1.8;
    if (p[1] > y1 || p[1] + h < y0) continue;
    const dx = p[0] - at[0], dz = p[2] - at[2];
    const across = dx * r[0] + dz * r[2], along0 = dx * f[0] + dz * f[2];
    if (hw + rad - Math.abs(across) <= 0 || hd + rad - Math.abs(along0) <= 0) continue;
    const along = Math.abs(along0) < 0.01 ? 0.01 : along0;
    const ways = [
      { d: f, by: hd + rad - along },
      { d: [-f[0], 0, -f[2]], by: hd + rad + along },
      { d: r, by: hw + rad - across },
      { d: [-r[0], 0, -r[2]], by: hw + rad + across },
    ].sort((a, b) => a.by - b.by);
    const mid = [p[0], p[1] + Math.min(1, h * 0.5), p[2]];
    const len = (w) => w.by + CLEAR_M + rad;
    const way = ways.find((w) => { try { const t = collider.raycast(mid, w.d, len(w)); return !(Number.isFinite(t) && t >= 0 && t < len(w)); } catch { return true; } });
    if (!way) { stuck.push(c); continue; }
    p[0] += way.d[0] * (way.by + CLEAR_M); p[2] += way.d[2] * (way.by + CLEAR_M);
    if (c.ai.knockbackSpeed) c.ai.knockbackSpeed = 0;
  }
  return stuck;
}

export function createObstacles(prefix) {
  let seq = 0;
  function put(owner, positions) {
    const key = `${prefix}-${++seq}`;
    try { owner.addMesh(key, positions, BOX_INDICES, IDENTITY); owner.settle?.(key); return key; } catch (e) { console.warn('[spells] Failed to add conjured obstacle mesh', e); return null; }
  }
  function lower(s, sunk) {
    s.boxSunk = sunk;
    if (!s.key) return;
    try { s.owner.removeBucket(s.key); } catch {}
    s.key = null;
    const p = s.positions, foot = p[1], top = p[13] - sunk;
    if (!(top > foot + 0.1)) return;
    const lowered = new Float32Array(p);
    for (let c = 4; c < 8; c++) lowered[c * 3 + 1] = top;
    s.key = put(s.owner, lowered);
  }
  return {
    get seq() { return seq; },
    stand(owner, positions) {
      const key = put(owner, positions);
      return key ? { key, owner, positions, boxSunk: 0 } : null;
    },
    lower,
    move(s, o) {
      for (let i = 0; i < s.positions.length; i += 3) { s.positions[i] += o[0]; s.positions[i + 1] += o[1]; s.positions[i + 2] += o[2]; }
      lower(s, s.boxSunk);
      return !!s.key;
    },
    remove(s) { if (s.key) try { s.owner.removeBucket(s.key); } catch {} },
  };
}
