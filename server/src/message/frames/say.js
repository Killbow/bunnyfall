import { redGate } from '../../relay.js';

export function sayFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, redGate, 'rbucket', 'rdrops', 'too many lines')) return;
  if (!Array.isArray(a.glyphs) || !a.glyphs.includes('dev')) return;
  const said = JSON.stringify({ t: 'red', text: m.text, at: now });
  for (const [other, b] of [...this._all()]) if (b.id) this._send(other, said);
}
