// Rebuilds a mod picture from a classic record in the player data plus pixel edits by the mod author, so no game
// data ships with the mod. Spec: { from: [archive, record, frame?], size: [w, h], at: [x, y], edits: [[x, y,
// 'rrggbbaa'], ...] }. Edits are top-down, and pixels that neither the record nor an edit covers are transparent.

const hex = (s, i) => Number.parseInt(s.slice(i, i + 2), 16);

/** @returns {Promise<{width:number, height:number, data:Uint8Array}>} */
export async function buildDerivedPicture(spec, classicRgba) {
  const [archive, record, frame = 0] = spec.from;
  const src = await classicRgba(archive, record, frame);
  if (!src?.width) throw new Error(`derived texture: ${archive}_${record}-${frame} is not in the player's data`);
  return composeDerivedPicture(spec, src);
}

export function composeDerivedPicture(spec, src) {
  const [w, h] = spec.size ?? [src.width, src.height];
  const [ax, ay] = spec.at ?? [0, 0];
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < src.height; y++) {
    const ty = y + ay;
    if (ty < 0 || ty >= h) continue;
    for (let x = 0; x < src.width; x++) {
      const tx = x + ax;
      if (tx < 0 || tx >= w) continue;
      const s = (y * src.width + x) * 4, d = (ty * w + tx) * 4;
      data[d] = src.data[s]; data[d + 1] = src.data[s + 1]; data[d + 2] = src.data[s + 2]; data[d + 3] = src.data[s + 3];
    }
  }
  for (const [x, y, c] of spec.edits ?? []) {
    if (x < 0 || y < 0 || x >= w || y >= h) throw new Error(`derived texture: an edit at ${x},${y} is off a ${w}x${h} picture`);
    const d = (y * w + x) * 4;
    data[d] = hex(c, 0); data[d + 1] = hex(c, 2); data[d + 2] = hex(c, 4); data[d + 3] = hex(c, 6);
  }
  return { width: w, height: h, data };
}

export function classicRecordRgba(bitmap, palette) {
  const { width, height } = bitmap;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const idx = bitmap.data[i];
    data[i * 4] = palette.getRed(idx); data[i * 4 + 1] = palette.getGreen(idx); data[i * 4 + 2] = palette.getBlue(idx);
    data[i * 4 + 3] = idx === 0 ? 0 : 255;
  }
  return { width, height, data };
}
// Returns null unless the player's own data holds a non-empty record. A mod archive (`vendor`) never counts as
// classic data.
export async function classicPictureOf(getTexture, palette, archive, record) {
  const t = await getTexture(archive);
  if (!t || t.vendor || !(record < t.recordCount)) return null;
  const bm = t.getDFBitmap(record, 0);
  return bm?.width ? classicRecordRgba(bm, palette) : null;
}

export function deriveSpec(from, picture, src, at = [0, 0]) {
  const base = composeDerivedPicture({ from, size: [picture.width, picture.height], at }, src);
  const edits = [];
  for (let y = 0; y < picture.height; y++) {
    for (let x = 0; x < picture.width; x++) {
      const i = (y * picture.width + x) * 4;
      if (picture.data[i + 3] === 0 && base.data[i + 3] === 0) continue;
      if (picture.data[i] === base.data[i] && picture.data[i + 1] === base.data[i + 1] && picture.data[i + 2] === base.data[i + 2] && picture.data[i + 3] === base.data[i + 3]) continue;
      const c = [0, 1, 2, 3].map((k) => picture.data[i + k].toString(16).padStart(2, '0')).join('');
      edits.push([x, y, c]);
    }
  }
  const spec = { from };
  if (picture.width !== src.width || picture.height !== src.height) spec.size = [picture.width, picture.height];
  if (at[0] || at[1]) spec.at = at;
  if (edits.length) spec.edits = edits;
  return spec;
}

// Row y of the frame comes from paint row (y + scroll) mod height. A paint pixel equal to `key` takes the record's
// pixel at ((x + px) mod w, (y + py) mod h), fully opaque.
export function composeTiledPicture(spec, src, paint) {
  const [w, h] = spec.size;
  if (paint.width !== w || paint.height !== h) throw new Error(`derived texture: a ${paint.width}x${paint.height} paint for a ${w}x${h} picture`);
  const [px, py] = spec.tile ?? [0, 0];
  const scroll = spec.scroll ?? 0;
  const k = [hex(spec.key, 0), hex(spec.key, 2), hex(spec.key, 4), hex(spec.key, 6)];
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = ((y + py) % src.height + src.height) % src.height;
    const row = ((y + scroll) % h + h) % h;
    data.set(paint.data.subarray(row * w * 4, (row + 1) * w * 4), y * w * 4);
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4;
      if (data[d] !== k[0] || data[d + 1] !== k[1] || data[d + 2] !== k[2] || data[d + 3] !== k[3]) continue;
      const s = (sy * src.width + (((x + px) % src.width) + src.width) % src.width) * 4;
      data[d] = src.data[s]; data[d + 1] = src.data[s + 1]; data[d + 2] = src.data[s + 2]; data[d + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** @returns {{ paint: {width:number,height:number,data:Uint8Array}, fromRecord: number, own: number, clear: number }} */
export function deriveTiledPaint(picture, src, tile, key) {
  const { width: w, height: h } = picture;
  const k = [hex(key, 0), hex(key, 2), hex(key, 4), hex(key, 6)];
  const [px, py] = tile;
  const data = new Uint8Array(w * h * 4);
  let fromRecord = 0, own = 0, clear = 0;
  for (let y = 0; y < h; y++) {
    const sy = ((y + py) % src.height + src.height) % src.height;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const p = picture.data;
      if (p[i + 3] === 0) { clear++; continue; }
      if (p[i] === k[0] && p[i + 1] === k[1] && p[i + 2] === k[2] && p[i + 3] === k[3]) throw new Error(`derived texture: the picture holds the key colour ${key} itself at ${x},${y}`);
      const s = (sy * src.width + (((x + px) % src.width) + src.width) % src.width) * 4;
      if (p[i + 3] === 255 && p[i] === src.data[s] && p[i + 1] === src.data[s + 1] && p[i + 2] === src.data[s + 2]) {
        data.set(k, i); fromRecord++;
      } else {
        data[i] = p[i]; data[i + 1] = p[i + 1]; data[i + 2] = p[i + 2]; data[i + 3] = p[i + 3]; own++;
      }
    }
  }
  return { paint: { width: w, height: h, data }, fromRecord, own, clear };
}

