// The `foes` frame's handler, called by message/dispatch.js with the room as `this`.
import { isCellRoom, isWorldRoom, CELL_FRAME_RECORDS_MAX } from '../../relay.js';

export function foesFrame(ws, a, m, message, doored) {
  const now = Date.now();
  if (doored !== 'foes') { a = this._meterFoes(ws, a, now); if (!a) return; }
  const cell = isCellRoom(a.key);
  if (!cell && (!isWorldRoom(a.key) || a.id !== this._hostOf())) return;
  if (cell && (!Array.isArray(m.data.f) || m.data.f.length > CELL_FRAME_RECORDS_MAX)) { this._junk(ws); return; }
  this._roomFoes = this._foesFan(ws, a, 'foes', m.data, message, cell, this._roomFoes, now);
  return;
}
