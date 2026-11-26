import { siegeGate } from '../../relay.js';
import { isBattleRoom } from '../../../../src/net/siegeRef.js';

export async function siegeFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, siegeGate, 'siegeBucket', 'siegeDrops', 'too many siege frames')) return;
  if (!isBattleRoom(a.key) || typeof a.sub !== 'string' || !a.sub) { this._junk(ws); return; }
  try { await this._siegeFrame(ws, a, m, now); } catch (e) { console.warn('[siege] frame failed', e?.message ?? e); }
  return;
}
