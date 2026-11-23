// A siege or battle room's fighters, seats, and hello gate, read once a wake and saved.
// It admits fighters, answers their frames, judges blows, and runs the step, tick, and end.
import { CHECKPOINT_MS } from '../../../src/net/gateBrain.js';
import { isBattleRoom, royalPrune, SIEGE_FIGHTERS_MAX, siegePlaceFree, battleOfRoom, SIEGE_OPENS_MS, SIEGE_SPECTATORS_MAX, siegeReturn, fieldOf, worksOf, newBattle, royalNextBeat, SIEGE_TICK_MS, siegeCampPose, newFighter, siegeFieldFrame, SIEGE_WORK_IDS, siegeOffGround, siegeGroundOf, SIEGE_HEIGHT_M, isSiegeNpcId, royalMayStrike, refereeCast, refereeBlow, siegeHeld, royalEnd, siegeNextWave, siegeWaveMs, SIEGE_WAVE_MS, refereeWorkBlow, SIEGE_GATEHOUSE, SIEGE_RAM, siegeBreach, siegeRamDown, siegeNpcFoe, siegeNpcInReach, siegeNpcPose, siegeNpcFell, siegeNpcProvoked, siegeStepLevel, royalStepOk, refereeStep, royalStep, siegeRise, battleStep, siegeNextBeat, honoured } from '../../../src/net/siegeRef.js';
import { tokenGate, HELLO_HZ_MAX, SOCKETS_MAX, SIEGE_IN_MS } from '../relay.js';
import { verifyOrder } from '../../../src/net/identityToken.js';
import { lookKey } from '../room/keys.js';
import { SIEGE_RECEIPT_TTL_S, mintSiegeReceipt } from '../../../src/net/siegeReceipt.js';

