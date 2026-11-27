import { hiddenHello, hiddenEntered } from '../../staffHidden.js';
import { isChannelShard, busOf, isChannelBus, HUB_KEY_KEY, HUB_SYNC_MS } from '../../../../src/net/hubShards.js';
import { isCellRoom, isSocialRoom, isWorldRoom, streamsFoes, isChatRoom, tokenGate, CLOSE_BUSY, BUSY_TOKEN_UNREAD, SEAT_ELSEWHERE, CLOSE_REPLACED, isRegionRoom, layerName, GRANT_HELLO_LAW, CHAT_ROSTER_MAX, badged, TRAV_STALE_MS, TRAV_WELCOME_MAX, RELAY_VERSION, rosterFor, CARAVAN_DECOR_KEY, PARK_TTL_MS } from '../../relay.js';
import { isBattleRoom, armsOk } from '../../../../src/net/siegeRef.js';
import { isArenaFloorRoom, isArenaRoom, arenaRatingOk, ARENA_CL_MIN, ARENA_CL_MAX, isArenaPrivateRoom } from '../../../../src/net/arenaLaw.js';
import { isSdRoom, sdSlotOfRoom } from '../../../../src/net/sdLaw.js';
import { isEgRoom } from '../../../../src/net/eliteGates/egLaw.js';
import { isKetchRoom } from '../../../../src/net/ketch/ketchLaw.js';
import { frozenHello } from '../../staffFreeze.js';
import { GROUND_OLD_WORDS } from '../../room/constants.js';
import { privateInteriorAdmits, caravanKeyOf } from '../../../../src/net/privateInterior.js';
import { isStaff } from '../../../../src/net/staffCommands.js';
import { isGateRoom, gateHolds, gateDayOfRoom } from '../../../../src/net/gateLaw.js';
import { SD_NO_BUSY } from '../../worker/sdLive.js';
import { lookKey } from '../../room/keys.js';
import { leaseRoom } from '../../../../src/net/roomLease.js';
import { relayCfgValue } from '../../../../src/net/relayCfg.js';
import { sayStaffBook } from '../../staffEvents.js';
import { cellsWelcome } from '../../cellNodes.js';
import { followJoined } from '../../staffFollow.js';

