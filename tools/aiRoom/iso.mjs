// AI-ROOMS: ISOMETRIC CUTAWAY RENDERS of a laid-out room, in software (no game, no browser, a second a picture). The
// camera looks down at 35 degrees; faces turned away from it are dropped, so a room's ceiling and its near walls vanish
// and its inside shows. Floors are coloured by HEIGHT (blue low, green, yellow, red high: the key is drawn at the foot),
// walls grey, new pieces tan, doors brown; a dark line is drawn where one plane meets another. Not Daggerfall's pictures:
// nothing here carries the game's art, so a render can be kept and shared.
import { transformPoint } from '../../src/world/mat4.js';
import { writePng, RDB_SIDE } from './kit.mjs';

const hsv = (h, s, v) => { const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s); const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6]; return [r * 255, g * 255, b * 255]; };
/** Height (metres) to a colour: 0 blue ... 45 red. */
export const heightColour = (y) => hsv(0.66 - 0.66 * Math.max(0, Math.min(1, y / 45)), 0.62, 0.95);

/**
 * @param {{placements:Array}} layout from kit.layoutJson
 * @param {(id:number)=>object} getModel
 * @param {{ yaw?: number, pitch?: number, scale?: number, width?: number, height?: number, ceil?: boolean }} opts degrees
 * @returns {{ width:number, height:number, rgba:Uint8Array }}
 */
