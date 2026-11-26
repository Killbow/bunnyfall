import { PARK_TTL_MS, PARK_REFRESH_MS, parkKey, parkSameSpot, PARK_ACCOUNT_MAX, PARK_CELL_MAX, wardenVerdicts, parkSpotOf, parkRegistryRoom, PARK_INTERNAL_REG, layerOf, PARK_INTERNAL_DROP, PARK_KEY_RE, isCellRoom, layerName } from '../relay.js';
import { ROOM_CALL_MS } from '../relayScale.js';
import { cellCall } from '../cellNodes.js';
import { json } from '../room/json.js';

export class ParkPart {
  async _parkList(now) {
    this._parks ??= this.state.storage.list({ prefix: 'park:' }).then((got) => new Map(got));
    const m = await this._parks;
    const out = [], dead = [];
    for (const [k, v] of m) { if (!v || typeof v.k !== 'string' || now - (v.at ?? 0) > PARK_TTL_MS) dead.push([k, v]); else out.push(v); }
    for (const [k] of dead) m.delete(k);
    for (let i = 0; i < dead.length; i += 128) await this.state.storage.delete(dead.slice(i, i + 128).map(([k]) => k));
    for (const [, v] of dead) if (v && typeof v.k === 'string') this._parkFan({ t: 'park', k: v.k, id: v.id, data: null }, v.sub);
    return out;
  }
  _parkPublic(v) { return { k: v.k, id: v.id, name: v.name ?? '', r: v.r, at: v.at, ...(Number.isFinite(v.y) ? { y: v.y } : {}) }; }
  _parkFan(o, ownerSub) { const s = JSON.stringify(o); for (const [other, b] of [...this._all()]) if (b.id && b.sub !== ownerSub) this._send(other, s); }
  async _parkStore(k, sub, id, name, r, now) {
    const list = await this._parkList(now);
    const had = list.find((e) => e.k === k) ?? null;
    if (had && had.id === id && had.name === name && JSON.stringify(had.r) === JSON.stringify(r)) {
      if (now - (had.at ?? 0) > PARK_REFRESH_MS) { const fresh = { ...had, at: now }; (await this._parks)?.set(parkKey(k), fresh); await this.state.storage.put(parkKey(k), fresh); }
      return Number.isFinite(had.y) ? had : null;
    }
    const same = !!had && parkSameSpot(had.r, r), thrown = same && Number.isFinite(had.y);
    const byAge = (x, y) => (x.at ?? 0) - (y.at ?? 0);
    const mine = list.filter((e) => e.k !== k && e.sub === sub).sort(byAge);
    const gone = new Set();
    for (const e of mine.slice(0, Math.max(0, mine.length - PARK_ACCOUNT_MAX + 1))) { gone.add(e.k); await this._parkDrop(e.k); }
    const others = list.filter((e) => e.k !== k && !gone.has(e.k)).sort(byAge);
    for (const e of others.slice(0, Math.max(0, others.length - PARK_CELL_MAX + 1))) await this._parkDrop(e.k);
    const rec = { k, sub, id, name, r, at: now, since: same && !thrown ? (had.since ?? had.at ?? now) : now, ...(thrown ? { y: had.y } : {}) };
    (await this._parks)?.set(parkKey(k), rec);
    await this.state.storage.put(parkKey(k), rec);
    this._parkFan({ t: 'park', k, id, name, at: now, data: r, ...(thrown ? { y: had.y } : {}) }, sub);
    await this._parkWarden(now);
    return thrown ? rec : null;
  }
  // Never run the warden from the alarm: in a drained cell the alarm forgets the stored world.
  // It runs at each store, each hello, and the first frame past `_wardenAt`.
  async _parkWarden(now) {
    const list = await this._parkList(now);
    const m = await this._parks;
    const { due, next } = wardenVerdicts(list, now);
    let n = 0;
    for (const k of due) {
      const had = m.get(parkKey(k));
      if (!had || Number.isFinite(had.y)) continue;
      const rec = { ...had, y: now };
      m.set(parkKey(k), rec);
      await this.state.storage.put(parkKey(k), rec);
      this._parkFan({ t: 'park', k, id: rec.id, name: rec.name ?? '', at: rec.at, data: rec.r, y: now }, rec.sub);
      this._parkTellOwner(rec);
      n++;
    }
    this._wardenAt = next;
    return n;
  }
  _parkTellOwner(rec, only = null) {
    const from = parkSpotOf(rec.r), to = rec.r?.ly;
    if (!from || !Array.isArray(to) || !Number.isFinite(rec.y)) return;
    const s = JSON.stringify({ t: 'parkYeet', at: rec.y, from, to, k: rec.k });
    for (const [ws, b] of [...this._all()]) if ((only === null || ws === only) && b.id && b.sub === rec.sub && b.pk === rec.k) this._send(ws, s);
  }
  async _parkDrop(k, before = Infinity) {
    const had = await this.state.storage.get(parkKey(k));
    if (!had || (had.at ?? 0) > before) return;
    (await this._parks)?.delete(parkKey(k));
    await this.state.storage.delete(parkKey(k));
    this._parkFan({ t: 'park', k, id: had.id, data: null }, had.sub);
  }
  async _parkRegister(k, cell, at, ly) {
    const rooms = this.env?.ROOMS;
    if (!rooms?.idFromName || !rooms?.get) return;
    try {
      await rooms.get(rooms.idFromName(parkRegistryRoom(k))).fetch(new Request(`https://relay.internal${PARK_INTERNAL_REG}`, { method: 'POST', body: JSON.stringify({ owner: k, cell, at, ...(ly !== undefined ? { ly } : {}) }), signal: AbortSignal.timeout(ROOM_CALL_MS) }));
    } catch (e) { console.warn('[park] registry', e?.message ?? e); }
  }
  async _parkTellDrop(where, k, at) {
    const [cell, ly] = where.split('#');
    try { await cellCall(this.env, cell, layerOf(ly), PARK_INTERNAL_DROP, { owner: k, at }); }
    catch (e) { console.warn('[park] drop', e?.message ?? e); }
  }
  async _parkInternal(path, request) {
    let body = null;
    try { body = await request.json(); } catch {  }
    const k = typeof body?.owner === 'string' && PARK_KEY_RE.test(body.owner) ? body.owner : null;
    const at = Number.isFinite(body?.at) ? body.at : null;
    if (!k || at === null) return json({ ok: false }, 400);
    if (path === PARK_INTERNAL_DROP) { await this._parkDrop(k, at); return json({ ok: true }); }
    const cell = body.cell == null ? null : (isCellRoom(body.cell) ? body.cell : undefined);
    if (cell === undefined) return json({ ok: false }, 400);
    const prev = (await this.state.storage.get('reg')) ?? null;
    const ly = cell === null ? 0 : body.ly !== undefined ? layerOf(body.ly) : prev?.cell === cell ? prev.ly | 0 : 0;
    const where = cell && layerName(cell, ly), was = prev?.cell ? layerName(prev.cell, prev.ly | 0) : null;
    if (prev && (prev.at ?? 0) > at) {
      if (where && where !== was) await this._parkTellDrop(where, k, at);
      return json({ ok: true });
    }
    await this.state.storage.put('reg', { cell, at, ...(ly ? { ly } : {}) });
    await this.state.storage.setAlarm(at + PARK_TTL_MS);
    if (was && was !== where) await this._parkTellDrop(was, k, at);
    return json({ ok: true });
  }
}
