
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

function meanOf(iter) {
  let r = 0; let g = 0; let b = 0; let n = 0;
  for (const c of iter) { r += c[0]; g += c[1]; b += c[2]; n++; }
  return n ? [r / n, g / n, b / n] : null;
}

// Palette index 0 is the transparent background, which is what separates black hair from no hair.
export function portraitFeatures(bitmap, palette) {
  const { width: w, height: h, data } = bitmap;
  if (!w || !h) return null;
  const rgb = (x, y) => { const c = palette.get(data[y * w + x]); return [c.r / 255, c.g / 255, c.b / 255]; };
  const fg = (x, y) => data[y * w + x] !== 0;
  let top = h; let bot = -1; let left = w; let right = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!fg(x, y)) continue;
      if (y < top) top = y; if (y > bot) bot = y; if (x < left) left = x; if (x > right) right = x;
    }
  }
  if (bot < 0) return null;
  const H = bot - top + 1; const W = right - left + 1;
  const band = (y0, y1, x0, x1) => {
    const out = [];
    for (let y = Math.max(top, Math.floor(top + y0 * H)); y < Math.min(bot + 1, Math.ceil(top + y1 * H)); y++) {
      for (let x = Math.max(left, Math.floor(left + x0 * W)); x < Math.min(right + 1, Math.ceil(left + x1 * W)); x++) {
        if (fg(x, y)) out.push(rgb(x, y));
      }
    }
    return out;
  };
  const skin = meanOf(band(0.40, 0.68, 0.32, 0.68));
  const hairBand = band(0.00, 0.22, 0.00, 1.00);
  const hair = meanOf(hairBand);
  if (!skin || !hair) return null;
  const bald = dist3(hair, skin) < 0.12;
  const hairish = (c) => !bald && dist3(c, hair) < dist3(c, skin);
  const lower = band(0.55, 1.00, 0.00, 1.00);
  const length = lower.length ? lower.filter(hairish).length / lower.length : 0;
  // Reads only the chin center, since long hair falls beside the jaw and a wider band reads it as a beard.
  const chin = band(0.76, 0.96, 0.40, 0.60);
  const beard = chin.length ? chin.filter(hairish).length / chin.length : 0;
  return { skin, hair, bald, length, beard };
}

// Samples skin through the mesh UVs instead of assuming a texture layout. In the Head node frame a head faces -Y,
// so the vertices with the least y are the face.
export function headFeatures(rgba, w, h, geometry = null) {
  if (!rgba || !w || !h) return null;
  const texel = (u, v) => {
    const x = Math.min(w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * w)));
    const y = Math.min(h - 1, Math.max(0, Math.floor((v - Math.floor(v)) * h)));
    const o = (y * w + x) * 4;
    return [rgba[o] / 255, rgba[o + 1] / 255, rgba[o + 2] / 255];
  };
  const shapes = (geometry ?? []).filter((g) => g && g.positions && g.uvs && g.uvs.length === (g.positions.length / 3) * 2);
  if (shapes.length) {
    let minY = Infinity; let maxY = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
    for (const g of shapes) {
      for (let i = 0; i < g.positions.length; i += 3) {
        const y = g.positions[i + 1]; const z = g.positions[i + 2];
        if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
      }
    }
    const spanY = maxY - minY || 1; const spanZ = maxZ - minZ || 1;
    const cheeks = []; const chin = [];
    for (const g of shapes) {
      for (let i = 0, k = 0; i < g.positions.length; i += 3, k += 2) {
        const fy = (maxY - g.positions[i + 1]) / spanY;
        const fz = (g.positions[i + 2] - minZ) / spanZ;
        if (fy < 0.62) continue;
        const c = texel(g.uvs[k], g.uvs[k + 1]);
        if (fz > 0.42 && fz < 0.72) cheeks.push(c);
        else if (fz < 0.30) chin.push(c);
      }
    }
    const skin = meanOf(cheeks);
    const chinMean = meanOf(chin);
    if (skin) {
      const beard = chinMean ? Math.max(0, Math.min(1, (lum(skin) - lum(chinMean)) / 0.25)) : 0;
      return { skin, beard, via: 'mesh' };
    }
  }
  const px = (x, y) => { const o = (y * w + x) * 4; return [rgba[o] / 255, rgba[o + 1] / 255, rgba[o + 2] / 255]; };
  const band = (y0, y1, x0, x1) => {
    const out = [];
    for (let y = Math.floor(y0 * h); y < Math.ceil(y1 * h); y++) {
      for (let x = Math.floor(x0 * w); x < Math.ceil(x1 * w); x++) out.push(px(x, y));
    }
    return out;
  };
  const cheeks = meanOf(band(0.30, 0.55, 0.20, 0.80));
  const chinB = meanOf(band(0.66, 0.90, 0.30, 0.70));
  if (!cheeks || !chinB) return null;
  const beard = Math.max(0, Math.min(1, (lum(cheeks) - lum(chinB)) / 0.25));
  return { skin: cheeks, beard, via: 'band' };
}

export function hairFeatures(rgba, w, h, extentZ) {
  if (!rgba || !w || !h) return null;
  const px = [];
  for (let i = 0; i < w * h; i++) {
    if (rgba[i * 4 + 3] < 128) continue;
    px.push([rgba[i * 4] / 255, rgba[i * 4 + 1] / 255, rgba[i * 4 + 2] / 255]);
  }
  const colour = meanOf(px);
  if (!colour) return null;
  return { colour, extentZ: Number.isFinite(extentZ) ? extentZ : 0 };
}

// Bump this when head or hair measuring or scoring changes, so cached verdicts in the derived store are measured
// again.
export const FACE_MATCH_VERSION = 2;

export function matchFace(portrait, heads, hairs, { female = false } = {}) {
  const reasons = [];
  if (!portrait) return { head: null, hair: null, reasons: ['portrait unreadable - the walk stands'] };
  let head = null; let best = Infinity;
  for (const h of heads ?? []) {
    if (!h.f) { reasons.push(`${h.id}: no texture to measure`); continue; }
    const d = dist3(portrait.skin, h.f.skin) + (female ? 0 : 0.35 * Math.abs(portrait.beard - h.f.beard));
    if (d < best) { best = d; head = h.id; }
  }
  if (head) reasons.push(`head ${head}: skin dist ${best.toFixed(2)}`);
  const measured = (hairs ?? []).filter((x) => x.f);
  for (const x of (hairs ?? [])) if (!x.f) reasons.push(`${x.id}: no texture to measure`);
  let hair = null;
  if (measured.length) {
    const sorted = measured.map((x) => x.f.extentZ).sort((a, b) => a - b);
    const rank = (v) => (sorted.length > 1 ? sorted.indexOf(v) / (sorted.length - 1) : 0.5);
    let bestH = Infinity;
    for (const x of measured) {
      const want = portrait.bald ? 0 : portrait.length;
      const d = (portrait.bald ? 0 : 1.2 * dist3(portrait.hair, x.f.colour)) + 0.6 * Math.abs(want - rank(x.f.extentZ));
      if (d < bestH) { bestH = d; hair = x.id; }
    }
    reasons.push(`hair ${hair}: ${portrait.bald ? 'portrait is bald, shortest hair' : `colour+length dist ${bestH.toFixed(2)}`}`);
  }
  return { head, hair, reasons };
}
