// Bakes a first texture for a mesh into a DDS: color bands along the long axis, brushing noise, and occlusion.
// Run: node tools/meshTexture.mjs <mesh.json> <out.dds> [--size=512] [--rays=64] [--preview=out.png].
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { writePng } from './pngIO.mjs';
import { isMain } from './lib/isMain.mjs';

// The palette values are linear: 0.30 encodes to sRGB 0.59.
export const BANDS = [
  { at: 0.00, name: 'muzzle',   colour: [0.070, 0.045, 0.026], rough: 0.90 },
  { at: 0.07, name: 'barrel',   colour: [0.305, 0.148, 0.036], rough: 0.55 },
  { at: 0.50, name: 'receiver', colour: [0.205, 0.112, 0.034], rough: 0.50 },
  { at: 0.76, name: 'grip',     colour: [0.055, 0.034, 0.022], rough: 0.95 },
];
export const GILDED_BANDS = [
  { at: 0.00, name: 'muzzle',   colour: [0.150, 0.096, 0.030], rough: 0.80 },
  { at: 0.07, name: 'barrel',   colour: [0.800, 0.530, 0.120], rough: 0.20 },
  { at: 0.50, name: 'receiver', colour: [0.680, 0.430, 0.095], rough: 0.25 },
  { at: 0.76, name: 'grip',     colour: [0.090, 0.040, 0.020], rough: 0.85 },
];

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function bandAt(t, bands = BANDS) {
  const x = clamp01(t);
  let i = 0;
  while (i + 1 < bands.length && bands[i + 1].at <= x) i++;
  const a = bands[i];
  const b = bands[Math.min(i + 1, bands.length - 1)];
  const span = b.at - a.at;
  const k = span > 0 ? clamp01((x - a.at) / span) : 0;
  const s = k * k * (3 - 2 * k);
  return {
    name: s < 0.5 ? a.name : b.name,
    colour: [0, 1, 2].map((c) => lerp(a.colour[c], b.colour[c], s)),
    rough: lerp(a.rough, b.rough, s),
  };
}

