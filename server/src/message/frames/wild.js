// The `wild` frame's handler, called by message/dispatch.js with the room as `this`.
import { streamsFoes, wildGate, wildDirected, WILD_HZ_MAX } from '../../relay.js';

export async function wildFrame(ws, a, m) {
  const now = Date.now();
  if (!this._spend(ws, now, wildGate, 'wildBucket', 'wildDrops', 'too many wild frames')) return;
  if (!streamsFoes(a.key)) { this._junk(ws); return; }
  await this._wildBeat(now);
  const k = m.data.k;
  if (k === 'strike' || k === 'spell') { if (m.data.to === a.id) { this._junk(ws); return; } await this._wildBlow(a, m.data, now); return; }
  if (k === 'helm' || k === 'shot' || k === 'board') { await this._seaWord(a, m.data, now); return; }
  if (k === 'zone') { await this._wildZoneWord(a, m.data.z, now, m.data.dd === 1); return; }
  if (k === 'pick') { await this._wildPickWord(a, m.data, now); return; }
  if (wildDirected(m.data)) {
    const to = m.data.to;
    if (to === a.id) { this._junk(ws); return; }
    const target = this._idFirst(to, ws);
    if (!target) return;
    const [tws] = target;
    if (!this._senderFunnel(tws, a.id, now, 'wiin', WILD_HZ_MAX)) return;
    this._send(tws, JSON.stringify({ t: 'wild', id: a.id, ...(typeof a.sub === 'string' && a.sub ? { sub: a.sub } : {}), data: m.data }));
    return;
  }
  try { await this._wildWord(ws, a, m.data, now); } catch (e) { console.warn('[wild] word failed', e?.message ?? e); }
  return;
}
