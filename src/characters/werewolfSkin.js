// Shadow Fang werewolf skin: a recolor applied to a copy of the texture pixels. Imports nothing.
export const WEREWOLF_SKINS = Object.freeze(['shadowfang']);
export const SKIN_GLYPH = Object.freeze({ shadowfang: 'shadowfang' });

export function werewolfSkinOf(glyphs) {
  if (!Array.isArray(glyphs)) return null;
  for (const s of WEREWOLF_SKINS) if (glyphs.includes(SKIN_GLYPH[s])) return s;
  return null;
}

export const SHADOW_FANG = Object.freeze({
  dark: 0.3,
  drain: 0.4,
  strand: Object.freeze([0.04, 0.15, 0.85]),
  tip: Object.freeze([0.85, 0.97, 0.6]),
  tipSpan: 0.04,
  fringe: 0.65,
  crimson: Object.freeze([196, 18, 48]),
  eye: Object.freeze([255, 34, 46]),
  eyeBlob: Object.freeze({ min: 6, share: 1 / 256, fill: 0.25, aspect: 4, lift: 0.3, crowd: 0.1 }),
});

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const isEyeTexture = (file) => /eye/i.test(String(file || ''));

export function looksLikeEye(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!mx || !d) return false;
  const s = d / mx, v = mx / 255;
  let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  hue = (hue * 60 + 360) % 360;
  return (v > 0.7 && s > 0.55 && hue >= 40 && hue <= 200) || (v > 0.8 && s > 0.7 && (hue >= 350 || hue <= 10));
}

export function skinUseOf(piece, file = '') {
  const m = piece?.material ?? null;
  const shape = piece?.shape ?? piece?.batch?.name ?? '';
  const head = /^head(\s|$)/i.test(String(piece?.slot ?? ''));
  return {
    file,
    eyes: isEyeTexture(file) || isEyeTexture(shape) ? 'all' : head ? 'colour' : 'none',
    cut: !!(m && m.alphaTest),
    clamp: m && Number.isInteger(m.clampMode) ? m.clampMode & 3 : 3,
  };
}

export const skinUseKey = (skin, use) => `${skin}|${use?.eyes ?? 'none'}|${use?.cut ? 1 : 0}|${(use?.clamp ?? 3) & 3}`;

function tapsOf(size, r, wrap) {
  const n = 2 * r + 1, t = new Int32Array(size * n);
  for (let x = 0; x < size; x++) {
    for (let d = -r; d <= r; d++) {
      const j = x + d;
      t[x * n + d + r] = wrap ? ((j % size) + size) % size : (j < 0 || j >= size ? -1 : j);
    }
  }
  return t;
}

function neighbourhoodLight(L, A, w, h, wrapS, wrapT) {
  const R = 2, N = 2 * R + 1;
  const cx = tapsOf(w, R, wrapS), cy = tapsOf(h, R, wrapT);
  const sumH = new Float32Array(w * h), cntH = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let t = x * N, e = t + N; t < e; t++) {
        const xx = cx[t];
        if (xx < 0) continue;
        const j = row + xx;
        if (A[j] >= 128) { s += L[j]; c++; }
      }
      sumH[row + x] = s; cntH[row + x] = c;
    }
  }
  const mean = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let t = y * N, e = t + N; t < e; t++) {
        const yy = cy[t];
        if (yy < 0) continue;
        const j = yy * w + x;
        s += sumH[j]; c += cntH[j];
      }
      const i = y * w + x;
      mean[i] = c ? s / c : L[i];
    }
  }
  return mean;
}

function besideACut(A, w, h, wrapS, wrapT) {
  const cx = tapsOf(w, 1, wrapS), cy = tapsOf(h, 1, wrapT);
  const row = new Uint8Array(w * h), near = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) {
      for (let t = x * 3, e = t + 3; t < e; t++) { const xx = cx[t]; if (xx >= 0 && A[o + xx] < 128) { row[o + x] = 1; break; } }
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let t = y * 3, e = t + 3; t < e; t++) { const yy = cy[t]; if (yy >= 0 && row[yy * w + x]) { near[y * w + x] = 1; break; } }
    }
  }
  return near;
}

