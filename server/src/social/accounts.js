// Social accounts on the hub, their records and secrets kept through a bounded cache. The hello
// guards and refreshes an account; a profile's friends merge in once, and a leave lets go.
import { acctSecretKey, acctKey, newAcct } from '../room/keys.js';
import { isHidden } from '../staffHidden.js';
import { ACCOUNT_SWEEP_MS, FRIENDS_MAX, PENDING_MAX, INVITE_TTL_MS } from '../relay.js';
import { ACCT_SEEN_WRITE_MS } from '../relayScale.js';

export class AccountsPart {
  async _asecretOf(id) {
    if (this._asecrets.has(id)) return this._asecrets.get(id);
    const v = await this.state.storage.get(acctSecretKey(id));
    const held = typeof v === 'string' ? v : null;
    this._asecrets.set(id, held);
    return held;
  }
  async _acct(id) {
    // The cached copy is trusted as storage: every account write goes through `_putAcct` or
    // `_putAccts`, and a delete also clears the cached copy.
    if (this._recs.has(id)) return this._recs.get(id);
    const r = await this.state.storage.get(acctKey(id));
    const rec = r && typeof r === 'object' ? r : null;
    this._keepRec(id, rec);
    return rec;
  }
  _keepRec(id, rec) { this._recs.set(id, rec); }
  _truced(id, rec) {
    // Runs before `_keepRec` on every account write, since `had` must be the record before it;
    // `partyWas` feeds the party truce in server/src/world/wdun.js.
    const had = this._recs.get(id);
    if (!rec || !had?.party || had.party === rec.party) return rec;
    return { ...rec, partyWas: { id: had.party, at: Date.now() } };
  }
  async _putAcct(id, rec) { rec = this._truced(id, rec); this._keepRec(id, rec); await this.state.storage.put(acctKey(id), rec); }
  // One batched put, so both sides of a friendship are written together or not at all.
  async _putAccts(recs) { const puts = {}; for (const [id, r] of Object.entries(recs)) { const rec = this._truced(id, r); this._keepRec(id, rec); puts[acctKey(id)] = rec; } await this.state.storage.put(puts); }
  async _accts(ids) {
    const out = new Map();
    const missing = [];
    for (const id of new Set(ids)) { if (this._recs.has(id)) { const r = this._recs.get(id); if (r) out.set(id, r); } else missing.push(id); }
    for (let i = 0; i < missing.length; i += 128) {
      const slice = missing.slice(i, i + 128);
      const got = await this.state.storage.get(slice.map(acctKey));
      for (const id of slice) { const v = got.get(acctKey(id)); const rec = v && typeof v === 'object' ? v : null; this._keepRec(id, rec); if (rec) out.set(id, rec); }
    }
    return out;
  }
  async _helloAccount(ws, m, now) {
    if (isHidden(this._attach(ws))) return;
    const me = this._attach(ws).sub || m.acct;
    if (me === m.acct) {
      const held = await this._asecretOf(m.acct);
      if (held && held !== m.asecret) { this._sayError(ws, 'account taken'); return; }
      if (!held) { await this.state.storage.put(acctSecretKey(m.acct), m.asecret); this._asecrets.set(m.acct, m.asecret); }
    } else {
      await this._retireForged(me, now);
      await this._mergeLegacy(me, m, this._attach(ws).name, now);
    }
    if (!this._alarmArmed) {
      this._alarmArmed = true;
      await this.state.storage.put('hub', 1);
      if ((await this.state.storage.getAlarm()) == null) await this.state.storage.setAlarm(now + ACCOUNT_SWEEP_MS);
      await this._sdArm(now);
      await this._heraldArm(now);
    }
    let a = this._attach(ws);
    if (a.id !== m.id) return;
    const had = await this._acct(me);
    // Use `a.name`, the name `_named` decided, never the name the frame asked for;
    // this record is durable.
    let rec = { ...(had ?? newAcct(a.name, now)), name: a.name, seen: now };
    let party = null;
    if (rec.party) {
      party = await this._livingParty(rec.party, now);
      if (!party || !party.members.includes(me)) { rec.party = null; party = null; }
      else if (party.away?.[me] != null) { const away = { ...party.away }; delete away[me]; party = { ...party, away }; await this._putParty(party); }
    }
    if (!had || had.name !== rec.name || had.party !== rec.party || !(now - (had.seen ?? 0) < ACCT_SEEN_WRITE_MS)) await this._putAcct(me, rec);
    else this._keepRec(me, { ...rec, seen: had.seen });
    a = this._attach(ws);
    if (a.id !== m.id || !this._setAttach(ws, { ...a, acct: me, party: rec.party })) return;
    await this._sayState(me, rec, now, ws);
    if (me !== m.acct && !m.ps) this._sayError(ws, 'update the game to see your friends and party');
    this._sayPresence(me, rec, now);
    if (party) await this._sayParty(party, now);
  }
  async _mergeLegacy(me, m, name, now) {
    const old = m.acct;
    const held = await this._asecretOf(old);
    if (!held || held !== m.asecret) return;
    const legacy = await this._acct(old);
    const swap = (id) => (id === old ? me : id);
    const ids = (l, drop) => [...new Set((l ?? []).map(swap))].filter((id) => id !== drop);
    const rows = (l, drop, cap) => { const seen = new Set(); const out = []; for (const e of l ?? []) { const id = swap(e?.acct); if (id === drop || seen.has(id)) continue; seen.add(id); out.push({ ...e, acct: id }); } return out.slice(-cap); };
    const puts = {};
    if (legacy) {
      const mine = (await this._acct(me)) ?? newAcct(name, now);
      const friends = ids([...mine.friends, ...legacy.friends], me).slice(0, FRIENDS_MAX);
      const fr = new Set(friends);
      puts[me] = { ...mine, friends,
        in: rows([...mine.in, ...legacy.in], me, PENDING_MAX).filter((e) => !fr.has(e.acct)),
        out: rows([...mine.out, ...legacy.out], me, PENDING_MAX).filter((e) => !fr.has(e.acct)) };
      const named = await this._accts([...legacy.friends, ...legacy.in.map((e) => e.acct), ...legacy.out.map((e) => e.acct)]);
      const myIn = new Set(puts[me].in.map((e) => e.acct)), myOut = new Set(puts[me].out.map((e) => e.acct));
      for (const [id, r] of named) if (id !== me) { const f = ids(r.friends, id).filter((x) => x !== me || fr.has(id)), rf = new Set(f); puts[id] = { ...r, friends: f, in: rows(r.in, id, PENDING_MAX).filter((e) => !rf.has(e.acct) && (e.acct !== me || myOut.has(id))), out: rows(r.out, id, PENDING_MAX).filter((e) => !rf.has(e.acct) && (e.acct !== me || myIn.has(id))) }; }
      const all = Object.entries(puts);
      for (let i = 0; i < all.length; i += 128) await this._putAccts(Object.fromEntries(all.slice(i, i + 128)));
    }
    this._recs.set(old, null);
    this._asecrets.set(old, null);
    await this.state.storage.delete([acctKey(old), acctSecretKey(old)]);
    for (const [id, r] of Object.entries(puts)) if (id !== me) await this._sayState(id, r, now);
  }
  async _retireForged(me, now) {
    if ((await this._asecretOf(me)) == null) return;
    const forged = await this._acct(me);
    const puts = {};
    if (forged) {
      const named = await this._accts([...(forged.friends ?? []), ...(forged.in ?? []).map((e) => e.acct), ...(forged.out ?? []).map((e) => e.acct)]);
      for (const [id, r] of named) if (id !== me) puts[id] = { ...r, friends: r.friends.filter((x) => x !== me), in: r.in.filter((e) => e.acct !== me), out: r.out.filter((e) => e.acct !== me) };
      const all = Object.entries(puts);
      for (let i = 0; i < all.length; i += 128) await this._putAccts(Object.fromEntries(all.slice(i, i + 128)));
    }
    this._recs.set(me, null);
    this._asecrets.set(me, null);
    await this.state.storage.delete([acctKey(me), acctSecretKey(me)]);
    for (const [id, r] of Object.entries(puts)) await this._sayState(id, r, now);
  }
  async _leaveAccount(ws, a, now) {
    const rec = await this._acct(a.acct);
    if (!rec) return;
    const gone = this._socketsOf(a.acct, ws).length === 0;
    let next = gone ? { ...rec, seen: now } : rec;
    let party = next.party ? await this._livingParty(next.party, now) : null;
    if (party && !party.members.includes(a.acct)) party = null;
    if (gone && party && party.members.length === 1 && !(party.invites ?? []).some((i) => now - i.at < INVITE_TTL_MS)) { await this._delParty(party.id); party = null; next = { ...next, party: null }; }
    if (gone) await this._putAcct(a.acct, next);
    this._sayPresence(a.acct, next, now, ws);
    if (!party) return;
    if (gone) { party = { ...party, away: { ...(party.away ?? {}), [a.acct]: now } }; await this._putParty(party); }
    await this._sayParty(party, now, ws);
  }
}