function hash3(x, y, z) {
  let h = (Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function valueNoise(x, y, z) {
  const xi = Math.floor(x); const yi = Math.floor(y); const zi = Math.floor(z);
  const xf = x - xi; const yf = y - yi; const zf = z - zi;
  const sx = xf * xf * (3 - 2 * xf); const sy = yf * yf * (3 - 2 * yf); const sz = zf * zf * (3 - 2 * zf);
  let out = 0;
  for (let k = 0; k < 8; k++) {
    const dx = k & 1; const dy = (k >> 1) & 1; const dz = (k >> 2) & 1;
    const w = (dx ? sx : 1 - sx) * (dy ? sy : 1 - sy) * (dz ? sz : 1 - sz);
    out += w * hash3(xi + dx, yi + dy, zi + dz);
  }
  return out;
}

function rayTri(o, d, a, b, c) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  // Two-sided: the mesh is an open shell with two-sided faces, so a back face still occludes.
  if (Math.abs(det) < 1e-12) return Infinity;
  const inv = 1 / det;
  const t = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const u = (t[0] * p[0] + t[1] * p[1] + t[2] * p[2]) * inv;
  if (u < 0 || u > 1) return Infinity;
  const q = [t[1] * e1[2] - t[2] * e1[1], t[2] * e1[0] - t[0] * e1[2], t[0] * e1[1] - t[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return Infinity;
  const dist = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return dist > 1e-5 ? dist : Infinity;
}

export function vertexAO(mesh, { rays = 64, range = null } = {}) {
  const P = mesh.positions; const N = mesh.normals; const I = mesh.indices;
  const n = P.length / 3;
  // The occlusion reach is a share of the model's longest axis, so it works at any scale.
  const reach = range ?? 0.12 * longestAxis(mesh.bounds);
  const tris = [];
  for (let t = 0; t < I.length; t += 3) {
    tris.push([
      [P[I[t] * 3], P[I[t] * 3 + 1], P[I[t] * 3 + 2]],
      [P[I[t + 1] * 3], P[I[t + 1] * 3 + 1], P[I[t + 1] * 3 + 2]],
      [P[I[t + 2] * 3], P[I[t + 2] * 3 + 1], P[I[t + 2] * 3 + 2]],
    ]);
  }
  const out = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    const nrm = [N[v * 3], N[v * 3 + 1], N[v * 3 + 2]];
    const s = nrm[2] >= 0 ? 1 : -1;
    const a = -1 / (s + nrm[2]);
    const b = nrm[0] * nrm[1] * a;
    const tx = [1 + s * nrm[0] * nrm[0] * a, s * b, -s * nrm[0]];
    const ty = [b, s + nrm[1] * nrm[1] * a, -nrm[1]];
    const origin = [P[v * 3] + nrm[0] * 1e-4, P[v * 3 + 1] + nrm[1] * 1e-4, P[v * 3 + 2] + nrm[2] * 1e-4];
    let open = 0;
    for (let r = 0; r < rays; r++) {
      const u1 = (r + 0.5) / rays;
      const u2 = (r * 0.6180339887498949 + v * 0.7548776662466927) % 1;
      const sinT = Math.sqrt(u1);
      const cosT = Math.sqrt(1 - u1);
      const phi = 2 * Math.PI * u2;
      const d = [
        tx[0] * sinT * Math.cos(phi) + ty[0] * sinT * Math.sin(phi) + nrm[0] * cosT,
        tx[1] * sinT * Math.cos(phi) + ty[1] * sinT * Math.sin(phi) + nrm[1] * cosT,
        tx[2] * sinT * Math.cos(phi) + ty[2] * sinT * Math.sin(phi) + nrm[2] * cosT,
      ];
      let hit = Infinity;
      for (const tri of tris) {
        const dist = rayTri(origin, d, tri[0], tri[1], tri[2]);
        if (dist < hit) hit = dist;
        if (hit < 1e-4) break;
      }
      open += hit >= reach ? 1 : hit / reach;
    }
    out[v] = open / rays;
  }
  return out;
}

export function bakeAttributes(mesh, size, ao) {
  const P = mesh.positions; const N = mesh.normals; const U = mesh.uvs; const I = mesh.indices;
  if (!U) throw new Error('this mesh has no UVs - there is nothing to bake into');
  const pos = new Float32Array(size * size * 3);
  const nrm = new Float32Array(size * size * 3);
  const occ = new Float32Array(size * size);
  const covered = new Uint8Array(size * size);
  const uvAt = (i) => [U[i * 2] * (size - 1), (1 - U[i * 2 + 1]) * (size - 1)];

  for (let t = 0; t < I.length; t += 3) {
    const idx = [I[t], I[t + 1], I[t + 2]];
    const s = idx.map(uvAt);
    const area = (s[1][0] - s[0][0]) * (s[2][1] - s[0][1]) - (s[2][0] - s[0][0]) * (s[1][1] - s[0][1]);
    if (Math.abs(area) < 1e-12) continue;
    // Conservative by one texel each way, so a triangle thinner than a texel still covers pixels.
    const minX = Math.max(0, Math.floor(Math.min(s[0][0], s[1][0], s[2][0])) - 1);
    const maxX = Math.min(size - 1, Math.ceil(Math.max(s[0][0], s[1][0], s[2][0])) + 1);
    const minY = Math.max(0, Math.floor(Math.min(s[0][1], s[1][1], s[2][1])) - 1);
    const maxY = Math.min(size - 1, Math.ceil(Math.max(s[0][1], s[1][1], s[2][1])) + 1);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5; const py = y + 0.5;
        let w0 = ((s[1][0] - s[0][0]) * (py - s[0][1]) - (px - s[0][0]) * (s[1][1] - s[0][1])) / area;
        let w1 = ((s[2][0] - s[1][0]) * (py - s[1][1]) - (px - s[1][0]) * (s[2][1] - s[1][1])) / area;
        let w2 = ((s[0][0] - s[2][0]) * (py - s[2][1]) - (px - s[2][0]) * (s[0][1] - s[2][1])) / area;
        const outside = w0 < 0 || w1 < 0 || w2 < 0;
        if (outside && covered[y * size + x]) continue;
        const sum = Math.abs(w0) + Math.abs(w1) + Math.abs(w2);
        if (outside) {
          w0 = clamp01(w0); w1 = clamp01(w1); w2 = clamp01(w2);
          const k = w0 + w1 + w2;
          if (k <= 0) continue;
          w0 /= k; w1 /= k; w2 /= k;
        } else if (sum > 0) { w0 /= sum; w1 /= sum; w2 /= sum; }
        // The weights are opposite-edge areas, so w0 belongs to idx[2], w1 to idx[0], and w2 to idx[1].
        const [c, a, b] = [idx[2], idx[0], idx[1]];
        const at = y * size + x;
        for (let k = 0; k < 3; k++) {
          pos[at * 3 + k] = P[c * 3 + k] * w0 + P[a * 3 + k] * w1 + P[b * 3 + k] * w2;
          nrm[at * 3 + k] = N[c * 3 + k] * w0 + N[a * 3 + k] * w1 + N[b * 3 + k] * w2;
        }
        occ[at] = ao[c] * w0 + ao[a] * w1 + ao[b] * w2;
        covered[at] = outside ? (covered[at] || 2) : 1;
      }
    }
  }
  return { pos, nrm, occ, covered, size };
}

