// @ts-check
import { MobileUnit } from '../../characters/mobileUnit.js';
import { ENEMY_BASICS } from '../../characters/enemyBasics.js';
import { mobileBillboardSize } from '../../world/rmbFlats.js';
import { NPC_FLAT_ARCHIVES } from '../../world/rdbLayout.js';
import { intoDeck, outOfDeck, mainLevel, DECK_STEP } from './navalDeck.js';
import { createCrewLife, CREW_MUSTER_M } from './crewLife.js';
import { createPersonTextureKeys } from '../../world/townScratch.js';
import { createPopulationLane } from '../../characters/npcBodies.js'; import { rosterLook } from '../../characters/foeBodies.js'; import { rosterActor } from '../../characters/rosterBodies.js';

export { mainLevel };

export const CREW_RANGE = 110;
export const CREW_KEEP = 130;
const PEOPLE = new Set(NPC_FLAT_ARCHIVES);
const _flats = new WeakMap();

/** @param {any} boat */
export function peopleFlatsOf(boat) {
  const memo = _flats.get(boat);
  if (memo && memo.variant === boat.variant) return memo.list;
  const out = [];
  const m = boat?.MeshObject?.worldMatrix?.();
  if (!m || !boat.GameObject) return out;
  const walk = (n) => {
    for (let i = 0; i < n.childCount; i++) {
      const c = n.getChild(i);
      if (!c.activeSelf) continue;
      const bb = c.getComponent?.('DaggerfallBillboard');
      const r = c.getComponent?.('MeshRenderer');
      if (bb && r && PEOPLE.has(bb.Summary?.Archive)) {
        const w = c.worldMatrix();
        const h = bb.Summary.Size?.[1] ?? 1.8;
        out.push({ node: c, renderer: r, archive: bb.Summary.Archive, record: bb.Summary.Record, feet: intoDeck(m, [w[12], w[13] - h / 2, w[14]]) });
      }
      walk(c);
    }
  };
  walk(boat.GameObject);
  _flats.set(boat, { variant: boat.variant, list: out });
  return out;
}

/**
 * @param {{ renderer: any, getTexture: (archive: number) => Promise<any>, uploadRecordFrame: (a: number, r: number, f: number) => void, rand?: () => number,
 *   wantBodies?: () => boolean, makeBodies?: (() => any) | null }} o
 */
