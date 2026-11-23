// The `own` frame's handler, called by message/dispatch.js with the room as `this`.
import { isWorldRoom, CELL_FRAME_RECORDS_MAX } from '../../relay.js';

export function ownFrame(ws, a, m, message, doored) {
  const now = Date.now();
  if (doored !== 'own') { if (!isWorldRoom(a.key)) { this._junk(ws); return; } a = this._meterFoes(ws, a, now); if (!a) return; }
  if (!Array.isArray(m.data.f) || m.data.f.length > CELL_FRAME_RECORDS_MAX) { this._junk(ws); return; }
  this._roomOwn = this._foesFan(ws, a, 'own', m.data, message, false, this._roomOwn, now);
  return;
}
