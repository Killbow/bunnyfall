// The live Eye of the Beholder body drawn behind the camera in third person.
import { eotbCamera } from './eotbCamera.js';
import { setEotbBodyReady, setEotbDrawBody, setEotbPlayerState } from './mwView.js';
import { modSettingIfDeclared, modSettingsOf, modSettingsGeneration } from '../mods/modSettings.js';
import {
  chooseTable, deathTable, ORIENTATIONS, orientationFor, facingFor, boatForwardOf, frameTime, speedMod, frameCount, isFootstepFrame,
  stateFor, STATE_TABLES, STRING, meleeAnimTickTime, RANGED_TICK, SPELL_TICK, LYCAN_TICK, DEATH_TICK,
  meleeStrokeFrames, forwardFrames, holdDrawFrames, mirrorFlips, mirrorRevertTime,
  DELAYED_FRAMES, ORIENTATION_TIME, signedAngleY, tableMoveSpeed, portrayedYaw,
} from './eotbBillboard.js';
import { spriteFor, eotbSpriteUrl, spriteCount, spriteSize, spriteOffset, flipRows, worldOrderColors, lookedPixels } from './eotbSprite.js';
import { decodePng } from '../render/textureReplacement.js';
import { isLayeredKey, decodeLayered, outfitOfSlots, layeredGenderOf, LAYERED_ARCHIVE } from './layeredArmor.js';
import { playerEntity } from '../characters/playerEntity.js';
import { equipTableOf } from '../characters/equip.js';
import { shownEquipTable } from '../characters/lookHidden.js';
import { horseLookCode, horseLookOfCode, lookSuffix } from '../travel/horseCoats.js';
import { createOwnDoll } from './eotbDoll.js';
import { getMeleeWeaponAnimTime } from '../characters/weaponStates.js';
import { setPlayerTorchOffsetOverride, setPlayerWaistLightOverride } from './playerTorch.js';
import {
  isRearView, createLanternArt, loadLanternArt, createSpriteLantern, restSpriteLantern, stepSpriteLantern, spriteStride,
  hangSpriteLantern, mintSpriteLantern, dropSpriteLantern,
} from './eotbLantern.js';

const STANDING_HEIGHT = 1.8;
const FP_DEPTH = -0.25;
const FP_HEAD = 0.9;
export const HORSE_PRELOAD_A_FRAME = 3;
const LAYERED_ARCHIVES = new Set(Object.values(LAYERED_ARCHIVE));
export const MATERIAL = Object.freeze({
  invisible: Object.freeze({ mode: 3, alpha: 0.4 }),
  shade: Object.freeze({ mode: 4, alpha: 0.6 }),
  blending: Object.freeze({ mode: 3, alpha: 0.8 }),
});
export const PLACE_JUMP_M = 8;
export const FOOTSTEP_VOLUME_SCALE = Object.freeze({ thirdPerson: 2, firstPerson: 1 });

function look() {
  let s = {};
  try { s = modSettingsOf('eye-of-the-beholder'); } catch { s = {}; }
  return {
    onFoot: s['Graphics.OnFoot'] ?? 0,
    onHorse: s['Graphics.OnHorse'] ?? 0,
    readyStance: s['Graphics.ReadyStance'] ?? 2,
    paperdoll: (s['Graphics.PlayerBody'] ?? 0) === 0,
    graphic: s['Graphics.Enable'] !== false,
    wornArmour: layeredGenderOf(s['Graphics.LayeredGear']) != null,
    layeredChoice: s['Graphics.LayeredGear'] ?? 0,
    layeredGender: layeredGenderOf(s['Graphics.LayeredGear'], playerEntity?.gender),
    turnToView: s['Graphics.TurnToView'] ?? 2,
    attackStrings: s['Graphics.AttackStrings'] ?? 3,
    mirrorTime: s['Graphics.MirrorTime'] ?? 3,
    visibility: s['Graphics.FirstPersonBillboard'] ?? 1,
    torchOffset: s['Graphics.TorchOffset'] ?? 1,
    syncFootsteps: s['Animation.SyncFootsteps'] !== false,
    dontHideWeapon: s['Compatibility.Don\'tHideWeapon'] === true,
    dontHideHorse: s['Compatibility.Don\'tHideHorse'] === true,
    scale: (s['Animation.BillboardScale'] ?? 1) + (s['Animation.FineBillboardScale'] ?? 0),
    walkAnimSpeedMod: s['Animation.WalkCycleSpeed'] ?? 1,
    enabled: s.Enabled !== false,
  };
}

