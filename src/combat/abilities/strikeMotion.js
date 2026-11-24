// Screen-height offsets and magnification around the grip at load, contact and follow-through.
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

// The actual contact event anchors recovery when the weapon machine's frame clock runs late.
export function strikePose(motion, now, strength) {
  if (!motion || !strength) return null;
  const elapsed = Math.max(0, now - motion.start);
  const contact = motion.contact ?? motion.hit;
  const progress = elapsed < contact ? elapsed / Math.max(.001, contact)
    : 1 + (elapsed - contact) / Math.max(.04, motion.duration - motion.hit);
  if (progress >= 2) return null;
  const [load, hit, follow] = poses[motion.kind];
  let a, b, t;
  if (progress < .62) { a = rest; b = load; t = progress / .62; }
  else if (progress < 1) { a = load; b = hit; t = (progress - .62) / .38; }
  else if (progress < 1.32) { a = hit; b = follow; t = (progress - 1) / .32; }
  else { a = follow; b = rest; t = (progress - 1.32) / .68; }
  t = t * t * (3 - 2 * t);
  const mix = i => a[i] + (b[i] - a[i]) * t;
  return { x: mix(0) * motion.side * strength, y: mix(1) * strength, scale: 1 + (mix(2) - 1) * strength };
}

export function poseStrikeRect(rect, pose, height, mirrored = false) {
  if (!pose) return rect;
  const w = rect.w * pose.scale, h = rect.h * pose.scale;
  return { ...rect, w, h, x: rect.x + (rect.w - w) * .5 + pose.x * height * (mirrored ? -1 : 1),
    y: rect.y + rect.h - h + pose.y * height };
}
