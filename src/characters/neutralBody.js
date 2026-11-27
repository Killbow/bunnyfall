export const WRIST_JUNCTION_Y = 0.9875;

export const ARM_X = 0.235;

export const HAND_REST_ROLL = 0.4 * Math.PI;

export const NECK_PIVOT_Y = 1.655;

export const BUILD_IDENTITY = Object.freeze({
  torso: 1, shoulder: 1, arm: 1, hand: 1, neck: 1, skull: 1, jaw: 1, leg: 1,
});
export const BUILD_MIN = 0.6, BUILD_MAX = 1.6;

export function buildNeutralBody(ramps, opts = {}) {
  const SEG = 28;
  const SKIN = [196, 154, 116], BOOT = [92, 74, 58];
  const faces = [];
  let grp = 'body';
  const sq = (u, p) => Math.sign(u) * Math.pow(Math.abs(u), p);
  const ring = (cx, y, cz, rx, rz, i, p = 1) => { const a = (i / SEG) * Math.PI * 2; return [cx + rx * sq(Math.cos(a), p), y, cz + rz * sq(Math.sin(a), p)]; };
  function loft(rows, col, cxOf, czOf) {
    const R = rows.slice().sort((a, b) => a.y - b.y);
    for (let k = 0; k + 1 < R.length; k++) {
      const a = R[k], b = R[k + 1];
      if (Math.abs(a.y - b.y) < 1e-6) continue;
      const ax = cxOf ? cxOf(a) : (a.cx ?? 0), bx = cxOf ? cxOf(b) : (b.cx ?? 0);
      const az = czOf ? czOf(a) : (a.cz ?? 0), bz = czOf ? czOf(b) : (b.cz ?? 0);
      const pa = a.p ?? 1, pb2 = b.p ?? 1;
      for (let i = 0; i < SEG; i++) {
        const p0 = ring(ax, a.y, az, a.rx, a.rz, i, pa), p1 = ring(ax, a.y, az, a.rx, a.rz, i + 1, pa);
        const p2 = ring(bx, b.y, bz, b.rx, b.rz, i + 1, pb2), p3 = ring(bx, b.y, bz, b.rx, b.rz, i, pb2);
        const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
        const vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
        const mx = (p0[0] + p2[0]) / 2 - ax, mz = (p0[2] + p2[2]) / 2 - az;
        if (nx * mx + nz * mz < 0) { nx = -nx; ny = -ny; nz = -nz; }
        faces.push({ p: [...p0, ...p1, ...p2, ...p3], n: [nx, ny, nz], c: col, g: grp });
      }
    }
  }

  const BD = { ...BUILD_IDENTITY, ...(opts.build || {}) };
  for (const k of Object.keys(BUILD_IDENTITY)) {
    BD[k] = Math.min(BUILD_MAX, Math.max(BUILD_MIN, Number.isFinite(BD[k]) ? BD[k] : 1));
  }
  const girth = (rows, k) => (k === 1 ? rows : rows.map((r) => ({ ...r, rx: r.rx * k, rz: r.rz * k })));

  const TP = 0.58;
  const torso = [
    { y: 1.66, rx: 0.205, rz: 0.090, p: TP },
    { y: 1.57, rx: 0.215, rz: 0.096, p: TP },
    { y: 1.46, rx: 0.208, rz: 0.098, p: TP },
    { y: 1.33, rx: 0.182, rz: 0.092, p: TP },
    { y: 1.19, rx: 0.160, rz: 0.082, p: TP },
    { y: 1.09, rx: 0.162, rz: 0.084, p: TP },
    { y: 1.04, rx: 0.168, rz: 0.088, p: TP },
    { y: 0.99, rx: 0.170, rz: 0.090, p: TP },
  ];
  loft(girth(torso, BD.torso), SKIN);

  const TRAP = [
    { y: 1.66, rx: 0.086, rz: 0.058, p: 0.5, cx: 0.00 },
    { y: 1.64, rx: 0.150, rz: 0.070, p: 0.5, cx: 0.00 },
    { y: 1.61, rx: 0.215, rz: 0.082, p: 0.5, cx: 0.00 },
  ];
  loft(girth(TRAP, BD.shoulder), SKIN);
  const DELT = [
    { y: 1.64, rx: 0.070, rz: 0.072, p: 0.55 },
    { y: 1.60, rx: 0.090, rz: 0.082, p: 0.55 },
    { y: 1.55, rx: 0.082, rz: 0.076, p: 0.55 },
    { y: 1.50, rx: 0.066, rz: 0.068, p: 0.6 },
  ];
  {
    const D = girth(DELT, BD.shoulder);
    grp = 'armL'; loft(D, SKIN, () => -0.240, () => 0);
    grp = 'armR'; loft(D, SKIN, () => 0.240, () => 0);
  }
  grp = 'body';
  loft(girth([
    { y: 1.63, rx: 0.078, rz: 0.078, p: 0.8 },
    { y: 1.68, rx: 0.070, rz: 0.072, p: 0.8 },
    { y: 1.73, rx: 0.072, rz: 0.074, p: 0.8 },
  ], BD.neck), SKIN, () => 0, () => -0.01);
  grp = 'head';
  const HEAD_JAW = [
    { y: 1.70, rx: 0.052, rz: 0.070, cz: 0.010 },
    { y: 1.74, rx: 0.082, rz: 0.105, cz: 0.005 },
  ];
  const HEAD_SEAM = [
    { y: 1.79, rx: 0.102, rz: 0.130, cz: -0.005 },
  ];
  const HEAD_SKULL = [
    { y: 1.85, rx: 0.108, rz: 0.140, cz: -0.015 },
    { y: 1.92, rx: 0.100, rz: 0.135, cz: -0.020 },
    { y: 1.98, rx: 0.082, rz: 0.108, cz: -0.018 },
    { y: 2.03, rx: 0.045, rz: 0.058, cz: -0.012 },
  ];
  loft([
    ...girth(HEAD_JAW, BD.jaw),
    ...girth(HEAD_SEAM, (BD.jaw + BD.skull) / 2),
    ...girth(HEAD_SKULL, BD.skull),
  ], SKIN, () => 0, (r) => r.cz);
  grp = 'body';

  const armProf = [
    { y: 1.61, rx: 0.072, rz: 0.075 },
    { y: 1.50, rx: 0.065, rz: 0.068 },
    { y: 1.42, rx: 0.058, rz: 0.060 },
    { y: 1.35, rx: 0.050, rz: 0.056, cz: -0.006 },
    { y: 1.30, rx: 0.056, rz: 0.062, cz: -0.008 },
    { y: 1.22, rx: 0.056, rz: 0.058 },
    { y: 1.16, rx: 0.050, rz: 0.052 },
    { y: 1.06, rx: 0.044, rz: 0.046 },
    { y: 0.99, rx: 0.036, rz: 0.038 },
  ];
  {
    const A = girth(armProf, BD.arm);
    grp = 'armL'; loft(A, SKIN, () => -ARM_X, () => 0);
    grp = 'armR'; loft(A, SKIN, () => ARM_X, () => 0);
  }
  grp = 'body';
  function hand(sign) {
    const cx = sign * ARM_X;
    loft(girth([
      { y: 0.985, rx: 0.036, rz: 0.038 },
      { y: 0.950, rx: 0.052, rz: 0.030 },
      { y: 0.905, rx: 0.054, rz: 0.030 },
      { y: 0.860, rx: 0.048, rz: 0.026 },
      { y: 0.820, rx: 0.036, rz: 0.020 },
    ], BD.hand), SKIN, () => cx, () => 0);
    const tside = sign;
    loft(girth([
      { y: 0.955, rx: 0.016, rz: 0.020, cz: 0.010 },
      { y: 0.935, rx: 0.020, rz: 0.024, cz: 0.018 },
      { y: 0.912, rx: 0.014, rz: 0.018, cz: 0.014 },
    ], BD.hand), SKIN, () => cx + tside * 0.052 * BD.hand, (r) => r.cz);
  }
  grp = 'armL'; hand(-1); grp = 'armR'; hand(1); grp = 'body';

  const ANKLE_Y = 0.10;
  const legProf = [
    { y: 0.10, rx: 0.048, rz: 0.048 },
    { y: 0.22, rx: 0.060, rz: 0.063 },
    { y: 0.34, rx: 0.084, rz: 0.088 },
    { y: 0.44, rx: 0.070, rz: 0.072 },
    { y: 0.50, rx: 0.076, rz: 0.088, cz: 0.010 },
    { y: 0.55, rx: 0.072, rz: 0.080 },
    { y: 0.62, rx: 0.086, rz: 0.090 },
    { y: 0.72, rx: 0.096, rz: 0.100 },
    { y: 0.82, rx: 0.112, rz: 0.114 },
    { y: 0.95, rx: 0.120, rz: 0.120 },
  ];
  const LEG_X = 0.082;
  const CONNECT = [
    { y: 0.90, rx: legProf[legProf.length - 1].rx, rz: legProf[legProf.length - 1].rz, dx: 0 },
    { y: 0.96, rx: 0.120, rz: 0.112, dx: 0.006 },
    { y: 1.00, rx: 0.108, rz: 0.100, dx: 0.012 },
  ];
  function leg(sign) {
    loft(girth(legProf, BD.leg), SKIN, () => sign * LEG_X, () => 0);
    loft(girth(CONNECT, BD.leg), SKIN, (r) => sign * (LEG_X - r.dx), () => 0);
  }
  grp = 'legL'; leg(-1); grp = 'legR'; leg(1); grp = 'body';

  const ANK = 0.045;
  const quad = (a, b, c, d, col) => {
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
    const vx = d[0]-a[0], vy = d[1]-a[1], vz = d[2]-a[2];
    let nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
    const L = Math.hypot(nx,ny,nz)||1; nx/=L; ny/=L; nz/=L;
    faces.push({ p: [...a, ...b, ...c, ...d], n: [nx,ny,nz], c: col, g: grp });
  };
  function foot(cx) {
    const SOLE = 0.005;
    const prof = [
      [-0.062, 0.082, 0.052],
      [-0.025, 0.090, 0.055],
      [ 0.06,  0.074, 0.058],
      [ 0.155, 0.056, 0.058],
      [ 0.235, 0.036, 0.044],
    ];
    for (let k = 0; k + 1 < prof.length; k++) {
      const [z0, t0, w0] = prof[k], [z1, t1, w1] = prof[k+1];
      const L0 = [cx-w0, SOLE, z0], R0 = [cx+w0, SOLE, z0], TL0 = [cx-w0, t0, z0], TR0 = [cx+w0, t0, z0];
      const L1 = [cx-w1, SOLE, z1], R1 = [cx+w1, SOLE, z1], TL1 = [cx-w1, t1, z1], TR1 = [cx+w1, t1, z1];
      quad(L0, R0, R1, L1, BOOT);
      quad(TL0, TL1, TR1, TR0, BOOT);
      quad(L0, L1, TL1, TL0, BOOT);
      quad(R0, TR0, TR1, R1, BOOT);
    }
    const h = prof[0], t = prof[prof.length-1];
    quad([cx-h[2],SOLE,h[0]], [cx-h[2],h[1],h[0]], [cx+h[2],h[1],h[0]], [cx+h[2],SOLE,h[0]], BOOT);
    quad([cx-t[2],SOLE,t[0]], [cx+t[2],SOLE,t[0]], [cx+t[2],t[1],t[0]], [cx-t[2],t[1],t[0]], BOOT);
    loft([
      { y: ANKLE_Y, rx: ANK, rz: ANK, cz: 0 },
      { y: 0.085, rx: 0.046, rz: 0.05, cz: 0 },
    ], BOOT, () => cx, () => 0);
  }
  grp = 'legL'; foot(-LEG_X); grp = 'legR'; foot(LEG_X); grp = 'body';

  const Lx = 0.5, Ly = 0.55, Lz = 0.67, Ln = Math.hypot(Lx, Ly, Lz);
  const shade = (ramp, it) => ramp[Math.max(0, Math.min(ramp.length-1, Math.round(it*(ramp.length-1))))];

  const displace = (groups, yLo, yHi, th, cxFor, zScale = 1, mat = 'steel', zLo = -Infinity, zHi = Infinity) => {
    for (const f of faces) {
      if (!groups.includes(f.g)) continue;
      let cy = 0; for (let i = 0; i < 4; i++) cy += f.p[i*3+1]; cy /= 4;
      if (cy < yLo || cy > yHi) continue;
      if (zLo !== -Infinity || zHi !== Infinity) {
        let cz = 0; for (let i = 0; i < 4; i++) cz += f.p[i*3+2]; cz /= 4;
        if (cz < zLo || cz > zHi) continue;
      }
      const cx = cxFor ? cxFor(f.g) : 0;
      for (let i = 0; i < 4; i++) {
        const x = f.p[i*3] - cx, z = f.p[i*3+2], r = Math.hypot(x, z) || 1;
        f.p[i*3] = cx + x + (x/r)*th; f.p[i*3+2] = z + (z/r)*th*zScale;
      }
      f._mat = mat;
    }
  };
  const legCx = (g) => g === 'legL' ? -LEG_X : g === 'legR' ? LEG_X : 0;
  const armCx = (g) => g === 'armL' ? -ARM_X : g === 'armR' ? ARM_X : 0;
  for (const z of (opts.clothZones || [])) {
    const cxFor = z.leg ? legCx : z.arm ? armCx : null;
    displace(z.groups, z.yLo, z.yHi, z.th ?? 0.008, cxFor, 1, z.mat || 'cloth', z.zLo ?? -Infinity, z.zHi ?? Infinity);
  }

  for (const z of (opts.armorZones || [])) {
    const cxFor = z.leg ? legCx : z.arm ? armCx : null;
    displace(z.groups, z.yLo, z.yHi, z.th ?? 0.02, cxFor, z.zScale ?? 1, z.mat || 'steel', z.zLo ?? -Infinity, z.zHi ?? Infinity);
  }

  const HSCALE = 0.9;
  for (const f of faces) for (let i = 0; i < 4; i++) f.p[i*3+1] *= HSCALE;

  {
    const wY = WRIST_JUNCTION_Y * HSCALE;
    for (const f of faces) {
      if (f.g !== 'armL' && f.g !== 'armR') continue;
      let cy = 0; for (let i = 0; i < 4; i++) cy += f.p[i*3+1]; cy /= 4;
      if (cy >= wY) continue;
      const px = f.g === 'armL' ? -ARM_X : ARM_X;
      const a = (f.g === 'armL' ? 1 : -1) * HAND_REST_ROLL;
      const c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < 4; i++) {
        const dx = f.p[i*3] - px, dz = f.p[i*3+2];
        f.p[i*3] = px + c*dx + s*dz; f.p[i*3+2] = -s*dx + c*dz;
      }
      const nx = f.n[0], nz = f.n[2];
      f.n[0] = c*nx + s*nz; f.n[2] = -s*nx + c*nz;
    }
  }

  const cen = faces.map((f) => {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < 4; i++) { x += f.p[i*3]; y += f.p[i*3+1]; z += f.p[i*3+2]; }
    return [x/4, y/4, z/4];
  });
  const AO_R = 0.11, AO_K = 0.55;
  const ao = new Array(faces.length).fill(1);
  const CELL = AO_R;
  const key = (ix, iy, iz) => ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512);
  const cellOf = (v) => Math.floor(v / CELL);
  const grid = new Map();
  const cellKey = new Array(faces.length);
  for (let i = 0; i < faces.length; i++) {
    const k = key(cellOf(cen[i][0]), cellOf(cen[i][1]), cellOf(cen[i][2]));
    cellKey[i] = k;
    const bucket = grid.get(k);
    if (bucket) bucket.push(i); else grid.set(k, [i]);
  }
  const nearOf = new Map();
  for (let i = 0; i < faces.length; i++) {
    const c = cen[i], n = faces[i].n; let occ = 0;
    let near = nearOf.get(cellKey[i]);
    if (near === undefined) {
      near = [];
      const bx = cellOf(c[0]), by = cellOf(c[1]), bz = cellOf(c[2]);
      for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) for (let oz = -1; oz <= 1; oz++) {
        const bucket = grid.get(key(bx + ox, by + oy, bz + oz));
        if (bucket) for (let b = 0; b < bucket.length; b++) near.push(bucket[b]);
      }
      near.sort((a, b) => a - b);
      nearOf.set(cellKey[i], near);
    }
    for (let t = 0; t < near.length; t++) {
      const j = near[t];
      if (j === i) continue;
      const dx = cen[j][0]-c[0], dy = cen[j][1]-c[1], dz = cen[j][2]-c[2];
      const d = Math.hypot(dx, dy, dz);
      if (d < 1e-4 || d > AO_R) continue;
      const facing = (dx*n[0] + dy*n[1] + dz*n[2]) / d;
      if (facing > 0.25) occ += (1 - d/AO_R) * facing;
    }
    ao[i] = Math.max(0.45, 1 - Math.min(1, occ * AO_K * 0.12));
  }
  for (let i = 0; i < faces.length; i++) {
    const fc = faces[i];
    let it = Math.max(0.08, (fc.n[0]*Lx + fc.n[1]*Ly + fc.n[2]*Lz) / Ln * 0.9 + 0.15);
    it *= ao[i];
    const ramp = fc._mat ? (opts.mats?.[fc._mat] || ramps[fc._mat] || opts.cloth || ramps.skin)
      : (fc.c === BOOT ? ramps.boot : ramps.skin);
    const iv = Math.min(1, Math.max(0.04, it)); fc._i = iv; fc.c = shade(ramp, iv);
  }

  return faces;
}