function wornOutfit(gender) {
  let slots = null;
  try { slots = shownEquipTable(equipTableOf(playerEntity)); } catch { slots = null; }
  return { outfit: outfitOfSlots(slots), gender };
}

export function bodyState(s = {}) {
  const m = s.motion ?? {};
  const riding = s.riding ?? !!m.riding;
  const moving = !!((m.forward || 0) || (m.strafe || 0));
  const standing = m.standing != null ? !!m.standing : !moving;
  const stopped = s.stopped ?? (standing || (m.freeze || 0) > 0);
  return {
    died: !!s.died,
    transformed: !!s.transformed,
    lycanthropyType: s.lycanthropyType ?? 0,
    horseLook: horseLookCode(horseLookOfCode(s.horseLook ?? 0)),
    riding,
    stopped,
    sheathed: s.sheathed ?? !s.weaponReady,
    spellcasting: !!s.spellcasting,
    usingBow: !!s.usingBow,
    attacking: !!s.attacking,
    swingN: Number.isInteger(s.swingN) ? s.swingN : null,
    castPlaying: !!s.castPlaying,
    bowDrawback: !!s.bowDrawback,
    swingHeld: !!s.swingHeld,
    liveSpeed: Number.isFinite(s.liveSpeed) ? s.liveSpeed : 50,
    animCtx: s.animCtx ?? null,
    concealment: s.concealment ?? null,
    forward: m.forward || 0,
    strafe: m.strafe || 0,
    moveSpeed: tableMoveSpeed(m.forward || 0, m.strafe || 0, m.speed),
    grounded: m.grounded !== false,
    running: !!m.running,
    crouching: !!m.crouching,
    sneaking: !!m.sneaking,
    levitating: !!m.levitating,
    swimming: !!m.swimming,
    floating: !!m.levitating || !!m.swimming,
    onExteriorWater: !!m.onExteriorWater,
    height: Number.isFinite(m.height) && m.height > 0 ? m.height : STANDING_HEIGHT,
    hipLantern: !!s.hipLantern,
  };
}

