import { shadePiece, pushQuad } from './pieceLoft.js';
import { KHAJIIT_FURS, ARGONIAN_HIDES } from '../palettes.js';

export const KHAJIIT_FUR   = KHAJIIT_FURS[0].coat;
export const KHAJIIT_BELLY = KHAJIIT_FURS[0].belly;
export const ARGONIAN_HIDE = ARGONIAN_HIDES[0].ramp;

function scaleBump(out, P, n, size, lift, g) {
  let up = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let t1 = [n[1]*up[2]-n[2]*up[1], n[2]*up[0]-n[0]*up[2], n[0]*up[1]-n[1]*up[0]];
  let l1 = Math.hypot(...t1) || 1; t1 = [t1[0]/l1, t1[1]/l1, t1[2]/l1];
  let t2 = [n[1]*t1[2]-n[2]*t1[1], n[2]*t1[0]-n[0]*t1[2], n[0]*t1[1]-n[1]*t1[0]];
  const base = [P[0]+n[0]*lift, P[1]+n[1]*lift, P[2]+n[2]*lift];
  const apex = [base[0]+n[0]*size*0.9, base[1]+n[1]*size*0.9, base[2]+n[2]*size*0.9];
  const s = size;
  const A = [base[0]+t2[0]*s, base[1]+t2[1]*s, base[2]+t2[2]*s];
  const B = [base[0]+t1[0]*s, base[1]+t1[1]*s, base[2]+t1[2]*s];
  const C = [base[0]-t2[0]*s, base[1]-t2[1]*s, base[2]-t2[2]*s];
  const D = [base[0]-t1[0]*s, base[1]-t1[1]*s, base[2]-t1[2]*s];
  const tri = (a, b, c) => pushQuad(out, a, b, c, c, g);
  tri(A, B, apex); tri(B, C, apex); tri(C, D, apex); tri(D, A, apex);
}

export function buildBodyScales(bodyFaces, skin) {
  const faces = [];
  let idx = 0;
  for (const f of bodyFaces) {
    const n = f.n;
    if (f.g === 'head') continue;
    if (n[2] < -0.35) continue;
    let cx=0, cy=0, cz=0; for (let i=0;i<4;i++){ cx+=f.p[i*3]; cy+=f.p[i*3+1]; cz+=f.p[i*3+2]; }
    cx/=4; cy/=4; cz/=4;
    if (cy > 1.62) continue;
    if ((idx++ % 2) !== 0) continue;
    const big = (f.g === 'body' && cy < 1.35 && cy > 0.85);
    scaleBump(faces, [cx, cy, cz], n, big ? 0.024 : 0.017, 0.006, f.g);
  }
  for (let y = 1.52; y > 0.86; y -= 0.058) {
    let best = null, bz = -1e9;
    for (const f of bodyFaces) {
      if (f.g !== 'body') continue;
      let mx=0,my=0,mz=0; for (let i=0;i<4;i++){ mx+=f.p[i*3]; my+=f.p[i*3+1]; mz+=f.p[i*3+2]; }
      mx/=4; my/=4; mz/=4;
      if (Math.abs(my - y) > 0.03 || Math.abs(mx) > 0.05 || f.n[2] < 0.4) continue;
      if (mz > bz) { bz = mz; best = [mx, my, mz]; }
    }
    if (!best) continue;
    const w = 0.052, z = best[2] + 0.006, py = best[1];
    const tl=[-w, py+0.026, z], tr=[w, py+0.026, z];
    const ml=[-w*0.9, py, z+0.010], mr=[w*0.9, py, z+0.010];
    const bot=[0, py-0.034, z];
    const q = (a, b, c, d) => pushQuad(faces, a, b, c, d, 'body');
    q(tl, tr, mr, ml); q(ml, mr, bot, bot);
  }
  return shadePiece(faces, skin, 0.08, 0.18);
}

function furTuft(out, P, n, len, g) {
  let up = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  let t1 = [n[1]*up[2]-n[2]*up[1], n[2]*up[0]-n[0]*up[2], n[0]*up[1]-n[1]*up[0]];
  const l1 = Math.hypot(...t1) || 1; t1 = [t1[0]/l1, t1[1]/l1, t1[2]/l1];
  const base = [P[0]+n[0]*0.003, P[1]+n[1]*0.003, P[2]+n[2]*0.003];
  const w = len * 0.22;
  const a = [base[0]+t1[0]*w, base[1]+t1[1]*w, base[2]+t1[2]*w];
  const b = [base[0]-t1[0]*w, base[1]-t1[1]*w, base[2]-t1[2]*w];
  const tip = [base[0]+n[0]*len*0.5, base[1]+n[1]*len*0.5 - len*0.85, base[2]+n[2]*len*0.5 - len*0.15];
  const ux=a[0]-base[0],uy=a[1]-base[1],uz=a[2]-base[2], vx=tip[0]-base[0],vy=tip[1]-base[1],vz=tip[2]-base[2];
  let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx; const L=Math.hypot(nx,ny,nz)||1;
  out.push({ p:[...a,...b,...tip,...tip], n:[nx/L,ny/L,nz/L], g });
}

export function buildBodyFur(bodyFaces, coat = KHAJIIT_FUR, belly = KHAJIIT_BELLY, region = 'all') {
  const coatF = [], bellyF = [];
  for (const f of bodyFaces) {
    if (f.g === 'head') continue;
    const n = f.n;
    if (n[2] < -0.45) continue;
    let cx=0, cy=0, cz=0; for (let i=0;i<4;i++){ cx+=f.p[i*3]; cy+=f.p[i*3+1]; cz+=f.p[i*3+2]; }
    cx/=4; cy/=4; cz/=4;
    if (cy > 1.62) continue;
    const len = (f.g === 'body') ? 0.030 : 0.024;
    const ventral = n[1] < -0.05 || (n[2] > 0.30 && cy < 1.30) || (Math.abs(cx) < 0.10 && cy < 1.15);
    if (region === 'coat' && ventral) continue;
    if (region === 'belly' && !ventral) continue;
    furTuft(ventral ? bellyF : coatF, [cx, cy, cz], n, len, f.g);
  }
  shadePiece(coatF, coat, 0.08, 0.18); shadePiece(bellyF, belly, 0.08, 0.18);
  return coatF.concat(bellyF);
}
