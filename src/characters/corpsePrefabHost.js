// @ts-check
// Gives the hosts access to a mod's corpse prefab; buildDungeonContext and createExteriorFoes wire it.
// The body is removed only after the new enemy spawns, so a refused spawn leaves the body in place.

import { createCorpsePrefabs } from './corpseMarker.js';
import { hitSpellFields } from '../net/wire.js';

/** @param {{ isPuppetFoe: (f: any) => boolean, freeCorpse: (f: any) => void, spawnLooseFoe: (type: number, at: number[]) => Promise<any>, mintMarker: (spec: any) => Promise<any>, renderer: any, billboardBatches: any[], dead: () => boolean, onFoeHit: ((hit: any) => any) | null | undefined, foes: any[], locationKey: () => any, layoutFoes: () => number, say: (line: string) => void }} h */
export function createDungeonCorpsePrefabs(h) {
  const ashes = new Set();
  let gen = 0;
  const runner = createCorpsePrefabs({
    runs: (f) => !h.isPuppetFoe(f),
    body: (f) => (f.corpsePos ? { pos: f.corpsePos, size: f.corpseBatch?.size ?? null } : null),
    rise: async (f) => {
      const p = f.corpsePos ?? f.ai.feet;
      if (!(await h.spawnLooseFoe(f.mobileType, [p[0], p[1], p[2]]))) return false;
      if (f.dead && f.corpse) { f.corpseDestroyed = 1; h.freeCorpse(f); }
      return true;
    },
    vanish: (f) => { f.corpseDestroyed = 1; h.freeCorpse(f); },
    toAsh: (f, ash) => {
      const p = f.corpsePos, g = gen;
      f.corpseDestroyed = 2; h.freeCorpse(f);
      if (p) h.mintMarker({ corpseTexture: ash, feet: p, centre: ash.centre }).then((c) => {
        if (!c) return;
        if (h.dead() || g !== gen) { h.renderer.destroyBillboardBatch(c.batch); return; }
        ashes.add(c.batch); h.billboardBatches.push(c.batch);
      });
    },
    send: (f, spell, level) => {
      const sp = hitSpellFields(spell, level), hit = { dmg: 0, kind: 'spell', ...sp, cs: 1 };
      if (sp) h.onFoeHit?.(f._ownFrom != null ? { own: 1, to: f._ownFrom, k: h.locationKey(), i: f._ownI, ...hit } : { ...(f._encId != null ? { i: f._encId, xs: 1 } : { i: f._surI ?? h.foes.indexOf(f) }), ...hit });
    },
    say: (line) => h.say(line),
    key: (f) => { const i = h.foes.indexOf(f); return i >= 0 && i < h.layoutFoes() ? `${h.locationKey()}|${i}` : null; },
  });
  return {
    ...runner,
    clearAsh() {
      gen++;
      for (const b of ashes) { const i = h.billboardBatches.indexOf(b); if (i >= 0) h.billboardBatches.splice(i, 1); h.renderer.destroyBillboardBatch(b); }
      ashes.clear();
    },
  };
}

/** @param {{ removeCorpse: (f: any) => void, spawnFoe: (type: number, at: number[], o: any) => Promise<any>, mintMarker: (spec: any) => Promise<any>, renderer: any, corpseBatches: any[], collider: any, epoch: () => number, currentPixelKey: () => any, sendHit: (f: any, hit: any) => void, say: (line: string) => void }} h */
export function createStreetCorpsePrefabs(h) {
  const dropMarker = (f) => {
    const body = f.corpseMarker;
    if (!body) return null;
    const i = h.corpseBatches.indexOf(body);
    if (i >= 0) h.corpseBatches.splice(i, 1);
    h.renderer.destroyBillboardBatch(body.batch);
    f.corpseMarker = null;
    return body;
  };
  return createCorpsePrefabs({
    runs: (f) => !f.puppet,
    body: (f) => f.corpseMarker ?? null,
    rise: async (f) => {
      const p = f.corpseMarker?.pos ?? f.ai.feet;
      if (!(await h.spawnFoe(f.mobileType, [p[0], p[1], p[2]], { feetGiven: true, replacing: true }))) return false;
      if (f.dead && f.corpse) h.removeCorpse(f);
      return true;
    },
    vanish: (f) => { f.corpseDestroyed = 1; if (!f.puppet) h.removeCorpse(f); else dropMarker(f); },
    toAsh: (f, ash) => {
      const gen = h.epoch(), pixelKey = f.corpsePixelKey ?? h.currentPixelKey();
      f.corpseDestroyed = 2;
      const body = dropMarker(f);
      h.mintMarker({ collider: body ? null : h.collider, corpseTexture: ash, feet: body?.pos ?? f.ai.feet, centre: ash.centre }).then((c) => {
        if (!c) return;
        if (gen !== h.epoch() || f._gone || !f.corpse) { h.renderer.destroyBillboardBatch(c.batch); return; }
        c.pixelKey = f.corpsePixelKey = pixelKey; f.corpseMarker = c; h.corpseBatches.push(c);
      });
    },
    send: (f, spell, level) => { const sp = hitSpellFields(spell, level); if (sp && f.puppet) h.sendHit(f, { dmg: 0, kind: 'spell', ...sp, cs: 1 }); },
    say: (line) => h.say(line),
    key: () => null,
  });
}
