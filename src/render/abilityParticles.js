// Local coordinates: sideways, height, forward. Curves are sampled in order so their shape draws over time.
const turn = 2 * Math.PI;
const sin = Math.sin, cos = Math.cos;
const paths = {
  helix: (t,k) => [.2*cos(turn*t*1.6+k*Math.PI), .2*sin(turn*t*1.6+k*Math.PI), t],
  needle: (t,k) => [(k-.5)*.16*(1-t), .14*(1-t), t],
  crescent: t => [sin((t-.5)*2.6), .45*(.5-t), .48+.4*cos((t-.5)*2.6)],
  horizon: t => [2*t-1, .08*t, .72],
  cross: (t,k) => [2*t-1, (k ? -1 : 1)*(t-.5)*1.4, .68],
  braid: (t,k) => [.38*sin(t*turn+k*Math.PI), .32*(t-.5), t],
  orbit: (t,k) => [.72*cos(turn*t), .36*sin(turn*t)*(k ? -1 : 1), .5+.35*sin(turn*t)],
  lash: t => [sin(t*turn)*(.95-.5*t), .45*cos(t*turn), t],
  fan: (t,k) => [(k-1)*t*.65, .12*t, t],
  claw: (t,k) => [(k-1)*.22+.46*(1-t), .75-1.15*t, .45+.35*sin(t*Math.PI)],
  dash: (t,k) => [(k-.5)*.5*(1-t), -.45+.28*t, t],
  vault: t => [.18*sin(t*turn), 1.15*sin(t*Math.PI)-.3, t],
  cyclone: (t,k) => [(.3+.55*t)*cos(t*turn*1.4+k*Math.PI), 1.55*t-.55, .48+.28*sin(t*turn*1.4+k*Math.PI)],
  mark: (t,k) => [(.78-.55*t)*cos(k*Math.PI/2), (.78-.55*t)*sin(k*Math.PI/2), .65],
  eye: (t,k) => [t*1.6-.8, (k ? -1 : 1)*sin(t*Math.PI)*.42, .62],
  ward: t => [.65*sin(turn*t), .64*cos(turn*t)-.24*Math.max(0,-cos(turn*t)), .65],
  halo: t => [.8*cos(turn*t), .13, .5+.38*sin(turn*t)],
  crown: (t,k) => [(k-1)*.47+.23*sin(t*Math.PI), .86*t-.35, .55+.1*cos(t*Math.PI)],
  crack: (t,k) => [(k-1)*.5*t+.065*sin(t*28), -.76, t],
  fracture: (t,k) => [t*cos(k*turn/3)+.09*sin(t*22), t*sin(k*turn/3), .6],
  roots: (t,k) => [(k-1)*.7*t+.15*sin(t*9), -.72+.22*t*t, t],
  rain: (t,k) => [(k-1)*.52-.15*t, 1.4-2*t, .55+.16*k],
  feather: (t,k) => [(k ? -1 : 1)*(.15+.5*sin(t*Math.PI)), .88*t-.36, .48+.18*t],
  veil: (t,k) => [(.3+.5*t)*cos(k*Math.PI+t*2.8), .86*t-.48, .5+.2*sin(t*turn)],
  step: (t,k) => [(k ? -1 : 1)*.32, -.7+.12*sin(t*Math.PI), .1+.48*t+.32*k],
  bubbles: (t,k) => [(k-1)*.4+.1*sin(t*8+k), 1.35*t-.55, .35+.12*k],
  anchor: (t,k) => k ? [.6*cos(Math.PI*t), -.5*sin(Math.PI*t), .62] : [0, .64-1.1*t, .62],
  return: (t,k) => [(1-t)*cos(turn*t+k*Math.PI), (1-t)*sin(turn*t+k*Math.PI), .8-.35*t],
  key: (t,k) => k ? [.6*t-.1,.4-.9*t+(t > .72 ? .17 : 0),.62] : [.23*cos(t*turn)-.18,.23*sin(t*turn)+.4,.62],
};
const strands = { fan:3, claw:3, mark:4, fracture:3, roots:3, rain:3, bubbles:3, crack:3, crown:3,
  crescent:1, horizon:1, vault:1, ward:1, halo:1, lash:1 };

export function drawAbilityArt(fx, look, at, { phase, form, yaw = 0, len = 2, spin = 1, dir }) {
  const path = paths[form];
  if (!path || !look) return false;
  if (phase === 'flight') {
    for (let i=0;i<2;i++) fx._part(look, at, [fx.r(-.35,.35),fx.r(.05,.45),fx.r(-.35,.35)],
      { life:.22, w:.035, g:0, drag:1, I:1, streak:.08 });
    return true;
  }
  const finish = phase === 'finish';
  const impact = phase === 'impact' || finish, self = phase === 'self', charging = phase === 'wind-up';
  const scale = finish ? .4 : impact ? .58 : charging ? .45 : 1;
  const reach = impact ? .28 : self ? 1.1 : Math.max(.1,Math.min(4,len));
  const dx = dir?.[0] ?? sin(yaw), dz = dir?.[2] ?? cos(yaw);
  const horizontal = Math.hypot(dx,dz);
  const rightX = horizontal > .001 ? dz/horizontal : cos(yaw);
  const rightZ = horizontal > .001 ? -dx/horizontal : -sin(yaw);
  // A drilling blow leaves two expanding collars at the contact plane. A shattered
  // guard throws fragments downward; rain scatters upward where the shafts land.
  if (impact && (form === 'helix' || form === 'needle')) {
    for (let i=0; i<2; i++) fx._decal(look, at, { n:[dx,0,dz], r0:.05, r1:.3+i*.13,
      band:.055, life:.23+i*.07, delay:i*.055, I:1 });
  }
  if (impact && ['crack','fracture','rain','claw'].includes(form)) {
    for (let i=0; i<7; i++) fx._part(look, at, [fx.r(-2,2),fx.r(.6,2.5),fx.r(-2,2)],
      { life:.34, w:.027, g:7, streak:.065, I:1 });
  }
  // Keep the contact accent stronger than the trail and the preparatory motes.
  const duration = charging ? .08 : self ? .28 : impact ? .07 : .13;
  const steps = impact ? 6 : 10;
  const ribbonLife = self ? .28 : impact ? .18 : .14;
  const moteLife = charging ? .11 : self ? .25 : impact ? .21 : .15;
  for (let k=0; k<(strands[form] ?? 2); k++) {
    let previous;
    for (let i=0; i<=steps; i++) {
      const u=i/steps, t=charging ? 1-u : u;
      const [x,y,z]=path(t,k);
      const forward = charging ? .65+.22*z : reach*z;
      const side = x*scale*spin;
      const point = [at[0]+rightX*side+dx*forward, at[1]+y*scale+(dir?.[1] ?? 0)*forward,
        at[2]+rightZ*side+dz*forward];
      if (previous) {
        const delay = (finish ? .095 : 0) + duration*(i-1)/steps;
        if (!charging) {
          const taper = Math.sin(Math.PI * (i-.5)/steps);
          fx._ribbon(look, previous, point, .014+.029*taper, delay, ribbonLife);
        }
        if (impact || i % 2 === 1) {
          const velocity = point.map((v,j)=>(v-previous[j])/.075);
          fx._part(look, previous, velocity, { delay, life:moteLife, w:impact ? .035 : .03,
            g:0, drag:8, streak:.065, maxLen:.36, I:impact ? 1.2 : charging ? .55 : .85, fadeIn:.02 });
        }
      }
      previous=point;
    }
  }
  return true;
}
