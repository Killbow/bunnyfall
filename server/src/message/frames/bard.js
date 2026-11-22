// The `bard` frame's handler, called by message/dispatch.js with the room as `this`.
import { BARD_GAP_MS } from '../bardGap.js';
import { validTune } from '../../../../src/net/bardTune.js';

export function bardFrame(ws, a, m) {
  const now = Date.now();
  if (!a.id || !String(a.key ?? '').startsWith('interior:')) return;
  if (a.mu && a.mu > Math.floor(now / 1000)) return;
  this._bardAt = this._bardAt ?? new WeakMap();
  if (now - (this._bardAt.get(ws) ?? 0) < BARD_GAP_MS) return;
  const tune = validTune(m);
  if (!tune) return;
  this._bardAt.set(ws, now);
  const said = JSON.stringify({ t: 'bard', id: a.id, name: a.name, n: m.n, d: m.d, at: now });
  for (const [other, b] of [...this._all()]) if (other !== ws && b.id) this._send(other, said);
  return;
}
