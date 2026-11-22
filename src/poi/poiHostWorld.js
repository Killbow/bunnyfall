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
    renderer, feed: shared.poiFeed, decodeImage: decodePoiImageSteps,   // AUDIT POI R8, R9: its readback a band a step, under the host's budget
    pixels: () => (_mode() === 'exterior' ? built.values() : []),
    translation: (px, py, out) => state.pixelTranslation(px, py, out),
    groundAt: (x, z) => surfaceAt(x, z),   // the drawn ground, as the monument stands on (no ground: its pixel not built)
    collider: () => collider,
    riding: (px, py) => {
      const k = py * 1000 + px;
      let ride = _poiRides.get(k);
      if (!ride) { const o = [0, 0, 0]; ride = onFloatingFrame(state, () => state.pixelTranslation(px, py, o)); _poiRides.set(k, ride); }
      return ride;
    },
    feet: () => (walkMode && shared.playerSpawned ? player.feetAt() : null),
    auth: () => shared.poiLive?.auth() ?? storedSession(appStorage())?.secret ?? null,   // POI-3 (the live view's bearer first): a builder's drafts' assets, asked with the builder's bearer
    getTexture, uploadRecordFrame, say: (line) => townTalk.say(line),   // BUNNYFALL: the people a POI stands (scenes/poiNpcs.js)
    // a POI's flat pictures (scenes/poiFlats.js); a flame's frames step with the other animated flats on its map square
    uploadRecord, flatAnims: (px, py) => built.get(`${px},${py}`)?.flatAnims ?? null,
    collideDrafts: () => shared.poiEditor?.collideDrafts() ?? true,   // POI-3: a draft dragged files no collider until the drag ends
    // the editor's Test: the draft under test runs its DM content in preview, and live POIs none
    dmTest: (id) => shared.poiTest?.runtimeFor(id) ?? null, dmHeld: () => !!shared.poiTest?.active(),
    // POI v2 (World Builder M5): a POI's patrols, talk, trades, objects and encounters - its module loaded only once one stands
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
      store: { get: (k) => { try { return JSON.parse(appStorage().getItem(k) ?? 'null'); } catch { return null; } }, set: (k, v) => { try { appStorage().setItem(k, JSON.stringify(v)); } catch { /* full */ } } },
    })),
  });
  if (params.has('live')) {   // the World Builder's live view: its draft laid over the feed, the body taken to its spot (scenes/poiLive.js)
    shared.poiLive = createPoiLive({ feed: shared.poiFeed, say: (line) => townTalk.say(line),
      goTo: (p, tries = 0) => {   // the body is taken once the player stands (a tab still on the menu tries again for a while)
        if (!shared.playerSpawned || _mode() !== 'exterior') { if (tries < 40) setTimeout(() => shared.poiLive?.goTo?.(p, tries + 1), 1500); return; }
        _teleportToPixel(p.px, p.py, [p.x, player.pos[1] + 1, p.z], { grounded: true }).catch((e) => console.warn('[poi] live view', e?.message ?? e));
      } });
  }
  if (params.has('editor')) startPoiEditor();   // POI-3: `?editor` (refused online - systems/online/onlineLane.js): a builder's editor over this world
}
