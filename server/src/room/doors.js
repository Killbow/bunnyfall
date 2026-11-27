import { cellDoors } from '../cellMoves.js';
import { PARK_INTERNAL_REG, PARK_INTERNAL_DROP, GATE_INTERNAL_FELL, GATE_INTERNAL_SEAT, GATE_INTERNAL_COURT, GATE_INTERNAL_PARTY, SERPENT_INTERNAL_FELL, RAID_INTERNAL_CLEAN, STAR_INTERNAL_HELD, RAID_INTERNAL_DAY, WDUN_INTERNAL_RESET, WDUN_INTERNAL_KIN, WDUN_INTERNAL_GONE, WILD_INTERNAL_VIT, RITE_INTERNAL_BROKEN, RITE_INTERNAL_DAY, SD_INTERNAL_CENSUS, SD_INTERNAL_FOUND, SD_INTERNAL_LIVE, SD_INTERNAL_FELL, SD_INTERNAL_IN, EG_INTERNAL_OPEN, roomOf, isChatRoom, CHAT_SOCKETS_MAX, SOCKETS_MAX, isLayered, layerOf, LAYER_HEADER, LAYER_ASK_HEADER, LAYER_EMPTY_HEADER, LAYER_LAST_HEADER, LAYER_FULL_HEADER, isCellRoom } from '../relay.js';
import { SEV_INTERNAL_BOOK, staffBookInternal, SEV_INTERNAL_TELL, staffTellInternal, SEV_INTERNAL_CALL, staffCallInternal } from '../staffEvents.js';
import { RELAY_INTERNAL_CFG } from '../../../src/net/relayCfg.js';
import { json } from './json.js';
import { HUB_INTERNAL_UP, HUB_INTERNAL_POLL } from '../../../src/net/hubShards.js';
import { INSTANCE_INTERNAL_KIN } from '../../../src/net/instanceRoom.js';
import { STATUS_INTERNAL, ARENA_INTERNAL_OPEN, ARENA_INTERNAL_LIVE, HOLDEM_INTERNAL_VOID } from './keys.js';
import { KT_INTERNAL_RC } from '../../../src/net/wire.js';
import { EG_INTERNAL_HERALD } from '../../../src/net/eliteGates/egHerald.js';
import { EG_INTERNAL_LIVE, EG_INTERNAL_STAGE, EG_INTERNAL_VOID, EG_INTERNAL_CALLED, EG_INTERNAL_RCPT } from '../../../src/net/eliteGates/egDurable.js';
import { SAFE_INTERNAL_LAW } from './holds.js';
import { FOLLOW_INTERNAL_SAY } from '../../../src/net/staffFollow.js';
import { followSayInternal } from '../staffFollow.js';
import { privateInteriorOf } from '../../../src/net/privateInterior.js';
import { isGateRoom } from '../../../src/net/gateLaw.js';
import { hiddenSeats, hiddenAsked, seatsTaken } from '../staffHidden.js';
import { nodeHeard } from '../cellNodes.js';

