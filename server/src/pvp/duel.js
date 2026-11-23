// The duels a room referees, held in its memory alone: opened, struck, forfeited, and beaten.
// A duel's words and its end, with a won bout's signed receipt, go to its two fighters.
import { newDuelRef, duelOpen, duelBoutOf, duelBlow, duelVitals, duelEnd, duelForfeit, duelStep } from '../../../src/net/duelRef.js';
import { lookKey } from '../room/keys.js';
import { SIEGE_HIT, siegeHeld } from '../../../src/net/siegeRef.js';
import { mintDuelReceipt } from '../../../src/net/duelReceipt.js';

export class DuelPart {
  _duels() { return (this._duelRef ??= newDuelRef()); }
  _duelSay(bout, word) {
    for (const x of [bout.a, bout.b]) {
      const sk = this._siegeSocketOf(x.sub);
      if (sk) this._send(sk[0], JSON.stringify(typeof word === 'function' ? word(x) : word));
    }
  }
  _duelOpen(ws, a, tb, d, now) {
    const bytes = new Uint8Array(6);
    globalThis.crypto.getRandomValues(bytes);
    const n = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    const r = duelOpen(this._duels(), { a: { sub: a.sub, id: a.id, pose: a.pose, lv: a.lv }, b: { sub: tb.sub, id: tb.id, pose: tb.pose, lv: tb.lv }, s: d.s, c: d.c, n }, now);
    if (r.no) { this._send(ws, JSON.stringify({ t: 'dref', k: 'no', s: d.s, why: r.no })); return null; }
    return r.bout;
  }
  async _duelBlow(a, d, now) {
    const st = this._duelRef;
    const bout = st ? duelBoutOf(st, a.sub) : null;
    if (!bout) return;
    let look = null;
    if (d.k === 'strike') {
      look = this._looks.get(a.id) ?? null;
      if (!look) { look = (await this.state.storage.get(lookKey(a.id))) ?? null; if (look) this._looks.set(a.id, look); }
    }
    const r = d.k === 'spell' ? SIEGE_HIT.Spell : d.by === 'arrow' ? SIEGE_HIT.Shaft : SIEGE_HIT.Melee;
    const held = d.k === 'strike' ? siegeHeld(look, d.w ? d.w.t : -1, d.w ? d.w.m : 0) : null;
    const res = duelBlow(st, a.sub, d.to, { d: d.d, r, held, wa: a.wa ?? null }, now);
    if (!res.ok || !res.dealt) return;
    this._duelSay(bout, { t: 'dref', k: 'hp', s: bout.s, by: a.id, to: d.to, d: res.dealt, r, h: duelVitals(bout) });
    if (res.fell) await this._duelClose(duelEnd(st, bout, a.sub, 'fell'), now);
  }
  async _duelForfeit(a, d, now) {
    const bout = this._duelRef ? duelBoutOf(this._duelRef, a.sub) : null;
    if (!bout || bout.s !== d.s) return false;
    const end = duelForfeit(this._duelRef, a.sub, d.why, now);
    if (end) await this._duelClose(end, now, bout);
    return true;
  }
  async _duelBeat(now) {
    if (!this._duelRef?.bouts.size) return;
    // Copy the bouts first: `duelStep` deletes each bout it ends, and `_duelClose` needs its sides.
    const bouts = new Map(this._duelRef.bouts);
    for (const end of duelStep(this._duelRef, (sub) => !!this._siegeSocketOf(sub), now)) await this._duelClose(end, now, bouts.get(end.s));
  }
  async _duelClose(end, now, bout = null) {
    let rc = null;
    if (end.w != null) {
      try { rc = await mintDuelReceipt({ f: end.f, w: end.w, n: end.n }, await this._receiptKeyOf(), { subtle: globalThis.crypto.subtle, nowS: Math.floor(now / 1000) }); } catch (e) { console.warn('[duel] receipt failed', e?.message ?? e); }
    }
    const word = { t: 'dref', k: 'end', s: end.s, w: end.w == null ? '' : end.ids[end.w], why: end.why, ...(rc ? { rc } : {}) };
    const sides = bout ?? { a: { sub: end.f[0] }, b: { sub: end.f[1] } };
    this._duelSay(sides, word);
  }
}
