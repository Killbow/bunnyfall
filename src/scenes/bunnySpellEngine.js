// @ts-check
// BUNNY-SPELLS (2026-10-30): WHAT BUNNYFALL'S OWN EFFECTS DO IN THE SCENE - built by the cast engine (scenes/hostMagic.js),
// one per engine, so every host that casts has them (THE FOUR HOSTS RULE: the engine is the one seam they share).
//
//   METEOR        an Area at Range spell carrying it starts in the sky over the spot aimed at (`meteorStart`), and its
//                 burst (`burst`) throws the foes in it back.
//   GRAVITY WELL  where an area spell carrying it bursts, a well stands for its rounds: each frame the foes about it are
//                 pulled toward its centre, through the motor's own knockback (characters/enemy/enemyMotor.js), so the
//                 floor and the walls hold them as a blow's push does.
//   WALL OF EARTH a box of earth rises where the caster looks (`cast`), a collider bucket of its own: the player and
//                 every foe are stopped by it. It stands while the caster's buff does.
//   DECOY         a double stands where the caster looks while the buff does; the caster is lost to the foes as one
//                 blending is (effects.js isBlending), and the foes about it go to it (their last known place of the
//                 target, the motor's own pursuit).
//   RESCUE        the party member, companion or allied creature the caster can see (`rescue`) is brought to their side
//                 - another player through their own client (the host's `rescuePeer`), anyone this engine runs here.
// The shapes are drawn with the impact light's bursts (the engine's `burst`), a shimmer where they stand.

import {
  METEOR_TYPE, WELL_TYPE, WALL_TYPE, DECOY_TYPE, spellHas, METEOR_HEIGHT_M, METEOR_KNOCKBACK, RESCUE_REACH_M,
  RESCUE_SET_DOWN_M, WALL_REACH_M, WALL_SIZE, DECOY_REACH_M, DECOY_LURE_M, WELL_RADIUS_M, WELL_PULL,
} from '../systems/spell/bunnySpellLaw.js';
import { hasActiveEffect, rollDuration } from '../systems/effects.js';
import { t } from '../systems/textManager.js';

/** How often a standing shape shimmers, seconds. */
const SHIMMER_S = 0.45;
/** Seconds a round lasts (a magic round, DFU's). */
const ROUND_S = 5;
/** Knockback units per classic unit (enemyMotor.js KB): the motor's own scale. */
const KB = (v) => v / 3.95;
const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
/** How near the aim a body must pass to be picked, metres. */
const PICK_SLACK_M = 0.9;

/**
 * @param {{ collider: any, foes: () => any[], playerEntity: any, say: (s: string) => void,
 *   burstFx: (kind: string, pos: number[], o?: any) => void, glowFx?: ((kind: string, pos: number[], o?: any) => void) | null, companions?: (() => any[]) | null,
 *   rescueTarget?: ((eye: number[], dir: number[], reach: number) => ({ id: string, name: string, distance: number } | null)) | null,
 *   rescuePeer?: ((id: string) => boolean) | null, casterLevel: () => number }} deps
 */
