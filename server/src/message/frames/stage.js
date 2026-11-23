// The `stage` frame's handler, called by message/dispatch.js with the room as `this`.
import { isSocialRoom, eventGate, EVENT_KEY } from '../../relay.js';

export async function stageFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, eventGate, 'evbucket', 'evdrops', 'too many stages')) return;
  if (!isSocialRoom(a.key)) { this._junk(ws); return; }
  if (!Array.isArray(a.glyphs) || !a.glyphs.includes('dev')) return;
  const ev = m.kind ? { kind: m.kind, at: now } : null;
  // EVENT_KEY stays outside the prefixes `_sweep` (server/src/room/store.js) and
  // `_sweepHub` (server/src/room/alarm.js) delete, or a quiet night ends a live event.
  if (ev) await this.state.storage.put(EVENT_KEY, ev); else await this.state.storage.delete(EVENT_KEY);
  this._event = ev;
  const said = JSON.stringify({ t: 'event', kind: m.kind, at: now });
  for (const [other, b] of [...this._all()]) if (b.id) this._send(other, said);
  return;
}
