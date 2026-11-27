import { isRegionRoom, badged, travRoomGate } from '../../relay.js';

export function travFrame(ws, a, m) {
  const now = Date.now();
  if (!isRegionRoom(a.key)) { this._junk(ws); return; }
  if (this._travOwed.size) this._payTravOwed(now);
  if (m.p || !a.tm) { a = this._meterTrav(ws, a, now); if (!a) return; }
  if (!m.p && !a.tm) return;
  const rest = { ...a };
  delete rest.tm;
  if (!this._setAttach(ws, m.p ? { ...rest, tm: { ...m.p, at: now, ...(m.bd ? { bd: m.bd } : {}), ...(m.sr ? { sr: m.sr } : {}) } } : rest)) return;
  const clear = !m.p;
  if (!clear) this._travOwed.delete(a.id);
  const room = travRoomGate(clear ? this._travClearFan : this._travFan, now);
  if (clear) this._travClearFan = room.bucket; else this._travFan = room.bucket;
  const out = JSON.stringify(badged({ t: 'trav', id: a.id, name: a.name, sub: a.sub, p: m.p ?? null, ...(m.bd ? { bd: m.bd } : {}), ...(m.sr ? { sr: m.sr } : {}) }, a));
  // A clear over budget is owed, not dropped: the client never resends it, and the mark
  // would linger for TRAV_STALE_MS.
  if (!room.pass) { if (clear) this._oweTravClear(a.id, out); return; }
  this._fanAllBut(ws, a.id, out);
  return;
}
