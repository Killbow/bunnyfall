// A private arena session beside its bout, read, saved, armed, and shown to its members.
// It answers the session words, says who has a place on the floor, and drops, clears, or ends it.
import { privateSessionDeadline, isArenaPrivateRoom, arenaPrivateCodeOf, ARENA_PRIVATE_JOIN_HZ } from '../../../src/net/arenaLaw.js';
import { sessionWord, fighterOfSub, boutFinished, openSession, sessionJoin, sessionPick, sessionGoFighters, openBout, sessionKick, leaveSeat } from '../../../src/net/arenaBrain.js';
import { lookKey, arenaId } from '../room/keys.js';
import { badged, tokenGate, SOCKETS_MAX } from '../relay.js';

export class SessionPart {
  async _sessionOf() {
    if (this._session === undefined) { const v = await this.state.storage.get('arenasession'); this._session = v && typeof v === 'object' ? v : null; }
    return this._session;
  }
  async _sessionSave() {
    if (this._session) await this.state.storage.put('arenasession', this._session);
    else await this.state.storage.delete('arenasession');
  }
  async _sessionArm(S, now) {
    const at = Math.max(now + 1000, privateSessionDeadline(S));
    const cur = await this.state.storage.getAlarm();
    if (cur == null || cur > at) await this.state.storage.setAlarm(at);
  }
  _sessionHere(gone = null) {
    const at = new Set();
    for (const [w, b] of this._all()) if (w !== gone && b.id && b.sub) at.add(b.sub);
    return (sub) => at.has(sub);
  }
  _sessionFan(S, gone = null, ask = null) {
    const here = this._sessionHere(gone);
    const st = this._bout ?? null;
    const sig = JSON.stringify(sessionWord(S, S.host, here, st));
    if (ask && sig === this._sessionSig) { this._arenaSend(ask, sessionWord(S, this._attach(ask)?.sub, here, st)); return; }
    this._sessionSig = sig;
    for (const [ws, b] of [...this._all()]) if (ws !== gone && b.id && S.members[b.sub]) this._arenaSend(ws, sessionWord(S, b.sub, here, st));
  }
  async _sessionShow(ws) {
    const cur = this._attach(ws);
    if (!cur || cur.shown) return;
    // Mark the socket shown before the look awaits, so a second join cannot show it twice.
    this._setAttach(ws, { ...cur, shown: 1 });
    const S = await this._sessionOf();
    const lookOf = async (id) => this._looks.get(id) ?? (await this.state.storage.get(lookKey(id))) ?? null;
    const mine = JSON.stringify(badged({ t: 'join', id: cur.id, name: cur.name, look: await lookOf(cur.id), pose: cur.pose }, cur));
    for (const [other, b] of [...this._all()]) {
      if (other === ws || !b.id || !S?.members?.[b.sub]) continue;
      this._send(ws, JSON.stringify(badged({ t: 'join', id: b.id, name: b.name, look: await lookOf(b.id), pose: b.pose }, b)));
      this._send(other, mine);
    }
  }
  _sessionUnshow() {
    for (const [ws, b] of [...this._all()]) {
      if (!b.id || !b.shown) continue;
      const out = JSON.stringify({ t: 'leave', id: b.id });
      for (const [o2, b2] of [...this._all()]) if (o2 !== ws && b2.id) this._send(o2, out);
      this._setAttach(ws, { ...b, shown: 0 });
    }
  }
  async _floorOwn(key, sub) {
    if (!sub) return false;
    if (isArenaPrivateRoom(key)) return !!(await this._sessionOf())?.members?.[sub];
    const st = await this._boutOf();
    return !!st && !!fighterOfSub(st, sub);
  }
  _sessionSay(S, w) { for (const [ws, b] of [...this._all()]) if (b.id && S.members[b.sub]) this._arenaSend(ws, w); }
  async _sessionDropBout() {
    for (const [ws, b] of [...this._all()]) {
      if (!b.id) continue;
      if (b.af || b.asp || b.afid) this._setAttach(ws, { ...b, af: 0, afid: null, asp: 0 });
    }
    this._bout = null;
    await this.state.storage.delete('arenabout');
  }
  async _sessionClear(S, now) {
    await this._sessionDropBout();
    S.bout = null;
    await this._sessionSave();
    this._sessionFan(S);
    await this._sessionArm(S, now);
  }
  async _sessionEnd(S, why) {
    this._sessionSay(S, { k: 'no', m: why });
    this._sessionUnshow();
    await this._sessionDropBout();
    this._session = null;
    await this._sessionSave();
  }
  async _sessionWord(ws, a, m, now) {
    let S = await this._sessionOf();
    const sub = a.sub;
    const no = (w) => { this._arenaSend(ws, { k: 'no', m: w }); };
    const here = this._sessionHere();
    const st = await this._boutOf();
    const standing = !!st && !boutFinished(st);
    if (!this._sessionJoinBy) this._sessionJoinBy = new Map();
    if (m.a === 'open' || m.a === 'join') {
      if (m.a === 'open' && !S) {
        if (!a.lk) { no('host guest'); return; }
        S = this._session = openSession({ code: arenaPrivateCodeOf(a.key), host: { sub, name: a.name, title: a.title ?? null, banner: m.bn ?? null }, now });
        await this._sessionSave();
        await this._sessionArm(S, now);
        this._sessionFan(S);
        await this._sessionShow(ws);
        return;
      }
      if (!S) { no('no session'); return; }
      if (m.a === 'open' && S.host !== sub) { no('taken'); return; }
      const prev = S.members[sub] ? { ...S.members[sub] } : null;
      if (prev) {
        const budget = tokenGate(this._sessionJoinBy.get(sub), now, ARENA_PRIVATE_JOIN_HZ, 2);
        this._sessionJoinBy.delete(sub);
        if (this._sessionJoinBy.size >= SOCKETS_MAX) this._sessionJoinBy.delete(this._sessionJoinBy.keys().next().value);
        this._sessionJoinBy.set(sub, budget.bucket);
        if (!budget.pass) { this._arenaSend(ws, sessionWord(S, sub, here, st)); await this._sessionShow(ws); return; }
      }
      const goneWas = S.hostGoneAt;
      const j = sessionJoin(S, { sub, name: a.name, guest: !a.lk, title: a.title ?? null, banner: m.bn ?? null }, now, here, st ? st.f.map((x) => x.sub) : []);
      if (j.no) { no(j.no); return; }
      const me = S.members[sub];
      const same = !!prev && prev.name === me.name && prev.guest === me.guest && prev.title === me.title && prev.banner === me.banner && goneWas === S.hostGoneAt;
      if (!same) await this._sessionSave();
      this._sessionFan(S, null, ws);
      await this._sessionShow(ws);
      return;
    }
    if (!S) { no('no session'); return; }
    if (S.host !== sub) { no(S.members[sub] ? 'host only' : S.kicked.includes(sub) ? 'removed' : 'not member'); return; }
    const open = !!st && !st.res && !boutFinished(st);
    if (m.a === 'lock') {
      S.locked = m.l === 1;
      await this._sessionSave();
      this._sessionFan(S);
      return;
    }
    if (m.a === 'pick') {
      const r = sessionPick(S, { r: m.r, b: m.b }, here, standing);
      if (r.no) { no(r.no); return; }
      await this._sessionSave();
      this._sessionFan(S);
      return;
    }
    if (m.a === 'go') {
      const g = sessionGoFighters(S, here, !!st);
      if (g.no) { no(g.no); return; }
      const o = arenaId();
      this._bout = openBout({ o, kind: 'pvp', f: /** @type {any[]} */ (g.f), casual: true, equal: true, priv: true, now });
      S.bout = o;
      await this._boutSave(now, true);
      await this._sessionSave();
      await this._boutArm(now);
      this._sessionFan(S);
      return;
    }
    if (m.a === 'void') {
      if (!open) { no(st && !boutFinished(st) ? 'has result' : 'no bout'); return; }
      this._sessionSay(S, { k: 'no', m: 'voided' });
      await this._sessionClear(S, now);
      return;
    }
    if (m.a === 'kick') {
      const k = sessionKick(S, m.m);
      if (k.no) { no(k.no); return; }
      if (st && st.f.some((x) => x.sub === k.sub) && open) this._sessionSay(S, { k: 'no', m: 'voided' });
      let seats = 0;
      for (const [w, b] of [...this._all()]) {
        if (!b.id || b.sub !== k.sub) continue;
        if (b.af || b.shown) { const out = JSON.stringify({ t: 'leave', id: b.id }); for (const [o2, b2] of [...this._all()]) if (o2 !== w && b2.id) this._send(o2, out); }
        // Never close a removed socket: `src/net/online.js` reads a policy close as final,
        // and the player goes offline.
        this._arenaSend(w, { k: 'no', m: 'removed' });
        if (b.asp && st) { leaveSeat(st); seats++; }
        if (b.af || b.asp || b.afid || b.shown) this._setAttach(w, { ...b, af: 0, afid: null, asp: 0, shown: 0 });
      }
      if (seats && st) this._boutFan([{ k: 'sp', n: st.spectators }]);
      if (st && st.f.some((x) => x.sub === k.sub)) { await this._sessionClear(S, now); return; }
      await this._sessionSave();
      this._sessionFan(S);
      return;
    }
    if (m.a === 'close') { await this._sessionEnd(S, 'closed'); return; }
    this._junk(ws);
  }
}
