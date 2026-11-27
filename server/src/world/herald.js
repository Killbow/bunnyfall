import { heraldWebhook, heraldRole, HERALD_TIMEOUT_MS, gateSiteDayOk, foldGateSite, heraldOmenDue, heraldFellLive, agreedGateSite, HERALD_RETRY_MS, ritePost, fellPost, omenPost } from '../../../src/net/gateHerald.js';
import { relayCfgValue } from '../../../src/net/relayCfg.js';
import { heraldThread, HERALD_FAMILIES, heraldPostUrl } from '../../../src/net/herald/heraldCard.js';
import { serpentHeraldRole, serpentSiteDayOk, serpentHeraldOmenDue, serpentHeraldKill, serpentFellPost, agreedSerpentSite, serpentOmenPost } from '../../../src/net/serpentHerald.js';
import { ketchHeraldRole, readKetchHeraldState, ketchHeraldDue, ketchHeraldPost } from '../../../src/net/ketch/ketchHerald.js';
import { riteStands } from '../../../src/net/gateRite.js';
import { riteCirclesBy, riteNames } from './riteKeys.js';
import { readSdHeraldState, sdHeraldDue, sdHeraldPost } from '../../../src/net/sdHerald.js';
import { validEgHeraldTell, readEgHeraldState, EG_HERALD_KEY, egHeraldFold, egHeraldNext, egHeraldPost } from '../../../src/net/eliteGates/egHerald.js';
import { json } from '../room/json.js';