export function createNavalCrew({ renderer, getTexture, uploadRecordFrame, rand = Math.random, wantBodies = undefined, makeBodies = null }) {
  const bodiesLane = createPopulationLane({ laneName: 'crew', renderer, ...(wantBodies ? { want: wantBodies } : {}), make: makeBodies });
  let _crewIds = 0;
  /** @type {Map<any, any>} */
  const ships = new Map();
  const _dir = [0, 0, 0], _fw = [0, 0, 0];
  const _motion = { moving: false, striking: false };
  const textureKey = createPersonTextureKeys();
  const _records = new Map();
  const recordKey = (record, frame) => { const k = record * 1024 + frame; let v = _records.get(k); if (v === undefined) { v = `${record}#${frame}`; _records.set(k, v); } return v; };

  function sprite(member) {
    const basics = ENEMY_BASICS[member.mobile];
    if (!basics) return null;
    const archive = member.gender === 'female' ? basics.femaleTexture : basics.maleTexture;
    const s = { id: `crew:${++_crewIds}`, archive, tex: null, unit: null, batch: null, origin: [0, 0, 0], dead: false, yaw: 0, swings: 0, swinging: false };
    getTexture(archive).then((tex) => {
      if (s.dead || !tex) return;
      s.tex = tex;
      s.unit = new MobileUnit(member.mobile, basics, (rec) => tex.getFrameCount(rec), rand, member.gender);
      s.batch = renderer.createBillboardBatch(archive, 0, { w: 1, h: 1 }, [[0, 0, 0]]);
    }).catch(() => {});
    return s;
  }
  const drop = (s) => { if (!s) return; s.dead = true; if (s.batch) renderer.destroyBillboardBatch?.(s.batch); s.batch = null; };
  function standDown(ship) {
    for (const s of ship.sprites.values()) drop(s);
    ship.sprites.clear();
    for (const f of ship.flats) f.renderer.m_Enabled = f.was;
  }

  /** @param {any[]} list */
  function sync(list) {
    const want = new Set();
    for (const w of list) want.add(w.key);
    // Re-keyed ships keep their crew, and unlisted crews stand down first, so none reads flats another has hidden.
    for (const w of list) {
      if (ships.has(w.key)) continue;
      for (const [key, ship] of ships) if (ship.boat === w.boat && !want.has(key)) { ships.delete(key); ship.key = w.key; ships.set(w.key, ship); break; }
    }
    for (const [key, ship] of ships) if (!want.has(key)) { standDown(ship); ships.delete(key); }
    for (let w of list) {
      let ship = ships.get(w.key);
      if (ship && (ship.boat !== w.boat || ship.held && !w.hold)) { standDown(ship); ships.delete(w.key); ship = null; }
      if (!ship) {
        if (!w.deck?.count || !(w.hold || w.count > 0)) continue;
        const main = mainLevel(w.deck);
        const flats = peopleFlatsOf(w.boat).filter((f) => f.feet[1] >= main - DECK_STEP);
        for (const f of flats) { f.was = f.renderer.m_Enabled; f.renderer.m_Enabled = false; }
        const life = createCrewLife({ deck: w.deck, roster: w.hold ? [] : w.rosterOf(), seed: w.seed, places: flats.map((f) => f.feet), faction: w.faction ?? null });
        ship = { key: w.key, boat: w.boat, deck: w.deck, life, flats, sprites: new Map(), battle: false, held: !!w.hold, seed: w.seed | 0 };
        for (const m of life.members) ship.sprites.set(m, sprite(m));
        ships.set(w.key, ship);
      }
      ship.battle = !!w.battle;
      ship.struck = !!w.struck;
      ship.mine = w.mine ?? null;
      ship.work = Number.isFinite(w.work) ? w.work : 0;
      const at = w.boat.GameObject?.position;
      ship.toward = w.toward && at && Math.hypot(w.toward[0] - at[0], w.toward[2] - at[2]) <= CREW_MUSTER_M ? w.toward : null;
      ship.way = ship.toward ? w.way ?? null : null;
      const off = w.away ? ship.life.away(w.away) : 0;
      if (off && !w.hold) w = { ...w, count: Math.max(0, w.count - off) };
      if (w.away) for (const m of ship.life.members) { if (!m.gone && !ship.sprites.get(m)) ship.sprites.set(m, sprite(m)); }
      if (w.hold && !ship.held) { ship.held = true; ship.life.take(Infinity); }
      else if (!w.hold && ship.life.standing() > w.count) ship.life.trim(w.count);
      else if (!w.hold && ship.life.standing() < w.count) {
        ship.life.restore(w.count, ship.life.members.length < w.count ? w.rosterOf() : []);
        for (const m of ship.life.members) if (!m.gone && !ship.sprites.get(m)) ship.sprites.set(m, sprite(m));
      }
    }
  }

  /** @param {number} dt @param {number[]} eye @param {(key: any, ship: any) => any} [ctxOf] */
  function frame(dt, eye, ctxOf) {
    for (const ship of ships.values()) {
      ship.life.step(dt, ctxOf?.(ship.key, ship) ?? { battle: ship.battle, struck: ship.struck });
      const m = ship.boat.MeshObject?.worldMatrix?.();
      if (!m) continue;
      for (const [member, s] of ship.sprites) {
        if (!s) continue;
        if (member.gone) { drop(s); ship.sprites.set(member, null); continue; }
        if (member.below || !s.unit || !s.batch) continue;
        outOfDeck(m, member.pos, s.origin);
        _fw[0] = Math.sin(member.yaw); _fw[1] = 0; _fw[2] = Math.cos(member.yaw);
        _dir[0] = m[0] * _fw[0] + m[8] * _fw[2]; _dir[2] = m[2] * _fw[0] + m[10] * _fw[2];
        _motion.moving = member.moving;
        _motion.striking = !!member.swing;
        s.yaw = Math.atan2(_dir[0], _dir[2]);
        if (member.swing && !s.swinging) s.swings++;
        s.swinging = !!member.swing;
        const out = s.unit.update(dt, _motion, s.yaw, s.origin, eye);
        if (!renderer.textures?.has?.(textureKey(s.archive, out.record, out.frame))) uploadRecordFrame(s.archive, out.record, out.frame);
        const sz = mobileBillboardSize(s.tex, out.record);
        s.batch.record = recordKey(out.record, out.frame);
        const bs = s.batch.size ??= { w: 0, h: 0 };
        bs.w = out.flip ? -sz.w : sz.w; bs.h = sz.h;
        s.batch.origin = s.origin;
        s.batch.conceal = ship.boat.conceal ?? null;
        s.head = s.head ?? [0, 0, 0];
        s.head[0] = s.origin[0]; s.head[1] = s.origin[1] + sz.h + 0.25; s.head[2] = s.origin[2];
      }
    }
  }

  function drawBodies(canvas, proj, view, eye, dt) {
    bodiesLane.frame();
    for (const ship of ships.values()) {
      let i = 0;
      for (const [m, s] of ship.sprites) {
        i++;
        if (!s?.batch || !s.unit || m.below) continue;
        const look = rosterLook(s, { mobileType: m.mobile, gender: m.gender, seed: Math.imul((ship.seed | 0) + i, 0x9e3779b1) >>> 0 });
        if (!look) continue;
        bodiesLane.offer(rosterActor(s, { id: s.id, look, feet: s.origin, yaw: s.yaw, moving: !!m.moving, swingKey: s.swings || null }), s.batch, ship.boat.conceal ?? null);
      }
    }
    bodiesLane.draw(canvas, proj, view, eye, dt);
  }

  function batches() {
    const out = [];
    for (const ship of ships.values()) for (const [m, s] of ship.sprites) if (s?.batch && s.unit && !m.below) out.push(s.batch);
    return out;
  }

  function speech() {
    const out = [];
    for (const ship of ships.values()) {
      for (const l of ship.life.speech()) {
        const s = ship.sprites.get(l.member);
        if (s?.head) out.push({ key: ship.key, member: l.member, head: s.head, text: l.text, kind: l.kind });
      }
    }
    return out;
  }

  function take(key, n, opts) {
    const ship = ships.get(key);
    if (!ship || !(n > 0)) return [];
    const m = ship.boat.MeshObject?.worldMatrix?.();
    const out = [];
    for (const t of ship.life.take(n, opts)) {
      const feet = m ? outOfDeck(m, t.pos) : [...t.pos];
      _fw[0] = Math.sin(t.yaw); _fw[2] = Math.cos(t.yaw);
      const yaw = m ? Math.atan2(m[0] * _fw[0] + m[8] * _fw[2], m[2] * _fw[0] + m[10] * _fw[2]) : t.yaw;
      out.push({ mobile: t.mobile, gender: t.gender, feet, yaw });
    }
    for (const [member, s] of ship.sprites) if (member.gone && s) { drop(s); ship.sprites.set(member, null); }
    return out;
  }

  return {
    sync, frame, batches, speech, take,
    drawBodies,
    drawVeiledBodies() { bodiesLane.drawVeiled(); },
    offsetBodies(o) { bodiesLane.offsetAll(o); },
    takeByBoat(boat, n, opts) { for (const ship of ships.values()) if (ship.boat === boat) return take(ship.key, n, opts); return []; },
    reset(key) { const ship = ships.get(key); if (ship) { standDown(ship); ships.delete(key); } },
    has: (key) => ships.has(key),
    ships: () => [...ships.values()],
    clear() { for (const ship of ships.values()) standDown(ship); ships.clear(); bodiesLane.destroy(); },
  };
}
