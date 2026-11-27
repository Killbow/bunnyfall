import { abilityArt } from './abilityArt.js';

const poses = {
  thrust: [[.06,.08,.84],[-.035,-.12,1.32],[-.025,-.06,1.15]],
  sweep: [[.16,.06,.96],[-.04,-.07,1.12],[-.20,.025,1.04]],
  chop: [[.08,-.15,1.12],[-.04,.11,1.18],[-.08,.14,1.02]],
  jab: [[.045,.045,.92],[-.065,-.10,1.27],[-.025,-.02,1.05]],
  lash: [[.14,-.05,.91],[-.08,-.09,1.2],[-.15,.09,.96]],
};
const rest = [0,0,1];

export function strikeMotionKind(id, stage, strike, weapon) {
  if (/flail/.test(id) || [125,514].includes(weapon?.templateIndex)) return 'lash';
  if (weapon == null || /hand-to-hand\.(jab|hundred|flow|shoulder)/.test(id)) return 'jab';
  if (stage.halfWidthM || strike === 'StrikeUp') return 'thrust';
  if (strike === 'StrikeDown' || stage.fx === 'quake') return 'chop';
  return 'sweep';
}

// Each ability's art form has its own path for the weapon sprite. Keys are [progress, x, y, scale]: 0 to 1
// runs to the contact frame, and 1 to 2 runs out to rest. Rest is added at both ends. Paths stay small, with no spins.
const SIGNATURES = {
  crescent: [[.5,.17,-.09,.96],[.82,.07,-.1,1.04],[1,-.07,-.03,1.14],[1.38,-.22,.07,1.02]],
  helix: [[.3,.05,.06,.9],[.62,.0,.11,.84],[1,-.03,-.13,1.36],[1.18,.02,-.09,1.24],[1.42,-.02,-.05,1.12]],
  needle: [[.55,.03,.07,.86],[1,-.02,-.12,1.38],[1.3,-.01,-.07,1.16]],
  cross: [[.48,.15,-.12,1.0],[1,-.1,.1,1.16],[1.28,.12,.06,1.06],[1.55,-.07,-.04,1.0]],
  orbit: [[.25,.1,0,.96],[.5,.0,-.1,.98],[.75,-.1,0,1.04],[1,-.03,.08,1.16],[1.4,-.12,.05,1.02]],
  cyclone: [[.2,.14,.02,.94],[.45,.02,-.12,.98],[.7,-.14,-.02,1.06],[1,-.04,.1,1.18],[1.3,.1,.06,1.06],[1.55,-.06,.02,1.0]],
  vault: [[.62,.01,-.22,1.06],[1,-.02,.16,1.26],[1.25,-.04,.19,1.08]],
  claw: [[.58,.17,-.14,1.0],[1,-.05,.12,1.18],[1.3,-.13,.17,1.0]],
  lash: [[.35,.14,-.06,.92],[.7,.02,.05,1.0],[1,-.09,-.08,1.2],[1.35,-.16,.08,.96]],
  braid: [[.35,.09,.03,.94],[.68,-.05,-.04,1.02],[1,.04,-.08,1.18],[1.35,-.08,.04,1.04]],
  fan: [[.55,.2,.03,.94],[1,-.02,-.04,1.08],[1.38,-.24,.03,1.0]],
  dash: [[.5,.03,.11,.88],[1,-.04,-.07,1.32],[1.35,-.03,-.02,1.1]],
  crack: [[.6,.06,-.17,1.12],[1,-.03,.15,1.16],[1.14,-.03,.1,1.12],[1.3,-.04,.13,1.06]],
  fracture: [[.6,.09,-.12,1.06],[1,-.05,.1,1.2],[1.15,-.02,.07,1.14],[1.35,-.07,.11,1.02]],
  roots: [[.55,.05,-.14,1.08],[1,-.02,.17,1.14],[1.3,-.03,.18,1.04]],
  horizon: [[.6,.22,.0,.95],[1,-.02,-.02,1.12],[1.4,-.26,.0,1.02]],
  mark: [[.5,.06,.05,.9],[.8,.02,.0,.95],[1,-.03,-.1,1.28],[1.3,.0,-.04,1.1]],
  eye: [[.4,.08,.02,.9],[.7,.08,.06,.88],[1,-.04,-.1,1.3],[1.3,-.05,-.03,1.08]],
  ward: [[.5,.04,.12,.92],[1,-.02,-.02,1.22],[1.35,.02,.04,1.1]],
  halo: [[.3,.15,.0,.96],[.65,-.05,-.08,1.0],[1,-.12,.0,1.12],[1.35,.06,.03,1.02]],
  crown: [[.55,.05,.16,.9],[1,-.03,-.14,1.2],[1.3,-.04,-.08,1.08]],
  veil: [[.55,.18,.1,.94],[1,-.06,.02,1.12],[1.4,-.2,.06,1.0]],
  feather: [[.5,.1,-.04,.95],[1,-.06,-.06,1.12],[1.3,-.12,-.02,1.02]],
  step: [[.5,.02,.09,.9],[1,-.03,-.05,1.24],[1.3,-.02,0,1.08]],
  rain: [[.5,.03,-.2,1.04],[1,-.02,.12,1.2],[1.2,-.02,.08,1.12],[1.4,-.03,.12,1.04]],
  bubbles: [[.5,.06,.06,.94],[1,-.03,-.06,1.2],[1.3,-.03,.02,1.06]],
};

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

