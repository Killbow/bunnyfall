// @ts-check
export function sharedSea(peers, feet, radius) {
  if (!Array.isArray(peers) || !Array.isArray(feet)) return false;
  for (const p of peers) if (Array.isArray(p?.feet) && Math.hypot(p.feet[0] - feet[0], p.feet[2] - feet[2]) <= radius) return true;
  return false;
}
// One client sails every ship of a shared sea for all nearby players, so a shared sea runs at real time.
export const seaSeconds = (dt, scale, shared) => {
  const d = Math.max(0, Number(dt) || 0);
  return shared && scale > 1 ? d / scale : d;
};
