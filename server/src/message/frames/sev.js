import { isCellRoom, raidGate } from '../../relay.js';
import { staffEventWord } from '../../staffEvents.js';

export async function sevFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, raidGate, 'raidBucket', 'raidDrops', 'too many event frames')) return;
  if (!isCellRoom(a.key)) { this._junk(ws); return; }
  try { await staffEventWord(this, ws, a, m, now); } catch (e) { console.warn('[sev] word failed', e?.message ?? e); }
  return;
}
