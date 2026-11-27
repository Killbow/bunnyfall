import { KT_VOYAGE_KEY, validKetchIn, ketchRelayGate, KT_BRAIN_MIN, KT_TELL_RETRY_MS, KT_INTERNAL_RC, validKtRcTell, ketchReceiptKey } from '../../../src/net/wire.js';
import { newVoyage, KT_POSE_FRESH_MS, joinVoyage, idlePlaces, freePlace, voyageStateOf, voyageWord, stampFightFall, dropCell, stepVoyage, voyageLive, voyageEarners, fightBodyOf } from '../../../src/net/ketch/ketchBrain.js';
import { CHECKPOINT_MS, BRAIN_TICK_MS, earnedBy } from '../../../src/net/gateBrain.js';
import { dungeonToDeck } from '../../../src/net/ketch/ketchDeck.js';
import { KT_TEXT, ketchRoomOf, ketchAdmits, isKetchRoom, ketchHolds, ketchVoyageOf, ketchVoyageAt } from '../../../src/net/ketch/ketchLaw.js';
import { isStaff } from '../../../src/net/staffCommands.js';
import { instanceOwnerOf } from '../../../src/net/instanceRoom.js';
import { bodyWordRelayGate, isSocialRoom, SOCIAL_ROOM } from '../relay.js';
import { bodySaid, bodyOut, bodyLife, bodyCensus } from '../../../src/net/bossBody.js';
import { rand01, rand32 } from '../room/dice.js';
import { KT_RECEIPT_TTL_S, mintKetchReceipt, readKetchReceipt } from '../../../src/net/ketch/ketchReceipt.js';
import { judgeVoyage } from '../../../src/net/ketch/ketchJudge.js';
import { KETCH_SEAM } from '../../../src/net/ketch/ketchWarden.js';
import { json } from '../room/json.js';