export class HeraldPart {
  _heraldOf() {
    // Rebuilt when `_relayCfg` is a new object, so replace the settings, never edit them in place.
    if (this._herald === undefined || this._heraldCfg !== this._relayCfg) {
      this._heraldCfg = this._relayCfg;
      const hook = heraldWebhook(this.env?.GATE_DISCORD_WEBHOOK);
      if (!hook && this.env?.GATE_DISCORD_WEBHOOK) console.warn('[herald] GATE_DISCORD_WEBHOOK is not a Discord webhook\'s URL - nothing is posted');
      const cfg = this._relayCfg, role = (k) => relayCfgValue(cfg, this.env, k);
      const gateThread = heraldThread(role('gateThread'));
      const threads = Object.fromEntries(Object.entries(HERALD_FAMILIES).map(([f, F]) => [f, heraldThread(role(F.thread)) ?? gateThread]));
      if (hook) for (const F of Object.values(HERALD_FAMILIES)) if (String(role(F.thread) ?? '').trim() && !heraldThread(role(F.thread))) console.warn(`[herald] ${F.thread} is not a Discord thread's id - its posts go to the gate's thread, else the channel`);
      this._herald = hook ? { hook, threads, role: heraldRole(role('gateRole')), serpentRole: serpentHeraldRole(role('serpentRole'), role('gateRole')), sdRole: serpentHeraldRole(role('sdRole'), role('gateRole')), ktRole: ketchHeraldRole(role('ktRole'), role('gateRole')) } : null;
    }
    return this._herald;
  }
  async _heraldSend(body, family) {
    const h = this._heraldOf();
    if (!h) return false;
    const thread = h.threads?.[family] ?? null;
    const post = (url) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(HERALD_TIMEOUT_MS) });
    const forGood = (status) => status >= 400 && status < 500 && status !== 429;
    const why = async (res) => { try { return String(await res.text?.() ?? '').slice(0, 200); } catch { return ''; } };
    try {
      let res = await post(heraldPostUrl(h.hook, thread));
      if (!res.ok && thread && forGood(res.status)) {
        console.warn(`[herald] Discord refused the ${family} post in thread ${thread} (${res.status} ${await why(res)}) - posted to the channel instead`);
        res = await post(h.hook);
      }
      if (res.ok) return true;
      console.warn(`[herald] Discord said ${res.status} to the ${family} post`, await why(res));
      return forGood(res.status);
    } catch (e) { console.warn(`[herald] the ${family} post failed`, e?.message ?? e); return false; }
  }
  async _heraldState() {
    const v = await this.state.storage.get('herald');
    return { omen: Number.isSafeInteger(v?.omen) ? v.omen : -1, fell: Number.isSafeInteger(v?.fell) ? v.fell : -1, owe: v?.owe && typeof v.owe === 'object' ? v.owe : null,
      rite: Number.isSafeInteger(v?.rite) ? v.rite : -1, riteOwe: v?.riteOwe && typeof v.riteOwe === 'object' ? v.riteOwe : null };
  }
  async _gateSiteOf() {
    if (this._gateSiteRec === undefined) this._gateSiteRec = (await this.state.storage.get('gatesite')) ?? null;
    return this._gateSiteRec;
  }
  async _gateSite(sub, m, now) {
    if (!gateSiteDayOk(m.d, now)) return;
    const had = await this._gateSiteOf();
    const rec = foldGateSite(had, m.d, sub, m.px, m.py, m.pl);
    if (rec === had) return;
    await this.state.storage.put('gatesite', rec);
    this._gateSiteRec = rec;
  }
  _heraldNextAt(st, now) {
    if (st.owe || st.riteOwe) return now;
    const due = heraldOmenDue(now, st.omen);
    return due ? due.at : null;
  }
  async _hubArm(at) {
    const had = await this.state.storage.getAlarm();
    if (had == null || had > at) await this.state.storage.setAlarm(at);
  }
  async _heraldArm(now) {
    if (!this._heraldOf()) return;
    const at = this._heraldNextAt(await this._heraldState(), now);
    if (at != null) await this._hubArm(at);
    await this._serpentHeraldArm(now);
    await this._sdHeraldArm(now);
    await this._ktHeraldArm(now);
  }
  async _heraldOwe(fell, now) {
    if (!this._heraldOf() || !heraldFellLive(fell.d, now)) return;
    const st = await this._heraldState();
    if (st.fell >= fell.d || st.owe?.d === fell.d) return;
    st.owe = { d: fell.d, top: fell.top, n: fell.n, ...(fell.cs > 1 ? { w: fell.w, cs: fell.cs } : {}) };
    await this.state.storage.put({ herald: st, hub: 1 });
    await this._hubArm(now);
  }
  async _heraldRiteOwe(d, now) {
    if (!this._heraldOf() || !riteStands(d, now, await this._fellAtOf(d))) return;
    const st = await this._heraldState();
    if (st.rite >= d || st.riteOwe?.d === d) return;
    st.riteOwe = { d };
    await this.state.storage.put({ herald: st, hub: 1 });
    await this._hubArm(now);
  }
  async _heraldBeat(now) {
    const h = this._heraldOf();
    if (!h) return;
    try {
      const st = await this._heraldState();
      const was = JSON.stringify(st), read = st.owe, readRite = st.riteOwe;
      let retry = null;
      if (st.riteOwe && (st.riteOwe.d <= st.rite || !riteStands(st.riteOwe.d, now, await this._fellAtOf(st.riteOwe.d)))) st.riteOwe = null;
      if (st.riteOwe) {
        const site = agreedGateSite(await this._gateSiteOf(), st.riteOwe.d);
        const c = riteCirclesBy(await this._riteOf(), st.riteOwe.d, site)[0] ?? null;
        if (!c) retry = now + HERALD_RETRY_MS;
        else if (await this._heraldSend(ritePost({ day: st.riteOwe.d, place: site?.pl ?? null, by: riteNames(c), n: Object.keys(c.h).length }), 'gate')) { st.rite = st.riteOwe.d; st.riteOwe = null; }
        else retry = now + HERALD_RETRY_MS;
      }
      if (st.owe && (st.owe.d <= st.fell || !heraldFellLive(st.owe.d, now))) st.owe = null;
      if (st.owe) {
        const site = agreedGateSite(await this._gateSiteOf(), st.owe.d);
        if (await this._heraldSend(fellPost({ day: st.owe.d, place: site?.pl ?? null, top: st.owe.top, n: st.owe.n, w: st.owe.w, cs: st.owe.cs }), 'gate')) { st.fell = st.owe.d; st.owe = null; }
        else retry = now + HERALD_RETRY_MS;
      }
      const due = heraldOmenDue(now, st.omen);
      if (due && due.at <= now) {
        const site = agreedGateSite(await this._gateSiteOf(), due.day);
        if (await this._heraldSend(omenPost({ day: due.day, place: site?.pl ?? null, role: h.role }), 'gate')) st.omen = due.day;
        else retry = now + HERALD_RETRY_MS;
      }
      if (JSON.stringify(st) !== was) {
        // Merge into storage as it is now; a kill or rite owed during the webhook awaits must stay.
        const cur = await this._heraldState();
        st.omen = Math.max(st.omen, cur.omen); st.fell = Math.max(st.fell, cur.fell); st.rite = Math.max(st.rite, cur.rite);
        if (cur.owe && cur.owe.d !== read?.d && cur.owe.d > st.fell) st.owe = cur.owe;
        if (cur.riteOwe && cur.riteOwe.d !== readRite?.d && cur.riteOwe.d > st.rite) st.riteOwe = cur.riteOwe;
        await this.state.storage.put('herald', st);
      }
      const owed = st.owe || st.riteOwe ? null : heraldOmenDue(now, st.omen);
      const next = [retry, owed && owed.at > now ? owed.at : null].filter((x) => x != null);
      if (next.length) await this._hubArm(Math.min(...next));
    } catch (e) { console.warn('[herald] beat failed', e?.message ?? e); await this._hubArm(now + HERALD_RETRY_MS); }
  }
  async _serpentSiteOf() {
    if (this._serpentSiteRec === undefined) this._serpentSiteRec = (await this.state.storage.get('serpentsite')) ?? null;
    return this._serpentSiteRec;
  }
  async _serpentSite(sub, m, now) {
    if (!serpentSiteDayOk(m.d, now)) return;
    const had = await this._serpentSiteOf();
    const rec = foldGateSite(had, m.d, sub, m.sx, m.sz, m.pl);
    if (rec === had) return;
    await this.state.storage.put('serpentsite', rec);
    this._serpentSiteRec = rec;
  }
  async _serpentHeraldState() {
    const v = await this.state.storage.get('sherald');
    return { omen: Number.isSafeInteger(v?.omen) ? v.omen : -1, fell: Number.isSafeInteger(v?.fell) ? v.fell : -1 };
  }
  async _serpentHeraldArm(now) {
    const bells = serpentHeraldOmenDue(now, (await this._serpentHeraldState()).omen);
    if (bells) await this._hubArm(bells.at);
  }
  async _serpentHeraldBeat(now) {
    const h = this._heraldOf();
    if (!h) return;
    try {
      const st = await this._serpentHeraldState();
      const was = JSON.stringify(st);
      let retry = null;
      const rec = await this._serpentSiteOf();
      const kill = serpentHeraldKill(await this._serpentFellsOf(), rec, st.fell, now);
      if (kill?.wait) retry = now + HERALD_RETRY_MS;
      else if (kill) { if (await this._heraldSend(serpentFellPost(kill), 'serpent')) st.fell = kill.day; else retry = now + HERALD_RETRY_MS; }
      const due = serpentHeraldOmenDue(now, st.omen);
      if (due && due.at <= now) {
        const site = agreedSerpentSite(rec, due.day);
        if (await this._heraldSend(serpentOmenPost({ day: due.day, place: site?.place ?? null, role: h.serpentRole }), 'serpent')) st.omen = due.day;
        else retry = now + HERALD_RETRY_MS;
      }
      if (JSON.stringify(st) !== was) await this.state.storage.put('sherald', st);
      const owed = serpentHeraldOmenDue(now, st.omen);
      const next = [retry, owed && owed.at > now ? owed.at : null].filter((x) => x != null);
      if (next.length) await this._hubArm(Math.min(...next));
    } catch (e) { console.warn('[herald] serpent beat failed', e?.message ?? e); await this._hubArm(now + HERALD_RETRY_MS); }
  }
  async _sdHeraldState() {
    return readSdHeraldState(await this.state.storage.get('sdherald'));
  }
  async _sdHeraldArm(now) {
    if (!this._heraldOf()) return;
    if (sdHeraldDue(await this._sdOf(), await this._sdHeraldState(), now).kind) await this._hubArm(now);
  }
  async _sdHeraldBeat(now) {
    const h = this._heraldOf();
    if (!h) return;
    try {
      let st = await this._sdHeraldState();
      const was = JSON.stringify(st);
      let retry = null;
      for (let step = 0; step < 3; step++) {
        const rec = await this._sdOf();
        const due = sdHeraldDue(rec, st, now);
        st = due.st;
        if (!due.kind) break;
        if (!(await this._heraldSend(sdHeraldPost(due.kind, rec, h.sdRole), 'abyss'))) { retry = now + HERALD_RETRY_MS; break; }
        st[due.kind === 'fell' || due.kind === 'fade' ? 'end' : due.kind] = rec.s;
      }
      if (JSON.stringify(st) !== was) await this.state.storage.put('sdherald', st);
      if (retry != null) await this._hubArm(retry);
    } catch (e) { console.warn('[herald] abyss beat failed', e?.message ?? e); await this._hubArm(now + HERALD_RETRY_MS); }
  }
  async _ktHeraldState() {
    return readKetchHeraldState(await this.state.storage.get('ktherald'));
  }
  async _ktHeraldArm(now) {
    if (!this._heraldOf()) return;
    const due = ketchHeraldDue(now, await this._ktHeraldState());
    if (due) await this._hubArm(due.at);
  }
  async _ktHeraldBeat(now) {
    const h = this._heraldOf();
    if (!h) return;
    try {
      let st = await this._ktHeraldState();
      const was = JSON.stringify(st);
      let retry = null;
      for (let step = 0; step < 3; step++) {
        const due = ketchHeraldDue(now, st);
        if (!due || due.at > now) break;
        if (!(await this._heraldSend(ketchHeraldPost(due.n, due.k, h.ktRole), 'ketch'))) { retry = now + HERALD_RETRY_MS; break; }
        st = { n: due.n, k: due.i };
      }
      if (JSON.stringify(st) !== was) await this.state.storage.put('ktherald', st);
      const owed = ketchHeraldDue(now, st);
      const next = [retry, owed && owed.at > now ? owed.at : null].filter((x) => x != null);
      if (next.length) await this._hubArm(Math.min(...next));
    } catch (e) { console.warn('[herald] ketch beat failed', e?.message ?? e); await this._hubArm(now + HERALD_RETRY_MS); }
  }
  async _egHeraldInternal(request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const tell = validEgHeraldTell(body);
    if (!tell) return json({ ok: false }, 400);
    const now = Date.now(), herald = !!this._heraldOf();
    const had = readEgHeraldState(await this.state.storage.get(EG_HERALD_KEY));
    const st = egHeraldFold(had, tell, { nowMs: now, post: herald });
    await this.state.storage.put({ [EG_HERALD_KEY]: st, hub: 1 });
    if (herald && st.n > had.n) await this._hubArm(now);
    return json({ ok: true });
  }
  async _egHeraldBeat(now) {
    if (!this._heraldOf()) return;
    try {
      const done = new Set();
      let retry = null;
      for (;;) {
        const { p, gone } = egHeraldNext(readEgHeraldState(await this.state.storage.get(EG_HERALD_KEY)), done, now);
        for (const i of gone) done.add(i);
        if (!p) break;
        if (!(await this._heraldSend(egHeraldPost(p), 'spire'))) { retry = now + HERALD_RETRY_MS; break; }
        done.add(p.i);
      }
      if (done.size) {
        const cur = readEgHeraldState(await this.state.storage.get(EG_HERALD_KEY));
        await this.state.storage.put(EG_HERALD_KEY, { ...cur, q: cur.q.filter((p) => !done.has(p.i)) });
      }
      if (retry !== null) await this._hubArm(retry);
    } catch (e) { console.warn('[herald] spire beat failed', e?.message ?? e); await this._hubArm(now + HERALD_RETRY_MS); }
  }
}