function lightQuantiles(L, A, qLo, qHi) {
  const hist = new Uint32Array(256);
  let n = 0;
  for (let i = 0; i < L.length; i++) if (A[i] >= 128) { hist[Math.min(255, (L[i] * 255) | 0)]++; n++; }
  if (!n) return [0, 0];
  const at = (q) => {
    const want = q * n;
    let acc = 0;
    for (let b = 0; b < 256; b++) { acc += hist[b]; if (acc >= want) return (b + 0.5) / 255; }
    return 1;
  };
  return [at(qLo), at(qHi)];
}

function eyeBlobs(rgba, A, w, h, isEye) {
  const k = SHADOW_FANG.eyeBlob;
  const n = w * h;
  const cand = new Uint8Array(n), V = new Float32Array(n);
  let any = false;
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    V[i] = Math.max(rgba[o], rgba[o + 1], rgba[o + 2]) / 255;
    if (A[i] >= 128 && isEye(rgba[o], rgba[o + 1], rgba[o + 2])) { cand[i] = 1; any = true; }
  }
  const eye = new Uint8Array(n);
  if (!any) return eye;
  const most = Math.max(k.min, Math.floor(n * k.share));
  const blob = new Int32Array(n).fill(-1);
  const stack = [], members = [];
  for (let i0 = 0; i0 < n; i0++) {
    if (!cand[i0] || blob[i0] >= 0) continue;
    stack.length = 0; members.length = 0;
    stack.push(i0); blob[i0] = i0;
    let x0 = w, x1 = -1, y0 = h, y1 = -1, sum = 0;
    while (stack.length) {
      const i = stack.pop();
      members.push(i); sum += V[i];
      const x = i % w, y = (i - x) / w;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const j = yy * w + xx;
          if (cand[j] && blob[j] < 0) { blob[j] = i0; stack.push(j); }
        }
      }
    }
    const area = members.length;
    if (area < k.min || area > most) continue;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (area / (bw * bh) < k.fill || Math.max(bw, bh) > k.aspect * Math.min(bw, bh)) continue;
    let rs = 0, rc = 0, crowd = 0;
    for (let y = Math.max(0, y0 - 2); y <= Math.min(h - 1, y1 + 2); y++) {
      for (let x = Math.max(0, x0 - 2); x <= Math.min(w - 1, x1 + 2); x++) {
        const j = y * w + x;
        if (A[j] < 128) continue;
        if (cand[j]) { if (blob[j] !== i0) crowd++; continue; }
        rs += V[j]; rc++;
      }
    }
    if (!rc || crowd > k.crowd * (rc + crowd) || sum / area - rs / rc < k.lift) continue;
    for (const i of members) eye[i] = 1;
  }
  return eye;
}

// Returns a new array; the input belongs to the shared texture cache and is never written.
/**
 * @param {Uint8Array} rgba
 * @param {number} w
 * @param {number} h
 * @param {{ eyes?: 'all'|'colour'|'none', cut?: boolean, wrapS?: boolean, wrapT?: boolean,
 * isEye?: (r: number, g: number, b: number) => boolean }} [opts]
 */
