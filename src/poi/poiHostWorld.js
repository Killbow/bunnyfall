// The world's POI host: the POIs placed on built pixels, with their rides, flats, people, and the
// DM runtime and its store. It also starts the live view and the editor when the page asks.
import { call as accountCall, storedSession } from '../net/accountClient.js';
import { addGoldPieces, addItem } from '../items/inventory.js';
import { appStorage } from '../platform/appStorage.js';
import { createPoiHost } from './poiHost.js';
import { createPoiLive } from './poiLive.js';
import { decodePoiImageSteps } from './poiImageDecode.js';
import { onFloatingFrame } from '../player/collider.js';
import { playerEntity } from '../characters/playerEntity.js';
import { realmGoldAct } from '../saves/realmSaves.js';

/** @param {any} shared */
export function createPoiHostWorld(shared) {
  const {
    _mode, _poiRides, _teleportToPixel, built, collider, exteriorFoes, getTexture, onlineCheckpoint, params, player,
    poiDmCursor, realmIoNow, realmSession, renderer, startPoiEditor, state, surfaceAt, townTalk, uploadRecord,
    uploadRecordFrame, walkMode,
  } = shared;
  shared.poiHost = createPoiHost({
    renderer, feed: shared.poiFeed, decodeImage: decodePoiImageSteps,
    pixels: () => (_mode() === 'exterior' ? built.values() : []),
    translation: (px, py, out) => state.pixelTranslation(px, py, out),
    groundAt: (x, z) => surfaceAt(x, z),
    collider: () => collider,
    riding: (px, py) => {
      const k = py * 1000 + px;
      let ride = _poiRides.get(k);
      if (!ride) { const o = [0, 0, 0]; ride = onFloatingFrame(state, () => state.pixelTranslation(px, py, o)); _poiRides.set(k, ride); }
      return ride;
    },
    feet: () => (walkMode && shared.playerSpawned ? player.feetAt() : null),
    auth: () => shared.poiLive?.auth() ?? storedSession(appStorage())?.secret ?? null,
    getTexture, uploadRecordFrame, say: (line) => townTalk.say(line),
    uploadRecord, flatAnims: (px, py) => built.get(`${px},${py}`)?.flatAnims ?? null,
    collideDrafts: () => shared.poiEditor?.collideDrafts() ?? true,
    dmTest: (id) => shared.poiTest?.runtimeFor(id) ?? null, dmHeld: () => !!shared.poiTest?.active(),
    dm: () => import('../poi/poiDmRuntime.js').then((m) => m.createPoiDm({
      say: (line) => townTalk.say(line),
      pack: () => playerEntity,
      give: (records, gold) => { for (const it of records) addItem(playerEntity.items ??= [], it); if (gold) addGoldPieces(playerEntity, gold); },
      feet: () => (walkMode && shared.playerSpawned ? player.feetAt() : null),
      ...m.poolFoes(exteriorFoes),
      act: realmSession ? (path, body, o) => realmGoldAct({ session: realmSession, checkpoint: () => onlineCheckpoint(), read: !!o?.read, needsAnswer: true, reserve: o?.reserve ?? null,
        call: (at) => accountCall(realmIoNow(), path, { ...body, id: at.id, lease: at.lease, seq: at.seq }) }) : null,
      alive: () => playerEntity.health > 0, cursor: poiDmCursor,
      character: () => params.get('realm') ?? null,
      store: { get: (k) => { try { return JSON.parse(appStorage().getItem(k) ?? 'null'); } catch { return null; } }, set: (k, v) => { try { appStorage().setItem(k, JSON.stringify(v)); } catch { } } },
    })),
  });
  if (params.has('live')) {
    shared.poiLive = createPoiLive({ feed: shared.poiFeed, say: (line) => townTalk.say(line),
      goTo: (p, tries = 0) => {
        if (!shared.playerSpawned || _mode() !== 'exterior') { if (tries < 40) setTimeout(() => shared.poiLive?.goTo?.(p, tries + 1), 1500); return; }
        _teleportToPixel(p.px, p.py, [p.x, player.pos[1] + 1, p.z], { grounded: true }).catch((e) => console.warn('[poi] live view', e?.message ?? e));
      } });
  }
  if (params.has('editor')) startPoiEditor();
}
