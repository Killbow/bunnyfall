// King's Gambit tables in a room, read once a wake and saved. It answers the table words and
// ready, keeps the receipts owed, and runs ghosts, leaves, and the tick.
import { gambitTableValid, gambitEmpty, gambitNextAt, gambitStand, gambitLook, gambitSeatOf, newGambitTable, gambitSitRefusal, gambitSit, gambitUnready, gambitForfeit, gambitCommand, gambitReady, gambitReadyRefusal, gambitVoid, gambitTick as gambitTableTick } from '../../../src/net/gambit/gambitTable.js';
import { emptyTable as holdemEmpty, holdemGoldTable, stand as holdemStand } from '../../../src/net/holdemTable.js';
import { iliacEmpty } from '../../../src/net/iliacTable.js';
import { holdemSitRoomGate } from '../relay.js';
import { rand32 } from '../room/dice.js';
import { verifyOrder } from '../../../src/net/identityToken.js';
import { GAMBIT_STAKE_BB } from '../../../src/net/gambit/gambitStakes.js';
import { stakeKeyOf, gambitOwedKeyOf, ILIAC_OWED_MAX } from '../room/keys.js';
import { mintGambitReceipt, GAMBIT_RECEIPT_TTL_S } from '../../../src/net/gambit/gambitReceipt.js';