export function strikeMotionPath(id, beat = 0, final = false) {
  const art = abilityArt(id);
  const form = (final && art?.finish && SIGNATURES[art.finish]) ? art.finish : art?.form;
  const keys = SIGNATURES[form];
  if (!keys) return null;
  const u = hash(id + ':' + beat);
  const amp = .9 + .2 * u, lean = (u - .5) * .03;
  return keys.map(([t, x, y, s]) => [t, x * amp + lean, y * amp, 1 + (s - 1) * amp]);
}

const restStart = [0, ...rest], restEnd = [2, ...rest];
const keyAt = (keys, i) => (i < 0 ? restStart : i >= keys.length ? restEnd : keys[i]);
const ease = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;

export function strikePose(motion, now, strength) {
  if (!motion || !strength) return null;
  const elapsed = Math.max(0, now - motion.start);
  const contact = motion.contact ?? motion.hit;
  const progress = elapsed < contact ? elapsed / Math.max(.001, contact)
    : 1 + (elapsed - contact) / Math.max(.04, motion.duration - motion.hit);
  if (progress >= 2) return null;
  let a, b, t, o = 0;
  if (motion.path) {
    const keys = motion.path;
    let i = 0;
    while (i < keys.length && keys[i][0] <= progress) i++;
    a = keyAt(keys, i - 1); b = keyAt(keys, i); o = 1;
    t = Math.max(0, Math.min(1, (progress - a[0]) / Math.max(1e-6, b[0] - a[0])));
  } else {
    const [load, hit, follow] = poses[motion.kind];
    if (progress < .62) { a = rest; b = load; t = progress / .62; }
    else if (progress < 1) { a = load; b = hit; t = (progress - .62) / .38; }
    else if (progress < 1.32) { a = hit; b = follow; t = (progress - 1) / .32; }
    else { a = follow; b = rest; t = (progress - 1.32) / .68; }
  }
  t = ease(t);
  const x = lerp(a[o], b[o], t), y = lerp(a[o + 1], b[o + 1], t), scale = lerp(a[o + 2], b[o + 2], t);
  return { x: x * motion.side * strength, y: y * strength, scale: 1 + (scale - 1) * strength };
}

export function poseStrikeRect(rect, pose, height, mirrored = false) {
  if (!pose) return rect;
  const w = rect.w * pose.scale, h = rect.h * pose.scale;
  return { ...rect, w, h, x: rect.x + (rect.w - w) * .5 + pose.x * height * (mirrored ? -1 : 1),
    y: rect.y + rect.h - h + pose.y * height };
}
