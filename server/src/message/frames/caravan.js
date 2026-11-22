// The `caravan` frame's handler, called by message/dispatch.js with the room as `this`.
import { CARAVAN_DECOR_KEY, PARK_TTL_MS, parkKeyOf, CARAVAN_DOC_MIN_MS, PARK_REFRESH_MS } from '../../relay.js';
import { caravanKeyOf } from '../../../../src/net/privateInterior.js';

export async function caravanFrame(ws, a, m) {
  const now = Date.now();
  a = this._meterActs(ws, a, now); if (!a) return;
  const ck = caravanKeyOf(a.key);
  if (!ck || typeof a.sub !== 'string' || !a.sub || (await parkKeyOf(a.sub, m.data.c)) !== ck) { this._junk(ws); return; }
  if (now - (this._cvSaidAt ?? -Infinity) < CARAVAN_DOC_MIN_MS) return;
  this._cvSaidAt = now;
  if (m.data.d === null) { this._cvDoc = null; await this.state.storage.delete(CARAVAN_DECOR_KEY); }
  else {
    const doc = JSON.stringify(m.data.d), changed = doc !== this._cvDoc;
    if (!changed && now - (this._cvAt ?? 0) < PARK_REFRESH_MS) return;
    this._cvDoc = doc; this._cvAt = now;
    await this.state.storage.put(CARAVAN_DECOR_KEY, { at: now, d: m.data.d }); await this.state.storage.setAlarm(now + PARK_TTL_MS);
    if (!changed) return;
  }
  this._cvOwed = ws;
  await this._caravanFan(now);
  return;
}
