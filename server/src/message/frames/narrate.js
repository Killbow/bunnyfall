// The `narrate` frame's handler, called by message/dispatch.js with the room as `this`.
import { dmGate } from '../../relay.js';

export function narrateFrame(ws, a, m) {
  if (!Array.isArray(a.glyphs) || !(a.glyphs.includes('dm') || a.glyphs.includes('dev'))) return;
  const now = Date.now();
  const meters = this._meterOf(ws);
  const gate = dmGate(meters.dbucket, now);
  meters.dbucket = gate.bucket;
  if (!gate.pass) return;
  const said = JSON.stringify({ t: 'dm', text: m.text, at: now, ...(m.c ? { c: m.c } : {}) });
  for (const [other, b] of [...this._all()]) if (b.id) this._send(other, said);
}