export function shadowFangPixels(rgba, w, h, { eyes = 'none', cut = true, wrapS = true, wrapT = true, isEye = looksLikeEye } = {}) {
  const k = SHADOW_FANG;
  const n = w * h;
  const out = new Uint8Array(n * 4);
  if (!n) return out;
  const L = new Float32Array(n), A = new Uint8Array(n);
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    L[i] = (0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]) / 255;
    A[i] = rgba[o + 3];
  }
  const allEye = eyes === 'all';
  const eye = eyes === 'colour' ? eyeBlobs(rgba, A, w, h, isEye) : null;
  const mean = allEye ? null : neighbourhoodLight(L, A, w, h, wrapS, wrapT);
  const [tipLo, tipHi] = allEye ? [0, 0] : lightQuantiles(L, A, k.tip[0], k.tip[1]);
  const tips = tipHi - tipLo >= k.tipSpan;
  const near = cut && !allEye ? besideACut(A, w, h, wrapS, wrapT) : null;
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    const r = rgba[o], g = rgba[o + 1], b = rgba[o + 2], a = rgba[o + 3];
    out[o + 3] = a;
    if (!a) { out[o] = r; out[o + 1] = g; out[o + 2] = b; continue; }
    const l = L[i];
    if (allEye || (eye && eye[i])) {
      const q = 0.25 + 0.75 * Math.min(1, l / 0.6);
      out[o] = (k.eye[0] * q + 0.5) | 0; out[o + 1] = (k.eye[1] * q + 0.5) | 0; out[o + 2] = (k.eye[2] * q + 0.5) | 0;
      continue;
    }
    const grey = l * 255;
    const br = (r * (1 - k.drain) + grey * k.drain) * k.dark;
    const bg = (g * (1 - k.drain) + grey * k.drain) * k.dark;
    const bb = (b * (1 - k.drain) + grey * k.drain) * k.dark;
    const strand = smooth(k.strand[0], k.strand[1], l - mean[i]) * k.strand[2];
    const tip = tips ? smooth(tipLo, tipHi, l) * k.tip[2] : 0;
    const fringe = near && a >= 128 && near[i] ? k.fringe : 0;
    const wgt = Math.min(1, Math.max(strand, tip, fringe));
    const lit = 0.5 + 0.7 * l;
    out[o] = (br * (1 - wgt) + k.crimson[0] * lit * wgt + 0.5) | 0;
    out[o + 1] = (bg * (1 - wgt) + k.crimson[1] * lit * wgt + 0.5) | 0;
    out[o + 2] = (bb * (1 - wgt) + k.crimson[2] * lit * wgt + 0.5) | 0;
  }
  return out;
}

export function downsampleLevel(src, sw, sh, dw, dh) {
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor((y * sh) / dh), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * sh) / dh));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor((x * sw) / dw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sw) / dw));
      let r = 0, g = 0, b = 0, a = 0, rw = 0, gw = 0, bw = 0, c = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const o = (yy * sw + xx) * 4, al = src[o + 3];
          r += src[o]; g += src[o + 1]; b += src[o + 2]; a += al; c++;
          rw += src[o] * al; gw += src[o + 1] * al; bw += src[o + 2] * al;
        }
      }
      const o = (y * dw + x) * 4;
      if (a) { out[o] = (rw / a + 0.5) | 0; out[o + 1] = (gw / a + 0.5) | 0; out[o + 2] = (bw / a + 0.5) | 0; }
      else { out[o] = (r / c + 0.5) | 0; out[o + 1] = (g / c + 0.5) | 0; out[o + 2] = (b / c + 0.5) | 0; }
      out[o + 3] = (a / c + 0.5) | 0;
    }
  }
  return out;
}

/**
 * @param {Array<{width: number, height: number, rgba: Uint8Array}>} mips
 * @param {string|null} skin
 * @param {{file?: string, eyes?: 'all'|'colour'|'none', cut?: boolean, clamp?: number}|string} [use]
 */
export function skinMips(mips, skin, use = {}) {
  if (skin !== 'shadowfang' || !Array.isArray(mips) || !mips.length) return mips;
  const u = typeof use === 'string' ? { file: use } : (use ?? {});
  if (mips.some((m) => !m?.rgba || m.rgba.length < m.width * m.height * 4)) return mips;
  const clamp = Number.isInteger(u.clamp) ? u.clamp & 3 : 3;
  const opts = { eyes: u.eyes ?? (isEyeTexture(u.file) ? 'all' : 'none'), cut: u.cut ?? true, wrapS: !!(clamp & 2), wrapT: !!(clamp & 1) };
  const top = mips[0];
  const out = [{ ...top, rgba: shadowFangPixels(top.rgba, top.width, top.height, opts) }];
  for (let lv = 1; lv < mips.length; lv++) {
    const prev = out[lv - 1], m = mips[lv];
    const rgba = downsampleLevel(prev.rgba, prev.width, prev.height, m.width, m.height);
    for (let i = 3; i < rgba.length; i += 4) rgba[i] = m.rgba[i];
    out.push({ ...m, rgba });
  }
  return out;
}
