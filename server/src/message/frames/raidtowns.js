import { isSocialRoom, raidTownsGate } from '../../relay.js';

export async function raidtownsFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, raidTownsGate, 'raidTownsBucket', 'raidTownsDrops', 'too many raid town frames')) return;
  if (!isSocialRoom(a.key)) { this._junk(ws); return; }
  try { await this._raidTownsPiece(ws, m); } catch (e) { console.warn('[hub] raid towns failed', e?.message ?? e); }
  return;
}