export class KetchPart {
  async _ktOf(key) {
    if (this._kt === undefined || (this._kt && this._kt.key !== key)) {
      const v = await this.state.storage.get(KT_VOYAGE_KEY);
      this._kt = v && typeof v === 'object' && v.key === key ? v : newVoyage(key, Date.now());
    }
    return this._kt;
  }
  async _ktSave(V, now, force) {
    if (!force && now - (this._ktSavedAt ?? 0) < CHECKPOINT_MS) return;
    this._ktSavedAt = now;
    await this.state.storage.put(KT_VOYAGE_KEY, V);
  }
  async _ktArm(now) {
    const at = await this.state.storage.getAlarm();
    if (at == null || at > now + BRAIN_TICK_MS) await this.state.storage.setAlarm(now + BRAIN_TICK_MS);
  }
  _ktPoseOf(p) { const [x, y, z] = dungeonToDeck(p.x, p.y ?? 0, p.z); return { x, y, z, dead: !!p.dd }; }
  _ktBodies(V, now) {
    const newest = new Map();
    for (const [ws, b] of this._all()) {
      if (!b.id || !b.sub || !b.pose || !V.players[b.sub] || now - (b.pAt ?? b.since ?? 0) > KT_POSE_FRESH_MS) continue;
      const had = newest.get(b.sub);
      if (!had || (b.since ?? 0) >= (had[1].since ?? 0)) newest.set(b.sub, [ws, b]);
    }
    return [...newest.values()].map(([ws, b]) => { const p = this._ktPoseOf(b.pose), rz = V.players[b.sub]?.rzAt; return { sub: b.sub, x: p.x, y: p.y, z: p.z, dead: p.dead && !(Number.isFinite(rz) && (b.pAt ?? b.since ?? 0) <= rz), tr: this._trailOf(ws, (q) => this._ktPoseOf(q)) }; });
  }
  _ktFan(frames) {
    if (!frames.length) return;
    const all = [];
    for (const fr of frames) {
      if (fr.to == null) { all.push(JSON.stringify({ t: 'kt', ...fr })); continue; }
      if (all.length) this._fanFrames(all.splice(0), (b) => b.id);
      const { to, ...word } = fr, w = JSON.stringify({ t: 'kt', ...word });
      for (const [ws, b] of [...this._all()]) if (b.id && b.sub === to) this._send(ws, w);
    }
    if (all.length) this._fanFrames(all, (b) => b.id);
  }
  async _ktHello(key, who, now) {
    if (!who?.subject) return { w: KT_TEXT.refuse.crew };
    if (!(await this._battleHelloGate(who.subject, 'fighter', now)).pass) return { w: 'busy', busy: true };
    if (who.hid) return null;
    const V = await this._ktOf(key), r = ketchRoomOf(key);
    let right = null;
    if (!V.players[who.subject]) {
      right = isStaff(who.glyphs) ? 'staff' : (await instanceOwnerOf(who.subject)) === r?.owner ? 'owner' : null;
      if (!right) { const kin = await this._instanceKinOf(who.subject, r?.owner ?? '', now); if (kin == null) return { w: 'busy', busy: true }; right = kin ? 'party' : null; }
    }
    let no = ketchAdmits(key, who.subject, right, V.crew, now);
    if (no === 'full' && r && (await this._ktFreePlace(V, r.owner, now))) no = ketchAdmits(key, who.subject, right, V.crew, now);
    if (no) return { w: KT_TEXT.refuse[no] ?? KT_TEXT.refuse.crew };
    const fresh = joinVoyage(V, who.subject, who.name ?? '', Number.isSafeInteger(who.cl) ? who.cl : 1, now);
    await this._ktSave(V, now, fresh);
    await this._ktArm(now);
    return null;
  }
  async _ktFreePlace(V, owner, now) {
    const present = new Set([...this._all()].filter(([, b]) => b.id && b.sub).map(([, b]) => b.sub));
    for (const sub of idlePlaces(V, present, now)) {
      if ((await instanceOwnerOf(sub)) === owner || (await this._instanceKinOf(sub, owner, now)) !== false) continue;
      this._ktFan([...freePlace(V, sub, now), voyageStateOf(V, now)]);
      return true;
    }
    return false;
  }
  async _ktWelcome(ws, sub, key, now) {
    const V = await this._ktOf(key);
    if (!this._send(ws, JSON.stringify({ t: 'kt', ...voyageStateOf(V, now) }))) return false;
    const r = sub ? V.rc?.[sub] : null;
    return !r || this._send(ws, JSON.stringify({ t: 'kt', k: 'rcpt', r }));
  }
  async _ktFrameIn(ws, a, m) {
    const now = Date.now();
    const w = validKetchIn(m);
    if (!w) { this._junk(ws); return; }
    if (w.k === 'vt' ? !this._spend(ws, now, bodyWordRelayGate, 'bodyBucket', 'bodyDrops', 'too many body words') : !this._spend(ws, now, ketchRelayGate, 'ktBucket', 'ktDrops', 'too many ketch words')) return;
    if (w.k === 'spent') {
      if (!isSocialRoom(a.key) || typeof a.sub !== 'string' || !a.sub) { this._junk(ws); return; }
      try { await this._ktSpent(a.sub, w.n, now); } catch (e) { console.warn('[hub] kt spent failed', e?.message ?? e); }
      return;
    }
    if (!isKetchRoom(a.key) || typeof a.sub !== 'string' || !a.sub) { this._junk(ws); return; }
    try { await this._ktWord(ws, a, w, now); } catch (e) { console.warn('[kt] word failed', e?.message ?? e); }
  }
  async _ktWord(ws, a, w, now) {
    const V = await this._ktOf(a.key);
    const p = V.players[a.sub];
    if (!p) { this._junk(ws); return; }
    if (!ketchHolds(V.n, now)) { this._send(ws, JSON.stringify({ t: 'kt', k: 'no', m: 0 })); return; }
    const line = this._bodyLine();
    if (w.k === 'vt') { bodySaid(p, w.v / 1000, now, line.body, { enforce: line.enforce }); return; }
    if (w.k === 'in' && !(w.bv >= KT_BRAIN_MIN)) { this._send(ws, JSON.stringify({ t: 'kt', k: 'no', m: 2 })); return; }
    if (w.k === 'in' && Number.isSafeInteger(a.cl) && a.cl >= 1) w.lv = a.cl;
    const pose = a.pose && now - (a.pAt ?? a.since ?? 0) <= KT_POSE_FRESH_MS ? this._ktPoseOf(a.pose) : null;
    if (pose && bodyOut(p, line.enforce)) pose.dead = true;
    const out = voyageWord(V, a.sub, w, pose, now, rand01);
    for (const r of out) if (r.k === 'rez' && V.players[r.s]) { bodyLife(V.players[r.s], now, line.body); V.players[r.s].rzAt = now; }
    if (w.k === 'in') this._trailSeed(ws, a, now);
    this._ktFan(out);
    if (V.fell && !V.said) await this._ktFall(V, now);
    await this._ktSave(V, now, out.length > 0 && w.k !== 'hit' && w.k !== 'drop' && w.k !== 'hurt');
    await this._ktArm(now);
  }
  async _ktTick() {
    let key = this._kt?.key ?? [...this._all()].map(([, b]) => b.key).find((k) => isKetchRoom(k));
    if (!key && !this._ktNone) {
      const v = await this.state.storage.get(KT_VOYAGE_KEY);
      if (v && typeof v === 'object' && isKetchRoom(v.key)) key = v.key; else this._ktNone = true;
    }
    if (!key || !isKetchRoom(key)) return false;
    const V = await this._ktOf(key), now = Date.now();
    if (now >= ketchVoyageOf(V.n).endAt) {
      for (const [ws, b] of [...this._all()]) if (b.id) this._refuse(ws, KT_TEXT.refuse.gone);
      if (V.said && !V.told) await this._ktTellHub(V, now);
      if (V.said && !V.told && now < ketchVoyageOf(V.n).endAt + KT_RECEIPT_TTL_S * 1000) { await this.state.storage.setAlarm(now + KT_TELL_RETRY_MS); return true; }
      await this.state.storage.delete(KT_VOYAGE_KEY);
      this._kt = undefined;
      return false;
    }
    try {
      const line = this._bodyLine(), census = bodyCensus(V, this._ktBodies(V, now), now, line.body, line.enforce);
      const { hits, struck } = judgeVoyage(V, census, now);
      if (V.wf) hits.push(...KETCH_SEAM.judge(V.wf, census, now));
      await this._bodyCount('kt', V, hits, now, line.body);
      stampFightFall(V);
      this._bodyTell('kt', V, now);
      const drops = [], sg = V.sg;
      for (const sub of new Set([...struck, ...hits.map((h) => h.sub)])) if (V.cells.carry[sub]) dropCell(V, sub, census.find((b) => b.sub === sub) ?? null, now, 'struck', drops);
      this._ktFan(drops);
      this._ktFan(stepVoyage(V, now, this._bodiesBare(census), rand01));
      if (V.fell && !V.said) await this._ktFall(V, now);
      else if (V.said && !V.told) await this._ktTellHub(V, now);
      await this._ktSave(V, now, V.sg !== sg);
    } catch (e) { console.warn('[kt] beat failed', e?.message ?? e); }
    const here = [...this._all()].some(([, b]) => b.id);
    if (here && voyageLive(V)) { await this.state.storage.setAlarm(now + BRAIN_TICK_MS); return true; }
    await this.state.storage.setAlarm(V.said && !V.told ? now + KT_TELL_RETRY_MS : ketchVoyageOf(V.n).endAt);
    return false;
  }
  async _ktFall(V, now) {
    if (this._ktFalling) return this._ktFalling;
    this._ktFalling = (async () => {
      if (V.said) return;
      const key = await this._receiptKeyOf(), nowS = Math.floor(now / 1000), f = V.wf;
      V.rc = {};
      for (const sub of voyageEarners(V)) {
        try { V.rc[sub] = await mintKetchReceipt({ d: V.n, o: V.owner, s: sub, c: rand32(), x: earnedBy(f, sub), l: f.players[sub].lv, ...this._bodyMeasureOf({ ...f, players: { ...f.players, [sub]: { ...f.players[sub], bd: fightBodyOf(V, sub) } } }, sub, KETCH_SEAM.earned) }, key, { subtle: crypto.subtle, nowS }); }
        catch (e) { console.warn('[kt] receipt refused', e?.message ?? e); }
      }
      V.said = true;
      await this._ktSave(V, now, true);
      for (const [ws, b] of [...this._all()]) { const r = b.id && b.sub ? V.rc[b.sub] : null; if (r) this._send(ws, JSON.stringify({ t: 'kt', k: 'rcpt', r })); }
      await this._ktTellHub(V, now);
    })().finally(() => { this._ktFalling = null; });
    return this._ktFalling;
  }
  async _ktTellHub(V, now) {
    if (V.told || !V.said) return;
    if (this._ktTelling) return this._ktTelling;
    this._ktTelling = (async () => {
      const rooms = this.env?.ROOMS;
      let ok = !rooms?.idFromName || !rooms?.get || !Object.keys(V.rc ?? {}).length;
      if (!ok) {
        try {
          const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${KT_INTERNAL_RC}`, { method: 'POST', body: JSON.stringify({ n: V.n, rc: Object.entries(V.rc) }), signal: AbortSignal.timeout(KT_TELL_RETRY_MS) }));
          ok = !!res && (res.ok || (res.status >= 400 && res.status < 500));
        } catch (e) { console.warn('[kt] hub', e?.message ?? e); }
      }
      if (!ok) return;
      V.told = true;
      await this._ktSave(V, now, true);
    })().finally(() => { this._ktTelling = null; });
    return this._ktTelling;
  }
  async _ktRcInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const c = validKtRcTell(body);
    if (!c) return json({ ok: false }, 400);
    const keep = [];
    for (const [sub, r] of c.rc) { const cl = readKetchReceipt(r); if (cl && cl.s === sub && cl.d === c.n) keep.push([sub, { n: c.n, r, e: cl.e }]); }
    if (!keep.length) return json({ ok: true });
    this._noKtRcpt.clear();
    const had = await this.state.storage.get(keep.map(([sub]) => ketchReceiptKey(sub)));
    const fresh = keep.filter(([sub]) => { const v = had.get(ketchReceiptKey(sub)); return !(v && typeof v === 'object' && Number.isSafeInteger(v.n) && (v.n > c.n || (v.n === c.n && (v.spent || v.r)))); });
    if (fresh.length) await this.state.storage.put(Object.fromEntries(fresh.map(([sub, v]) => [ketchReceiptKey(sub), v])));
    const owed = new Map(fresh);
    for (const [sub, [ws]] of this._siegeSockets()) if (owed.has(sub)) this._send(ws, JSON.stringify({ t: 'kt', k: 'rcpt', r: owed.get(sub).r }));
    return json({ ok: true });
  }
  async _ktReceiptTo(ws, sub, now) {
    if (this._noKtRcpt.has(sub)) return;
    const k = ketchReceiptKey(sub), v = await this.state.storage.get(k);
    if (!v || typeof v !== 'object') { this._noKtRcpt.set(sub, 1); return; }
    const gone = !(Number.isFinite(v.e) && v.e * 1000 > now) || (v.spent !== true && typeof v.r !== 'string');
    if (gone) { await this.state.storage.delete(k); return; }
    if (v.spent === true) return;
    this._send(ws, JSON.stringify({ t: 'kt', k: 'rcpt', r: v.r }));
  }
  async _ktSpent(sub, n, now) {
    if (!(n <= ketchVoyageAt(now).n)) return;
    const k = ketchReceiptKey(sub), v = await this.state.storage.get(k);
    if (v && typeof v === 'object' && Number.isSafeInteger(v.n) && (v.n > n || (v.n === n && v.spent === true))) return;
    this._noKtRcpt.delete(sub);
    await this.state.storage.put(k, { n, spent: true, e: Math.floor(now / 1000) + KT_RECEIPT_TTL_S });
  }
}
