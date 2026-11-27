import { iliacEmpty, iliacNextAt, iliacStand, iliacLook, iliacSeatOf, newIliacTable, iliacSitRefusal, iliacSit, iliacCommit, iliacVouch, iliacBack, iliacVoid, iliacGone, iliacTick as iliacTableTick } from '../../../src/net/iliacTable.js';
import { verifyOrder, deckDigest } from '../../../src/net/identityToken.js';
import { emptyTable as holdemEmpty, stand as holdemStand } from '../../../src/net/holdemTable.js';
import { gambitEmpty } from '../../../src/net/gambit/gambitTable.js';
import { holdemSitRoomGate } from '../relay.js';
import { mintIliacReceipt, ILIAC_RECEIPT_TTL_S } from '../../../src/net/iliacReceipt.js';
import { iliacOwedKeyOf, ILIAC_OWED_MAX } from '../room/keys.js';
import { rand32 } from '../room/dice.js';

export class IliacPart {
  async _iliacOf() {
    if (!this._iliac) {
      const kept = await this.state.storage.get('iliac');
      this._iliac = new Map(kept && typeof kept === 'object' ? Object.entries(kept).map(([k, v]) => [Number(k), v]) : []);
    }
    return this._iliac;
  }
  async _iliacSave() {
    const tables = this._iliac;
    if (!tables) return;
    await this._iliacResults(tables);
    for (const [k, t] of tables) if (iliacEmpty(t) && !t.results?.length) tables.delete(k);
    if (tables.size) await this.state.storage.put('iliac', Object.fromEntries(tables));
    else await this.state.storage.delete('iliac');
    let at = Infinity;
    for (const t of tables.values()) { const n = iliacNextAt(t); if (n != null) at = Math.min(at, n); }
    if (Number.isFinite(at)) await this._boutArm(Date.now(), at);
  }
  _iliacSend(index, msgs, now) {
    for (const { to, frame } of msgs) {
      const out = JSON.stringify({ t: 'iliac', table: index, now, ...frame });
      for (const [w, b] of this._all()) if (b.id && (to == null || b.id === to)) this._send(w, out);
    }
  }
  async _iliacUp(id, now) {
    const tables = await this._iliacOf();
    let moved = false;
    for (const [k, t] of tables) { const up = iliacStand(t, { id, now }); if (up.length) { moved = true; this._iliacSend(k, up, now); } }
    return moved;
  }
  async _iliacWord(ws, a, m, now) {
    const tables = await this._iliacOf();
    const refuse = (error) => this._send(ws, JSON.stringify({ t: 'iliac', table: m.table, now, error }));
    if (m.op === 'ack') { await this._iliacAck(a, m.j); return; }
    if (m.op === 'vouch') { await this._iliacVouch(a, m, now, refuse); return; }
    let t = tables.get(m.table);
    let msgs;
    if (m.op === 'look') { msgs = t ? iliacLook(t, a.id) : []; await this._iliacOwed(ws, a, m.table); }
    else if (m.op === 'sit') {
      await this._iliacOwed(ws, a, m.table);
      if (a.ly) { refuse(m.order !== undefined ? 'ranked closed' : 'busy'); return; }
      let sub = null, orderE;
      if (m.order !== undefined) {
        if (!this._verifyKey || !a.sub || !(await this._receiptKeyOf())) { refuse('ranked closed'); return; }
        const v = await verifyOrder(m.order, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'deck' });
        if (!v.ok || v.claims.s !== a.sub) { refuse('deck refused'); return; }
        if (v.claims.dh !== await deckDigest(m.deck, { subtle: crypto.subtle })) { refuse('deck refused'); return; }
        sub = a.sub;
        orderE = v.claims.e;
      }
      t = tables.get(m.table);
      if (t && t.chairs !== m.chairs) { refuse('table differs'); return; }
      const hold = (await this._holdemOf()).get(m.table);
      if (hold && !holdemEmpty(hold)) { refuse('other game'); return; }
      const kg = (await this._gambitOf()).get(m.table);
      if (kg && !gambitEmpty(kg)) { refuse('other game'); return; }
      if (a.sub && [...this._all()].some(([, b]) => b.id && b.id !== a.id && b.sub === a.sub && [...tables.values()].some((x) => iliacSeatOf(x, b.id) >= 0))) { refuse('account seated'); return; }
      const fresh = !t;
      if (fresh) { t = newIliacTable({ chairs: m.chairs }); if (!t) { refuse('bad table'); return; } }
      const no = iliacSitRefusal(t, { id: a.id, chair: m.chair, deck: m.deck });
      if (no) { refuse(no); return; }
      const gate = holdemSitRoomGate(this._holdemSitBucket ?? null, now);
      this._holdemSitBucket = gate.bucket;
      if (!gate.pass) { refuse('busy'); return; }
      const r = iliacSit(t, { id: a.id, name: a.name ?? '', chair: m.chair, deck: m.deck, now, sub, orderE });
      if (typeof r === 'string') { refuse(r); return; }
      if (fresh) tables.set(m.table, t);
      for (const [k, other] of tables) if (k !== m.table) { const up = iliacStand(other, { id: a.id, now }); if (up.length) this._iliacSend(k, up, now); }
      const holdem = await this._holdemOf();
      let stood = false;
      for (const [k, other] of holdem) { const up = holdemStand(other, { id: a.id, now }); if (up.length) { stood = true; this._holdemSend(k, up, now); } }
      if (stood) await this._holdemSave();
      if (await this._gambitUp(a.id, now)) await this._gambitSave();
      msgs = r;
    } else if (!t) { refuse('no table'); return; }
    else if (m.op === 'stand') msgs = iliacStand(t, { id: a.id, now, gameNo: m.gameNo });
    else {
      const r = iliacCommit(t, { id: a.id, plays: m.plays, now, gameNo: m.gameNo, turn: m.turn });
      if (typeof r === 'string') { refuse(r); return; }
      msgs = r;
    }
    if (!msgs.length) return;
    this._iliacSend(m.table, msgs, now);
    if (m.op !== 'look') await this._iliacSave();
  }
  async _iliacResults(tables) {
    const key = await this._receiptKeyOf();
    const nowS = Math.floor(Date.now() / 1000);
    for (const [k, t] of tables) {
      while (t.results?.length) {
        const res = t.results[0];
        let receipt;
        try { receipt = await mintIliacReceipt({ j: res.j, f: res.f, r: res.r, h: res.h }, key, { subtle: crypto.subtle, nowS }); } catch (e) { console.warn('[iliac] a result would not mint', e?.message ?? e); t.results.shift(); continue; }
        try { for (const sub of res.f) await this._iliacKeep(sub, k, res.j, receipt, nowS); } catch (e) { console.warn('[iliac] a result was not kept', e?.message ?? e); break; }
        t.results.shift();
        const out = JSON.stringify({ t: 'iliac', table: k, now: Date.now(), receipt });
        for (const [w, b] of this._all()) if (b.id && (res.to.includes(b.id) || res.f.includes(b.sub))) this._send(w, out);
      }
    }
  }
  async _iliacKeep(sub, k, j, receipt, nowS) {
    const key = iliacOwedKeyOf(sub);
    const live = ((await this.state.storage.get(key)) ?? []).filter((x) => x?.j !== j && x?.e > nowS);
    await this.state.storage.put(key, [...live, { j, k, receipt, e: nowS + ILIAC_RECEIPT_TTL_S }].slice(-ILIAC_OWED_MAX));
  }
  async _iliacOwed(ws, a, index) {
    if (!a.sub) return;
    const nowS = Math.floor(Date.now() / 1000);
    const owed = ((await this.state.storage.get(iliacOwedKeyOf(a.sub))) ?? []).filter((x) => x?.e > nowS);
    for (const x of owed) this._send(ws, JSON.stringify({ t: 'iliac', table: Number.isInteger(x.k) ? x.k : index, now: Date.now(), receipt: x.receipt }));
  }
  async _iliacAck(a, j) {
    if (!a.sub) return;
    const key = iliacOwedKeyOf(a.sub);
    const owed = (await this.state.storage.get(key)) ?? [];
    if (!owed.some((x) => x?.j === j)) return;
    const rest = owed.filter((x) => x?.j !== j);
    await (rest.length ? this.state.storage.put(key, rest) : this.state.storage.delete(key));
  }
  async _iliacVouch(a, m, now, refuse) {
    if (!this._verifyKey || !a.sub || !(await this._receiptKeyOf())) { refuse('ranked closed'); return; }
    const v = await verifyOrder(m.order, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'deck' });
    const t = (await this._iliacOf()).get(m.table);
    const seat = t?.seats[iliacSeatOf(t, a.id)];
    if (!seat) { refuse('not seated'); return; }
    if (!v.ok || v.claims.s !== a.sub || v.claims.dh !== await deckDigest(seat.deck, { subtle: crypto.subtle })) { refuse('deck refused'); return; }
    const no = iliacVouch(t, { id: a.id, sub: a.sub, orderE: v.claims.e });
    if (no) { refuse(no); return; }
    await this._iliacSave();
  }
  async _iliacHello(ws, id, sub, now) {
    const tables = await this._iliacOf();
    let moved = false;
    for (const [k, t] of tables) { const back = iliacBack(t, { id, sub, now }); if (back.length) { moved = true; this._iliacSend(k, back, now); } }
    if (moved) await this._iliacSave();
    await this._iliacOwed(ws, { sub }, 0);
  }
  _iliacGhosts(tables, now, everyone = false) {
    const here = new Set(everyone ? [] : [...this._all()].filter(([, b]) => b.id).map(([, b]) => b.id));
    let moved = false;
    for (const [k, t] of tables) {
      if (everyone && t.game) { moved = true; this._iliacSend(k, iliacVoid(t, now), now); }
      for (const s of [...t.seats]) {
        if (!s || here.has(s.id) || (!everyone && s.away)) continue;
        const up = everyone ? iliacStand(t, { id: s.id, now }) : iliacGone(t, { id: s.id, now });
        if (up.length) { moved = true; this._iliacSend(k, up, now); }
      }
    }
    return moved;
  }
  async _iliacLeave(a, now) {
    const tables = await this._iliacOf();
    if (!tables.size) return;
    let moved = false;
    for (const [k, t] of tables) { const up = iliacGone(t, { id: a.id, now }); if (up.length) { moved = true; this._iliacSend(k, up, now); } }
    if (moved) await this._iliacSave();
  }
  async _iliacTick() {
    const tables = await this._iliacOf();
    if (!tables.size) return false;
    const now = Date.now();
    this._iliacGhosts(tables, now);
    for (const [k, t] of tables) { const msgs = iliacTableTick(t, now, rand32); if (msgs.length) this._iliacSend(k, msgs, now); }
    await this._iliacSave();
    return tables.size > 0;
  }
}
