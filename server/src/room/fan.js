import { POSE_BATCH_MS, WIRE2_BATCH_MAX, wire2Batch, ROSTER_BATCH_MS } from '../relay.js';

export class FanPart {
  // Walks the index in place: a failed send can delete its socket mid-walk, which Map
  // iteration allows. Nothing here may add a socket, or the walk would visit it.
  _fanBut(ws, out) { for (const [other, b] of this._all()) if (other !== ws && b.id) this._send(other, out); }
  _owe(ws, item, ms = POSE_BATCH_MS) {
    let q = this._owed.get(ws);
    if (!q) this._owed.set(ws, q = []);
    q.push(item);
    this._metrics.c.owed++;
    if (q.length >= WIRE2_BATCH_MAX) { this._flushOwedOf(ws); return; }
    if (ms <= POSE_BATCH_MS) { if (!this._owedSoon) this._owedSoon = setTimeout(() => this._flushOwed(), POSE_BATCH_MS); }
    else if (!this._owedSoon && !this._owedLate) this._owedLate = setTimeout(() => this._flushOwed(), ms);
  }
  _flushOwedOf(ws) {
    const q = this._owed.get(ws);
    if (!q) return;
    this._owed.delete(ws);
    this._metrics.c.batches++;
    this._send(ws, wire2Batch(q));
  }
  _flushOwed() {
    clearTimeout(this._owedSoon); clearTimeout(this._owedLate);
    this._owedSoon = this._owedLate = null;
    for (const ws of [...this._owed.keys()]) this._flushOwedOf(ws);
  }
  _fanRoster(ws, out) { for (const [other, b] of (this._vper.size ? this._reals() : this._all())) if (other !== ws && b.id && !other.virtual) { if (b.w2) this._owe(other, out, ROSTER_BATCH_MS); else this._send(other, out); } }
  _refereesPoses() { return !!(this._duelRef?.bouts?.size || this._wildRef?.fighters?.size || this._serpents?.size); }
  _rfSay() {
    const rf = this._refereesPoses();
    this._rfSaid = rf;
    const out = JSON.stringify({ t: 'rf', on: rf ? 1 : 0 });
    for (const [ws, b] of this._all()) if (b.id && b.w2) this._send(ws, out);
  }
  _fanFrames(outs, hears) {
    if (!outs.length) return;
    let one = null;
    for (const [ws, b] of this._all()) {
      if (!hears(b)) continue;
      if (b.w2 && outs.length > 1) { this._metrics.c.owed += outs.length; this._metrics.c.batches++; this._send(ws, one ??= wire2Batch(outs)); }
      else for (const s of outs) if (!this._send(ws, s)) break;
    }
  }
}