export class SiegePart {
  async _siegeOf() {
    if (this._siege === undefined) {
      const v = await this.state.storage.get('siege'); this._siege = v && typeof v === 'object' ? v : null;
      if (this._siege?.fighters) {
        for (const [sub, f] of Object.entries(this._siege.fighters)) {
          // The attachment survives a wake and holds the newest pose; without it, reach is judged
          // from the checkpoint and the fighter is pulled back.
          const pose = this._siegeSocketOf(sub)?.[1].pose;
          if (f && pose) f.pose = pose;
        }
      }
    }
    return this._siege;
  }
  async _siegeSave(now, force) {
    if (!this._siege || (!force && now - this._siegeSavedAt < CHECKPOINT_MS)) return;
    this._siegeSavedAt = now;
    await this.state.storage.put('siege', this._siege);
  }
  _siegeSocketOf(sub) {
    let best = null;
    for (const [ws, b] of this._all()) if (b.id && b.sub === sub && (!best || (b.since ?? 0) >= (best[1].since ?? 0))) best = [ws, b];
    return best;
  }
  _siegeSockets() {
    const out = new Map();
    for (const [ws, b] of this._all()) if (b.id && b.sub) { const best = out.get(b.sub); if (!best || (b.since ?? 0) >= (best[1].since ?? 0)) out.set(b.sub, [ws, b]); }
    return out;
  }
  _drawn(b, key) {
    return !isBattleRoom(key) || this._siege?.fighters?.[b.sub] ? b : { ...b, pose: null };
  }
  async _battleHelloGate(sub, side, now) {
    const own = tokenGate(this._helloBy.get(sub), now, HELLO_HZ_MAX);
    this._helloBy.delete(sub);
    if (this._helloBy.size >= SOCKETS_MAX) this._helloBy.delete(this._helloBy.keys().next().value);
    this._helloBy.set(sub, own.bucket);
    if (!own.pass) return { pass: false };
    if (side !== 'watch') return { pass: true };
    const stands = tokenGate(this._hellos, now, HELLO_HZ_MAX);
    this._hellos = stands.bucket;
    return { pass: stands.pass, bucket: stands.bucket };
  }
  _siegeRoomFor(s, sub, side, now) {
    const here = (x) => !!this._siegeSocketOf(x);
    if (side === 'duel') {
      if (s.battle) royalPrune(s.battle, s.fighters, here);
      let n = 0;
      for (const [, b] of this._all()) if (b.id && b.sd === 'duel' && b.sub !== sub) n++;
      return n >= SIEGE_FIGHTERS_MAX ? 'the field is full' : null;
    }
    if ((side === 'attack' || side === 'defend') && s.battle && !siegePlaceFree(s.fighters, side, s.battle.tier, here, now, sub)) return 'the field is full';
    return Object.keys(s.fighters).length >= SIEGE_FIGHTERS_MAX ? 'the field is full' : null;
  }
  async _siegeGone(ws, sub, now) {
    const s = await this._siegeOf(), f = s?.fighters?.[sub];
    if (!f) return;
    for (const [other, b] of this._all()) if (other !== ws && b.id && b.sub === sub && !this._gone.has(other) && !this._dead.has(other)) return;
    f.goneAt = now;
    await this._siegeSave(now, true);
  }
  _siegeFan(frames) {
    if (!frames.length) return;
    this._fanFrames(frames.map((fr) => JSON.stringify({ t: 'siege', ...fr })), (b) => b.id);
  }
  async _siegeArm(at) {
    const was = await this.state.storage.getAlarm();
    if (was == null || was > at) await this.state.storage.setAlarm(at);
  }
  async _siegeAdmit(key, who, sp, now) {
    const s = await this._siegeOf();
    if (!sp) return who.subject && Array.isArray(who.glyphs) && who.glyphs.includes('dev') && !s?.battle ? { side: null } : { no: 'the siege is not open' };
    if (!who.subject || !this._verifyKey) return { no: 'the siege is not open' };
    const r = await verifyOrder(sp, this._verifyKey, { subtle: crypto.subtle, nowS: Math.floor(now / 1000), kind: 'siege' });
    if (!r.ok) return { no: 'that pass will not do' };
    const c = r.claims, room = battleOfRoom(key);
    if (c.s !== who.subject || !room || c.sk !== room.key || c.sw !== room.week) return { no: 'that pass is for another battle' };
    if ((room.kind === 'royal') !== (c.sn === 'royal')) return { no: 'that pass is for another battle' };
    if (now < c.sb * 1000 - SIEGE_OPENS_MS) return { no: 'the siege is not open' };
    const of = { sk: c.sk, sw: c.sw, sn: c.sn, st: c.st, sb: c.sb, se: c.se, sf: JSON.stringify(c.sf), sx: JSON.stringify(c.sx ?? null) };
    if (s?.of && Object.keys(of).some((k) => s.of[k] !== of[k])) return { no: 'that pass is for another battle' };
    const mine = s?.fighters?.[who.subject];
    // Past `se`, `server-account/src/seatSiege.js` still signs a rostered fighter's pass.
    // Admit one only after the result, on the side it fought, to collect its receipt.
    if (now >= c.se * 1000) return s?.battle?.result && s.receipts?.[who.subject] && mine?.side === c.sd ? { side: c.sd } : { no: 'the siege is not open' };
    if (c.sd === 'watch') {
      if (mine?.side) return { no: 'a fighter is always a fighter' };
      let watching = 0;
      for (const [, b] of this._all()) if (b.id && b.sd === 'watch' && b.sub !== who.subject) watching++;
      if (watching >= SIEGE_SPECTATORS_MAX) return { no: 'the stands are full' };
    } else if (mine) {
      if (mine.side !== c.sd) return { no: 'that pass is for another side' };
      if (s.battle && !(s.battle.result && s.receipts?.[who.subject]) && (c.sd === 'attack' || c.sd === 'defend') && !siegePlaceFree(s.fighters, c.sd, s.battle.tier, (x) => !!this._siegeSocketOf(x), now, who.subject)) return { no: 'your place was taken' };
      if (c.sd === 'duel') { const no = this._siegeRoomFor(s, who.subject, c.sd, now); if (no) return { no }; }
      if (s.battle && !s.battle.result && (mine.side === 'attack' || mine.side === 'defend') && Number.isFinite(mine.goneAt)) {
        const gone = mine.goneAt;
        if (siegeReturn(s.battle, mine, now)) await this._siegeArm(mine.upAt);
        mine.goneAt = gone;
        await this._siegeSave(now, true);
      }
    } else if (s) { const no = this._siegeRoomFor(s, who.subject, c.sd, now); if (no) return { no }; }
    if (!s?.battle) {
      const field = fieldOf(c.sf, c.st, c.sn);
      const works = worksOf(c.sx, c.st, c.sn);
      if (!field || !works) return { no: 'that pass will not do' };
      this._siege = { ...(s ?? { fighters: {} }), of, battle: newBattle({ kind: c.sn, tier: c.st, startMs: c.sb * 1000, endMs: c.se * 1000, field, works }) };
      await this._siegeSave(now, true);
      await this._siegeArm(c.sn === 'royal' ? royalNextBeat(this._siege.battle, now) : now + SIEGE_TICK_MS);
    }
    return { side: c.sd };
  }
  async _siegeFrame(ws, a, m, now) {
    const s = (await this._siegeOf()) ?? (this._siege = { fighters: {} });
    const b = s.battle ?? null;
    if (m.k === 'in') {
      const mt = this._meterOf(ws);
      if (Number.isFinite(mt.siegeInAt) && now - mt.siegeInAt < SIEGE_IN_MS) return;
      mt.siegeInAt = now;
      const mine = s.fighters[a.sub];
      if (a.sd !== 'watch' && !mine) {
        const side = a.sd === 'attack' || a.sd === 'defend' || a.sd === 'duel' ? a.sd : null;
        const full = this._siegeRoomFor(s, a.sub, side, now);
        if (full) { this._send(ws, JSON.stringify({ t: 'siege', k: 'no', m: full })); return; }
        const camp = b && (side === 'attack' || side === 'defend');
        const pose = camp ? siegeCampPose(b, side, a.pose) : (a.pose ?? null);
        s.fighters[a.sub] = { ...newFighter(a.lv, now), side, pose, poseAt: now };
        if (camp) this._send(ws, JSON.stringify({ t: 'siege', k: 'back', p: pose }));
        await this._siegeSave(now, true);
      } else if (mine && Number.isFinite(mine.goneAt)) {
        const waits = siegeReturn(b, mine, now);
        if (b && !b.result && (mine.side === 'attack' || mine.side === 'defend')) this._send(ws, JSON.stringify({ t: 'siege', k: 'back', p: mine.pose }));
        if (waits) await this._siegeArm(mine.upAt);
        await this._siegeSave(now, true);
      }
      const st = [];
      const socks = this._siegeSockets();
      for (const [sub, f] of Object.entries(s.fighters)) { const sk = socks.get(sub); if (sk) st.push([sk[1].id, f.hp, f.max, f.down ? 1 : 0, ...(f.side === 'attack' || f.side === 'defend' ? [f.side === 'attack' ? 1 : 2] : [])]); }
      this._send(ws, JSON.stringify({ t: 'siege', k: 'st', f: st }));
      if (b?.kind === 'royal') { this._royalSay(ws, s, b, a.sub); return; }
      if (b) this._send(ws, JSON.stringify({ t: 'siege', ...siegeFieldFrame(b, this._siegeCounts(s), now) }));
      if (b?.result) this._send(ws, JSON.stringify({ t: 'siege', k: 'end', r: b.result, a: b.raised ? 1 : 0, ...(s.receipts?.[a.sub] ? { rc: s.receipts[a.sub] } : {}) }));
      return;
    }
    const by = s.fighters[a.sub];
    if (!by) { this._junk(ws); return; }
    if (m.k === 'ask' || m.k === 'yes') { if (b?.kind === 'royal' && by.side === 'duel') await this._royalHand(ws, a, s, b, m, now); else this._junk(ws); return; }
    if (b && (b.result || now < b.startMs)) return;
    if (m.to === SIEGE_WORK_IDS.gate || m.to === SIEGE_WORK_IDS.ram) { await this._siegeWorkBlow(ws, a, s, b, by, m, now); return; }
    if (siegeOffGround(siegeGroundOf(b, a.sub), by.pose) > SIEGE_HEIGHT_M) return;
    if (isSiegeNpcId(m.to)) { await this._siegeNpcBlow(ws, a, s, b, by, m, now); return; }
    const target = this._idFirst(m.to)?.[1] ?? null;
    const to = target?.sub ? s.fighters[target.sub] : null;
    if (!to) return;
    if (b && (!by.side || !to.side)) return;
    const heal = m.k === 'cast' && m.h === 1;
    if (by.side && b?.kind !== 'royal' && (heal ? to.side !== by.side : to.side === by.side)) return;
    if (b?.kind === 'royal' && (m.k === 'cast' || !royalMayStrike(b, a.sub, target.sub, now))) return;
    let look = this._looks.get(a.id) ?? null;
    if (!look && m.k === 'blow') { look = (await this.state.storage.get(lookKey(a.id))) ?? null; if (look) this._looks.set(a.id, look); }
    const res = m.k === 'cast'
      ? refereeCast(by, to, { from: by.pose, at: to.pose, d: m.d, heal }, now)
      : refereeBlow(by, to, { from: by.pose, at: to.pose, held: siegeHeld(look, m.w, m.m), d: m.d, r: m.r, wa: a.wa ?? null }, now);
    if (!res.ok || !res.dealt) return;
    const frames = [{ k: 'hp', id: m.to, h: to.hp, m: to.max }];
    if (res.fell && b?.kind === 'royal') { this._siegeFan(frames); await this._royalBoutEnd(s, b, royalEnd(b, a.sub, now), now); return; }
    if (res.fell) {
      by.felled = (by.felled ?? 0) + 1;
      to.upAt = siegeNextWave(now, b ? siegeWaveMs(b, to.side) : SIEGE_WAVE_MS.palace);
      frames.push({ k: 'fell', id: m.to, by: a.id });
      await this._siegeArm(to.upAt);
    }
    this._siegeFan(frames);
    await this._siegeSave(now, res.fell);
  }
  async _siegeWorkBlow(ws, a, s, b, by, m, now) {
    if (!b || b.kind !== 'siege' || m.k !== 'blow') { this._junk(ws); return; }
    const gate = m.to === SIEGE_WORK_IDS.gate;
    if (by.side !== (gate ? 'attack' : 'defend')) return;
    const work = gate ? (b.breached ? null : b.gate) : b.ram;
    if (!work) return;
    let look = this._looks.get(a.id) ?? null;
    if (!look) { look = (await this.state.storage.get(lookKey(a.id))) ?? null; if (look) this._looks.set(a.id, look); }
    const res = refereeWorkBlow(by, work, { point: b.field.throne, size: gate ? SIEGE_GATEHOUSE.sizeM : SIEGE_RAM.sizeM, from: by.pose, ground: b.ground ?? null,
      held: siegeHeld(look, m.w, m.m), d: m.d, r: m.r, share: gate ? SIEGE_GATEHOUSE.blowShare : 1, wa: a.wa ?? null }, now);
    if (!res.ok) return;
    if (res.broke) {
      if (gate) siegeBreach(b); else siegeRamDown(b, now);
      this._siegeFan([siegeFieldFrame(b, this._siegeCounts(s), now)]);
      await this._siegeSave(now, true);
      return;
    }
    await this._siegeSave(now, false);
  }
  async _siegeNpcBlow(ws, a, s, b, by, m, now) {
    const n = b && b.kind !== 'royal' ? (b.npcs ?? []).find((x) => x.id === m.to) ?? null : null;
    if (!n) { this._junk(ws); return; }
    if ((m.k === 'cast' && m.h === 1) || !siegeNpcFoe(n, by.side) || n.down) return;
    if (!siegeNpcInReach(n, by.pose, b.ground ?? null)) return;
    let look = this._looks.get(a.id) ?? null;
    if (m.k === 'blow' && !look) { look = (await this.state.storage.get(lookKey(a.id))) ?? null; if (look) this._looks.set(a.id, look); }
    const at = siegeNpcPose(n, now, b.ground ?? null, by.pose?.y ?? 0);
    const res = m.k === 'cast'
      ? refereeCast(by, n, { from: by.pose, at, d: m.d }, now)
      : refereeBlow(by, n, { from: by.pose, at, held: siegeHeld(look, m.w, m.m), d: m.d, r: m.r, wa: a.wa ?? null }, now);
    if (!res.ok || !res.dealt) return;
    if (res.fell) {
      siegeNpcFell(b, n, now);
      by.felled = (by.felled ?? 0) + 1;
      this._siegeFan([{ k: 'hp', id: n.id, h: 0, m: n.max }, { k: 'fell', id: n.id, by: a.id }, siegeFieldFrame(b, this._siegeCounts(s), now)]);
      await this._siegeSave(now, true);
      return;
    }
    siegeNpcProvoked(n, a.sub, now);
    this._siegeFan([{ k: 'hp', id: n.id, h: n.hp, m: n.max }]);
    await this._siegeSave(now, false);
  }
  _siegeCounts(s) {
    let attack = 0, defend = 0, watch = 0;
    for (const [, b] of this._all()) {
      if (!b.id) continue;
      if (b.sd === 'watch') { watch++; continue; }
      const side = b.sub ? s.fighters[b.sub]?.side : null;
      if (side === 'attack') attack++; else if (side === 'defend') defend++;
    }
    return [attack, defend, watch];
  }
  async _siegeStep(ws, a, p, now) {
    const s = await this._siegeOf(), f = s?.fighters[a.sub];
    if (!f) return 'eye';
    if (!siegeStepLevel(siegeGroundOf(s.battle, a.sub), f.pose, p)) { this._send(ws, JSON.stringify({ t: 'siege', k: 'back', p: f.pose })); return false; }
    // Ask `royalStepOk` first: `refereeStep` spends the run allowance (`stepM`),
    // and a step the ring refuses must spend none.
    if (!royalStepOk(s.battle, a.sub, p) || !refereeStep(f.pose, p, now - (f.poseAt ?? now), f)) { this._send(ws, JSON.stringify({ t: 'siege', k: 'back', p: f.pose })); return false; }
    f.pose = p; f.poseAt = now;
    return 'body';
  }
  async _siegeTick() {
    const s = await this._siegeOf();
    if (!s) return false;
    const now = Date.now();
    const b = s.battle ?? null;
    if (b?.result) {
      if (now >= (s.dropAt ?? 0)) { await this.state.storage.delete('siege'); this._siege = null; } else await this.state.storage.setAlarm(s.dropAt);
      return true;
    }
    if (b?.kind === 'royal') {
      for (const e of royalStep(b, (sub) => !!this._siegeSocketOf(sub), now)) {
        if (e.k === 'bout') await this._royalBoutEnd(s, b, e, now);
        else { s.dropAt = now + SIEGE_RECEIPT_TTL_S * 1000; await this._siegeSave(now, true); await this.state.storage.setAlarm(s.dropAt); return true; }
      }
      await this._siegeSave(now, false);
      await this.state.storage.setAlarm(royalNextBeat(b, now));
      return true;
    }
    const frames = [];
    let next = Infinity, felled = false;
    for (const [sub, f] of Object.entries(s.fighters)) {
      if (siegeRise(f, now)) {
        const sk = this._siegeSocketOf(sub);
        if (b && f.side) { f.pose = siegeCampPose(b, f.side, f.pose); f.poseAt = now; }
        if (sk) frames.push({ k: 'up', id: sk[1].id, ...(b && f.side ? { p: f.pose } : {}) }, { k: 'hp', id: sk[1].id, h: f.hp, m: f.max });
      } else if (f.down) next = Math.min(next, f.upAt);
    }
    this._siegeFan(frames);
    if (b) {
      const list = [];
      // A restarted object never hears some leaves;
      // stamp `goneAt` here for a sided fighter with no socket.
      for (const [sub, f] of Object.entries(s.fighters)) if (f.side) { f.here = !!this._siegeSocketOf(sub); f.sub = sub; list.push(f); if (!f.here && !Number.isFinite(f.goneAt)) f.goneAt = now; }
      const events = battleStep(b, list, now);
      for (const f of list) { delete f.here; delete f.sub; }
      const struck = [];
      for (const e of events) {
        if (e.k !== 'nhit') continue;
        const sk = this._siegeSocketOf(e.to);
        if (!sk) continue;
        struck.push({ k: 'hp', id: sk[1].id, h: e.h, m: e.m });
        if (e.fell) struck.push({ k: 'fell', id: sk[1].id, by: e.n });
      }
      felled = events.some((e) => e.k === 'nup' || (e.k === 'nhit' && e.fell));
      this._siegeFan([...struck, siegeFieldFrame(b, this._siegeCounts(s))]);
      if (events.some((e) => e.k === 'end')) { await this._siegeEnd(s, now); return true; }
      next = Math.min(next, siegeNextBeat(b, now));
    }
    await this._siegeSave(now, frames.length > 0 || felled);
    if (Number.isFinite(next)) await this.state.storage.setAlarm(next);
    return true;
  }
  async _siegeEnd(s, now) {
    const b = s.battle, key = await this._receiptKeyOf(), nowS = Math.floor(now / 1000);
    s.receipts = {};
    for (const [sub, f] of Object.entries(s.fighters)) {
      if (f.side !== 'attack' && f.side !== 'defend') continue;
      try { s.receipts[sub] = await mintSiegeReceipt({ s: sub, sk: s.of.sk, sw: s.of.sw, sd: f.side, r: b.result, a: b.raised ? 1 : 0, h: honoured(f, b) ? 1 : 0, th: b.reached ? 1 : 0 }, key, { subtle: crypto.subtle, nowS }); } catch (e) { console.warn('[siege] receipt failed', e?.message ?? e); }
    }
    s.dropAt = now + SIEGE_RECEIPT_TTL_S * 1000;
    for (const [ws, att] of [...this._all()]) {
      if (!att.id) continue;
      const rc = att.sub ? s.receipts[att.sub] : undefined;
      this._send(ws, JSON.stringify({ t: 'siege', k: 'end', r: b.result, a: b.raised ? 1 : 0, ...(rc ? { rc } : {}) }));
    }
    await this._siegeSave(now, true);
    await this.state.storage.setAlarm(s.dropAt);
  }
}
