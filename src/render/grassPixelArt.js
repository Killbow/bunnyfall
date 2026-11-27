// @ts-check
// Pixel grass style: a tuft sprite sheet and its mip chain, built at boot from a seed, so every machine builds the
// same sheet. Every texel is a blade or nothing: alpha is 0 or 255, never between.

export const PX_VARIANTS = 8;
// The quad is half its drawn height wide (labGrass.js GRASSPX_VS_EDITS), so a texel is square on every blade.
// Every size rule below is a function of these two numbers.
export const PX_TUFT_W = 8;
export const PX_TUFT_H = 16;
export const tuftMarginFor = (w) => Math.max(1, Math.round(w * 3 / 16));
export const bladeMinFor = (h) => Math.floor(h * 0.45);
export const highlightMinFor = (h) => Math.round(h * 20 / 32);
export const PX_TUFT_MARGIN = tuftMarginFor(PX_TUFT_W);
export const PX_BLADE_MIN = bladeMinFor(PX_TUFT_H);
export const PX_HIGHLIGHT_MIN = highlightMinFor(PX_TUFT_H);
// R holds the tone (0 nothing, 1 root, 2 mid, 3 tip, 4 highlight) as tone * 64, 255 for 4; the shader reads it back
// as floor(R * 4 + 0.5).
export const PX_TONES = 4;
export const PX_RAMP_STEPS = 8;
export const PX_TINT_BANDS = 4;
export const PX_SEED = 0x9e3779b1;
export const PX_BLADES_PER_TUFT = 2;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const toneByte = (tone) => tone >= PX_TONES ? 255 : tone * 64;

/**
 * @param {() => number} rnd
 * @param {number} w
 * @param {number} h
 */
export function layTuft(rnd, w = PX_TUFT_W, h = PX_TUFT_H) {
  const blades = [];
  const n = 3 + Math.floor(rnd() * 3);
  const margin = tuftMarginFor(w);
  for (let b = 0; b < n; b++) {
    const x0 = margin + Math.floor(rnd() * (w - 2 * margin));
    const height = Math.floor(h * (0.45 + rnd() * 0.55));
    let lean = (rnd() * 2 - 1) * (2 + rnd() * 4) * (w / 16);
    lean = Math.max(1 - x0, Math.min(w - 2 - x0, lean));
    const wide = rnd() < 0.5;
    const head = height >= h * 0.8 && rnd() < 0.4;
    if (head) lean = Math.min(w - 3 - x0, lean);
    blades.push({ x0, height, lean, wide, head, ordinal: n > 1 ? b / (n - 1) : 0 });
  }
  return blades;
}

export function toneAt(f, isTip, height, highlightMin = PX_HIGHLIGHT_MIN) {
  if (isTip && height >= highlightMin) return 4;
  return f < 0.35 ? 1 : f < 0.75 ? 2 : 3;
}
export const isHighlightRow = (r, top, height, highlightMin = PX_HIGHLIGHT_MIN) => height >= highlightMin && r >= top - 1;

/**
 * @param {Uint8Array} out
 * @param {number} stride
 * @param {number} ox
 * @param {ReturnType<typeof layTuft>} blades
 */
export function paintTuft(out, stride, ox, blades, w = PX_TUFT_W, h = PX_TUFT_H) {
  const highlightMin = highlightMinFor(h);
  const put = (x, y, tone, f, ordinal) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const i = ((y * stride) + ox + x) * 4;
    out[i] = toneByte(tone);
    out[i + 1] = Math.round(f * 255);
    out[i + 2] = Math.round(ordinal * 255);
    out[i + 3] = 255;
  };
  for (const bl of blades) {
    const top = bl.height - 1;
    if (bl.head) {
      // The seed head is painted before the stalk, so the stalk's highlight texel lands on top of it.
      const xt = bl.x0 + Math.round(bl.lean);
      for (const [dx, dy] of [[0, -1], [1, -1], [0, 0], [1, 0]]) put(xt + dx, top + dy, 2, 1, bl.ordinal);
    }
    for (let r = 0; r <= top; r++) {
      const f = top > 0 ? r / top : 1;
      const x = bl.x0 + Math.round(bl.lean * f * f);
      const tone = isHighlightRow(r, top, bl.height, highlightMin) ? 4 : toneAt(f, r === top, bl.height, highlightMin);
      put(x, r, tone, f, bl.ordinal);
      if (bl.wide && f < 0.2) put(x + (bl.lean >= 0 ? -1 : 1), r, 1, f, bl.ordinal);
    }
  }
}