export async function helloFrame(ws, a, m) {
  const now = Date.now();
  this._metrics.c.hellos++;
  const chat = isChatRoom(a.key);
  const battle = isBattleRoom(a.key);
  const floor = isArenaFloorRoom(a.key);
  const realmRoom = isSdRoom(a.key);
  const egRoom = isEgRoom(a.key);
  const ktRoom = isKetchRoom(a.key);
  let gate = null;
  // Battle, arena floor, realm, and ship rooms skip the room hello gate and spend a per-account
  // gate after the token is verified, so tokenless hellos cannot shut them.
  if (!battle && !floor && !realmRoom && !ktRoom) {
    gate = tokenGate(this._hellos, now, this._helloHz(a.key));
    this._hellos = gate.bucket;
    if (!gate.pass) { this._refuse(ws, 'busy', CLOSE_BUSY, BUSY_TOKEN_UNREAD); return; }
  }
  if (await this._doorRefused(ws, a.key, m, now)) return;
  // Check the token before anything is written (the id's secret, its look, a replaced holder,
  // or the attachment), so a refused hello leaves nothing behind.
  const who = await this._named(m, now);
  if (who.error) { this._refuse(ws, who.error); return; }
  if (await this._bannedHello(ws, who.subject, who.gio, now)) return;
  { const no = hiddenHello(this, ws, a, m, who); if (no) { this._refuse(ws, no); return; } }
  if (await frozenHello(this, ws, a.key, who, m, now, GROUND_OLD_WORDS)) return;
  if (isChannelShard(a.key) && this._shardOf(busOf(a.key), who.subject) !== a.key) { this._hubHop(ws, this._shardOf(busOf(a.key), who.subject) ??  (busOf(a.key))); return; }
  if (isChannelBus(a.key) && m.hs === 1 && this._shardOf(a.key, who.subject)) { this._hubHop(ws,  (this._shardOf(a.key, who.subject))); return; }
  if (a.key.startsWith('owned:') && !await privateInteriorAdmits(a.key, who.subject, isStaff(who.glyphs) || !!who.hid)) {
    this._refuse(ws, 'private room'); return;
  }
  if (who.hid) hiddenEntered(this, a.key, who.subject);
  if (isGateRoom(a.key)) { const no = a.ly ? (gateHolds(gateDayOfRoom(a.key), now) ? null : 'the gate is closed') : await this._gateAdmit(a.key, who.subject, now); if (no) { this._refuse(ws, no); return; } }
  if (who.hid) {  } else if (realmRoom) {
    const known = !!who.subject && (await this._sdRealmOf(sdSlotOfRoom(a.key))).in.includes(who.subject);
    gate = await this._battleHelloGate(who.subject ?? m.id, known ? 'fighter' : 'watch', now);
    if (!gate.pass) { this._refuse(ws, 'busy', CLOSE_BUSY); return; }
    const no = await this._sdAdmit(a.key, who.subject, now, who.kind !== 'linked');
    if (no === SD_NO_BUSY) { this._refuse(ws, 'busy', CLOSE_BUSY); return; }
    if (no) { this._refuse(ws, no); return; }
  }
  if (egRoom) {
    gate = await this._battleHelloGate(who.subject ?? m.id, 'fighter', now);
    if (!gate.pass) { this._refuse(ws, 'busy', CLOSE_BUSY); return; }
    const no = await this._egAdmit(a.key, who, now);
    if (no) { this._refuse(ws, no); return; }
  }
  if (ktRoom) { const no = await this._ktHello(a.key, who, now); if (no) { this._refuse(ws, no.w, no.busy ? CLOSE_BUSY : undefined); return; } }
  if (floor) {
    gate = await this._battleHelloGate(who.subject ?? m.id, (await this._floorOwn(a.key, who.subject)) ? 'fighter' : 'watch', now);
    if (!gate.pass) { this._refuse(ws, 'busy', CLOSE_BUSY); return; }
  }
  let siegeSide = null;
  if (battle && !who.hid) {
    const v = await this._siegeAdmit(a.key, who, m.sp, now); if (v.no) { this._refuse(ws, v.no); return; } siegeSide = v.side;
    gate = await this._battleHelloGate(who.subject, siegeSide, now);
    if (!gate.pass) { this._refuse(ws, 'busy', CLOSE_BUSY); return; }
  }
  const seatHeld = isSocialRoom(a.key) && who.subject ? this._otherTabsOf(who.subject, ws, m.id) : [];
  if (seatHeld.length && !m.cl) { this._refuse(ws, SEAT_ELSEWHERE, CLOSE_REPLACED); return; }
  const held = await this._secretOf(m.id);
  if (held && held !== m.secret) { this._refuse(ws, 'id taken'); return; }
  const before = chat ? null : this._hostOf();
  let replaced = null;
  for (const [other, b] of this._withId(m.id, ws)) {
    replaced = b;
    if ((isChannelShard(a.key) || (a.ly && isGateRoom(a.key))) && b.vid) { this._vidIdx.delete(b.vid); this._hubUpOwe(b.vid, 'r', 0); }
    this._setAttach(other, { ...b, id: null, replaced: true });
    try { other.close(CLOSE_REPLACED, 'replaced'); } catch {  }
    this._closed(other);
    if (isSocialRoom(a.key) && b.acct && b.acct !== (m.acct ? (who.subject || m.acct) : null)) { try { await this._leaveAccount(other, b, now); } catch (e) { console.warn('[hub] replaced leave failed', e?.message ?? e); } }
  }
  if ((isGateRoom(a.key) || isBattleRoom(a.key) || isSdRoom(a.key) || isKetchRoom(a.key) || isCellRoom(a.key) || isWorldRoom(a.key)) && who.subject) for (const [other, b] of [...this._all()]) if (other !== ws && b.id && b.sub === who.subject) this._refuse(other, 'replaced', CLOSE_REPLACED);
  if (egRoom && who.subject) for (const [sock, att] of [...this._all()]) if (sock !== ws && att.id && att.sub === who.subject) this._refuse(sock, 'replaced', CLOSE_REPLACED);
  if (isGateRoom(a.key) && !a.ly && who.subject) this._courtReplace(who.subject, null);
  if (m.cl) for (const other of seatHeld) this._refuse(other, SEAT_ELSEWHERE, CLOSE_REPLACED);
  const others = this._othersOf(ws);
  const carried = !!replaced || (!!m.cl && seatHeld.length > 0);
  if (!others.length && !carried && !this._swept) { try { await this._sweep(a.key); } catch (e) { console.warn('[room] sweep failed', e?.message ?? e); } }
  this._swept = false;
  // The id's secret also lives in the attachment (`sc`): after a wake `_secretOf` refills
  // `_secrets` from attachments, not from storage.
  if (held !== m.secret || !this._secrets.has(m.id)) this._secrets.set(m.id, m.secret);
  if (!chat && (!this._looks.has(m.id) || JSON.stringify(this._looks.get(m.id)) !== JSON.stringify(m.look))) { await this.state.storage.put(lookKey(m.id), m.look); this._looks.set(m.id, m.look); }
  const guild = who.gi ? { gi: who.gi, gt: who.gt, gm: who.gm } : {};
  const arena = isArenaRoom(a.key) ? { ar: arenaRatingOk(who.ar), lk: who.kind === 'linked' ? 1 : 0, ...(Number.isSafeInteger(who.cl) && who.cl >= ARENA_CL_MIN && who.cl <= ARENA_CL_MAX ? { cl: who.cl } : {}) } : {};
  const linked = (isRegionRoom(a.key) || realmRoom) && who.kind === 'linked' ? { lk: 1 } : {};
  const charLv = (isCellRoom(a.key) || realmRoom || ktRoom) && Number.isSafeInteger(who.cl) && who.cl >= 1 ? { cl: who.cl } : {};
  if (egRoom && Number.isSafeInteger(who.cl) && who.cl >= 1) charLv.cl = who.cl;
  const placed = floor && replaced ? { af: replaced.af ?? 0, afid: replaced.afid ?? null, asp: replaced.asp ?? 0 } : {};
  const shown = isArenaPrivateRoom(a.key) ? { shown: (await this._sessionOf())?.members?.[who.subject] ? 1 : 0 } : {};
  const shard = isChannelShard(a.key), copy = !!a.ly && isGateRoom(a.key), vid = shard || copy ? `${m.id}~${now.toString(36)}${(++this._vseq).toString(36)}${crypto.getRandomValues(new Uint16Array(1))[0].toString(36)}` : null;
  if (shard || copy) {
    this._hubKey = shard ? a.key : layerName(a.key, a.ly);
    if (this._hubKeyKept !== this._hubKey) { this._hubKeyKept = this._hubKey; try { await this.state.storage.put(HUB_KEY_KEY, this._hubKey); } catch { this._hubKeyKept = null; } }
  }
  if (!this._setAttach(ws, { ...a, ...placed, ...shown, ...(shard ? { vid, hm: { acct: m.acct ?? null, as: m.asecret ?? null, ps: m.ps === 1 ? 1 : 0, sc: m.secret } } : copy ? { vid } : {}), ...(m.gv >= GRANT_HELLO_LAW && streamsFoes(a.key) ? { gv: 1 } : {}), id: m.id, sc: m.secret, name: who.name, title: who.title, ...(who.ts ? { ts: who.ts } : {}), glyphs: who.glyphs, gx: who.gx, au: who.au, ...(who.pi ? { pi: who.pi } : {}), ...(who.rb ? { rb: who.rb } : {}), lv: who.lv, ...guild, ...(who.hn ? { hn: who.hn, hc: who.hc, hb: who.hb, hg: who.hg } : {}), ...(who.ci && !chat && !isSocialRoom(a.key) ? { ci: who.ci } : {}), ...(armsOk(who.wa) && !chat && !isSocialRoom(a.key) ? { wa: who.wa } : {}), gio: who.gio, ...(Number.isSafeInteger(who.lt) ? { lt: who.lt } : {}), ...(m.ls === 1 && leaseRoom(a.key) ? { ld: 0 } : {}), sub: who.subject, ...(siegeSide ? { sd: siegeSide } : {}), mu: who.mu, ...(who.fz ? { fz: who.fz } : {}), ...(m.fv === 1 ? { fv: 1 } : {}), pose: chat ? null : m.pose, since: this._seatKeep(replaced, now), ...arena, ...charLv, ...linked, ...(chat && who.kind === 'guest' ? { gu: 1 } : {}), ...(m.w2 === 1 ? { w2: 1 } : {}), ...(who.fo ? { fo: who.fo } : {}), ...(m.sm === 1 && isSocialRoom(a.key) ? { sm: 1 } : {}), ...(who.hid ? { hid: 1, lk: 0 } : {}) })) { this._refuse(ws, 'hello too large'); return; }
  if (!chat && m.pose && this._trailing({ key: a.key, sub: who.subject })) this._trailPose(ws, m.pose, now);
  if (chat) {
    const named = others.slice(0, CHAT_ROSTER_MAX).map((b) => badged({ id: b.id, name: b.name, sub: b.sub }, b));
    const ev = isSocialRoom(a.key) && !shard ? await this._liveEvent() : null;
    const tr = isRegionRoom(a.key) ? others.filter((b) => b.tm && now - b.tm.at <= TRAV_STALE_MS).slice(0, TRAV_WELCOME_MAX).map((b) => { const { at, bd, sr, ...p } = b.tm; return badged({ id: b.id, name: b.name, sub: b.sub, p, ...(bd ? { bd } : {}), ...(sr ? { sr } : {}), ag: Math.max(0, Math.floor((now - at) / 1000)) }, b); }) : [];
    if (!this._send(ws, JSON.stringify({ t: 'welcome', id: m.id, peers: named, n: shard ? this._hubN(others.length + 1) : others.length + 1, v: RELAY_VERSION, now: Date.now(), ...(ev ? { ev } : {}), ...(tr.length ? { tr } : {}), ...(isSocialRoom(a.key) && !shard ? { ldo: relayCfgValue(await this._relayCfgOf(), this.env, 'leaseDoor') === 'on' ? 1 : 0 } : {}) }))) return;
    if (isSocialRoom(a.key) && !shard) await sayStaffBook(this, ws, now);
    const jn = shard ? (this._hubTotal != null ? this._hubN(others.length + 1) : null) : others.length + 1;
    const said = JSON.stringify(badged({ t: 'join', id: m.id, name: who.name, sub: who.subject, ...(jn != null ? { n: jn } : {}) }, who));
    if (!who.hid) this._fanRoster(ws, said);
    if (shard) {
      this._vidIdx.set(vid, ws);
      this._hubUpOwe(vid, 'h', { att: this._shardAtt(this._attach(ws)), m: { acct: m.acct ?? null, asecret: m.asecret ?? null, ps: m.ps === 1 ? 1 : 0, cl: m.cl ? 1 : 0, secret: m.secret } });
      if (!this._hubAlarmed) { this._hubAlarmed = true; try { if ((await this.state.storage.getAlarm()) == null) await this.state.storage.setAlarm(now + HUB_SYNC_MS); } catch {  } }
      return;
    }
    if (isChannelBus(a.key)) this._busCountMoved();
    if (isSocialRoom(a.key)) await this._hubHelloWords(ws, m, who.subject, now);
    return;
  }
  const unseen = isArenaPrivateRoom(a.key) && !this._attach(ws)?.shown;
  const S = isArenaPrivateRoom(a.key) ? await this._sessionOf() : null;
  if (isArenaPrivateRoom(a.key)) for (let i = others.length - 1; i >= 0; i--) if (unseen || !S?.members?.[others[i].sub]) others.splice(i, 1);
  // Choose the roster before reading looks: a batched storage get takes at most 128 keys,
  // so ROSTER_MAX (src/net/wire.js) must stay at or below 128.
  const near = rosterFor(battle ? others.map((b) => this._drawn(b, a.key)) : others, m.id, m.pose);
  const missing = near.filter((b) => !this._looks.has(b.id)).map((b) => lookKey(b.id));
  const fetched = missing.length ? await this.state.storage.get(missing) : new Map();
  const roster = near.map((b) => {
    const look = this._looks.get(b.id) ?? fetched.get(lookKey(b.id)) ?? null;
    if (look && !this._looks.has(b.id)) this._looks.set(b.id, look);
    return { ...b, look };
  });
  const host = this._hostOf();
  if (host !== before && others.length) this._sayHost({ skip: ws });
  const world = isWorldRoom(a.key) ? await this._worldRaw() : null;
  if (isWorldRoom(a.key)) this._setAttach(ws, { ...this._attach(ws), worldSeen: !!world });
  const ow = isCellRoom(a.key) ? await this._owWelcome(Date.now()) : '';
  const gm = streamsFoes(a.key) ? this._grantWelcome() : '';
  const rf = (isCellRoom(a.key) && this._refereesPoses() ? ',"rf":1' : '') + cellsWelcome(a);
  // Finish every await before building the welcome: `now` is stamped at build, and the
  // client reads it as the relay clock.
  const welcome = `{"t":"welcome","id":${JSON.stringify(m.id)},"peers":${JSON.stringify(roster)},"host":${JSON.stringify(host)}${ow},"world":${world ?? 'null'},"now":${Date.now()},"v":${JSON.stringify(RELAY_VERSION)}${rf}${gm}${a.ly ? `,"ly":${a.ly}` : ''}}`;
  if (!this._send(ws, welcome)) return;
  if (isCellRoom(a.key) && this._refereesPoses() !== this._rfSaid) this._rfSay();
  if (isCellRoom(a.key)) {
    const now = Date.now(), sub = this._attach(ws)?.sub;
    await this._parkWarden(now);
    // Always send `parks` after the welcome, an empty list included: a reconnect takes it
    // as the whole list.
    const parks = (await this._parkList(now)).filter((e) => e.sub !== sub).map((e) => this._parkPublic(e));
    if (!this._send(ws, JSON.stringify({ t: 'parks', now, data: parks }))) return;
    try {
      const fights = await this._serpentFights(), b = this._attach(ws);
      for (const [id, f] of fights) if (b && !f.fell && !f.gone && this._serpentHears(id, f, b)) { await this._serpentArm(Date.now()); break; }
    } catch (e) { console.warn('[serpent] hello arm failed', e?.message ?? e); }
  }
  if (caravanKeyOf(a.key)) { const cv = await this.state.storage.get(CARAVAN_DECOR_KEY); if (cv && Date.now() - (cv.at ?? 0) < PARK_TTL_MS && !this._send(ws, JSON.stringify({ t: 'caravan', data: cv.d }))) return; }
  if (streamsFoes(a.key)) { try { await this._wildHello(ws, Date.now()); } catch (e) { console.warn('[wild] hello failed', e?.message ?? e); } }
  if (isSdRoom(a.key)) { try { if (!this._send(ws, this._sdHallWord(await this._sdHallOf(sdSlotOfRoom(a.key))))) return; } catch (e) { console.warn('[sd] hall word failed', e?.message ?? e); } }
  if (isSdRoom(a.key)) { try { if (!(await this._sdHelloFight(ws, who.subject, sdSlotOfRoom(a.key), now))) return; } catch (e) { console.warn('[sd] fight word failed', e?.message ?? e); } }
  if (isKetchRoom(a.key)) { try { if (!(await this._ktWelcome(ws, who.subject, a.key, now))) return; } catch (e) { console.warn('[kt] welcome failed', e?.message ?? e); } }
  if (egRoom) { try { if (!(await this._egHello(ws, who.subject, now))) return; } catch (e) { console.warn('[eg] hello word failed', e?.message ?? e); } }
  if (String(a.key ?? '').startsWith('interior:') && who.subject) { try { await this._iliacHello(ws, m.id, who.subject, Date.now()); } catch (e) { console.warn('[iliac] hello failed', e?.message ?? e); } }
  if (String(a.key ?? '').startsWith('interior:') && who.subject) { try { await this._gambitOwed(ws, { sub: who.subject }, 0); } catch (e) { console.warn('[gambit] hello failed', e?.message ?? e); } }
  if (unseen) return;
  const join = JSON.stringify(badged({ t: 'join', id: m.id, name: who.name, ...(who.subject ? { sub: who.subject } : {}), look: m.look, pose: this._drawn({ sub: who.subject, pose: m.pose }, a.key).pose }, who));
  if (!who.hid) for (const [other, b] of [...this._all()]) if (other !== ws && b.id && (!S || S.members[b.sub])) this._send(other, join);
  followJoined(this, ws, this._attach(ws));
  if (copy) {
    this._vidIdx.set(vid, ws);
    this._hubUpOwe(vid, 'h', { att: this._shardAtt(this._attach(ws)) });
    if (m.pose) this._hubUpOwe(vid, 'p', m.pose);
    if (!this._hubAlarmed) { this._hubAlarmed = true; try { if ((await this.state.storage.getAlarm()) == null) await this.state.storage.setAlarm(now + HUB_SYNC_MS); } catch {  } }
  }
  return;
}
