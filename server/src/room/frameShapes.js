// A peer's frame serialized again for the fan, or null when it grew or cannot be, and the quest,
// traveller mark, and map share cooldowns in a meter's shape.
import { questShareGate, travHubGate, amapShareGate } from '../relay.js';

export function fanOut(t, id, data, sentLength, g = false) {
  let out;
  try { out = JSON.stringify(g ? { t, id, g: 1, data } : { t, id, data }); } catch { return null; }
  // The fan was charged the sent length; allow only the added "id" field (8 plus the id) and "g"
  // field (6), so a frame that grows is dropped.
  return out.length > sentLength + id.length + 8 + (g ? 6 : 0) ? null : out;
}
export const questMeter = (at, now) => { const g = questShareGate(at, now); return { bucket: g.at, pass: g.pass }; };
export const travMeter = (at, now) => { const g = travHubGate(at, now); return { bucket: g.at, pass: g.pass }; };
export const amapMeter = (at, now) => { const g = amapShareGate(at, now); return { bucket: g.at, pass: g.pass }; };
