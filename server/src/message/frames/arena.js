import { arenaGate } from '../../relay.js';
import { isArenaFloorRoom, isArenaPrivateRoom, isArenaHall } from '../../../../src/net/arenaLaw.js';

export async function arenaFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, arenaGate, 'arenaBucket', 'arenaDrops', 'too many arena frames')) return;
  if (typeof a.sub !== 'string' || !a.sub) { this._junk(ws); return; }
  try {
    if (isArenaHall(a.key)) await this._hallWord(ws, a, m, now);
    else if (m.k === 'ps' && isArenaPrivateRoom(a.key)) await this._sessionWord(ws, a, m, now);
    else if (isArenaFloorRoom(a.key)) await this._boutWord(ws, a, m, now);
    else this._junk(ws);
  } catch (e) { console.warn('[arena] word failed', e?.message ?? e); }
  return;
}
