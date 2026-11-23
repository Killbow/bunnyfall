// A rite's records as the hub and the cells read them. They cover who broke a circle, the hub's
// words for a broken rite and an open cage, the circles a day counts, who is paid, and the shape.
import { RITE_BY_MAX } from '../relay.js';
import { RITE_HELPERS_MAX } from '../../../src/net/gateRite.js';

export const riteNames = (c) => Object.values(c?.h ?? {}).filter((n) => typeof n === 'string' && n);
export const riteSaid = (d, c) => ({ k: 'br', d, px: c.px, py: c.py, at: c.at, by: riteNames(c).slice(0, RITE_BY_MAX), n: Object.keys(c.h).length });
export const cageSaid = (d, c) => ({ k: 'cl', d, px: c.px, py: c.py, at: c.clAt });
export const riteOwed = (c) => (!!c.f && c.told < Object.keys(c.h).length) || (!!c.cl && !c.clTold);
export const riteCirclesBy = (r, d, site) => {
  if (!r || r.d !== d) return [];
  const cs = Object.values(r.c ?? {});
  if (site) return cs.filter((c) => c.px === site.px && c.py === site.py);
  return cs.map((c, i) => [c, i]).sort((a, b) => Object.keys(b[0].h).length - Object.keys(a[0].h).length || a[1] - b[1]).map(([c]) => c);
};
export const riteHelpersBy = (r, d, site) => {
  const out = new Set();
  for (const c of riteCirclesBy(r, d, site)) for (const sub of Object.keys(c.h)) if (out.size < RITE_HELPERS_MAX) out.add(sub);
  return [...out];
};
export const riteRecordOk = (v) => !!v && typeof v === 'object' && Number.isSafeInteger(v.d) && !!v.c && typeof v.c === 'object' && !Array.isArray(v.c);
