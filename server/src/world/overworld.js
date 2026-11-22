// A cell's overworld ledger, read once a life and shared, pruned and written back. The welcome says
// it, and the spent, spawn, and grave words of the players in the cell change it.
import { owLedgerOf, owPrune, owLedgerEmpty, toWelcome, owIdInCell, owRowSane, owRowInCell, owFoldSpent, owFoldRows, owRowsBehind, owFoldGraves } from '../../../src/net/overworldLaw.js';
import { OW_LEDGER_KEY, sharedClassicMinutes, owRoomGate, owGraveGate } from '../relay.js';
import { coverOf } from '../cellNodes.js';

export class OverworldPart {
  _owLedger(now) {
    if (!this._owLoad) {
      this._owLoad = (async () => {
        const led = owLedgerOf(await this.state.storage.get(OW_LEDGER_KEY));
        if (owPrune(led, now)) await this._owWrite(led);
        return led;
      })();
      this._owLoad.catch(() => { this._owLoad = null; });
    }
    return this._owLoad;
  }
  async _owWrite(led) {
    if (owLedgerEmpty(led)) await this.state.storage.delete(OW_LEDGER_KEY);
    else await this.state.storage.put(OW_LEDGER_KEY, owLedgerOf(led));
  }
  async _owWelcome(now) {
    try {
      const w = toWelcome(await this._owLedger(now), now);
      return w.sp.length || w.dg.length || w.gr?.length ? `,"ow":${JSON.stringify(w)}` : '';
    } catch (e) { console.warn('[ow] welcome failed', e?.message ?? e); return ''; }
  }
  async _owWord(ws, a, m, now) {
    if (m.k === 'gr') return this._owGraves(ws, a, m, now);
    const junk = m.k === 'sp' ? !m.ids.every((id) => owIdInCell(id, coverOf(a))) : !m.rows.every((r) => owRowSane(r) && owRowInCell(r, coverOf(a)));
    if (junk) { this._junk(ws); return; }
    if (a.ly) return;
    const led = await this._owLedger(now);
    const moved = m.k === 'sp' ? owFoldSpent(led, m.ids, now) : owFoldRows(led, m.rows, sharedClassicMinutes(now));
    if (moved.length) {
      owPrune(led, now);
      await this._owWrite(led);
      const out = JSON.stringify(m.k === 'sp' ? { t: 'ow', k: 'sp', ids: moved } : { t: 'ow', k: 'dg', rows: moved });
      const room = owRoomGate(this._roomOw, now);
      this._roomOw = room.bucket;
      if (room.pass) { for (const [other, b] of [...this._all()]) if (b.id) this._send(other, out); }
      else this._send(ws, out);
    }
    if (m.k === 'dg') {
      const behind = owRowsBehind(led, m.rows, moved);
      if (behind.length) this._send(ws, JSON.stringify({ t: 'ow', k: 'dg', rows: behind }));
    }
  }
  async _owGraves(ws, a, m, now) {
    if (!this._spend(ws, now, owGraveGate, 'owGrBucket', 'owGrDrops', 'too many grave words')) return;
    if (!m.rows.every((r) => owRowInCell(r, coverOf(a)))) { this._junk(ws); return; }
    if (typeof a.sub !== 'string' || !a.sub) return;
    const led = await this._owLedger(now);
    const taken = owFoldGraves(led, m.rows, a.sub, sharedClassicMinutes(now), a.name);
    if (!taken.length) return;
    owPrune(led, now);
    await this._owWrite(led);
    const out = JSON.stringify({ t: 'ow', k: 'gr', rows: taken });
    const room = owRoomGate(this._roomOw, now);
    this._roomOw = room.bucket;
    if (room.pass) { for (const [other, b] of [...this._all()]) if (b.id) this._send(other, out); }
    else this._send(ws, out);
  }
}