export class GambitPart {
  async _gambitOf() {
    if (!this._gambit) {
      const kept = await this.state.storage.get('gambit');
      this._gambit = new Map();
      if (kept && typeof kept === 'object') {
        for (const [k, v] of Object.entries(kept)) {
          if (gambitTableValid(v)) this._gambit.set(Number(k), v);
          else console.warn('[gambit] a stored table the law did not mint, dropped', k);
        }
      }
    }
    return this._gambit;
  }
  async _gambitSave() {
    const tables = this._gambit;
    if (!tables) return;
    await this._gambitOwedOut(tables);
    for (const [k, t] of tables) if (gambitEmpty(t) && !t.cashouts?.length && !t.results?.length) tables.delete(k);
    if (tables.size) await this.state.storage.put('gambit', Object.fromEntries(tables));
    else await this.state.storage.delete('gambit');
    let at = Infinity;
    for (const t of tables.values()) { const n = gambitNextAt(t); if (n != null) at = Math.min(at, n); }
    if (Number.isFinite(at)) await this._boutArm(Date.now(), at);
  }
  _gambitSend(index, msgs, now) {
    for (const { to, frame } of msgs) {
      const out = JSON.stringify({ t: 'gambit', table: index, now, ...frame });
      for (const [w, b] of this._all()) if (b.id && (to == null || b.id === to)) this._send(w, out);
    }
  }
  async _gambitUp(id, now) {
    const tables = await this._gambitOf();
    let moved = false;
    for (const [k, t] of tables) { const up = gambitStand(t, { id, now }); if (up.length) { moved = true; this._gambitSend(k, up, now); } }
    return moved;
  }
  async _gambitWord(ws, a, m, now) {
    const tables = await this._gambitOf();
    const refuse = (error) => this._send(ws, JSON.stringify({ t: 'gambit', table: m.table, now, error }));
    if (m.op === 'ack') { await this._gambitAck(a, m.j); return; }
    let t = tables.get(m.table);
    let msgs;
    if (m.op === 'look') { msgs = t ? gambitLook(t, a.id) : []; await this._gambitOwed(ws, a, m.table); }
    else if (m.op === 'sit') {
      await this._gambitOwed(ws, a, m.table);
      if (a.ly) { refuse('busy'); return; }
      if (t && t.chairs !== m.chairs) { refuse('table differs'); return; }
      const hold = (await this._holdemOf()).get(m.table), ili = (await this._iliacOf()).get(m.table);
      if ((hold && !holdemEmpty(hold)) || (ili && !iliacEmpty(ili))) { refuse('other game'); return; }
      if (a.sub && [...this._all()].some(([, b]) => b.id && b.id !== a.id && b.sub === a.sub && [...tables.values()].some((x) => gambitSeatOf(x, b.id) >= 0))) { refuse('account seated'); return; }
      const fresh = !t;
      if (fresh) { t = newGambitTable({ chairs: m.chairs, gold: holdemGoldTable(m.table) }); if (!t) { refuse('bad table'); return; } }
      const no = gambitSitRefusal(t, { id: a.id, chair: m.chair, crown: m.crown });
      if (no) { refuse(no); return; }
      const gate = holdemSitRoomGate(this._holdemSitBucket ?? null, now);
      this._holdemSitBucket = gate.bucket;
      if (!gate.pass) { refuse('busy'); return; }
      const r = gambitSit(t, { id: a.id, name: a.name ?? '', chair: m.chair, crown: m.crown, now, sub: a.sub ?? null });
      if (typeof r === 'string') { refuse(r); return; }
      if (fresh) tables.set(m.table, t);
      for (const [k, other] of tables) if (k !== m.table) { const up = gambitStand(other, { id: a.id, now }); if (up.length) this._gambitSend(k, up, now); }
      const holdem = await this._holdemOf();
      let stood = false;
      for (const [k, other] of holdem) { const up = holdemStand(other, { id: a.id, now }); if (up.length) { stood = true; this._holdemSend(k, up, now); } }
      if (stood) await this._holdemSave();
      if (await this._iliacUp(a.id, now)) await this._iliacSave();
      msgs = r;
    } else if (!t) { refuse('no table'); return; }
    else if (m.op === 'stand') msgs = gambitStand(t, { id: a.id, now, gameNo: m.gameNo });
    else {
      const r = m.op === 'ready' ? await this._gambitReady(a, m, now)
        : m.op === 'unready' ? gambitUnready(t, { id: a.id, now })
        : m.op === 'forfeit' ? gambitForfeit(t, { id: a.id, gameNo: m.gameNo, now })
        : gambitCommand(t, { id: a.id, cmd: m.cmd, gameNo: m.gameNo, now, rand32 });
      if (typeof r === 'string') { refuse(r); return; }
      msgs = r;
    }
    if (!msgs.length) return;
    this._gambitSend(m.table, msgs, now);
    if (m.op !== 'look') await this._gambitSave();
  }
  async _gambitReady(a, m, now) {
    const tables = await this._gambitOf();
    let t = tables.get(m.table);
    if (m.stake === undefined) return gambitReady(t, { id: a.id, army: m.army, crown: m.crown, now });
    if (a.ly) return 'stakes closed';
    await this._loadKey();
    if (!this._verifyKey || !a.sub || !(await this._receiptKeyOf())) return 'stakes closed';
    const v = await verifyOrder(m.stake, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'stake' });
    if (!v.ok || v.claims.s !== a.sub) return 'stake refused';
    const c = v.claims;
    if (c.cr !== a.key || c.ct !== m.table || c.cb !== GAMBIT_STAKE_BB) return 'stake elsewhere';
    t = tables.get(m.table);
    if (!t) return 'no table';
    const no = gambitReadyRefusal(t, { id: a.id, army: m.army, crown: m.crown, stake: c.ca });
    if (no) return no;
    if ((await this.state.storage.get(stakeKeyOf(c.cj))) !== undefined) return 'stake spent';
    await this.state.storage.put(stakeKeyOf(c.cj), Math.floor(now / 1000));
    const r = gambitReady(t, { id: a.id, army: m.army, crown: m.crown, now, stake: { j: c.cj, sub: c.s, amount: c.ca } });
    if (typeof r === 'string') await this._holdemReceipt(m.table, a.id, { j: c.cj, s: c.s, r: c.ca, w: 'refused' });
    return r;
  }
  async _gambitOwedOut(tables) {
    for (const [k, t] of tables) {
      while (t.cashouts?.length) {
        let done = false;
        try { done = !!(await this._holdemReceipt(k, t.cashouts[0].to, t.cashouts[0])); } catch (e) { console.warn('[gambit] a cash-out was not kept', e?.message ?? e); }
        if (done === false) break;
        t.cashouts.shift();
      }
      if (!t.results?.length) continue;
      const key = await this._receiptKeyOf();
      const nowS = Math.floor(Date.now() / 1000);
      while (t.results.length) {
        const res = t.results[0];
        let receipt;
        try { receipt = await mintGambitReceipt({ j: res.j, f: res.f, r: res.r, h: res.h }, key, { subtle: crypto.subtle, nowS }); } catch (e) { console.warn('[gambit] a result would not mint', e?.message ?? e); t.results.shift(); continue; }
        try { for (const sub of res.f) await this._gambitKeep(sub, k, res.j, receipt, nowS); } catch (e) { console.warn('[gambit] a result was not kept', e?.message ?? e); break; }
        t.results.shift();
        const out = JSON.stringify({ t: 'gambit', table: k, now: Date.now(), receipt });
        for (const [w, b] of this._all()) if (b.id && (res.f.includes(b.sub) || res.to.includes(b.id))) this._send(w, out);
      }
    }
  }
  async _gambitKeep(sub, k, j, receipt, nowS) {
    const key = gambitOwedKeyOf(sub);
    const live = ((await this.state.storage.get(key)) ?? []).filter((x) => x?.j !== j && x?.e > nowS);
    await this.state.storage.put(key, [...live, { j, k, receipt, e: nowS + GAMBIT_RECEIPT_TTL_S }].slice(-ILIAC_OWED_MAX));
  }
  async _gambitOwed(ws, a, index) {
    if (!a.sub) return;
    const nowS = Math.floor(Date.now() / 1000);
    const owed = ((await this.state.storage.get(gambitOwedKeyOf(a.sub))) ?? []).filter((x) => x?.e > nowS);
    for (const x of owed) this._send(ws, JSON.stringify({ t: 'gambit', table: Number.isInteger(x.k) ? x.k : index, now: Date.now(), receipt: x.receipt }));
  }
  async _gambitAck(a, j) {
    if (!a.sub) return;
    const key = gambitOwedKeyOf(a.sub);
    const owed = (await this.state.storage.get(key)) ?? [];
    if (!owed.some((x) => x?.j === j)) return;
    const rest = owed.filter((x) => x?.j !== j);
    await (rest.length ? this.state.storage.put(key, rest) : this.state.storage.delete(key));
  }
  _gambitGhosts(tables, now, everyone = false) {
    const here = new Set(everyone ? [] : [...this._all()].filter(([, b]) => b.id).map(([, b]) => b.id));
    let moved = false;
    for (const [k, t] of tables) {
      if (everyone && t.game) { moved = true; this._gambitSend(k, gambitVoid(t, now), now); }
      for (const s of [...t.seats]) {
        if (!s || here.has(s.id)) continue;
        const up = gambitStand(t, { id: s.id, now });
        if (up.length) { moved = true; this._gambitSend(k, up, now); }
      }
    }
    return moved;
  }
  async _gambitLeave(a, now) {
    const tables = await this._gambitOf();
    if (!tables.size) return;
    if (await this._gambitUp(a.id, now)) await this._gambitSave();
  }
  async _gambitTick() {
    const tables = await this._gambitOf();
    if (!tables.size) return false;
    const now = Date.now();
    this._gambitGhosts(tables, now);
    for (const [k, t] of tables) { const msgs = gambitTableTick(t, now, rand32); if (msgs.length) this._gambitSend(k, msgs, now); }
    await this._gambitSave();
    return tables.size > 0;
  }
}
