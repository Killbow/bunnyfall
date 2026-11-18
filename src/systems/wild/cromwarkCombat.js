// @ts-check
import { cromwarkProfile } from './cromwarkRoster.js';
import { cromwarkPattern, inCromwarkMark, shotPosition, shotHits, CROMWARK_ORB_RADIUS } from './cromwarkPatterns.js';
import { fitBlowToGround } from '../../ai/foeBlows.js';

/** One local player judges their own capsule against every owner's cast, including
 * casts aimed at someone else. No hit RPC, no duplicate damage from the owner.
 * Existing wind-up fields carry locked origin/yaw/serial; wp is elapsed seconds
 * and wk's upper four bits encode locked aim distance in 2m steps for these
 * seven IDs only. Late arrivals get a grace period and no past hits. */
export function createCromwarkCombat({ collider, hurt, impact, renderer, getTexture, uploadRecordFrame, clock = null }) {
  let now = 0, marks = [], bullets = [], batches = [];
  let lastClock = clock?.() ?? 0, elapsed = 0;
  let orbReady = false, orbPending = false;
  function warmOrb() {
    if (orbReady || orbPending) return;
    orbPending = true;
    getTexture(9947).then((tex) => {
      orbPending = false;
      if (!(tex?.getSize?.(0)?.width > 1)) return;
      uploadRecordFrame(9947, 0, 0);
      orbReady = renderer.textures.has('9947_0#0');
    }).catch(() => { orbPending = false; });
  }
  const states = new Set();
  const clearRay = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], d = Math.hypot(dx, dy, dz);
    const hit = d > .01 ? collider.raycast(a, [dx / d, dy / d, dz / d], d) : Infinity;
    return !Number.isFinite(hit) || hit >= d - .05;
  };
  function build(f, serial, origin, yaw, age = 0, range = 6) {
    const pattern = cromwarkPattern(f.mobileType, origin, yaw, serial, !!f.entity.eliteFoe, range);
    const s = { f, serial, origin: [...origin], yaw, range, started: now - age, heard: now, previous: age, pattern, hit: new Set(), blocked: new Set(), nextHit: 0 };
    for (const m of pattern.marks) {
      fitBlowToGround(m, collider);
      if (m.kind === 'lunge') {
        const hit = collider.raycast([m.origin[0], m.origin[1] + .8, m.origin[2]], [Math.sin(m.yaw), 0, Math.cos(m.yaw)], m.dim.len);
        if (Number.isFinite(hit)) m.dim.len = Math.max(0, hit - .3);
      }
    }
    for (const shot of pattern.shots) {
      const hit = collider.raycast(shotPosition(shot, shot.start), [Math.sin(shot.yaw), 0, Math.cos(shot.yaw)], shot.speed * shot.life);
      if (Number.isFinite(hit)) shot.life = Math.max(0, (hit - shot.r) / shot.speed);
    }
    if (f._crom) states.delete(f._crom);
    f._crom = s; states.add(s);
    return s;
  }
  function cancel(f) { if (f._crom) states.delete(f._crom); f._crom = null; }
  function begin(dt, foes) {
    const stamp = clock?.() ?? lastClock + dt;
    elapsed = dt > 0 ? Math.max(0, stamp - lastClock) : 0;
    now += elapsed; lastClock = stamp; marks = []; bullets = [];
    for (const s of states) if (!foes.includes(s.f) || s.f.dead) cancel(s.f);
  }
  function frame(f, dt, feet, height, disabled, playerAlive = true, target = feet) {
    const p = cromwarkProfile(f.mobileType);
    if (!p) return false;
    if (p.key === 'judge') {
      if (orbReady && !renderer.textures.has('9947_0#0')) orbReady = false;
      warmOrb();
    }
    if (disabled || f.dead || f.entity.team === 'PlayerAlly') { cancel(f); return false; }
    let s = f._crom;
    if (s && now - s.started > s.pattern.duration) { cancel(f); f._cromNext = now + p.cooldown * (f.entity.eliteFoe ? .85 : 1); s = null; }
    if (!s && !f.puppet && target && now >= (f._cromNext ?? 1) && f.ai.isHostile && f.ai.detected && f.ai.inSight
      && Math.hypot(target[0] - f.ai.feet[0], target[2] - f.ai.feet[2]) < p.range) {
      const pressure = [...states].reduce((n, x) => n + (cromwarkProfile(x.f.mobileType)?.weight ?? 0), 0);
      if (pressure + p.weight <= 4 && states.size < 3) {
        const yaw = Math.atan2(target[0] - f.ai.feet[0], target[2] - f.ai.feet[2]);
        const range = Math.min(30, Math.round(Math.hypot(target[0] - f.ai.feet[0], target[2] - f.ai.feet[2]) / 2) * 2);
        s = build(f, f._cromSerial = ((f._cromSerial ?? 0) + 1) & 255, f.ai.feet, yaw, 0, range);
      }
    }
    if (!s) return false;
    const age = now - s.started, canHit = playerAlive && now - s.heard >= .35 && elapsed > 0 && elapsed <= .5;
    const hit = (hazard, origin) => {
      if (!canHit || now < s.nextHit || !clearRay([origin[0], origin[1] + .8, origin[2]], [feet[0], feet[1] + .8, feet[2]])) return;
      s.nextHit = now + .4; // Intersecting spokes/volley pellets are one mistake, not an instant death.
      if (hurt(hazard.damage, f) === false) return;
      let dx = feet[0] - origin[0], dz = feet[2] - origin[2];
      if (Math.hypot(dx, dz) < .001) { dx = Math.sin(s.yaw); dz = Math.cos(s.yaw); }
      const d = Math.hypot(dx, dz);
      impact?.(hazard, [dx / d, dz / d]);
    };
    for (let i = 0; i < s.pattern.marks.length; i++) {
      const m = s.pattern.marks[i];
      if (age < m.start || age > m.land + m.duration) continue;
      marks.push({ blow: { ...m, start: s.started + m.start, land: s.started + m.land },
        phase: { t: Math.max(0, Math.min(1, (age - m.start) / (m.land - m.start))), flash: age >= m.land ? 1 : 0 } });
      if (age >= m.land && !s.hit.has(i) && inCromwarkMark(m, feet)) { s.hit.add(i); hit(m, m.origin); }
      if (m.dash && age >= m.land && !f.puppet && dt > 0) {
        // Drive through the same collision capsule as ordinary walking, never teleport.
        const step = Math.min(dt, .05) * m.dim.len / m.duration;
        collider.move(f.ai.feet, Math.sin(m.yaw) * step, -.05, Math.cos(m.yaw) * step, f.ai.controllerHeight, true);
      }
    }
    for (let i = 0; i < s.pattern.shots.length; i++) {
      if (!orbReady) continue; // An unavailable image must never become an invisible damaging projectile.
      const shot = s.pattern.shots[i], key = `s${i}`;
      if (age < shot.start || age > shot.start + shot.life || s.blocked.has(i)) continue;
      const pos = shotPosition(shot, age), prev = shotPosition(shot, Math.max(shot.start, s.previous));
      if (!clearRay(prev, pos)) { s.blocked.add(i); continue; }
      bullets.push(pos);
      if (!s.hit.has(key) && shotHits(shot, Math.max(s.previous, shot.start), age, feet, height)) { s.hit.add(key); hit(shot, pos); }
    }
    s.previous = age;
    return true;
  }
  function hear(f, r, origin) {
    if (r.wk === undefined || !origin || !Number.isFinite(r.wp)) { cancel(f); return; }
    if ((r.wk & 7) !== 0 || Math.hypot(origin[0] - f.ai.feet[0], origin[2] - f.ai.feet[2]) > 35
      || Math.abs(origin[1] - f.ai.feet[1]) > 8) { cancel(f); return; }
    if (f._cromSeen === r.wn) return; // Receipt jitter or an interrupted cast must never restart warnings.
    const range = (r.wk >> 3) * 2;
    const p = cromwarkPattern(f.mobileType, origin, r.wy, r.wn, !!f.entity.eliteFoe, range);
    if (r.wp < 0 || r.wp > p.duration) { cancel(f); return; }
    f._cromSeen = r.wn;
    build(f, r.wn, origin, r.wy, r.wp, range);
  }
  function wire(f, toWire) {
    const s = f._crom;
    if (!s) return {};
    const age = now - s.started;
    return { wk: (s.range / 2) << 3, wn: s.serial, wy: s.yaw, wo: toWire(s.origin), wl: Math.max(0, Math.round((1 - age) * 1000)), wp: age };
  }
  function bulletBatches() {
    if (bullets.length && !orbReady) {
      warmOrb();
      return [];
    }
    if (bullets.length) uploadRecordFrame(9947, 0, 0);
    // Reuse allocated batches. One small sprite per projectile; the maximum is bounded by the pressure budget.
    while (batches.length < bullets.length) {
      const b = renderer.createBillboardBatch(9947, '0#0', { w: 2 * CROMWARK_ORB_RADIUS, h: 2 * CROMWARK_ORB_RADIUS }, [[0, 0, 0]]);
      b.noShadow = true; batches.push(b);
    }
    for (let i = 0; i < bullets.length; i++) batches[i].origin = [bullets[i][0], bullets[i][1] - CROMWARK_ORB_RADIUS, bullets[i][2]];
    return batches.slice(0, bullets.length);
  }
  function offset(delta) {
    const add = (o) => { for (let i = 0; i < 3; i++) o[i] += delta[i]; };
    for (const s of states) { add(s.origin); for (const m of s.pattern.marks) add(m.origin); for (const shot of s.pattern.shots) add(shot.origin); }
    for (const b of bullets) add(b);
  }
  function destroy() { for (const s of states) s.f._crom = null; states.clear(); for (const b of batches) renderer.destroyBatch(b); batches = []; marks = []; bullets = []; }
  return { begin, frame, hear, wire, offset, destroy, marks: () => marks, batches: bulletBatches };
}