export function createBunnySpellEngine(deps) {
  const { collider, foes, playerEntity, say, burstFx } = deps;
  const glowFx = deps.glowFx ?? burstFx;
  /** @type {{ key: string, owner: any, at: number[], dir: number[] } | null} */
  let wall = null;
  /** @type {{ at: number[] } | null} */
  let decoy = null;
  /** @type {Array<{ at: number[], left: number }>} */
  const wells = [];
  let shimmer = 0, wallSeq = 0;

  const unit = (d) => { const l = Math.hypot(d[0], d[1], d[2]) || 1; return [d[0] / l, d[1] / l, d[2] / l]; };
  const owner = () => collider?.target?.() ?? collider;
  /** Where the aim meets a surface within `reach`, or the point `reach` along it, set down on the floor beneath. */
  function aimPoint(eye, dir, reach) {
    const u = unit(dir);
    let t = reach;
    try { const h = collider.raycast(eye, u, reach); if (Number.isFinite(h)) t = Math.max(0.5, h - 0.4); } catch { /* the whole reach */ }
    const p = [eye[0] + u[0] * t, eye[1] + u[1] * t, eye[2] + u[2] * t];
    try {
      const down = collider.raycast([p[0], p[1] + 0.5, p[2]], [0, -1, 0], 40);
      if (Number.isFinite(down)) p[1] = p[1] + 0.5 - down;
      else if (typeof collider.heightAt === 'function') { const g = collider.heightAt(p[0], p[2]); if (Number.isFinite(g)) p[1] = g; }
    } catch { /* where it is */ }
    return p;
  }
  /** Is the way from the eye to `to` clear? */
  function clear(eye, to) {
    const d = [to[0] - eye[0], to[1] - eye[1], to[2] - eye[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (!(len > 0)) return true;
    try { const h = collider.raycast(eye, unit(d), len); return !(Number.isFinite(h) && h < len - 0.3); } catch { return true; }
  }

  // ── METEOR ─────────────────────────────────────────────────────────────────────────────────────────────────────
  /** Where an Area at Range spell carrying Meteor starts and which way it goes: over the spot aimed at, straight down. */
  function meteorStart(sp, eye, dir) {
    if (!spellHas(sp, METEOR_TYPE) || sp.rangeType !== 4) return null;
    const at = aimPoint(eye, dir, 80);
    return { pos: [at[0], at[1] + METEOR_HEIGHT_M, at[2]], dir: [0, -1, 0] };
  }

  // ── BURSTS: Meteor's throw, Gravity Well's opening ─────────────────────────────────────────────────────────────
  function burst(pos, spell, radius) {
    if (spellHas(spell, METEOR_TYPE)) {
      for (const f of foes()) {
        const p = f?.ai?.feet;
        if (!p || f.dead || f.puppet) continue;
        const d = [p[0] - pos[0], 0, p[2] - pos[2]];
        const dist = Math.hypot(d[0], d[2]);
        if (dist > radius + 1) continue;
        const u = dist > 0.01 ? [d[0] / dist, 0.35, d[2] / dist] : [0, 1, 0];
        f.ai.knockbackSpeed = Math.max(f.ai.knockbackSpeed ?? 0, KB(METEOR_KNOCKBACK));
        f.ai.knockbackDir = unit(u);
      }
    }
    if (spellHas(spell, WELL_TYPE)) {
      const e = spell.effects.find((x) => x?.type === WELL_TYPE);
      const rounds = Math.max(1, rollDuration(e, deps.casterLevel()));
      wells.push({ at: [pos[0], pos[1], pos[2]], left: rounds * ROUND_S });
      say(t('spell.bunny.wellOpens', 'A well of gravity opens.'));
    }
  }

  // ── WALL OF EARTH and DECOY: placed at the cast ───────────────────────────────────────────────────────────────
  function raiseWall(eye, dir) {
    dropWall();
    const at = aimPoint(eye, dir, WALL_REACH_M);
    const f = unit([dir[0], 0, dir[2]]);
    const r = [f[2], 0, -f[0]];   // across the aim
    const hw = WALL_SIZE.w / 2, hd = WALL_SIZE.d / 2, y0 = at[1] - 0.3, y1 = at[1] + WALL_SIZE.h;
    const corner = (a, b, y) => [at[0] + r[0] * a + f[0] * b, y, at[2] + r[2] * a + f[2] * b];
    const c = [corner(-hw, -hd, y0), corner(hw, -hd, y0), corner(hw, hd, y0), corner(-hw, hd, y0),
      corner(-hw, -hd, y1), corner(hw, -hd, y1), corner(hw, hd, y1), corner(-hw, hd, y1)];
    const positions = new Float32Array(c.flat());
    const o = owner();
    if (!standWall(o, positions)) return;
    wall = { key: `bunny-wall-${wallSeq}`, owner: o, at, dir: f, positions };
    burstFx('magic', [at[0], at[1] + 1, at[2]], { power: 1.2, area: WALL_SIZE.w / 2, heard: 40, shake: 2 });
  }
  const WALL_INDICES = new Uint32Array([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
  /** The wall's box as a collider bucket of its own (a fresh key each time it stands). */
  function standWall(o, positions) {
    const key = `bunny-wall-${++wallSeq}`;
    try { o.addMesh(key, positions, WALL_INDICES, IDENTITY); o.settle?.(key); return true; } catch (e) { console.warn('[spells] the wall would not stand', e); return false; }
  }
  function dropWall() {
    if (!wall) return;
    try { wall.owner.removeBucket(wall.key); } catch { /* gone with its scene */ }
    burstFx('magic', [wall.at[0], wall.at[1] + 1, wall.at[2]], { power: 0.6, heard: 30 });
    wall = null;
  }
  /** A caster-only cast just landed (the cast engine's CasterOnly arm): what it placed, where the caster looks. */
  function cast(sp, eye, dir) {
    if (!eye || !dir) return;
    if (spellHas(sp, WALL_TYPE) && hasActiveEffect(playerEntity, 'wallOfEarth')) raiseWall(eye, dir);
    if (spellHas(sp, DECOY_TYPE) && hasActiveEffect(playerEntity, 'decoy')) {
      decoy = { at: aimPoint(eye, dir, DECOY_REACH_M) };
      burstFx('magic', [decoy.at[0], decoy.at[1] + 1, decoy.at[2]], { power: 1, heard: 30 });
    }
  }

  // ── RESCUE ─────────────────────────────────────────────────────────────────────────────────────────────────────
  /** The body the aim passes nearest along it, within reach and in sight: `{ rec, feet, name }`. */
  function pickBody(eye, dir, bodies) {
    const u = unit(dir);
    let best = null, bestT = Infinity;
    for (const b of bodies) {
      const f = b.feet;
      const h = b.height ?? 1.8;
      const mid = [f[0], f[1] + h * 0.55, f[2]];
      const v = [mid[0] - eye[0], mid[1] - eye[1], mid[2] - eye[2]];
      const t = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
      if (!(t > 0) || t > RESCUE_REACH_M || t >= bestT) continue;
      const off = Math.hypot(v[0] - u[0] * t, v[1] - u[1] * t, v[2] - u[2] * t);
      if (off > PICK_SLACK_M + h * 0.3) continue;
      if (!clear(eye, mid)) continue;
      best = b; bestT = t;
    }
    return best;
  }
  /** Where a rescued body is set down: a step in front of the caster, on the floor. */
  function setDownAt(feet, eye, dir) {
    const f = unit([dir[0], 0, dir[2]]);
    const p = [feet[0] + f[0] * RESCUE_SET_DOWN_M, feet[1], feet[2] + f[2] * RESCUE_SET_DOWN_M];
    try { const c = owner().findClearFloor?.(p); if (c) return c; } catch { /* the step itself */ }
    return p;
  }
  /** Cast: the one the caster sees is brought to them. Answers whether anyone was. */
  function rescue(eye, dir, feet) {
    if (!eye || !dir || !feet) { say(t('spell.bunny.noRescue', 'There is no one in sight to rescue.')); return false; }
    // another player first (their own client moves them: the host's door)
    const peer = deps.rescueTarget?.(eye, dir, RESCUE_REACH_M) ?? null;
    if (peer && deps.rescuePeer?.(peer.id)) { say(t('spell.bunny.rescueCall', 'You call {name} to your side.', { name: peer.name })); return true; }
    const bodies = [];
    for (const c of deps.companions?.() ?? []) {
      const f = c?.ai?.feet;
      if (c && !c.dead && !c.puppet && Array.isArray(f)) bodies.push({ rec: c, feet: f, height: c.ai.height, name: c.entity?.name || 'your companion' });
    }
    for (const c of foes()) {
      const f = c?.ai?.feet;
      const allied = (c?.entity?.mobileTeam ?? c?.entity?.basics?.team) === 'PlayerAlly';
      if (c && !c.dead && !c.puppet && allied && Array.isArray(f)) bodies.push({ rec: c, feet: f, height: c.ai.height, name: c.entity?.name || 'your ally' });
    }
    const hit = pickBody(eye, dir, bodies);
    if (!hit) { say(t('spell.bunny.noRescue', 'There is no one in sight to rescue.')); return false; }
    const to = setDownAt(feet, eye, dir);
    const ai = hit.rec.ai;
    burstFx('magic', [hit.feet[0], hit.feet[1] + 1, hit.feet[2]], { power: 0.8, heard: 30 });
    ai.feet[0] = to[0]; ai.feet[1] = to[1]; ai.feet[2] = to[2];
    if (ai.knockbackSpeed) ai.knockbackSpeed = 0;
    burstFx('magic', [to[0], to[1] + 1, to[2]], { power: 0.8, heard: 30 });
    say(t('spell.bunny.rescuePull', 'You pull {name} to your side.', { name: hit.name }));
    return true;
  }

  // ── THE FRAME ──────────────────────────────────────────────────────────────────────────────────────────────────
  function update(dt) {
    if (wall && !hasActiveEffect(playerEntity, 'wallOfEarth')) dropWall();
    if (decoy && !hasActiveEffect(playerEntity, 'decoy')) decoy = null;
    shimmer -= dt;
    const glow = shimmer <= 0;
    if (glow) shimmer = SHIMMER_S;
    if (decoy) {
      if (glow) glowFx('magic', [decoy.at[0], decoy.at[1] + 1, decoy.at[2]], { scale: 0.6, power: 0.3 });
      for (const f of foes()) {
        const p = f?.ai?.feet;
        if (!p || f.dead || f.puppet || !f.ai.isHostile) continue;
        if (Math.hypot(p[0] - decoy.at[0], p[2] - decoy.at[2]) > DECOY_LURE_M) continue;
        f.ai.lastKnownTargetPos = [decoy.at[0], decoy.at[1], decoy.at[2]];
      }
    }
    if (wall && glow) {
      const r = [wall.dir[2], 0, -wall.dir[0]];
      const a = (Math.random() - 0.5) * WALL_SIZE.w;
      glowFx('magic', [wall.at[0] + r[0] * a, wall.at[1] + Math.random() * WALL_SIZE.h, wall.at[2] + r[2] * a], { scale: 0.5, power: 0.2 });
    }
    for (let i = wells.length - 1; i >= 0; i--) {
      const w = wells[i];
      w.left -= dt;
      if (w.left <= 0) { wells.splice(i, 1); continue; }
      if (glow) glowFx('magic', [w.at[0], w.at[1] + 0.5, w.at[2]], { scale: 0.8, power: 0.4, area: WELL_RADIUS_M * 0.4 });
      for (const f of foes()) {
        const p = f?.ai?.feet;
        if (!p || f.dead || f.puppet) continue;
        const d = [w.at[0] - p[0], 0, w.at[2] - p[2]];
        const dist = Math.hypot(d[0], d[2]);
        if (dist > WELL_RADIUS_M || dist < 0.8) continue;
        f.ai.knockbackSpeed = Math.max(f.ai.knockbackSpeed ?? 0, KB(WELL_PULL));
        f.ai.knockbackDir = [d[0] / dist, 0, d[2] / dist];
      }
    }
  }

  /** A floating origin's shift: every place this engine keeps moves with the scene. */
  function shift(o) {
    for (const p of [wall?.at, decoy?.at, ...wells.map((w) => w.at)]) if (p) { p[0] += o[0]; p[1] += o[1]; p[2] += o[2]; }
    // the wall's bucket stands in the scene's own place (no frame carries it): stood again where the scene moved it
    if (wall) {
      try { wall.owner.removeBucket(wall.key); } catch { /* gone */ }
      for (let i = 0; i < wall.positions.length; i += 3) { wall.positions[i] += o[0]; wall.positions[i + 1] += o[1]; wall.positions[i + 2] += o[2]; }
      if (standWall(wall.owner, wall.positions)) wall.key = `bunny-wall-${wallSeq}`;
      else wall = null;
    }
  }
  /** The scene is leaving: nothing stands in the next. */
  function clearAll() { dropWall(); decoy = null; wells.length = 0; }

  return { meteorStart, burst, cast, rescue, update, shift, clearAll };
}
