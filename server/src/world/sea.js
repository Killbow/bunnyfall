import { seaHelm, seaBoard, seaShot, SEA_WRECK_PREFIX, SEA_REF, seaStep } from '../../../src/net/sea/seaRef.js';
import { duelBoutOf } from '../../../src/net/duelRef.js';
import { wildKin } from '../../../src/net/wildRef.js';
import { mintSeaWreck } from '../../../src/net/wildReceipt.js';

export class SeaPart {
  async _seaWord(a, d, now) {
    if (!a.sub) return;
    const st = await this._wildSt();
    if (d.k === 'helm') {
      const res = seaHelm(st, a.sub, { id: a.id, ci: a.ci ?? '', hl: d.hl, t: d.t / 100, u: d.u, h: d.h / 1000 }, now, { rid: this._wildRid(), room: a.key });
      if (res) await this._seaWrecked(res, now);
      return;
    }
    if (d.k === 'board') { const w = seaBoard(st, a.sub, d.r, now); if (w) await this._seaSign(w, now); return; }
    if (d.to === a.id) return;
    const target = this._idFirst(d.to);
    const tb = target?.[1];
    if (!tb?.sub) return;
    const fa = st.fighters.get(a.sub), ft = st.fighters.get(tb.sub);
    if (!fa || !ft || !fa.zone || !ft.zone || fa.down || ft.down || !st.ships?.has(a.sub) || !st.ships?.has(tb.sub)) return;
    const bout = this._duelRef ? duelBoutOf(this._duelRef, a.sub) : null;
    const kin = wildKin({ guilds: [a.gi, tb.gi], duel: !!bout && (bout.a.sub === tb.sub || bout.b.sub === tb.sub) }) || wildKin({ party: await this._wdunKinOf(a.sub, tb.sub, now) });
    const res = seaShot(st, a.sub, tb.sub, { d: d.d, s: d.s, f: d.f === 1, kin, rid: this._wildRid(), room: a.key }, now);
    if (!res.ok || !(res.frac > 0 || res.sail > 0 || res.fire)) return;
    const word = JSON.stringify({ t: 'wref', k: 'hull', by: a.id, to: tb.id, d: Math.min(1000, Math.floor(res.frac * 1000)), s: Math.min(1000, Math.floor(res.sail * 1000)), f: res.fire ? 1 : 0, h: Math.min(1000, Math.ceil(res.left * 1000)) });
    this._send(target[0], word);
    const mine = this._siegeSocketOf(a.sub);
    if (mine) this._send(mine[0], word);
    if (res.dealt > 0) this._wildCarryPut(tb.sub, this._zoneCarry(st, tb.sub, now));
    if (res.wreck || res.evicted) await this._seaWrecked(res, now);
  }
  async _seaWrecked({ wreck, evicted }, now) {
    if (evicted) await this._seaSign(evicted, now);
    if (!wreck) return;
    try { await this.state.storage.put(`${SEA_WRECK_PREFIX}${wreck.r}`, wreck); } catch (e) { console.warn('[sea] wreck kept failed', e?.message ?? e); }
    await this._seaArm(wreck.at + SEA_REF.boardMs + 1000);
    this._wildFan({ t: 'wref', k: 'wreck', id: wreck.fallenId, by: wreck.killerId, r: wreck.r });
  }
  async _seaArm(at) {
    try { const had = await this.state.storage.getAlarm(); if (had == null || had > at) await this.state.storage.setAlarm(at); }
    catch (e) { console.warn('[sea] arm', e?.message ?? e); }
  }
  async _seaAlarm(now) {
    if (!this._wildRef?.wrecks?.size) {
      let kept = 0;
      try { kept = (await this.state.storage.list({ prefix: SEA_WRECK_PREFIX, limit: 1 })).size; } catch { return; }
      if (!kept) return;
    }
    const st = await this._wildSt();
    for (const w of seaStep(st, now)) await this._seaSign(w, now);
    let next = Infinity;
    for (const w of st.wrecks?.values() ?? []) next = Math.min(next, w.at + SEA_REF.boardMs + 1000);
    if (Number.isFinite(next)) await this._seaArm(next);
  }
  async _seaSign(w, now) {
    let rc = null;
    if (w.ci && w.kc && w.u > 0) {
      try { rc = await mintSeaWreck({ f: w.fallen, c: w.ci, k: w.killer, kc: w.kc, r: w.r, u: w.u, b: w.boarded ? 1 : 0, m: w.m }, await this._receiptKeyOf(), { subtle: globalThis.crypto.subtle, nowS: Math.floor(now / 1000) }); } catch (e) { console.warn('[sea] wreck receipt failed', e?.message ?? e); }
    }
    try { await this.state.storage.delete(`${SEA_WRECK_PREFIX}${w.r}`); } catch {  }
    if (rc) this._wildHand([w.fallen, w.killer], { t: 'wref', k: 'wc', r: w.r, rc });
  }
}
