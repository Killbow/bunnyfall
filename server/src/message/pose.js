// A pose or a ping, the room's hottest frames: both metered on the socket's bucket, the ping
// answered, and the pose fanned by tier to the sockets in range.
import { isChatRoom, poseChanged, KEEPALIVE_FAN_MS, poseGate, isCellRoom, inRangeOf, poseFan, slimPose, cellRoomOfWire } from '../relay.js';
import { isBattleRoom } from '../../../src/net/siegeRef.js';
import { isEgRoom } from '../../../src/net/eliteGates/egLaw.js';
import { isSdRoom } from '../../../src/net/sdLaw.js';
import { isKetchRoom } from '../../../src/net/ketch/ketchLaw.js';
import { staffReactPose } from '../staffFeeds.js';
import { duelPose } from '../../../src/net/duelRef.js';
import { wildPose } from '../../../src/net/wildRef.js';
import { isGateRoom } from '../../../src/net/gateLaw.js';
import { isArenaFloorRoom, isArenaPrivateRoom } from '../../../src/net/arenaLaw.js';
import { poseOf } from '../../../src/net/arenaBrain.js';
import { inCover } from '../cellNodes.js';

export class PosePart {
  async _poseFrame(ws, a, m) {
    const chat = isChatRoom(a.key);
    const posed = m.t === 'pose' && !chat;
    const now = Date.now();
    // Compare against the stored pose before the meter runs; the meter writes this frame's pose
    // into the attachment.
    const unmoved = posed && !!a.pose && !poseChanged(a.pose, m.p);
    const stopped = posed && !!a.pose && (a.pose.mv | 0) !== 0 && (m.p.mv | 0) === 0;
    const still = (unmoved || stopped) && now - (a.kept ?? 0) >= KEEPALIVE_FAN_MS;
    const battle = posed && isBattleRoom(a.key) && a.sub;
    if (battle && !this._spend(ws, now, poseGate, 'bucket', 'drops', 'too many poses')) return;
    const step = battle ? await this._siegeStep(ws, a, m.p, now) : null;
    if (battle && !step) return;
    const turned = posed ? { ...(isEgRoom(a.key) ? { eAt: now } : {}), turn: ((a.turn | 0) + 1) & 0xffff, ...(still ? { kept: now } : {}), ...(isSdRoom(a.key) || isKetchRoom(a.key) ? { pAt: now } : {}) } : {};
    const met = battle ? this._metered(ws, a, true, { pose: m.p }, turned) : this._meter(ws, a, now, { pose: posed ? m.p : a.pose }, turned, posed && !stopped);
    if (!met) return;
    // The runtime auto-answers the exact text {"t":"ping"} without calling the handler; any other
    // ping that parses lands here and gets the same pong.
    if (m.t === 'ping') { this._send(ws, '{"t":"pong"}'); return; }
    if (chat) return;
    if (posed) this._metrics.c.poses++;
    if (posed && this._staffReact) staffReactPose(this, ws, m.p, now);
    if (posed && this._duelRef?.bouts.size) { duelPose(this._duelRef, a.sub, m.p, now); await this._duelBeat(now); }
    if (posed && this._wildRef?.fighters.has(a.sub)) { wildPose(this._wildRef, a.sub, m.p, now); await this._wildBeat(now); }
    if (posed && this._trailing(a)) this._trailPose(ws, m.p, now);
    if (posed && isEgRoom(a.key) && typeof a.sub === 'string' && a.sub) this._egPoseIn(ws, a, m.p, now);
    if (posed && a.vid && a.ly && isGateRoom(a.key)) this._hubUpOwe(a.vid, 'p', m.p);
    if (posed && isCellRoom(a.key) && this._refereesPoses() !== this._rfSaid) this._rfSay();
    if (step === 'eye') return;
    if (posed && m.p?.dd && typeof a.sub === 'string' && a.sub && isSdRoom(a.key)) await this._sdMarkFallen(a.key, a.sub, m.p);
    if (isArenaFloorRoom(a.key) && m.t === 'pose') {
      const cur = this._attach(ws);
      if (cur.af) { try { const st = await this._boutOf(); if (st && cur.afid) poseOf(st, cur.afid, m.p.x, m.p.z, now); } catch (e) { console.warn('[arena] pose', e?.message ?? e); } }
    }
    let out = null, entry = null;
    const heard = [];
    const S = isArenaPrivateRoom(a.key) ? await this._sessionOf() : null;
    if (isArenaPrivateRoom(a.key) && !S?.members?.[a.sub]) return;
    const reach = inRangeOf(a.key ?? '', m.p);
    for (const [other, b] of this._all()) {
      if (other === ws || !b.id || (S && !S.members[b.sub])) continue;
      if (reach(b.pose)) heard.push([other, b]);
    }
    // A keepalive or stop fans untiered: HEARTBEAT_MS * POSE_FAR_SHARE equals PEER_TIMEOUT_MS
    // (src/net/wire.js, src/net/online.js), so a tiered one lands just as far peers time out.
    for (const [other, b] of (still ? heard : poseFan(heard, m.p, (e) => e[1].pose, met.turn, (e) => e[1].id))) {
      if (b.w2) this._owe(other, entry ??= JSON.stringify([a.id, slimPose(m.p, a.key)]));
      else this._send(other, out ??= JSON.stringify({ t: 'pose', id: a.id, p: m.p }));
    }
    if (isCellRoom(a.key) && inCover(a, cellRoomOfWire(m.p.x, m.p.z)) && typeof met.sub === 'string' && met.sub) await this._watchTick(ws, met.sub, m.p, !unmoved, now);
    return;
  }
}
