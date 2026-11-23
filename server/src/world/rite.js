// The rite of the faithful at a breach: words at the circle, the cell ledger, and the hub told.
// It answers a broken rite and the rite of the day, and asks the hub ahead for who broke it.
import { junkOutsideCover } from '../cellNodes.js';
import { worldRoom, RITE_CIRCLES_MAX, sanitizeName, RITE_KEY, RITE_TELL_RETRY_MS, SOCIAL_ROOM, RITE_INTERNAL_BROKEN, validRiteOut, RITE_HUB_CIRCLES_MAX, RITE_ASK_TIMEOUT_MS, RITE_INTERNAL_DAY, RITE_ASK_EVERY_MS } from '../relay.js';
import { isGateDay, gateTimes } from '../../../src/net/gateLaw.js';
import { riteHeard, riteNear, RITE_HELPERS_MAX, riteStands, cageStands } from '../../../src/net/gateRite.js';
import { riteRecordOk, riteOwed, riteSaid, cageSaid, riteHelpersBy } from './riteKeys.js';
import { json } from '../room/json.js';
import { agreedGateSite } from '../../../src/net/gateHerald.js';

export class RitePart {
  async _riteWord(ws, a, m, now) {
    if (junkOutsideCover(this, ws, a, worldRoom(m.px, m.py))) return;
    if (!isGateDay(m.d) || !riteHeard(m.d, now)) return;
    if (a.ly) return;
    if (!a.pose || !riteNear(m.d, m.px, m.py, a.pose.x, a.pose.z)) return;
    if (typeof a.sub !== 'string' || !a.sub) return;
    const led = await this._riteLedgerOf(m.d);
    if (!led) return;
    const k = `${m.px},${m.py}`;
    let c = led.c[k];
    if (!c) {
      if (Object.keys(led.c).length >= RITE_CIRCLES_MAX) return;
      c = led.c[k] = { px: m.px, py: m.py, h: {}, f: 0, at: 0, told: -1 };
    }
    let moved = false;
    if (m.s === 1 && !Object.hasOwn(c.h, a.sub) && Object.keys(c.h).length < RITE_HELPERS_MAX) { c.h[a.sub] = sanitizeName(a.name ?? ''); moved = true; }
    if (m.f === 1 && !c.f) { c.f = 1; c.at = now; moved = true; }
    if (m.c === 1 && !c.cl) { c.cl = 1; c.clAt = now; if (!c.f) { c.f = 1; c.at = now; } moved = true; }
    if (!moved) return;
    await this._riteSave(led);
    await this._riteTellHub(now);
  }
  async _riteLedgerOf(day = null) {
    if (this._riteLed === undefined) { const v = await this.state.storage.get(RITE_KEY); if (this._riteLed === undefined) this._riteLed = riteRecordOk(v) ? v : null; }
    if (day == null) return this._riteLed;
    if (this._riteLed && this._riteLed.d > day) return null;
    if (!this._riteLed || this._riteLed.d < day) this._riteLed = { d: day, c: {} };
    return this._riteLed;
  }
  async _riteSave(led) { this._riteLed = led; await this.state.storage.put(RITE_KEY, led); }
  async _riteTellHub(now) {
    const led = await this._riteLedgerOf();
    const owed = led ? Object.values(led.c).filter(riteOwed) : [];
    if (!owed.length || !riteStands(led.d, now)) return false;
    if (this._riteTelling) { await this._riteArm(now + RITE_TELL_RETRY_MS); return true; }
    this._riteTelling = true;
    try {
      // Arm the retry before telling, so a reset mid-tell still tells the hub.
      await this._riteArm(now + RITE_TELL_RETRY_MS);
      let moved = false;
      for (const c of owed) {
        const n = Object.keys(c.h).length;
        const cl = c.cl ? 1 : 0;
        if (await this._riteTellHubOf({ d: led.d, px: c.px, py: c.py, at: c.at, h: Object.entries(c.h), ...(cl ? { cl, clAt: c.clAt } : {}) })) { c.told = Math.max(c.told, n); if (cl) c.clTold = 1; moved = true; }
      }
      if (moved && this._riteLed === led) await this._riteSave(led);
      return Object.values(led.c).some(riteOwed);
    } finally { this._riteTelling = false; }
  }
  async _riteArm(at) {
    try { const had = await this.state.storage.getAlarm(); if (had == null || had > at) await this.state.storage.setAlarm(at); }
    catch (e) { console.warn('[rite] arm', e?.message ?? e); }
  }
  async _riteTellHubOf(body) {
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return true;
    try { const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${RITE_INTERNAL_BROKEN}`, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(RITE_TELL_RETRY_MS) })); return !!res?.ok; }
    catch (e) { console.warn('[rite] hub', e?.message ?? e); return false; }
  }
  async _riteOf() {
    if (this._riteHub === undefined) { const v = await this.state.storage.get(RITE_KEY); if (this._riteHub === undefined) this._riteHub = riteRecordOk(v) ? v : null; }
    return this._riteHub;
  }
  async _fellAtOf(d) { const g = await this._gateFellOf(); return g && g.d === d && Number.isFinite(g.at) ? g.at : null; }
  async _riteBrokenInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const o = validRiteOut({ k: 'br', d: body?.d, px: body?.px, py: body?.py, at: body?.at, by: [] });
    if (!o) return json({ ok: false }, 400);
    const now = Date.now();
    await this._riteOf();
    const fellAt = await this._fellAtOf(o.d);
    const stands = riteStands(o.d, now, fellAt);
    if (!stands && !(body?.cl === 1 && cageStands(o.d, now))) return json({ ok: true });
    // No await between this read and setting `_riteHub`: two reports landing together
    // would each start a fresh day.
    let r = this._riteHub;
    if (r && r.d > o.d) return json({ ok: true });
    if (!r || r.d < o.d) r = { d: o.d, c: {} };
    const k = `${o.px},${o.py}`;
    let c = r.c[k];
    if (!c) {
      if (Object.keys(r.c).length >= RITE_HUB_CIRCLES_MAX) return json({ ok: true });
      c = r.c[k] = { px: o.px, py: o.py, at: o.at, h: {}, said: 0 };
    }
    for (const e of Array.isArray(body.h) ? body.h.slice(0, RITE_HELPERS_MAX) : []) {
      if (!Array.isArray(e) || typeof e[0] !== 'string' || !e[0] || e[0].length > 128) continue;
      if (Object.hasOwn(c.h, e[0]) || Object.keys(c.h).length < RITE_HELPERS_MAX) c.h[e[0]] = sanitizeName(typeof e[1] === 'string' ? e[1] : '');
    }
    const fresh = stands && !c.said;
    if (stands) c.said = 1;
    const cleared = body.cl === 1 && !c.cl;
    if (cleared) { c.cl = 1; c.clAt = Number.isSafeInteger(body.clAt) && body.clAt > 0 ? body.clAt : now; }
    this._riteHub = r;
    await this.state.storage.put(RITE_KEY, r);
    if (fresh) {
      const said = JSON.stringify({ t: 'rite', ...riteSaid(r.d, c) });
      for (const [ws, b] of [...this._all()]) if (b.id) this._send(ws, said);
      try { await this._heraldRiteOwe(r.d, now); } catch (e) { console.warn('[herald] rite not kept', e?.message ?? e); }
    }
    if (cleared) {
      const said = JSON.stringify({ t: 'rite', ...cageSaid(r.d, c) });
      for (const [ws, b] of [...this._all()]) if (b.id) this._send(ws, said);
    }
    return json({ ok: true });
  }
  async _riteDayInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const d = Number.isSafeInteger(body?.d) ? body.d : null;
    return json({ h: d == null ? [] : riteHelpersBy(await this._riteOf(), d, agreedGateSite(await this._gateSiteOf(), d)) });
  }
  async _riteHelpersOf(day, timeoutMs = RITE_ASK_TIMEOUT_MS) {
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return new Set();
    try {
      const res = await rooms.get(rooms.idFromName(SOCIAL_ROOM)).fetch(new Request(`https://relay.internal${RITE_INTERNAL_DAY}`, { method: 'POST', body: JSON.stringify({ d: day }), signal: AbortSignal.timeout(timeoutMs) }));
      const body = res?.ok ? await res.json() : null;
      return Array.isArray(body?.h) ? new Set(body.h.filter((x) => typeof x === 'string' && x).slice(0, RITE_HELPERS_MAX)) : null;
    } catch (e) { console.warn('[rite] helpers', e?.message ?? e); return null; }
  }
  _riteAskAhead(f, now) {
    if (f.fell || this._riteAsking || now < gateTimes(f.day).openAt || now - (this._riteAskedAt ?? -Infinity) < RITE_ASK_EVERY_MS) return;
    this._riteAsking = true; this._riteAskedAt = now;
    this._riteHelpersOf(f.day).then((h) => { if (h && this._fight === f && !f.said) f.helped = [...h]; }).catch(() => {}).finally(() => { this._riteAsking = false; });
  }
}