export async function decodeSprite(url) {
  if (isLayeredKey(url)) return worldOrderColors(await decodeLayered(url, decodePng), { owned: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return worldOrderColors(await decodePng(new Uint8Array(await res.arrayBuffer())), { owned: true });
}

const norm2 = (v) => { const l = Math.hypot(v[0], v[2]); return l > 0 ? [v[0] / l, 0, v[2] / l] : [0, 0, 0]; };

export function createEotbBody({ count = spriteCount, urlFor = eotbSpriteUrl, decode = decodeSprite, loadLantern = loadLanternArt } = {}) {
  let renderer = null;
  const ownDoll = createOwnDoll();
  let attachedState = null;
  let clipSwing = null;
  let cfg = look();
  let cfgGeneration = modSettingsGeneration();
  function reload() {
    const was = cfg;
    cfg = look(); cfgGeneration = modSettingsGeneration();
    if (renderer && (was.onFoot !== cfg.onFoot || was.onHorse !== cfg.onHorse || was.wornArmour !== cfg.wornArmour || was.layeredGender !== cfg.layeredGender)) preload();
    return cfg;
  }
  let last = bodyState();
  let cam = { pos: [0, 0, 0], forward: [0, 0, 1], yaw: 0, feet: [0, 0, 0] };
  let face = null;

  let activeFlag = false;
  let FP = false;
  let frameCurrent = 0;
  let frameTimer = 0;
  let stateCurrent = 'Idle';
  let stateLast = null;
  let lastOrientation = 0;
  let orientationChosen = 0;
  let forceOrient = false;
  let lastMoveDirection = null;
  let currentAngle = 0;
  let orientationTimer = 0;
  let isAnimating = null;
  let animating = false;
  let died = false;
  let mirrorCount = 0;
  let mirrorTimer = 0;
  let strokeCount = 0;
  let footstepAlt = false;
  let hasPlayedFootstep = false;
  let wasGrounded = false;
  let vanillaDisabled = false;
  let shown = null;
  const pending = [];
  let fell = false;
  let fellVolume = 1;

  const tex = new Map();
  const decoded = new Map();
  let batch = null;
  let batchRec = null;
  let batchSize = null, batchPx = 0;
  let figure = null;
  let facingDrawn = null;
  let firstUp = false;

  const lantern = createSpriteLantern();
  const lanternArt = createLanternArt(() => renderer, loadLantern);
  let waistWritten = false;
  const lanternFacing = { fx: 0, fz: 1 };
  const lanternWaist = { left: 0, up: 0, forward: 0 };
  const lanternHangs = () => last.hipLantern && activeFlag && !FP && !died && !last.died && !last.riding && !last.transformed;
  const lanternShown = () => lanternHangs() && isRearView(shown?.orientation);
  function turnYaw() {
    const f = lastMoveDirection;
    return f && Math.hypot(f[0], f[2]) > 1e-6 ? Math.atan2(f[0], f[2]) : null;
  }
  function facingBasis() {
    const f = lastMoveDirection && (lastMoveDirection[0] || lastMoveDirection[2]) ? lastMoveDirection : cam.forward;
    const l = Math.hypot(f[0], f[2]) || 1;
    lanternFacing.fx = f[0] / l; lanternFacing.fz = f[2] / l;
    return lanternFacing;
  }
  function stepLantern(dt) {
    if (!lanternHangs()) { restSpriteLantern(lantern); dropLantern(); return; }
    const f = facingBasis();
    const tick = frameTime(last.riding, cfg.walkAnimSpeedMod) * speedMod(last);
    const stride = spriteStride(!last.stopped, last.moveSpeed, frameCurrent, frameTimer, tick, frameCount(stateCurrent));
    stepSpriteLantern(lantern, dt, f.fx, f.fz, last.moveSpeed || 0, stride);
  }
  function waistDefault() {
    if (waistWritten) { setPlayerWaistLightOverride(null); waistWritten = false; }
  }
  function dropLantern() {
    dropSpriteLantern(lantern, renderer);
    waistDefault();
  }
  function drawLantern() {
    if (!lanternHangs()) { dropLantern(); return false; }
    const art = lanternArt.ensure();
    if (!art || !batchSize) return false;
    const base = place();
    if (!base) return false;
    const f = facingBasis();
    hangSpriteLantern(lantern, base, batchSize.h, f.fx, f.fz, cam.pos, cam.feet, face?.yaw ?? cam.yaw, cfg.scale > 0 ? cfg.scale : 1, art);
    const mid = lantern.mid;
    const yaw = cam.yaw, sy = Math.sin(yaw), cy = Math.cos(yaw);
    const px = mid[0] - cam.feet[0], pz = mid[2] - cam.feet[2];
    const wo = lanternWaist;
    wo.left = -(px * cy - pz * sy); wo.up = mid[1] - cam.feet[1]; wo.forward = px * sy + pz * cy;
    setPlayerWaistLightOverride(wo);
    waistWritten = true;
    if (!isRearView(shown?.orientation)) return false;
    mintSpriteLantern(lantern, renderer).conceal = material();
    renderer.drawBillboards(lantern.list, lantern.right, lantern.up);
    return true;
  }

  const cacheKey = (s) => `${s.archive}:${s.rec}`;
  async function pixels(key) {
    let p = decoded.get(key);
    if (!p) {
      const url = urlFor(key);
      if (!url) return null;
      p = decode(url);
      decoded.set(key, p);
      p.then((img) => { if (decoded.get(key) === p) decoded.set(key, img); }, () => { if (decoded.get(key) === p) decoded.delete(key); });
    }
    return p;
  }
  function ensure(s) {
    if (!renderer || !s) return null;
    let have = tex.get(cacheKey(s));
    if (have && !(have instanceof Promise) && renderer.textures?.has && !renderer.textures.has(cacheKey(s).replace(':', '_'))) { tex.delete(cacheKey(s)); have = undefined; }
    if (have && !(have instanceof Promise)) return have;
    if (have !== undefined) return null;
    if (!urlFor(s.key)) { tex.set(cacheKey(s), null); return null; }
    const p = (async () => {
      const img = await pixels(s.key);
      if (tex.get(cacheKey(s)) !== p) return null;
      if (!img) throw new Error(`${s.key}: no art`);
      const { width, height, colors } = lookedPixels(s, img);
      const px = s.mirror ? flipRows(colors, width, height) : colors;
      renderer.uploadTexture(s.archive, s.rec, { width, height, colors: px });
      return { w: width, h: height };
    })();
    tex.set(cacheKey(s), p);
    p.then((r) => { if (tex.get(cacheKey(s)) !== p) return; tex.set(cacheKey(s), r); firstUp = true; },
      () => { if (tex.get(cacheKey(s)) === p) tex.set(cacheKey(s), null); });
    return null;
  }
  let outfitUp = null;
  function releaseOutfits(s, lk) {
    const layered = isLayeredKey(s.key);
    if (!layered && lk.outfit) return;
    const now = layered ? `${s.archive}|${lk.outfit}` : null;
    if (now === outfitUp) return;
    const had = outfitUp;
    outfitUp = now;
    if (had == null) return;
    const plain = String(lk.outfit ?? '').split('~')[0];
    const stands = (archive, code) => layered && archive === s.archive && (code === lk.outfit || code === plain);
    for (const k of [...tex.keys()]) {
      const i = k.indexOf(':'), archive = Number(k.slice(0, i));
      if (!LAYERED_ARCHIVES.has(archive) || stands(archive, k.slice(i + 1).split('_')[0])) continue;
      tex.delete(k);
      renderer?.evictTexture?.(k.replace(':', '_'));
    }
    for (const k of [...decoded.keys()]) {
      const p = isLayeredKey(k) ? k.split(':') : null;
      if (p && !stands(LAYERED_ARCHIVE[p[1]], p[4])) decoded.delete(k);
    }
  }
  const lookNow = () => ({ ...cfg, lycanthropyType: last.lycanthropyType, horse: last.horseLook ?? 0, ...(cfg.wornArmour ? wornOutfit(layeredGenderOf(cfg.layeredChoice, playerEntity?.gender)) : {}) });
  let preloadedForm = null;
  let preloadedLook = 0;
  let horseQueue = [];
  function preloadHorse() {
    const lk = lookNow();
    const was = preloadedLook;
    preloadedLook = lk.horse;
    if (was && was !== lk.horse) {
      const tail = lookSuffix(was);
      for (const [k] of [...tex]) {
        if (!k.endsWith(tail)) continue;
        tex.delete(k);
        renderer?.evictTexture?.(k.replace(':', '_'));
      }
    }
    horseQueue = [];
    for (const table of Object.keys(STATE_TABLES)) {
      if (!table.endsWith('Horse')) continue;
      for (let f = 0; f < frameCount(table); f++) for (let o = 0; o < ORIENTATIONS; o++) horseQueue.push([table, o, f]);
    }
  }
  function stepHorseQueue() {
    if (!horseQueue.length) return;
    const lk = lookNow();
    for (const [table, o, f] of horseQueue.splice(0, HORSE_PRELOAD_A_FRAME)) ensure(spriteFor(table, o, f, lk));
  }
  function preload(onlyLycan = false) {
    const lk = lookNow();
    preloadedForm = lk.lycanthropyType;
    if (!onlyLycan) preloadedLook = lk.horse;
    for (const table of Object.keys(STATE_TABLES)) {
      if (onlyLycan && !table.endsWith('Lycan')) continue;
      for (let f = 0; f < frameCount(table); f++) {
        for (let o = 0; o < ORIENTATIONS; o++) ensure(spriteFor(table, o, f, lk));
      }
    }
  }

  function updateBillboard(frame, orientation, table) {
    const n = frameCount(table);
    if (frame > n - 1) frame = n - 1;
    if (frame < 0) frame = 0;
    let mirror = stateFor(table, orientation)?.mirror ?? false;
    if (mirrorFlips(cfg.attackStrings, table, orientation, mirrorCount)) mirror = !mirror;
    if (FP && (cfg.visibility === 1 || cfg.visibility === 2) && last.riding) mirror = !mirror;
    shown = { table, orientation, frame, mirror, flip: mirror !== (stateFor(table, orientation)?.mirror ?? false) };
    frameCurrent = frame;
    lastOrientation = orientation;
  }
  function updateBillboardDelayed(frame, orientation, table) {
    pending.push({ frame, orientation, table, left: DELAYED_FRAMES });
  }
  function runDelayed() {
    for (let i = 0; i < pending.length;) {
      const p = pending[i];
      if (--p.left > 0) { i++; continue; }
      pending.splice(i, 1);
      updateBillboard(p.frame, p.orientation, p.table);
    }
  }

  function startClip(table, frames, interval, { freeze = false, kind = 'forward' } = {}) {
    isAnimating = { table, frames, interval, freeze, kind, i: 0, timer: 0, phase: kind === 'hold' ? 'draw' : 'run' };
    if (kind === 'hold') {
      if (frames.length) updateBillboard(frames[0], lastOrientation, table);
      else holdPhase();
    } else if (frames.length) updateBillboard(frames[0], lastOrientation, table);
    else endClip();
    return isAnimating;
  }
  function holdPhase() {
    const c = isAnimating;
    c.phase = 'hold';
    if (last.swingHeld) { updateBillboard(0, lastOrientation, c.table); return; }
    c.phase = 'release'; c.i = 0; c.frames = forwardFrames(frameCount(c.table)); c.timer = 0;
    updateBillboard(0, lastOrientation, c.table);
  }
  function endClip() {
    const c = isAnimating;
    if (c.kind === 'forward' && (cfg.attackStrings === STRING.Mirror || cfg.attackStrings === STRING.Mixed)) {
      if (c.table === 'AttackMelee' || c.table === 'AttackMeleeLycan') { mirrorTimer = 0; mirrorCount++; } else mirrorCount = 0;
    }
    isAnimating = null;
    if (!c.freeze) updateOrientation(true);
  }
  function advanceClip(dt) {
    const c = isAnimating;
    if (!c) return;
    if (c.phase === 'hold') { holdPhase(); return; }
    c.timer += dt;
    if (c.timer < c.interval) return;
    c.timer = 0;
    c.i++;
    if (c.i < c.frames.length) { updateBillboard(c.frames[c.i], lastOrientation, c.table); return; }
    if (c.kind === 'hold' && c.phase === 'draw') { holdPhase(); return; }
    endClip();
  }
  function playMeleeAttack() {
    if (last.riding || isAnimating) return null;
    const n = frameCount('AttackMelee');
    const animTime = getMeleeWeaponAnimTime(last.liveSpeed, last.animCtx);
    const frames = meleeStrokeFrames(n, Number.isInteger(last.swingN) ? last.swingN : strokeCount++);
    return startClip('AttackMelee', frames, meleeAnimTickTime(animTime, frames.length));
  }
  function playRangedAttack() {
    if (last.riding || isAnimating) return null;
    return startClip('AttackRanged', forwardFrames(frameCount('AttackRanged')), RANGED_TICK);
  }
  function playRangedAttackHold() {
    if (last.riding || isAnimating) return null;
    return startClip('AttackRanged', holdDrawFrames(frameCount('AttackRanged')), RANGED_TICK, { kind: 'hold' });
  }
  function playSpellAttack() {
    if (last.riding || isAnimating) return null;
    return startClip('AttackSpell', forwardFrames(frameCount('AttackSpell')), SPELL_TICK);
  }
  function playLycanAttack() {
    if (last.riding || isAnimating) return null;
    return startClip('AttackMeleeLycan', forwardFrames(frameCount('AttackMeleeLycan')), LYCAN_TICK);
  }
  function playDeath() {
    if (last.riding) return null;
    isAnimating = null;
    const table = deathTable(last);
    return startClip(table, forwardFrames(frameCount(table)), DEATH_TICK, { freeze: true });
  }

  function faceYaw(yaw) {
    if (!Number.isFinite(yaw)) return;
    lastMoveDirection = [Math.sin(yaw), 0, Math.cos(yaw)];
    forceOrient = true;
  }

  function updateOrientation(force) {
    if (ORIENTATION_TIME > 0) {
      if (orientationTimer > ORIENTATION_TIME) orientationTimer = 0;
      else return;
    }
    const toCamera = norm2([cam.pos[0] - cam.feet[0], 0, cam.pos[2] - cam.feet[2]]);
    const yaw = cam.yaw;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    const moveDir = (last.forward || last.strafe)
      ? [last.strafe * cy + last.forward * sy, 0, -last.strafe * sy + last.forward * cy]
      : [0, 0, 0];
    const facing = facingFor({
      turnToView: cfg.turnToView, floating: last.floating, animating: !!isAnimating,
      sheathed: last.sheathed, spellcasting: last.spellcasting, stopped: last.stopped,
      boatForward: boatForwardOf(eotbCamera.sailing()),
    }, moveDir, lastMoveDirection, cam.forward);
    lastMoveDirection = facing;
    currentAngle = signedAngleY(toCamera, facing);
    const o = orientationFor(facing, toCamera);
    orientationChosen = o;
    if (o !== lastOrientation || force || forceOrient || !shown) { forceOrient = false; updateBillboardDelayed(frameCurrent, o, stateCurrent); }
    if (!FP && cfg.torchOffset === 2) {
      const head = [cam.feet[0], cam.feet[1] + FP_HEAD, cam.feet[2]];
      torchAt([head[0] + (cam.pos[0] - head[0]) * 0.5, head[1] + (cam.pos[1] - head[1]) * 0.5, head[2] + (cam.pos[2] - head[2]) * 0.5]);
    } else if (!FP && cfg.torchOffset === 1) {
      const c = place();
      const d = norm2(lastMoveDirection);
      torchAt(c ? [c[0] + d[0] * 0.5, c[1] + 0.45, c[2] + d[2] * 0.5] : null);
    }
  }
  let torchWritten = false;
  function torchAt(p) {
    if (!p) return;
    const yaw = cam.yaw, sy = Math.sin(yaw), cy = Math.cos(yaw);
    const dx = p[0] - cam.feet[0], dz = p[2] - cam.feet[2];
    setPlayerTorchOffsetOverride({ left: -(dx * cy - dz * sy), up: p[1] - cam.feet[1], forward: dx * sy + dz * cy });
    torchWritten = true;
  }
  function torchDefault() {
    if (torchWritten) { setPlayerTorchOffsetOverride(null); torchWritten = false; }
  }

  function material() {
    const f = last.concealment;
    if (!f) return null;
    if (f.invisible) return MATERIAL.invisible;
    if (f.shade) return MATERIAL.shade;
    if (f.blending) return MATERIAL.blending;
    return null;
  }

  function playFootstep() {
    if (last.levitating) return;
    if (last.riding && !last.onExteriorWater) return;
    if (last.swimming) { hasPlayedFootstep = true; return; }
    fell = true;
    fellVolume = FP ? FOOTSTEP_VOLUME_SCALE.firstPerson : FOOTSTEP_VOLUME_SCALE.thirdPerson;
    footstepAlt = !footstepAlt;
    hasPlayedFootstep = true;
  }
  function loopIdleBillboard(dt) {
    const n = frameCount(stateCurrent);
    if (n > 1) {
      const mod = speedMod(last);
      if (cfg.syncFootsteps && !last.stopped && last.grounded && !animating) {
        if (isFootstepFrame(frameCurrent, last.riding)) { if (!hasPlayedFootstep) playFootstep(); } else hasPlayedFootstep = false;
      }
      if (frameTimer > frameTime(last.riding, cfg.walkAnimSpeedMod) * mod) {
        if (frameCurrent < n - 1) frameCurrent++; else frameCurrent = 0;
        if (frameCurrent > n - 1) frameCurrent = 0;
        updateBillboardDelayed(frameCurrent, orientationChosen, stateCurrent);
        frameTimer = 0;
      } else frameTimer += dt;
    }
    stateCurrent = chooseTable({ ...last, readyStance: cfg.readyStance });
    if (stateLast !== stateCurrent || (animating && !isAnimating)) updateBillboardDelayed(frameCurrent, orientationChosen, stateCurrent);
    if (isAnimating && !animating) animating = true;
    else if (!isAnimating && animating) animating = false;
    stateLast = stateCurrent;
  }

  function update(dt) {
    if (ORIENTATION_TIME > 0 && orientationTimer <= ORIENTATION_TIME) orientationTimer += dt;
    if (cfg.attackStrings === STRING.Mirror || cfg.attackStrings === STRING.Mixed) {
      const t = mirrorRevertTime(cfg.mirrorTime, FP);
      if (mirrorCount > 0 && !isAnimating && t > 0) {
        if (mirrorTimer > t) {
          mirrorCount = 0; mirrorTimer = 0;
          updateBillboardDelayed(frameCurrent, orientationChosen, stateCurrent);
          return;
        }
        mirrorTimer += dt;
      }
    }
  }
  function lateUpdate(dt) {
    if (died) {
      if (last.died) return;
      initialize();
    }
    if (last.died) { died = true; playDeath(); return; }
    updateOrientation(false);
    if (!isAnimating) {
      if (last.attacking) {
        const fresh = last.swingN == null || last.swingN !== clipSwing;
        if (last.transformed) { if (fresh && playLycanAttack()) clipSwing = last.swingN; }
        else if (!last.usingBow) { if (fresh && playMeleeAttack()) clipSwing = last.swingN; }
        else if (last.bowDrawback) playRangedAttackHold();
        else playRangedAttack();
      }
      if (last.castPlaying) playSpellAttack();
    }
    loopIdleBillboard(dt);
    if (cfg.syncFootsteps) {
      const grounded = last.grounded;
      if (grounded && !wasGrounded) playFootstep();
      wasGrounded = grounded;
    }
  }

  function initialize() {
    cfg = look();
    died = false;
    isAnimating = null;
    mirrorCount = 0; mirrorTimer = 0;
    stateCurrent = stateLast ?? 'Idle';
    vanillaDisabled = cfg.syncFootsteps;
    updateOrientation(true);
  }

  function place() {
    if (!shown || !batchSize) return null;
    const sp = spriteFor(shown.table, shown.orientation, shown.frame, lookNow());
    const xml = spriteOffset(sp.archive, sp.record);
    const size = batchSize;
    const h = last.height;
    const yaw = cam.yaw, sy = Math.sin(yaw), cy = Math.cos(yaw);
    const right = [cy, 0, -sy], fwd = [sy, 0, cy];
    const x = xml.x / xml.scale * (shown.mirror ? -1 : 1);
    const yOff = xml.y / xml.scale;
    let y;
    if (last.onExteriorWater) y = yOff - size.h * 0.5;
    else if (last.crouching) y = yOff + size.h * 0.5 - h;
    else y = yOff + size.h * 0.5 - h * 0.5;
    const z = FP && cfg.visibility > 0 ? FP_DEPTH : 0;
    const origin = [cam.feet[0], cam.feet[1] + h * 0.5, cam.feet[2]];
    const base = y - size.h * 0.5;
    return [origin[0] + right[0] * x + fwd[0] * z, origin[1] + base, origin[2] + right[2] * x + fwd[2] * z];
  }

  return {
    figure() { return figure; },
    facing() { return facingDrawn; },
    faceYaw,
    attach(r, playerState) {
      if (r && r === renderer && playerState === attachedState) return this;
      attachedState = playerState ?? null;
      clipSwing = null;
      renderer = r || null;
      reload();
      if (renderer) {
        preload();
        setEotbBodyReady(() => this.ready());
        setEotbDrawBody((canvas, f) => this.draw(canvas, f), () => this.figure(), () => this.facing());
        setEotbPlayerState(playerState);
      }
      eotbCamera.setBillboard(this);
      return this;
    },

    toggle(active, fp = false) {
      FP = !!fp;
      activeFlag = !!active;
      if (!activeFlag) { torchDefault(); pending.length = 0; dropLantern(); }
      if (activeFlag) initialize();
      return activeFlag;
    },
    torchDefault,
    standDown() { dropLantern(); },
    useDolls(source) { ownDoll.setSource(source); },
    rebase(delta) {
      if (!delta || !cam.feet) return;
      cam.feet = [cam.feet[0] + delta[0], cam.feet[1] + delta[1], cam.feet[2] + delta[2]];
    },

    ready() {
      if (cfgGeneration !== modSettingsGeneration()) reload();
      if (!renderer || !cfg.enabled) return false;
      if (modSettingIfDeclared('eye-of-the-beholder', 'Enabled') === false) return false;
      return count() > 0 && firstUp;
    },

    tick(dt, state = {}) {
      last = bodyState(state);
      if (renderer && last.lycanthropyType !== preloadedForm) preload(true);
      if (renderer && last.horseLook !== preloadedLook) preloadHorse();
      stepHorseQueue();
      fell = false;
      const was = cam.feet;
      if (state.feet) cam.feet = state.feet;
      if (state.cameraPos) cam.pos = state.cameraPos;
      if (Number.isFinite(state.yaw)) { cam.yaw = state.yaw; cam.forward = [Math.sin(state.yaw), 0, Math.cos(state.yaw)]; }
      if (state.cameraForward) cam.forward = state.cameraForward;
      if (state.feet && was && !(last.forward || last.strafe) && Math.hypot(state.feet[0] - was[0], state.feet[2] - was[2]) > PLACE_JUMP_M) faceYaw(Math.atan2(cam.forward[0], cam.forward[2]));
      if (FP) cam.pos = [cam.feet[0], cam.feet[1] + FP_HEAD, cam.feet[2]];
      if (!activeFlag) return { table: stateCurrent, frame: frameCurrent, clip: null };
      update(dt);
      runDelayed();
      advanceClip(dt);
      lateUpdate(dt);
      stepLantern(dt);
      return { table: stateCurrent, frame: frameCurrent, clip: isAnimating ? { table: isAnimating.table, i: isAnimating.i, phase: isAnimating.phase } : null };
    },

    draw(canvas, { eye, feet, yaw, face: faceNow = null } = {}) {
      face = faceNow && Number.isFinite(faceNow.yaw) ? faceNow : null;
      figure = null; facingDrawn = null;
      if (!renderer || !activeFlag || !shown) return false;
      if (!cfg.graphic) { dropLantern(); return false; }
      if (feet) cam.feet = feet;
      if (Number.isFinite(yaw)) cam.yaw = yaw;
      if (eye && !FP) cam.pos = eye;
      const flipView = FP && cfg.visibility === 2;
      const lk = lookNow();
      const doll = cfg.paperdoll && !FP && !last.riding && !last.transformed && !last.died ? ownDoll.pick(shown.orientation, Date.now()) : null;
      const s = doll ?? spriteFor(shown.table, shown.orientation, shown.frame, lk, { flip: shown.flip !== flipView });
      const grow = face && face.grow > 1 ? face.grow : 1;
      const up = doll ? { w: doll.w, h: doll.h } : ensure(s);
      if (up) {
        if (!doll) releaseOutfits(s, lk);
        const xml = doll ? { scale: 1 } : spriteOffset(s.archive, s.record);
        const dollK = cfg.scale > 0 ? cfg.scale : 1;
        const size = doll ? { w: doll.w * dollK, h: doll.h * dollK } : spriteSize(up.w, up.h, { riding: last.riding, transformed: last.transformed, scale: cfg.scale }, xml.scale);
        const key = `${cacheKey(s)}|${grow}`;
        if (!batch || batchRec !== key) {
          if (batch) renderer.destroyBillboardBatch?.(batch);
          batch = renderer.createBillboardBatch(s.archive, s.rec, grow > 1 ? { w: size.w * grow, h: size.h * grow } : size, [[0, 0, 0]]);
          batch.origin = [0, 0, 0];
          batch.selfCard = grow === 1;
          batch.noShadow = grow > 1;
          batchRec = key;
        }
        batchSize = size; batchPx = up.h;
      }
      if (!batch) return false;
      const c = place();
      if (!c) return false;
      batch.origin[0] = c[0]; batch.origin[1] = c[1]; batch.origin[2] = c[2];
      figure = last.riding || FP || doll ? null : { base: c[1] - cam.feet[1], mpp: batchPx > 0 ? batchSize.h * grow / batchPx : 0, beast: !!last.transformed };
      const seen = FP ? null : portrayedYaw(shown.orientation, [cam.pos[0] - cam.feet[0], 0, cam.pos[2] - cam.feet[2]]);
      facingDrawn = seen === null ? null : { yaw: seen, turn: turnYaw() ?? seen };
      batch.conceal = material();
      const by = face ? face.yaw : cam.yaw;
      const camRight = [Math.cos(by), 0, -Math.sin(by)];
      const bbUp = face?.up ?? [0, 1, 0];
      if (!FP || cfg.visibility === 2) renderer.drawBillboards([batch], camRight, bbUp);
      else if (cfg.visibility === 1) renderer.recordShadowBillboards?.([batch], camRight, bbUp);
      if (grow === 1) drawLantern();
      return true;
    },

    footstep() {
      return { owns: vanillaDisabled, fell, volumeScale: fellVolume };
    },

    hides() {
      const tp = eotbCamera.thirdPerson() && this.ready();
      return { weapon: tp && !cfg.dontHideWeapon, horse: tp && !cfg.dontHideHorse, spellHands: tp };
    },

    state: () => ({
      active: activeFlag, FP, table: stateCurrent, orientation: lastOrientation, frame: frameCurrent, ready: firstUp, cached: tex.size,
      shown: shown ? { ...shown } : null, pending: pending.map((p) => ({ ...p })),
      clip: isAnimating ? { table: isAnimating.table, frames: [...isAnimating.frames], i: isAnimating.i, kind: isAnimating.kind, phase: isAnimating.phase, interval: isAnimating.interval, freeze: isAnimating.freeze } : null,
      mirrorCount, mirrorTimer, strokeCount, died, animating, currentAngle, orientationTimer, orientationChosen,
      lastMoveDirection: lastMoveDirection ? [...lastMoveDirection] : null, last: { ...last }, hasPlayedFootstep, footstepAlt, wasGrounded,
      material: material(), placed: place(),
      lantern: { hangs: lanternHangs(), shown: lanternShown(), swing: { fore: lantern.swing.fore, side: lantern.swing.side }, batch: !!lantern.batch },
    }),
    settings: () => cfg,
    reload,
    orientations: ORIENTATIONS,
  };
}

export const eotbBody = createEotbBody();