export const longestAxis = (bounds) =>
  Math.max(...[0, 1, 2].map((k) => bounds.max[k] - bounds.min[k])) || 1;

export function muzzleFraction(y, bounds) {
  const span = bounds.max[1] - bounds.min[1] || 1;
  return clamp01((bounds.max[1] - y) / span);
}

export function shadeTexel(p, n, ao, bounds, bands = BANDS) {
  // +Y is forward, so the muzzle is the axis maximum and the fraction runs back from it.
  const band = bandAt(muzzleFraction(p[1], bounds), bands);
  let [r, g, b] = band.colour;

  const L = longestAxis(bounds);
  const q = [p[0] / L, p[1] / L, p[2] / L];
  const brush = valueNoise(q[0] * 220, q[1] * 26, q[2] * 220) - 0.5;
  const grain = valueNoise(q[0] * 60, q[1] * 60, q[2] * 60) - 0.5;
  const tone = 1 + brush * 0.34 * band.rough + grain * 0.16;

  const up = clamp01(n[2] * 0.5 + 0.5);
  const wear = 0.88 + 0.26 * up * (1 - band.rough);

  const occ = 0.22 + 0.78 * clamp01(ao);

  const k = tone * wear * occ;
  r *= k; g *= k; b *= k;
  return [clamp01(r), clamp01(g), clamp01(b)];
}

const toSrgb = (v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * (v ** (1 / 2.4)) - 0.055));

// Bilinear filtering and mips sample across island edges, so empty texels would draw a dark rim at every seam.
export function dilate(rgba, covered, size, passes) {
  const have = Uint8Array.from(covered);
  for (let pass = 0; pass < passes; pass++) {
    const next = Uint8Array.from(have);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const at = y * size + x;
        if (have[at]) continue;
        let r = 0; let g = 0; let b = 0; let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx; const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            const s = ny * size + nx;
            if (!have[s]) continue;
            r += rgba[s * 4]; g += rgba[s * 4 + 1]; b += rgba[s * 4 + 2]; n++;
          }
        }
        if (!n) continue;
        rgba[at * 4] = r / n; rgba[at * 4 + 1] = g / n; rgba[at * 4 + 2] = b / n; rgba[at * 4 + 3] = 255;
        next[at] = 1;
      }
    }
    have.set(next);
  }
}

export function bakeTexture(mesh, { size = 512, rays = 64, dilatePasses = 8, bands = BANDS } = {}) {
  const ao = vertexAO(mesh, { rays });
  const { pos, nrm, occ, covered } = bakeAttributes(mesh, size, ao);
  const rgba = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    if (!covered[i]) continue;
    const c = shadeTexel(
      [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]],
      [nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]],
      occ[i], mesh.bounds, bands,
    );
    rgba[i * 4] = toSrgb(c[0]); rgba[i * 4 + 1] = toSrgb(c[1]); rgba[i * 4 + 2] = toSrgb(c[2]); rgba[i * 4 + 3] = 255;
  }
  dilate(rgba, covered, size, dilatePasses);
  return { width: size, height: size, data: rgba, covered };
}

