import { emptyTable as holdemEmpty, nextAt as holdemNextAt, stateDelta as holdemDelta, tableLook as holdemLook, holdemGoldTable, newTable, sitRefusal as holdemSitRefusal, sit as holdemSit, stand as holdemStand, actAt as holdemAct, topUp as holdemTopUp, tick as holdemTick } from '../../../src/net/holdemTable.js';
import { iliacEmpty } from '../../../src/net/iliacTable.js';
import { gambitEmpty } from '../../../src/net/gambit/gambitTable.js';
import { holdemSitRoomGate, isLayered } from '../relay.js';
import { verifyOrder, verifyStakeOrderAnyAge } from '../../../src/net/identityToken.js';
import { stakeKeyOf, HOLDEM_STAKE_VOID_S, HOLDEM_INTERNAL_VOID, cashoutKeyOf, HOLDEM_OWED_MAX } from '../room/keys.js';
import { ROOM_CALL_MS } from '../relayScale.js';
import { json } from '../room/json.js';
import { mintCardReceipt, CARD_RECEIPT_TTL_S } from '../../../src/net/cardReceipt.js';
import { rand32 } from '../room/dice.js';

export class HoldemPart {
  async _holdemOf() {
    if (!this._holdem) {
      const kept = await this.state.storage.get('holdem');
      this._holdem = new Map(kept && typeof kept === 'object' ? Object.entries(kept).map(([k, v]) => [Number(k), v]) : []);
    }
    return this._holdem;
  }
  async _holdemSave() {
    const tables = this._holdem;
    if (!tables) return;
    await this._holdemCashouts(tables);
    for (const [k, t] of tables) if (holdemEmpty(t) && !t.cashouts?.length) { tables.delete(k); this._holdemSaid?.delete(k); }
    if (tables.size) await this.state.storage.put('holdem', Object.fromEntries(tables));
    else await this.state.storage.delete('holdem');
    let at = Infinity;
    for (const t of tables.values()) { const n = holdemNextAt(t); if (n != null) at = Math.min(at, n); }
    if (Number.isFinite(at)) await this._boutArm(Date.now(), at);
  }
  _holdemSend(index, msgs, now) {
    this._holdemSaid ??= new Map();
    for (const { to, frame: f } of msgs) {
      let frame = f;
      if (to == null && f.state) {
        // Room frames carry a running `n`; on a gap, `src/systems/card/cardRemoteTable.js`
        // asks for a look. A look sends the whole state at the last room `n`.
        const said = this._holdemSaid.get(index), n = (said?.n ?? -1) + 1;
        const delta = holdemDelta(said?.state, f.state);
        this._holdemSaid.set(index, { state: f.state, n });
        frame = delta ? { events: f.events, delta, n } : { ...f, n };
      } else if (f.state) frame = { ...f, n: this._holdemSaid.get(index)?.n };
      const out = JSON.stringify({ t: 'holdem', table: index, now, ...frame });
      for (const [w, b] of this._all()) if (b.id && (to == null || b.id === to)) this._send(w, out);
    }
  }
  async _holdemWord(ws, a, m, now) {
    const tables = await this._holdemOf();
    let t = tables.get(m.table);
    const refuse = (error) => this._send(ws, JSON.stringify({ t: 'holdem', table: m.table, now, error }));
    let msgs;
    if (m.op === 'ack') { await this._holdemAck(a, m.j); return; }
    if (m.op === 'void') { await this._holdemVoid(ws, a, m, now, refuse); return; }
    if (m.op === 'topup') { await this._holdemTopUp(a, m, now, refuse); return; }
    if (m.op === 'look') { msgs = t ? holdemLook(t, a.id, now) : []; await this._holdemOwed(ws, a, m.table); }
    else if (m.op === 'sit') {
      let stake = null;
      await this._holdemOwed(ws, a, m.table);
      if (a.ly) { refuse(m.stake !== undefined ? 'stakes closed' : 'bad table'); return; }
      const back = !!t?.seats.some((x) => x?.id === a.id && x.leaving && !x.cashed);
      if (m.stake !== undefined && !back) {
        const v = await this._holdemStake(a, m, now);
        if (v.no) { if (v.back) await this._holdemReceipt(m.table, a.id, { ...v.back, w: 'refused' }); refuse(v.no); return; }
        stake = v.stake;
      }
      // Read the table again: other frames can open or close it during the order check's await.
      t = tables.get(m.table);
      // Once a stake is spent, every refusal goes through `no`,
      // which hands it back in a 'refused' receipt.
      const no = async (why) => { if (stake) await this._holdemReceipt(m.table, a.id, { j: stake.j, s: stake.sub, r: stake.amount, w: 'refused' }); refuse(why); };
      if (!back && !!stake !== holdemGoldTable(m.table)) { await no(stake ? 'friendly table' : 'gold table'); return; }
      if (t && (t.chairs !== m.chairs || t.bb !== m.bb)) { await no('table differs'); return; }
      if (a.sub && this._holdemAccountSeated(tables, a)) { await no('account seated'); return; }
      const ili = (await this._iliacOf()).get(m.table);
      if (ili && !iliacEmpty(ili)) { await no('other game'); return; }
      const kg = (await this._gambitOf()).get(m.table);
      if (kg && !gambitEmpty(kg)) { await no('other game'); return; }
      const fresh = !t;
      if (fresh) { t = newTable({ chairs: m.chairs, bb: m.bb, gold: !!stake }); if (!t) { await no('bad table'); return; } }
      const refused = holdemSitRefusal(t, { id: a.id, chair: m.chair, stake });
      if (refused) { await no(refused); return; }
      const gate = holdemSitRoomGate(this._holdemSitBucket ?? null, now);
      this._holdemSitBucket = gate.bucket;
      if (!gate.pass) { await no('busy'); return; }
      const r = holdemSit(t, { id: a.id, name: a.name ?? '', chair: m.chair, now, stake });
      if (typeof r === 'string') { await no(r); return; }
      if (fresh) tables.set(m.table, t);
      for (const [k, other] of tables) if (k !== m.table) { const up = holdemStand(other, { id: a.id, now }); if (up.length) this._holdemSend(k, up, now); }
      if (await this._iliacUp(a.id, now)) await this._iliacSave();
      if (await this._gambitUp(a.id, now)) await this._gambitSave();
      msgs = r;
    } else if (!t) { refuse('no table'); return; }
    else if (m.op === 'stand') msgs = holdemStand(t, { id: a.id, now });
    else {
      const r = holdemAct(t, { id: a.id, action: m.action, now });
      if (typeof r === 'string') { refuse(r); return; }
      msgs = r;
    }
    if (!msgs.length) return;
    this._holdemSend(m.table, msgs, now);
    if (m.op !== 'look') await this._holdemSave();
  }
  _holdemAccountSeated(tables, a) {
    const others = new Set([...this._all()].filter(([, b]) => b.id && b.id !== a.id && b.sub === a.sub).map(([, b]) => b.id));
    if (!others.size) return false;
    for (const t of tables.values()) for (const s of t.seats) if (s && others.has(s.id)) return true;
    return false;
  }
  async _holdemStake(a, m, now) {
    await this._loadKey();
    if (!this._verifyKey || !a.sub || !(await this._receiptKeyOf())) return { no: 'stakes closed' };
    const v = await verifyOrder(m.stake, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'stake' });
    if (!v.ok || v.claims.s !== a.sub) return { no: 'stake refused' };
    const c = v.claims;
    // Leave another room's order unspent with no refund; each room records its own spends.
    // A refund here while that room still seats the stake would pay it twice.
    if (c.cr !== a.key) return { no: 'stake elsewhere' };
    if (await this.state.storage.get(stakeKeyOf(c.cj))) return { no: 'stake spent' };
    await this.state.storage.put(stakeKeyOf(c.cj), Math.floor(now / 1000));
    const back = { j: c.cj, s: c.s, r: c.ca };
    if (c.ct !== m.table || c.cb !== m.bb) return { no: 'stake elsewhere', back };
    return { stake: { j: c.cj, sub: c.s, amount: c.ca } };
  }
  async _holdemTopUp(a, m, now, refuse) {
    if (a.ly) { refuse('stakes closed'); return; }
    await this._loadKey();
    if (!this._verifyKey || !a.sub || !(await this._receiptKeyOf())) { refuse('stakes closed'); return; }
    const v = await verifyOrder(m.stake, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'stake' });
    if (!v.ok || v.claims.s !== a.sub) { refuse('stake refused'); return; }
    const c = v.claims;
    const t = (await this._holdemOf()).get(m.table);
    if (c.cr !== a.key || c.ct !== m.table || !t || c.cb !== t.bb) { refuse('stake elsewhere'); return; }
    const stake = { j: c.cj, sub: c.s, amount: c.ca };
    const no = holdemTopUp(t, { id: a.id, stake, now }, true);
    if (no) { refuse(no); return; }
    if (await this.state.storage.get(stakeKeyOf(c.cj))) { refuse('stake spent'); return; }
    await this.state.storage.put(stakeKeyOf(c.cj), Math.floor(now / 1000));
    const msgs = holdemTopUp(t, { id: a.id, stake, now });
    if (typeof msgs === 'string') { await this._holdemReceipt(m.table, a.id, { j: c.cj, s: c.s, r: c.ca, w: 'refused' }); refuse(msgs); return; }
    await this._holdemReceipt(m.table, a.id, { j: c.cj, s: c.s, r: 0, w: 'joined' });
    this._holdemSend(m.table, msgs, now);
    await this._holdemSave();
  }
  async _holdemVoid(ws, a, m, now, refuse) {
    await this._loadKey();
    if (!this._verifyKey || !a.sub || !(await this._receiptKeyOf())) { refuse('stakes closed'); return; }
    const v = await verifyStakeOrderAnyAge(m.stake, this._verifyKey, { subtle: crypto.subtle });
    if (!v.ok || v.claims.s !== a.sub || v.claims.cr !== a.key) { refuse('stake refused'); return; }
    const c = v.claims, nowS = Math.floor(now / 1000);
    if (nowS - c.i > HOLDEM_STAKE_VOID_S) { refuse('stake too old'); return; }
    // A layer sends the void to its place, which records every spend for the room.
    // A void spent in the layer could repay a stake the place has seated.
    if (a.ly) {
      const back = await this._holdemVoidAtPlace(a.key, m.stake, a.sub);
      if (back.no) { refuse(back.no); return; }
      await this._holdemKeepReceipt(back.table, a.id, c.s, c.cj, back.receipt);
      return;
    }
    const no = await this._holdemVoidSpend(c, nowS);
    if (no) { refuse(no); return; }
    await this._holdemReceipt(c.ct, a.id, { j: c.cj, s: c.s, r: c.ca, w: 'void' });
  }
  async _holdemVoidSpend(c, nowS) {
    if (await this.state.storage.get(stakeKeyOf(c.cj))) return 'stake spent';
    await this.state.storage.put(stakeKeyOf(c.cj), nowS);
    return null;
  }
  async _holdemVoidAtPlace(key, stake, sub) {
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return { no: 'stakes closed' };
    try {
      const res = await rooms.get(rooms.idFromName(key)).fetch(new Request(`https://relay.internal${HOLDEM_INTERNAL_VOID}`, { method: 'POST', body: JSON.stringify({ key, stake, sub }), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
      const o = await res.json();
      if (typeof o?.receipt === 'string' && Number.isSafeInteger(o.table)) return { receipt: o.receipt, table: o.table };
      return { no: typeof o?.no === 'string' ? o.no : 'stakes closed' };
    } catch (e) { console.warn('[holdem] the place did not answer a void', e?.message ?? e); return { no: 'stakes closed' }; }
  }
  async _holdemVoidInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const key = typeof body?.key === 'string' ? body.key : null, sub = typeof body?.sub === 'string' && body.sub ? body.sub : null;
    if (!key || !sub || !isLayered(key)) return json({ no: 'stake refused' }, 400);
    await this._loadKey();
    if (!this._verifyKey || !(await this._receiptKeyOf())) return json({ no: 'stakes closed' });
    const v = await verifyStakeOrderAnyAge(body.stake, this._verifyKey, { subtle: crypto.subtle });
    if (!v.ok || v.claims.s !== sub || v.claims.cr !== key) return json({ no: 'stake refused' });
    const c = v.claims, nowS = Math.floor(Date.now() / 1000);
    if (nowS - c.i > HOLDEM_STAKE_VOID_S) return json({ no: 'stake too old' });
    const no = await this._holdemVoidSpend(c, nowS);
    if (no) return json({ no });
    const receipt = await this._holdemReceipt(c.ct, null, { j: c.cj, s: c.s, r: c.ca, w: 'void' });
    return receipt ? json({ receipt, table: c.ct }) : json({ no: 'stakes closed' });
  }
  async _holdemReceipt(index, id, { j, s, r, w }) {
    let receipt;
    try { receipt = await mintCardReceipt({ s, j, r, w }, await this._receiptKeyOf(), { subtle: crypto.subtle, nowS: Math.floor(Date.now() / 1000) }); } catch (e) { console.warn('[holdem] a cash-out would not mint', e?.message ?? e); return false; }
    return this._holdemKeepReceipt(index, id, s, j, receipt);
  }
  async _holdemKeepReceipt(index, id, s, j, receipt) {
    const key = cashoutKeyOf(s), nowS = Math.floor(Date.now() / 1000);
    const kept = ((await this.state.storage.get(key)) ?? []).filter((x) => x && x.e > nowS && x.j !== j);
    kept.push({ j, receipt, e: nowS + CARD_RECEIPT_TTL_S });
    await this.state.storage.put(key, kept.slice(-HOLDEM_OWED_MAX));
    const out = JSON.stringify({ t: 'holdem', table: index, now: Date.now(), cashout: receipt });
    for (const [w, b] of this._all()) if (b.id && (b.id === id || b.sub === s)) this._send(w, out);
    return receipt;
  }
  async _holdemOwed(ws, a, index) {
    if (!a.sub) return;
    const nowS = Math.floor(Date.now() / 1000);
    for (const x of (await this.state.storage.get(cashoutKeyOf(a.sub))) ?? []) if (x && x.e > nowS) this._send(ws, JSON.stringify({ t: 'holdem', table: index, now: Date.now(), cashout: x.receipt }));
  }
  async _holdemAck(a, j) {
    if (!a.sub) return;
    const key = cashoutKeyOf(a.sub);
    const kept = (await this.state.storage.get(key)) ?? [];
    const left = kept.filter((x) => x?.j !== j);
    if (left.length === kept.length) return;
    if (left.length) await this.state.storage.put(key, left); else await this.state.storage.delete(key);
  }
  async _holdemCashouts(tables) {
    for (const [k, t] of tables) {
      if (!t.cashouts?.length) continue;
      while (t.cashouts.length) {
        let done = false;
        try { done = await this._holdemReceipt(k, t.cashouts[0].to, t.cashouts[0]); } catch (e) { console.warn('[holdem] a cash-out was not kept', e?.message ?? e); }
        if (!done) break;
        // Shift a cash-out only once it is signed and stored;
        // a failure leaves it and the rest queued.
        t.cashouts.shift();
      }
    }
  }
  _holdemGhosts(tables, now, everyone = false) {
    const here = new Set(everyone ? [] : [...this._all()].filter(([, b]) => b.id).map(([, b]) => b.id));
    let moved = false;
    for (const [k, t] of tables) {
      for (const s of [...t.seats]) {
        if (!s || s.leaving || here.has(s.id)) continue;
        const up = holdemStand(t, { id: s.id, now });
        if (up.length) { moved = true; this._holdemSend(k, up, now); }
      }
    }
    return moved;
  }
  async _holdemLeave(a, now) {
    const tables = await this._holdemOf();
    if (!tables.size) return;
    let moved = false;
    for (const [k, t] of tables) { const msgs = holdemStand(t, { id: a.id, now }); if (msgs.length) { moved = true; this._holdemSend(k, msgs, now); } }
    if (moved) await this._holdemSave();
  }
  async _holdemTick() {
    const tables = await this._holdemOf();
    if (!tables.size) return false;
    const now = Date.now();
    this._holdemGhosts(tables, now);
    for (const [k, t] of tables) { const msgs = holdemTick(t, now, rand32); if (msgs.length) this._holdemSend(k, msgs, now); }
    await this._holdemSave();
    return tables.size > 0;
  }
}
