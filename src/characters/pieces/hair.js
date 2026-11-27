// Head details (hair and race features) on the neutral rig, tagged 'head' so they bob with the head.
import { loftPiece, compress, shadePiece, pushQuad } from './pieceLoft.js';

export const HAIR_RAMPS = {
  brown: [[22, 15, 10], [40, 28, 18], [60, 44, 28], [84, 62, 42]],
  black: [[12, 10, 12], [24, 20, 24], [38, 33, 40], [54, 48, 56]],
  blonde:[[70, 54, 28], [104, 82, 44], [140, 114, 66], [178, 150, 96]],
};

export function buildHair(ramp = HAIR_RAMPS.brown, race = 'Human', skin = null, style = 'short') {
  const faces = [];
  const P = 0.8;
  const hasHair = race === 'Human' || race === 'Elf';
  if (hasHair && style !== 'bald') {
    const cap = (dropTo, backThick) => {
      loftPiece(faces, [
        { y: 2.055, rx: 0.058, rz: 0.064, p: P, cz: -0.012 },
        { y: 2.000, rx: 0.114, rz: 0.128, p: P, cz: -0.018 },
        { y: 1.945, rx: 0.146, rz: 0.158, p: P, cz: -0.018 },
        { y: 1.910, rx: 0.148, rz: 0.160, p: P, cz: -0.014 },
      ], { group: 'head', seg: 26, capBottom: false });
      const rows = [
        { y: 1.910, rx: 0.148, rz: 0.160, p: P, cz: -0.014 },
        { y: 1.820, rx: 0.146 + backThick, rz: 0.156 + backThick, p: P, cz: -0.020 },
      ];
      const steps = Math.max(1, Math.round((1.820 - dropTo) / 0.09));
      for (let k = 1; k <= steps; k++) { const t = k/steps, y = 1.820 - t*(1.820-dropTo);
        rows.push({ y, rx: (0.146 + backThick)*(1-0.28*t), rz: (0.156 + backThick)*(1-0.20*t), p: P, cz: -0.020 - t*0.02 }); }
      const GAP = 1.0;
      loftPiece(faces, rows, { group: 'head', seg: 22, arc: [Math.PI/2 + GAP, Math.PI/2 - GAP + Math.PI*2] });
    };
    const strand = (spine) => {
      const T = spine.map((_,i)=>{const a=spine[Math.max(0,i-1)],b=spine[Math.min(spine.length-1,i+1)];let t=[b.x-a.x,b.y-a.y,b.z-a.z];const l=Math.hypot(...t)||1;return[t[0]/l,t[1]/l,t[2]/l];});
      const side=[1,0,0];
      const rings=spine.map((pp,i)=>{const t=T[i];let d=[t[1]*side[2]-t[2]*side[1],t[2]*side[0]-t[0]*side[2],t[0]*side[1]-t[1]*side[0]];const dl=Math.hypot(...d)||1;d=[d[0]/dl,d[1]/dl,d[2]/dl];const N=8,ring=[];for(let k=0;k<N;k++){const a=k/N*2*Math.PI,c=Math.cos(a)*pp.r,sn=Math.sin(a)*pp.r;ring.push([pp.x+c*side[0]+sn*d[0],pp.y+c*side[1]+sn*d[1],pp.z+c*side[2]+sn*d[2]]);}return ring;});
      for(let i=0;i+1<rings.length;i++)for(let k=0;k<8;k++){const j=(k+1)%8;quad(rings[i][k],rings[i][j],rings[i+1][j],rings[i+1][k]);}
    };
    const quad = (a, b, c, d) => pushQuad(faces, a, b, c, d, 'head');

    if (style === 'short')    cap(1.740, 0.0);
    else if (style === 'buzz') cap(1.800, -0.02);
    else if (style === 'medium') cap(1.640, 0.006);
    else if (style === 'long') cap(1.470, 0.012);
    else if (style === 'ponytail') { cap(1.760, 0.0); strand([
        {x:0,y:1.860,z:-0.150,r:0.030},{x:0,y:1.800,z:-0.210,r:0.032},{x:0,y:1.700,z:-0.250,r:0.030},
        {x:0,y:1.580,z:-0.256,r:0.026},{x:0,y:1.470,z:-0.236,r:0.020},{x:0,y:1.390,z:-0.200,r:0.010}]); }
    else if (style === 'topknot') { cap(1.780, 0.0); strand([
        {x:0,y:2.055,z:-0.010,r:0.030},{x:0,y:2.110,z:-0.010,r:0.044},{x:0,y:2.150,z:-0.012,r:0.036},{x:0,y:2.168,z:-0.014,r:0.014}]); }
    else if (style === 'mohawk') {
      const cr = [[1.905,0.150],[1.995,0.090],[2.055,0.000],[2.045,-0.090],[1.965,-0.165]];
      for (let i=0;i+1<cr.length;i++){ const [y0,z0]=cr[i],[y1,z1]=cr[i+1]; const h0=0.075,h1=0.075,w=0.020;
        quad([-w,y0,z0],[w,y0,z0],[w,y0+h0,z0],[-w,y0+h0,z0]);
        quad([-w,y0,z0],[-w,y0+h0,z0],[-w,y1+h1,z1],[-w,y1,z1]);
        quad([w,y0,z0],[w,y1,z1],[w,y1+h1,z1],[w,y0+h0,z0]);
        quad([-w,y0+h0,z0],[w,y0+h0,z0],[w,y1+h1,z1],[-w,y1+h1,z1]); }
    }
    else cap(1.740, 0.0);
  }

  shadePiece(faces, ramp, 0.1, 0.2);

  const flesh = [];
  const quad = (a, b, c, d) => pushQuad(flesh, a, b, c, d, 'head');
  const tube = (spine, N = 6) => {
    const rings = spine.map((pp, i) => {
      const a = spine[Math.max(0, i-1)], b = spine[Math.min(spine.length-1, i+1)];
      let tx=b.x-a.x, ty=b.y-a.y, tz=b.z-a.z; const tl=Math.hypot(tx,ty,tz)||1; tx/=tl;ty/=tl;tz/=tl;
      let ux=0, uy=1, uz=0; const d=ux*tx+uy*ty+uz*tz; ux-=d*tx; uy-=d*ty; uz-=d*tz; const ul=Math.hypot(ux,uy,uz)||1; ux/=ul;uy/=ul;uz/=ul;
      const bx=ty*uz-tz*uy, by=tz*ux-tx*uz, bz=tx*uy-ty*ux;
      const ring = [];
      for (let k=0;k<N;k++){ const ang=k/N*2*Math.PI, c=Math.cos(ang)*pp.r, sn=Math.sin(ang)*pp.r; ring.push([pp.x+c*ux+sn*bx, pp.y+c*uy+sn*by, pp.z+c*uz+sn*bz]); }
      return ring;
    });
    for (let i=0;i+1<rings.length;i++) for (let k=0;k<N;k++){ const j=(k+1)%N; quad(rings[i][k], rings[i][j], rings[i+1][j], rings[i+1][k]); }
  };
  if (race === 'Elf') {
    const ear = (sx) => {
      const spine = [
        { o: 0.086, y: 1.836, z:  0.006, w: 0.028 },
        { o: 0.116, y: 1.874, z: -0.010, w: 0.034 },
        { o: 0.150, y: 1.912, z: -0.030, w: 0.036 },
        { o: 0.170, y: 1.950, z: -0.058, w: 0.030 },
        { o: 0.178, y: 1.984, z: -0.088, w: 0.018 },
        { o: 0.176, y: 2.008, z: -0.112, w: 0.006 },
      ];
      const sect = (r) => {
        const X = sx * r.o, cIn = sx * (r.o - 0.028);
        return [
          [X,           r.y, r.z + r.w],
          [cIn,         r.y, r.z + r.w*0.45],
          [cIn,         r.y, r.z - r.w*0.45],
          [X,           r.y, r.z - r.w],
        ];
      };
      const S = spine.map(sect);
      for (let k = 0; k + 1 < S.length; k++) for (let j = 0; j < 3; j++) {
        quad(S[k][j], S[k][j+1], S[k+1][j+1], S[k+1][j]);
      }
      for (let k = 0; k + 1 < S.length; k++) quad(S[k][0], S[k][3], S[k+1][3], S[k+1][0]);
      const b = S[0];
      quad([sx*0.070, 1.858, 0.030], b[0], b[3], [sx*0.070, 1.820, -0.030]);
    };
    ear(-1); ear(1);
  } else if (race === 'Khajiit') {
    const fZ = 0.176;
    const mring = (y, z, rx, ry) => {
      const r = []; const N = 10;
      for (let k = 0; k < N; k++) { const a = k/N*2*Math.PI; r.push([Math.cos(a)*rx, y + Math.sin(a)*ry, z]); }
      return r;
    };
    const mrows = [
      mring(1.826, 0.096, 0.078, 0.044),
      mring(1.820, 0.114, 0.066, 0.038),
      mring(1.814, 0.126, 0.050, 0.030),
      mring(1.808, 0.134, 0.030, 0.021),
      mring(1.803, 0.138, 0.014, 0.011),
    ];
    for (let i = 0; i + 1 < mrows.length; i++) for (let k = 0; k < 10; k++) { const j = (k+1)%10; quad(mrows[i][k], mrows[i][j], mrows[i+1][j], mrows[i+1][k]); }
    const tipC = [0, 1.806, 0.184]; for (let k = 0; k < 10; k++) { const j=(k+1)%10; quad(tipC, mrows[4][j], mrows[4][k], mrows[4][k]); }
    const ny = 1.826, nz = 0.134, nw = 0.016;
    const nL=[-nw,ny,nz], nR=[nw,ny,nz], nB=[0,ny-0.020,nz+0.008];
    quad(nL, nR, nB, nB);
    const kear = (sx) => {
      const fb   = [sx*0.042, 1.972, 0.034];
      const bb   = [sx*0.086, 1.958, -0.058];
      const midb = [sx*0.060, 1.950, -0.012];
      const tip  = [sx*0.108, 2.088, -0.030];
      quad(fb, tip, midb, midb);
      quad(midb, tip, bb, bb);
      quad(bb, tip, fb, fb);
      quad(fb, midb, bb, bb);
    };
    kear(-1); kear(1);
    { const by = 1.898, bz = 0.126, bw = 0.086;
      quad([-bw,by,bz],[bw,by,bz],[bw*0.86,by-0.020,bz+0.020],[-bw*0.86,by-0.020,bz+0.020]);
      quad([-bw*0.86,by-0.020,bz+0.020],[bw*0.86,by-0.020,bz+0.020],[bw*0.7,by-0.030,bz-0.02],[-bw*0.7,by-0.030,bz-0.02]); }
    const ruff = (sx, i) => {
      const y0 = 1.770 - i*0.028, rx = sx*(0.086 - i*0.004), z0 = 0.052 - i*0.014;
      const tip = [sx*(0.128 + i*0.006), y0 - 0.034, z0 - 0.030];
      quad([rx, y0 + 0.018, z0], tip, [rx, y0 - 0.018, z0 - 0.006], [rx, y0 - 0.018, z0 - 0.006]);
    };
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) ruff(sx, i);
    const whisker = (sx, i) => {
      const y0 = 1.822 - i*0.016, th = 0.0022;
      const root = [sx*0.052, y0, fZ - 0.030];
      const tip  = [sx*(0.150 + i*0.024), y0 - 0.006 - i*0.010, fZ - 0.070 - i*0.026];
      quad([root[0], root[1]+th, root[2]], [tip[0], tip[1], tip[2]], [tip[0], tip[1], tip[2]], [root[0], root[1]-th, root[2]]);
    };
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) whisker(sx, i);
  } else if (race === 'Argonian') {
    const prof = [[1.820,0.045,0.046],[1.780,0.082,0.090],[1.720,0.100,0.115],[1.660,0.108,0.125],[1.620,0.102,0.125],[1.560,0.082,0.110]];
    const interp = (cy) => { for (let i=0;i+1<prof.length;i++){ const a=prof[i],b=prof[i+1]; if (cy<=a[0]&&cy>=b[0]){ const t=(cy-a[0])/(b[0]-a[0]); return [a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; } } return cy>prof[0][0]?[prof[0][1],prof[0][2]]:[prof[5][1],prof[5][2]]; };
    const scale = (x, cy, z, nx, nz, r) => {
      const py = cy/0.9;
      const tx = nz, tz = -nx;
      const B = (dt, dv) => [x + tx*dt, py + dv, z + tz*dt];
      const apex = [x + nx*0.016, py, z + nz*0.016];
      const a1=B(-r,-r), a2=B(r,-r), a3=B(r,r), a4=B(-r,r);
      quad(a1, a2, apex, apex); quad(a2, a3, apex, apex); quad(a3, a4, apex, apex); quad(a4, a1, apex, apex);
    };
    let rowi = 0;
    for (let cy=1.590; cy<=1.795; cy+=0.032, rowi++) {
      const [rx,fz]=interp(cy);
      const off = (rowi%2)*0.5;
      for (let step=-3+off; step<=3; step+=1.0) {
        const a = step*0.40;
        if (Math.abs(a) > 1.30) continue;
        const sxx=Math.sin(a), x=rx*sxx*0.97, z=fz*Math.cos(a)*0.98;
        const nl=Math.hypot(sxx,Math.cos(a))||1;
        scale(x, cy, z, sxx/nl, Math.cos(a)/nl, 0.013);
      }
    }
    const snring = (y,z,rx2,ry2)=>{ const r=[]; for(let k=0;k<8;k++){const ang=k/8*2*Math.PI; r.push([Math.cos(ang)*rx2, y+Math.sin(ang)*ry2, z]);} return r; };
    const sn = [ snring(1.816,0.104,0.066,0.048), snring(1.808,0.124,0.054,0.038), snring(1.800,0.138,0.042,0.028), snring(1.794,0.148,0.028,0.018), snring(1.790,0.152,0.014,0.010) ];
    for(let i=0;i+1<sn.length;i++) for(let k=0;k<8;k++){const j=(k+1)%8; quad(sn[i][k],sn[i][j],sn[i+1][j],sn[i+1][k]);}
    { const tc=[0,1.790,0.154]; for(let k=0;k<8;k++){const j=(k+1)%8; quad(tc,sn[4][j],sn[4][k],sn[4][k]);} }
    for (const sxn of [-1,1]) { const nx2=sxn*0.016; quad([nx2-0.006,1.812,0.146],[nx2+0.006,1.812,0.146],[nx2+0.004,1.800,0.150],[nx2-0.004,1.800,0.150]); }
    const horn = (sx) => tube([
      { x: sx*0.066, y: 1.892, z:  0.000, r: 0.036 },
      { x: sx*0.088, y: 1.922, z: -0.058, r: 0.029 },
      { x: sx*0.092, y: 1.930, z: -0.124, r: 0.021 },
      { x: sx*0.080, y: 1.918, z: -0.186, r: 0.012 },
      { x: sx*0.062, y: 1.894, z: -0.238, r: 0.005 },
    ]);
    horn(-1); horn(1);
    for (let i = 0; i < 7; i++) {
      const t = i/6, y = 2.035 - t*0.34, z = 0.0 - t*0.14, h = 0.075 - t*0.03, w = 0.020 - t*0.008;
      quad([-w,y,z],[w,y,z],[0,y+h,z-0.055],[0,y+h,z-0.055]);
      quad([w,y,z],[0,y+h,z-0.055],[-w,y,z],[-w,y,z]);
    }
    for (let i = 0; i < 5; i++) {
      const sx = (i-2)/2 * 0.096, y = 1.878, z = 0.126, w = 0.022, h = 0.018;
      quad([sx-w,y-h*0.5,z-0.01],[sx+w,y-h*0.5,z-0.01],[sx+w*0.5,y+h*0.5,z+0.02],[sx-w*0.5,y+h*0.5,z+0.02]);
      quad([sx-w*0.5,y+h*0.5,z+0.02],[sx+w*0.5,y+h*0.5,z+0.02],[sx,y+h,z-0.005],[sx,y+h,z-0.005]);
    }
    for (let i = 0; i < 3; i++) {
      const y = 1.858 - i*0.026, z = 0.116 + i*0.012, w = 0.012, h = 0.020;
      quad([-w,y,z],[w,y,z],[0,y+h*0.4,z+0.03],[0,y+h*0.4,z+0.03]);
    }
    const frill = (sx) => {
      const inner = [[sx*0.092, 1.836, -0.044], [sx*0.086, 1.768, -0.082], [sx*0.074, 1.704, -0.104]];
      const outer = [[sx*0.118, 1.844, -0.108], [sx*0.126, 1.768, -0.140], [sx*0.114, 1.704, -0.166]];
      for (let i = 0; i + 1 < inner.length; i++) quad(inner[i], outer[i], outer[i+1], inner[i+1]);
    };
    frill(-1); frill(1);
  }
  if (flesh.length) faces.push(...shadePiece(flesh, skin || ramp, 0.1, 0.2));

  compress(faces);
  return faces;
}