export function buildTuftSheet({ variants = PX_VARIANTS, w = PX_TUFT_W, h = PX_TUFT_H, seed = PX_SEED } = {}) {
  const width = variants * w, height = h;
  const data = new Uint8Array(width * height * 4);
  for (let v = 0; v < variants; v++) {
    const rnd = mulberry32((seed ^ Math.imul(v + 1, 0x85ebca6b)) >>> 0);
    paintTuft(data, width, v * w, layTuft(rnd, w, h), w, h);
  }
  return { width, height, data, variants };
}

// Keeps the covered fraction the base level had (the alpha-test mip rule): a max fills a far tuft to a block, and
// an average loses it by the first level.
export function downsampleCoverage(level, { targetFrac, variants = PX_VARIANTS }) {
  const { width, height, data } = level;
  const w2 = Math.max(1, width >> 1), h2 = Math.max(1, height >> 1);
  const out = new Uint8Array(w2 * h2 * 4);
  const blocks = [];
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      let count = 0, bi = -1, bg = -1, bt = 9;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = Math.min(width - 1, x * 2 + dx), sy = Math.min(height - 1, y * 2 + dy);
          const i = (sy * width + sx) * 4;
          if (!data[i + 3]) continue;
          count++;
          const g = data[i + 1], t = data[i];
          if (g > bg || (g === bg && t < bt)) { bg = g; bt = t; bi = i; }
        }
      }
      const o = (y * w2 + x) * 4;
      if (bi >= 0) { out[o] = data[bi]; out[o + 1] = data[bi + 1]; out[o + 2] = data[bi + 2]; }
      blocks.push({ x, y, count, g: bg, o });
    }
  }
  const tuftAt = w2 / variants;
  const covered = blocks.filter((b) => b.count > 0);
  covered.sort((a, b) => b.count - a.count || b.g - a.g || b.y - a.y || a.x - b.x);
  const keep = Math.min(covered.length, Math.max(1, Math.round(targetFrac * w2 * h2)));
  for (let k = 0; k < keep; k++) out[covered[k].o + 3] = 255;
  for (let v = 0; v < variants; v++) {
    const x0 = Math.floor(v * tuftAt), x1 = Math.floor((v + 1) * tuftAt);
    const mine = covered.filter((b) => b.x >= x0 && b.x < x1);
    if (mine.length && !mine.some((b) => out[b.o + 3])) out[mine[0].o + 3] = 255;
  }
  return { width: w2, height: h2, data: out };
}

export function coverageOf(level) {
  let n = 0;
  for (let i = 3; i < level.data.length; i += 4) if (level.data[i]) n++;
  return n / (level.width * level.height);
}

// Down to 1x1: a chain that stops short is an incomplete texture, which samples black.
export function buildTuftMips(sheet = buildTuftSheet()) {
  /** @type {{ width: number, height: number, data: Uint8Array, variants?: number }[]} */
  const levels = [sheet];
  const targetFrac = coverageOf(sheet);
  while (levels[levels.length - 1].width > 1 || levels[levels.length - 1].height > 1) {
    levels.push(downsampleCoverage(levels[levels.length - 1], { targetFrac, variants: sheet.variants ?? PX_VARIANTS }));
  }
  return levels;
}

export const pixelGrass = (style) => style !== 'smooth';
