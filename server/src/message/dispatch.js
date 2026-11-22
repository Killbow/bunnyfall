// The frame dispatcher: each client frame passes the room's doors (hidden sockets, shard hand-on,
// lease, parse, court, hello), then reaches the arm for its type; and the room's hello rate.
import { hiddenMay, hiddenPose } from '../staffHidden.js';
import { roomKindOf } from '../relayScale.js';
import { isChannelShard, shardKeeps } from '../../../src/net/hubShards.js';
import { isCellRoom, wardenDue, WARDEN_RETRY_MS, QUEST_PREFIX, isSocialRoom, QUEST_FRAME_MAX, OWN_PREFIX, isWorldRoom, byteGate, FOES_ROOM_BYTES_PER_S, MAX_FRAME_BYTES, WORLD_PREFIX, FOES_PREFIX, streamsFoes, parseClient, isChatRoom, CHAT_HELLO_HZ_MAX, GATE_HELLO_HZ_MAX, HELLO_HZ_MAX } from '../relay.js';
import { frozenFrame } from '../staffFreeze.js';
import { isGateRoom } from '../../../src/net/gateLaw.js';
import { FRAMES } from './frames/index.js';
import { helloFrame } from './frames/hello.js';

export class DispatchPart {
  async _message(ws, message) {
    let a = this._attach(ws);
    if (a.hid && !hiddenMay(message)) return;
    this._kind ??= a.key ? roomKindOf(a.key) : null;
    if (a.vid && a.id && typeof message === 'string' && isChannelShard(a.key) && !shardKeeps(message)) { a = await this._leaseHeard(ws, a); if (a) this._hubForward(ws, a, message); return; }
    if (a.id && isCellRoom(a.key) && wardenDue(this._wardenAt, Date.now())) {
      try { await this._parkWarden(Date.now()); } catch (e) { this._parks = null; this._wardenAt = Date.now() + WARDEN_RETRY_MS; console.warn('[park] the watch', e?.message ?? e); }
    }
    a = this._seatHeard(ws, a, message);
    let doored = null;
    if (typeof message === 'string' && message.startsWith(QUEST_PREFIX)) {
      if (!a.acct) { this._refuse(ws, 'quest before hello'); return; }
      if (!isSocialRoom(a.key)) { this._refuse(ws, 'frame too large'); return; }
      if (message.length > QUEST_FRAME_MAX) { this._refuse(ws, 'frame too large'); return; }
      a = this._meterQuest(ws, a, Date.now());
      if (!a) return;
      doored = 'quest';
    } else if (typeof message === 'string' && message.startsWith(OWN_PREFIX)) {
      if (!a.id) { this._refuse(ws, 'own before hello'); return; }
      if (!isWorldRoom(a.key)) { this._junk(ws); return; }
      a = this._meterFoes(ws, a, Date.now());
      if (!a) return;
      const ingress = byteGate(this._roomOwnIn, Date.now(), message.length, FOES_ROOM_BYTES_PER_S);
      this._roomOwnIn = ingress.bucket;
      if (!ingress.pass) return;
      doored = 'own';
    } else if (typeof message === 'string' && (message.length > MAX_FRAME_BYTES || message.startsWith(WORLD_PREFIX) || message.startsWith(FOES_PREFIX))) {
      const foesLike = message.startsWith(FOES_PREFIX);
      if (!a.id) { this._refuse(ws, foesLike ? 'foes before hello' : 'world before hello'); return; }
      if (!(foesLike ? streamsFoes(a.key) : isWorldRoom(a.key)) && message.length > MAX_FRAME_BYTES) { this._refuse(ws, 'frame too large'); return; }
      a = foesLike ? this._meterFoes(ws, a, Date.now()) : this._meter(ws, a, Date.now());
      if (!a) return;
      if (foesLike && isCellRoom(a.key)) { const ingress = byteGate(this._roomFoesIn, Date.now(), message.length, FOES_ROOM_BYTES_PER_S); this._roomFoesIn = ingress.bucket; if (!ingress.pass) return; }
      // Junk a world frame from anyone but the host instead of refusing it:
      // a host handover races frames in flight.
      if (!(foesLike && isCellRoom(a.key)) && (!isWorldRoom(a.key) || a.id !== this._hostOf())) {
        this._junk(ws);
        return;
      }
      doored = foesLike ? 'foes' : 'world';
    }
    const m = parseClient(message, { hasHello: !!a.id });
    if (m.error) { this._refuse(ws, m.error); return; }
    // Re-check the parsed type on a shard: JSON keeps the last duplicate `t`, so the prefix test
    // alone lets a disguised frame run here.
    if (a.vid && a.id && isChannelShard(a.key) && m.t !== 'hello' && m.t !== 'ping' && m.t !== 'pose' && m.t !== 'lease') { a = await this._leaseHeard(ws, a); if (a) this._hubForward(ws, a, message); return; }
    if (ws.court && m.t !== 'gate') { this._junk(ws); return; }
    if (m.t === 'hello') return helloFrame.call(this, ws, a, m, message, doored);
    if (m.t === 'lease') return this._leaseFrame(ws, a, m, message);
    if (m.t !== 'ping') { a = await this._leaseHeard(ws, a); if (!a) return; }
    if (frozenFrame(this, a, m)) return;
    if (a.hid && (m.t === 'pose' || m.t === 'ping')) return hiddenPose(this, ws, a, m);
    if (m.t === 'pose' || m.t === 'ping') return this._poseFrame(ws, a, m);
    const frame = FRAMES.get(m.t);
    if (frame) return frame.call(this, ws, a, m, message, doored);
  }
  _helloHz(key) { return isChatRoom(key) ? CHAT_HELLO_HZ_MAX : isGateRoom(key) ? GATE_HELLO_HZ_MAX : HELLO_HZ_MAX; }
}
