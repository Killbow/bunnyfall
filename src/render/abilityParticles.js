// Paths return local [sideways, height, forward] offsets.
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
    const angle = fx.r(0,turn);
    for (const side of [-1,1]) fx._part(look, at, [side*cos(angle)*1.4,.45+side*sin(angle),side*sin(angle)*1.4],
      { life:.24, w:.07, g:1, drag:3, I:1.5, streak:.14 });
    return true;
  }
  const finish = phase === 'finish';
  const impact = phase === 'impact' || finish, self = phase === 'self', charging = phase === 'wind-up';
  const scale = finish ? .68 : impact ? .88 : charging ? .62 : 1.32;
  const reach = impact ? .28 : self ? 1.1 : Math.max(.1,Math.min(4,len));
  const dx = dir?.[0] ?? sin(yaw), dz = dir?.[2] ?? cos(yaw);
  const horizontal = Math.hypot(dx,dz);
  const rightX = horizontal > .001 ? dz/horizontal : cos(yaw);
  const rightZ = horizontal > .001 ? -dx/horizontal : -sin(yaw);
  if (phase === 'stroke' || self) {
    const along = distance => [at[0]+dx*distance, at[1]+(dir?.[1] ?? 0)*distance, at[2]+dz*distance];
    const plane = [dx,dir?.[1] ?? 0,dz];
    if (['helix','needle','dash','braid','return'].includes(form)) {
      for (let j=0; j<3; j++) {
        fx._decal(look, along(reach*(.24+j*.32)), { n:plane, r0:.58-j*.09, r1:.08,
          band:.095, delay:j*.055, life:.22, I:1.7 });
      }
    } else if (['crack','fracture','roots','claw','rain'].includes(form)) {
      for (let j=0; j<3; j++) {
        const point = along(reach*(.24+j*.32));
        point[1] -= .58;
        if (form === 'fracture' || form === 'rain') {
          const side = j % 2 ? -.45 : .45;
          const peak = [point[0]+rightX*side,point[1]+1.5,point[2]+rightZ*side];
          fx._bolt(look, peak, point, { w:.075, delay:j*.05, life:.21 });
        }
        fx._decal(look, point, { r0:.08, r1:.52+j*.12, band:.10, delay:j*.05, life:.25, I:1.5 });
        for (const side of [-1,1]) fx._part(look, point, [rightX*side*2,3+j*.7,rightZ*side*2],
          { delay:j*.05, life:.33, w:.085, g:13, drag:1, streak:.19, maxLen:.65, I:1.6 });
      }
    } else if (self || ['ward','crown','orbit','halo','eye','mark'].includes(form)) {
      const center = along(self ? .95 : reach*.65);
      fx._decal(look, center, { n:plane, r0:.15, r1:.95, band:.075, life:.39, I:1.45 });
      for (let j=0; j<8; j++) {
        const a = j*turn/8, lateral = cos(a)*.84, height = sin(a)*.84;
        fx._part(look, [center[0]+rightX*lateral,center[1]+height,center[2]+rightZ*lateral],
          [-rightX*height*3,lateral*3,-rightZ*height*3], { life:.34, w:.065, delay:.055,
            g:0, drag:3, streak:.15, maxLen:.45, I:1.45 });
      }
    } else {
      for (let j=1; j<=5; j++) {
        const [x,y,z] = path(j/6,0);
        const point = along(z*reach);
        point[0] += rightX*x*scale*spin;
        point[1] += y*scale;
        point[2] += rightZ*x*scale*spin;
        fx._part(look, point, [rightX*spin*2.5,1.6-j*.25,rightZ*spin*2.5],
          { delay:j*.021, life:.26, w:.075, g:5, drag:2, streak:.18, I:1.6 });
      }
    }
    fx._light({ ...look, light:look.main }, along(reach*.55), .65, { life:.23 });
  }
  if (impact && (form === 'helix' || form === 'needle')) {
    for (let i=0; i<2; i++) fx._decal(look, at, { n:[dx,0,dz], r0:.05, r1:.3+i*.13,
      band:.055, life:.23+i*.07, delay:i*.055, I:1 });
  }
  if (impact && ['crack','fracture','rain','claw'].includes(form)) {
    for (let i=0; i<7; i++) fx._part(look, at, [fx.r(-2,2),fx.r(.6,2.5),fx.r(-2,2)],
      { life:.34, w:.027, g:7, streak:.065, I:1 });
  }
  const duration = charging ? .08 : self ? .28 : impact ? .07 : .13;
  const steps = impact ? 6 : 10;
  const ribbonLife = self ? .36 : impact ? .20 : .29;
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
        const progress = (i-1)/steps;
        const timing = charging ? Math.sqrt(progress) : impact ? progress*progress : progress;
        const delay = (finish ? .095 : 0) + duration*timing;
        if (!charging) {
          const taper = Math.sin(Math.PI * (i-.5)/steps);
          const width = phase === 'impact' ? .05+.105*taper : .032+.092*taper;
          fx._ribbon(look, previous, point, width, delay, ribbonLife * (.75 + .25*u));
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