export class DoorsPart {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const cells = await cellDoors(this, path, request); if (cells) return cells;
    if (path === PARK_INTERNAL_REG || path === PARK_INTERNAL_DROP) return this._parkInternal(path, request);
    if (path === GATE_INTERNAL_FELL) return this._gateFellInternal(request);
    if (path === GATE_INTERNAL_SEAT) return this._gateSeatInternal(request);
    if (path === GATE_INTERNAL_COURT) return this._gateCourtInternal(request);
    if (path === GATE_INTERNAL_PARTY) return this._gatePartyInternal(request);
    if (path === SERPENT_INTERNAL_FELL) return this._serpentFellInternal(request);
    if (path === RAID_INTERNAL_CLEAN) return this._raidCleanInternal(request);
    if (path === SEV_INTERNAL_BOOK) return staffBookInternal(this);
    if (path === SEV_INTERNAL_TELL) return staffTellInternal(this, request);
    if (path === SEV_INTERNAL_CALL) return staffCallInternal(this, request);
    if (path === STAR_INTERNAL_HELD) return this._starHeldInternal(request);
    if (path === STATUS_INTERNAL) return json(this._statusRead());
    if (path === RELAY_INTERNAL_CFG) return json(await this._relayCfgOf());
    if (path === HUB_INTERNAL_UP) return this._hubUpInternal(request);
    if (path === HUB_INTERNAL_POLL) return this._hubPollInternal(request);
    if (path === RAID_INTERNAL_DAY) return this._raidDayInternal(request);
    if (path === WDUN_INTERNAL_RESET) return this._wdunResetInternal(request);
    if (path === INSTANCE_INTERNAL_KIN) return this._instanceKinInternal(request);
    if (path === WDUN_INTERNAL_KIN) return this._wdunKinInternal(request);
    if (path === WDUN_INTERNAL_GONE) return this._wdunGoneInternal(request);
    if (path === WILD_INTERNAL_VIT) return this._wildVitInternal(request);
    if (path === RITE_INTERNAL_BROKEN) return this._riteBrokenInternal(request);
    if (path === RITE_INTERNAL_DAY) return this._riteDayInternal(request);
    if (path === ARENA_INTERNAL_OPEN) return this._arenaOpenInternal(request);
    if (path === ARENA_INTERNAL_LIVE) return this._arenaLiveInternal(request);
    if (path === SD_INTERNAL_CENSUS) return this._sdCensusInternal();
    if (path === SD_INTERNAL_FOUND) return this._sdFoundInternal(request);
    if (path === SD_INTERNAL_LIVE) return this._sdLiveInternal();
    if (path === SD_INTERNAL_FELL) return this._sdFellInternal(request);
    if (path === KT_INTERNAL_RC) return this._ktRcInternal(request);
    if (path === SD_INTERNAL_IN) return this._sdInInternal(request);
    if (path === EG_INTERNAL_OPEN) return this._egOpenInternal(request);
    if (path === EG_INTERNAL_HERALD) return this._egHeraldInternal(request);
    if (path === EG_INTERNAL_LIVE) return this._egLiveInternal();
    if (path === EG_INTERNAL_STAGE) return this._egStageInternal();
    if (path === EG_INTERNAL_VOID) return this._egVoidInternal(request);
    if (path === EG_INTERNAL_CALLED) return this._egCalledInternal(request);
    if (path === EG_INTERNAL_RCPT) return this._egRcInternal(request);
    if (path === HOLDEM_INTERNAL_VOID) return this._holdemVoidInternal(request);
    if (path === SAFE_INTERNAL_LAW) return this._lawInternal(request);
    if (path === FOLLOW_INTERNAL_SAY) return followSayInternal(this, request);
    const key = roomOf(new URL(request.url).pathname);
    if (!key || (key.startsWith('owned:') && !privateInteriorOf(key))) return json({ error: 'no such private room' }, 404);
    const cap = isChatRoom(key) ? CHAT_SOCKETS_MAX : SOCKETS_MAX;
    const walked = isLayered(key) || isGateRoom(key);
    if (walked && layerOf(request.headers.get(LAYER_HEADER)) > 0 && request.headers.get(LAYER_ASK_HEADER) === '1' && this.state.getWebSockets().length === hiddenSeats(this)) { const empty = json({ error: 'layer empty' }, 503); empty.headers.set(LAYER_EMPTY_HEADER, '1'); return empty; }
    const hs = hiddenAsked(request);
    if (seatsTaken(this, hs, cap) >= cap) { this._unseatSilent(Date.now()); if (seatsTaken(this, hs, cap) >= cap) { if (!walked || request.headers.get(LAYER_LAST_HEADER) === '1') this._metrics.c.full++; this._metricsTick(); const full = json({ error: 'room full' }, 503); full.headers.set(LAYER_FULL_HEADER, '1'); return full; } }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // The object can hibernate between messages, so per-socket state, the room key
    // included, lives in the attachment.
    this.state.acceptWebSocket(server);
    const nd = isCellRoom(key) ? nodeHeard(this, request, key) : null;
    const ly = isLayered(key) || isGateRoom(key) ? layerOf(request.headers.get(LAYER_HEADER)) : 0;
    const att = { key, id: null, name: null, pose: null, at: Date.now(), ...(ly ? { ly } : {}), ...(nd ? { nd } : {}) };
    if (hs) att.hs = 1;
    server.serializeAttachment(att);
    this._adopt(server, att);
    return new Response(null, { status: 101, webSocket: client });
  }
}