export function isoRender(layout, getModel, { yaw = 45, pitch = 35, scale = 11, width = 900, height = 760, ceil = false, fit = true } = {}) {
  const th = (yaw * Math.PI) / 180, ph = (pitch * Math.PI) / 180, ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(ph), sp = Math.sin(ph);
  const cx = RDB_SIDE / 2;
  const raw = (p) => { const x = p[0] - cx, z = p[2] - cx, xr = x * ct - z * st, zr = x * st + z * ct; return [xr, -(p[1] - 22) * cp - zr * sp, zr * cp - (p[1] - 22) * sp]; };
  // fit: the picture's extent at scale 1, then the scale and offset that centre it
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const pl of layout.placements) { const m = getModel(pl.modelIdNum); if (!m?.positions?.length || (pl.modelIdNum >= 55000 && pl.modelIdNum < 55100)) continue; for (let i = 0; i < m.positions.length; i += 3) { const r = raw(transformPoint(pl.matrix, m.positions[i], m.positions[i + 1], m.positions[i + 2])); x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[0]); y0 = Math.min(y0, r[1]); y1 = Math.max(y1, r[1]); } }
  if (fit && x1 > x0) { scale = Math.min((width - 70) / (x1 - x0), (height - 110) / (y1 - y0)); }
  const ox = width / 2 - ((x0 + x1) / 2) * scale, oy = (height - 40) / 2 - ((y0 + y1) / 2) * scale;
  const proj = (p) => { const r = raw(p); return [ox + r[0] * scale, oy + r[1] * scale, r[2]]; };
  const rgba = new Uint8Array(width * height * 4), depth = new Float32Array(width * height).fill(1e9), group = new Int32Array(width * height).fill(-1);
  for (let i = 0; i < width * height; i++) { rgba[i * 4] = 238; rgba[i * 4 + 1] = 240; rgba[i * 4 + 2] = 244; rgba[i * 4 + 3] = 255; }
  const light = (() => { const v = [-0.4, 0.8, -0.45], l = Math.hypot(...v); return v.map((a) => a / l); })();
  for (const pl of layout.placements) {
    const m = getModel(pl.modelIdNum);
    if (!m?.indices?.length) continue;
    const kind = pl.modelIdNum >= 7100001 && pl.modelIdNum < 7100100 ? 'prop' : pl.modelIdNum >= 55000 && pl.modelIdNum < 55100 ? 'door' : 'shell';
    const wp = new Array(m.positions.length / 3);
    for (let i = 0; i < wp.length; i++) wp[i] = transformPoint(pl.matrix, m.positions[i * 3], m.positions[i * 3 + 1], m.positions[i * 3 + 2]);
    for (let t = 0; t < m.indices.length; t += 3) {
      const a = wp[m.indices[t]], b = wp[m.indices[t + 1]], c = wp[m.indices[t + 2]];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; const nl = Math.hypot(...n); if (nl < 1e-9) continue; n = n.map((q) => q / nl);
      const nxr = n[0] * ct - n[2] * st, nzr = n[0] * st + n[2] * ct;
      if (!ceil && n[1] * sp - nzr * cp < 0.0) continue;             // turned away from the camera: gone
      if (ceil && n[1] * sp - nzr * cp < 0.0 && kind !== 'shell') continue;
      const pa = proj(a), pb = proj(b), pc = proj(c);
      const lam = Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2]);
      const shade = 0.5 + 0.5 * lam;
      let base;
      if (kind === 'prop') base = [214, 176, 112]; else if (kind === 'door') base = [140, 84, 40]; else if (n[1] > 0.5) base = heightColour((a[1] + b[1] + c[1]) / 3); else base = [196, 192, 184];
      const gid = (Math.round(n[0] * 8) * 31 + Math.round(n[1] * 8) * 17 + Math.round(n[2] * 8)) * 997 + Math.round((n[0] * a[0] + n[1] * a[1] + n[2] * a[2]) * 5) + (kind === 'shell' ? 0 : 1000003 * (pl.modelIdNum % 97));
      const minX = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0]))), maxX = Math.min(width - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0])));
      const minY = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1]))), maxY = Math.min(height - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1])));
      const d = (pb[1] - pc[1]) * (pa[0] - pc[0]) + (pc[0] - pb[0]) * (pa[1] - pc[1]);
      if (Math.abs(d) < 1e-9) continue;
      for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        const l1 = ((pb[1] - pc[1]) * (x + 0.5 - pc[0]) + (pc[0] - pb[0]) * (y + 0.5 - pc[1])) / d, l2 = ((pc[1] - pa[1]) * (x + 0.5 - pc[0]) + (pa[0] - pc[0]) * (y + 0.5 - pc[1])) / d, l3 = 1 - l1 - l2;
        if (l1 < -0.002 || l2 < -0.002 || l3 < -0.002) continue;
        const z = l1 * pa[2] + l2 * pb[2] + l3 * pc[2], i = y * width + x;
        if (z >= depth[i]) continue;
        depth[i] = z; group[i] = gid;
        rgba[i * 4] = base[0] * shade; rgba[i * 4 + 1] = base[1] * shade; rgba[i * 4 + 2] = base[2] * shade;
      }
    }
  }
  // a dark line where one plane meets another, or the picture jumps in depth
  const out = Uint8Array.from(rgba);
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const i = y * width + x;
    if (group[i] < 0) continue;
    for (const j of [i - 1, i - width]) if (group[j] >= 0 && (group[j] !== group[i] || Math.abs(depth[j] - depth[i]) > 1.2) || group[j] < 0) { out[i * 4] *= 0.35; out[i * 4 + 1] *= 0.35; out[i * 4 + 2] *= 0.35; break; }
  }
  // the height key along the foot
  for (let k = 0; k < 46; k++) { const col = heightColour(k); for (let y = height - 26; y < height - 8; y++) for (let x = 0; x < 9; x++) { const i = (y * width + 20 + k * 9 + x) * 4; out[i] = col[0]; out[i + 1] = col[1]; out[i + 2] = col[2]; } }
  for (const m of [0, 10, 20, 30, 40]) for (let y = height - 30; y < height - 24; y++) { const i = (y * width + 20 + m * 9 + 4) * 4; out[i] = 20; out[i + 1] = 20; out[i + 2] = 30; }
  return { width, height, rgba: out };
}

/** Two views of a room side by side, written as a PNG. */
export function writeIsoPair(path, layout, getModel, opts = {}) {
  const w = opts.width ?? 900, h = opts.height ?? 760, a = isoRender(layout, getModel, { ...opts, yaw: 40, pitch: 38 }), b = isoRender(layout, getModel, { ...opts, yaw: 220, pitch: 38 });
  const rgba = new Uint8Array(w * 2 * h * 4);
  for (let y = 0; y < h; y++) { rgba.set(a.rgba.subarray(y * w * 4, (y + 1) * w * 4), y * w * 8); rgba.set(b.rgba.subarray(y * w * 4, (y + 1) * w * 4), y * w * 8 + w * 4); }
  writePng(path, w * 2, h, rgba);
}
