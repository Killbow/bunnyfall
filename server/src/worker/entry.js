import { json } from '../room/json.js';
import { RELAY_VERSION, SAFE_LAW_PATH, roomOf, isChatRoom, sharedClassicMinutes, isCellRoom, isLayered, layerOf } from '../relay.js';
import { EG_LIVE_PATH } from '../../../src/net/eliteGates/egDurable.js';
import { egLiveAsk, statusAsk, lawDoor } from './asks.js';
import { privateInteriorOf } from '../../../src/net/privateInterior.js';
import { isGateRoom, gateHolds, gateDayOfRoom } from '../../../src/net/gateLaw.js';
import { isSiegeRoom, isRoyalRoom } from '../../../src/net/siegeRef.js';
import { isArenaRoom, isArenaExhibitionRoom, arenaExhibitionHourOf } from '../../../src/net/arenaLaw.js';
import { exhibitionAdmits } from '../../../src/net/arenaExhibition.js';
import { isSdRoom, sdSlotOfRoom, sdHolds } from '../../../src/net/sdLaw.js';
import { isEgRoom } from '../../../src/net/eliteGates/egLaw.js';
import { ketchRoomHolds } from '../../../src/net/ketch/ketchLaw.js';
import { isCoarseNode } from '../../../src/net/cellTree.js';
import { sdLiveAsk } from './sdLive.js';
import { cellDoor } from '../cellNodes.js';
import { layerWalk, askRoom } from '../relayScale.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    url.pathname = url.pathname.replace(/^\/relay(?=\/)/, '');
    if (url.pathname === '/health') return json({ ok: true, service: 'daggerfall-online', version: RELAY_VERSION, t: Date.now() });
    if (url.pathname === '/status') return statusAsk(env.ROOMS);
    // routesCheck finds relay routes by quoted path, so this names `/v1/eg/live`, which EG_LIVE_PATH holds.
    if (url.pathname === EG_LIVE_PATH) return egLiveAsk(env.ROOMS);
    if (url.pathname === SAFE_LAW_PATH) return lawDoor(request, env);
    const key = roomOf(url.pathname);
    if (!key || (key.startsWith('chat:') && !isChatRoom(key))) return json({ error: 'no such room' }, 404);
    if (key.startsWith('owned:') && !privateInteriorOf(key)) return json({ error: 'no such private room' }, 404);
    if (key.startsWith('gate:') && !(isGateRoom(key) && gateHolds(gateDayOfRoom(key), Date.now()))) return json({ error: 'the gate is closed' }, 404);
    if (key.startsWith('siege:') && !isSiegeRoom(key)) return json({ error: 'no such siege' }, 404);
    if (key.startsWith('royal:') && !isRoyalRoom(key)) return json({ error: 'no such tourney' }, 404);
    if (key.startsWith('arena:') && !isArenaRoom(key)) return json({ error: 'no such room' }, 404);
    if (isArenaExhibitionRoom(key) && !exhibitionAdmits(arenaExhibitionHourOf(key), sharedClassicMinutes(Date.now()))) return json({ error: 'no such bout' }, 404);
    if (key.startsWith('sd:') && !isSdRoom(key)) return json({ error: 'no such room' }, 404);
    if (key.startsWith('eg:') && !isEgRoom(key)) return json({ error: 'no such room' }, 404);
    if (key.startsWith('kt:') && !ketchRoomHolds(key, Date.now())) return json({ error: 'the Ketch is gone' }, 404);
    if (isCoarseNode(key)) return json({ error: 'no such room' }, 404);
    if (String(request.headers.get('Upgrade') ?? '').toLowerCase() !== 'websocket') return json({ error: 'websocket only' }, 426);
    if (isSdRoom(key)) { const s = sdSlotOfRoom(key); const rec = await sdLiveAsk(env.ROOMS, s); if (!(rec && rec.s === s && sdHolds(rec, Date.now()))) return json({ error: 'the Hour has closed' }, 404); }
    if (isCellRoom(key)) return cellDoor(env, key, url, request);
    if (isLayered(key)) return layerWalk(env.ROOMS, key, request, layerOf(url.searchParams.get('ly')));
    if (isGateRoom(key)) return layerWalk(env.ROOMS, key, request, 0);
    return askRoom(env.ROOMS, key, request);
  },
};