export function halve({ width, height, data }) {
  const w = Math.max(1, width >> 1); const h = Math.max(1, height >> 1);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0; let n = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(width - 1, x * 2 + dx); const sy = Math.min(height - 1, y * 2 + dy);
            sum += data[(sy * width + sx) * 4 + c]; n++;
          }
        }
        out[(y * w + x) * 4 + c] = sum / n;
      }
    }
  }
  return { width: w, height: h, data: out };
}

export function writeDds(levels) {
  const HEADER = 128;
  let bytes = 0;
  for (const m of levels) bytes += m.width * m.height * 4;
  const buf = Buffer.alloc(HEADER + bytes);
  buf.writeUInt32LE(0x20534444, 0);
  buf.writeUInt32LE(124, 4);
  // Flags: CAPS, HEIGHT, WIDTH, PITCH, PIXELFORMAT, and MIPMAPCOUNT.
  buf.writeUInt32LE(0x1 | 0x2 | 0x4 | 0x8 | 0x1000 | 0x20000, 8);
  buf.writeUInt32LE(levels[0].height, 12);
  buf.writeUInt32LE(levels[0].width, 16);
  buf.writeUInt32LE(levels[0].width * 4, 20);
  buf.writeUInt32LE(0, 24);
  buf.writeUInt32LE(levels.length, 28);
  buf.writeUInt32LE(32, 76);
  // Pixel format flags: ALPHAPIXELS and RGB.
  buf.writeUInt32LE(0x1 | 0x40, 80);
  buf.writeUInt32LE(0, 84);
  buf.writeUInt32LE(32, 88);
  buf.writeUInt32LE(0x00ff0000, 92);
  buf.writeUInt32LE(0x0000ff00, 96);
  buf.writeUInt32LE(0x000000ff, 100);
  buf.writeUInt32LE(0xff000000, 104);
  // Caps: TEXTURE, COMPLEX, and MIPMAP.
  buf.writeUInt32LE(0x1000 | 0x8 | 0x400000, 108);
  let off = HEADER;
  for (const m of levels) {
    for (let i = 0; i < m.width * m.height; i++) {
      // A8R8G8B8 stores each pixel as B, G, R, and A.
      buf[off++] = m.data[i * 4 + 2];
      buf[off++] = m.data[i * 4 + 1];
      buf[off++] = m.data[i * 4];
      buf[off++] = m.data[i * 4 + 3];
    }
  }
  return buf;
}

export function mipChain(top) {
  const levels = [top];
  let cur = top;
  while (cur.width > 1 || cur.height > 1) { cur = halve(cur); levels.push(cur); }
  return levels;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d = null) => args.find((a) => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d;
  const files = args.filter((a) => !a.startsWith('--'));
  if (files.length !== 2) {
    console.error('usage: node tools/meshTexture.mjs <mesh.json> <out.dds> [--size=512] [--rays=64] [--preview=out.png]');
    process.exit(2);
  }
  const mesh = JSON.parse(readFileSync(files[0], 'utf8'));
  const size = Number(opt('size', 512));
  const top = bakeTexture(mesh, { size, rays: Number(opt('rays', 64)) });
  const levels = mipChain({ width: top.width, height: top.height, data: top.data });
  const dds = writeDds(levels);
  mkdirSync(dirname(files[1]), { recursive: true });
  writeFileSync(files[1], dds);
  const coveredCount = top.covered.reduce((a, v) => a + (v ? 1 : 0), 0);
  console.log(`${files[0]} -> ${files[1]}  ${dds.length} bytes, ${levels.length} mip levels`);
  console.log(`  ${size}x${size}, ${(100 * coveredCount / (size * size)).toFixed(1)}% of the atlas is the model`);
  if (opt('preview')) {
    mkdirSync(dirname(opt('preview')), { recursive: true });
    writeFileSync(opt('preview'), writePng({ width: top.width, height: top.height, data: top.data }));
    console.log(`  ${opt('preview')}`);
  }
}
