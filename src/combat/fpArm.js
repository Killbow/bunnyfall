// The Morrowind first-person arm and third-person body: build, animation state, and draw.

import { classicFaceRecord } from '../characters/roxArgonians.js';
import { lookAt, multiply, ortho, perspective, transformPoint, trs, wrapAngle } from '../world/mat4.js';
import { ClimbPose, POSE } from '../player/climbPose.js';
import { runWeightStep, runPhaseFollow, pumpTarget3D, RUN_3D, mirrorStrike, guardStep, GUARD, pairSpreadAngle, PAIR_SPREAD, easeTo } from './twoHands/handsLaw.js';
import { strikingSide, mirrorPlan, counterpartName } from './twoHands/mirrorRig.js';
import { createHeldClips, spellHandLimbs, spellHandStanceStep, drawsIntoSpellHand } from './twoHands/spellHandArm.js';
import { blowWeaponOf } from './twoHands/mixedArm.js';
import { climbRequestToRig, climbRequestToFirstPerson } from './climbRig.js';
import { seatRequestFor, seatedCamera, saddleRequestFor } from '../player/seatPose.js';
import { fieldOfView } from '../ui/viewSettings.js';
import { CHAR_SPRITE_RT_SIZE } from '../render/renderer.js';
import {
  sampleTrack, resetClip, advanceClip, getTextKeyTime, getStartTime,
} from '../formats/mwAnim.js';
import { accumRootRef, buildSkeleton, GRAPH_ROOT } from '../formats/mwSkin.js';
import { nodeTransformOf } from '../formats/mwCharacter.js';
import { parseNif } from '../formats/mwNifFile.js';
import { flattenNif } from '../formats/mwNifMesh.js';
import {
  assembleFirstPersonArm, poseAssembly, armPieceRows, clipReport, clipUnionBounds, clipSweepTimes, bindPartsInto,
  armReport, armMeshPaths, bodyParts,
  weaponRecords, dfWeaponToMw, dfWeaponShape, pickWeaponRecord, weaponAttachBone, MW_WEAPON_TYPE,
  ammoTypeFor, arrowAttachBone, ARROW_FALLBACK_NODE, reloadsItself, shootsRatherThanSwings,
  firstPersonCameraRef, composeStanceGroup, composeWeaponGroup, mwAttackType, attackKeys, MW_SHOOT_ATTACK, strikeReversed,
  weaponShortGroup, calculateWindUp, releaseStartPoint, EQUIP_KEYS, UNEQUIP_KEYS, isRealWeapon,
  aimingFactor, fpAnimSources, pickAnimSource, anySourceHasGroup, FP_BASE_MODEL, animSourceName,
  gmstValue, GMST_SNEAK_DELTA, sneakOffset,
  lightRecords, pickTorchRecord, blendMaskBones, overlayTracks, overlaySampler, weaponFlags, MW_TWO_HANDED,
  pickLanternRecord, hangAnchor, hookOnBone, hangAffine,
  tpAnimSources, TP_BASE_MODEL, playerBodyRows, werewolfHeadRows, MW_UNITS_PER_METER, resolveBodyParts, ARM_PARTS, raceRecords, armorRecords, clothingRecords,
  facePools, meshBounds, curatedAnswersFace,
  movementAnimState, composeMovementGroup, MOVEMENT_FALLBACK_SPEED, MOVEMENT_SPEED_CAP, turnAnimSpeed,
  jumpAnimState,
  sourcesKeyTime, sourceVelocityOf,
  magicEffectRecords, vfxStaticRecords,
  assembleCreature, creatureAnimSources, creatureRecords, CREA_FLAG,
  posePartClocks, WEAPON_CLASS, MW_WEAPON_CLASS,
  placeAtBone,
} from '../formats/mwFirstPerson.js';
import { PART_BONES, dfRaceKeyOf } from '../formats/mwNpc.js';
import { portraitFeatures, headFeatures, hairFeatures, matchFace, FACE_MATCH_VERSION } from '../formats/mwFaceMatch.js';
import { CifRciFile } from '../formats/cifRciFile.js';
import { DFPalette } from '../formats/dfPalette.js';
import { raceArt } from '../characters/races.js';
import { appStorage } from '../platform/appStorage.js';
import { drawBodyPicture, mwModelPixel } from '../render/characterSprite.js';
import { WEAPONS } from '../characters/weapons.js';
import { materialName } from '../items/itemInfo.js';
import { composeWornArmor, composeWornModest, shadowSkinRows, fpWornAdds, mwArmorRecords, mwClothingRecord, CLOTHING_NAME, werewolfRobeOf, firstPersonPartGroup } from '../formats/mwItemMap.js';
import { showNudity } from '../characters/nudeFlats.js';
import { getPref } from '../ui/uiPrefs.js';
import { skinMips, skinUseOf, skinUseKey } from '../characters/werewolfSkin.js';
import { correctTexturePath, correctActorModelPath, wrapModes, warningImage, decodeTextureImage } from '../formats/mwTexture.js';
import { decodeTextureOffThread } from '../formats/mwTextureClient.js';
import { diffuseAt, emissiveAt } from '../formats/mwNifMesh.js';
import { fpLightingOn } from './fpsWeapon.js';
import { createParticleSystem, packParticleQuads, particleDrawState, affineOfTransform, affineMul, affineApply, affineScale } from '../formats/mwParticles.js';
import { boneSourcesFor, resolveHolsterParts, holsterPartPaths, holsterHidden, HOLSTER_SLOTS } from './weaponSheathing.js';
import { fitCloakOver, fitStowedGear, followCloak, HIP_PITCH_LIMIT, CLOAK_PUSH_LIMIT, SLUNG_MOVE_LIMIT } from '../formats/mwCloakFit.js';
import { isCloakSlot, ownCloakFor, isOutfitSlot } from '../characters/ownClothingModels.js';
import { injectSkeletonNodes } from '../formats/mwSkin.js';
import { deltaTracks, heldSampler, paperPiece, refreshPaperSource, projectPaperCorners, normaliseHeldPose, HELD_POSE_DEFAULT } from './heldPose.js';
import { createHipLantern, HIP_LANTERN_HEIGHT } from '../player/lanternSwing.js';
import { createBodyMotion, motionWord } from '../characters/bodyMotion/bodyMotion.js';
import { spinePitchFactor, spineAimSlot } from './spineAim.js';
import { vfxOf, createVfx, vfxCapacity, vfxTextures } from '../formats/mwVfx.js';
import { spellVisualIntensity } from '../magic/spellVisualSettings.js';
import { spellFxPlan } from '../formats/mwSpellFx.js';
import { effectSchool } from '../magic/spellcost.js';
import { createVfxGpu } from '../render/vfxGpu.js';
import { validCastRate } from '../magic/castSpeed.js';
import { skinLayout, skinSamePieces, packSkinStream, writeSkinPalette, restreamMovedRows } from '../formats/mwGpuSkin.js';
import { pageParam } from '../platform/pageQuery.js';
import { t } from '../ui/textManager.js';

// Lazily opened archives throw from get() for an unloaded entry, so each synchronous read here follows its load.
async function loadFromArchives(archives, paths) {
  const seen = new Set();
  const jobs = [];
  for (const path of paths ?? []) {
    if (!path || seen.has(path)) continue;
    seen.add(path);
    const arc = (archives ?? []).find((a) => a.has(path));
    if (!arc || typeof arc.load !== 'function') continue;
    if (typeof arc.loaded === 'function' && arc.loaded(path)) continue;
    jobs.push(Promise.resolve(arc.load(path)).catch(() => null));
  }
  if (jobs.length) await Promise.all(jobs);
}

function findLoaded(archives, path) {
  const arc = (archives ?? []).find((a) => a.has(path));
  if (arc && typeof arc.loaded === 'function' && !arc.loaded(path)) {
    throw new Error(`MW-LOAD: ${path} was read before it was loaded - the preload that covers this read missed it`);
  }
  return arc;
}

async function preloadArmTextures(pieces, archives, gen = null) {
  const paths = [];
  const want = [];
  const seen = new Set();
  const exists = (p) => archives.some((a) => a.has(p));
  for (const piece of pieces ?? []) {
    const file = piece.material && piece.material.textureFile;
    if (!file || seen.has(file)) continue;
    seen.add(file);
    if (gen !== null && TEXTURE_CACHE.has(`${gen}:${file}`)) continue;
    const path = correctTexturePath(file, exists);
    paths.push(path);
    want.push([file, path]);
  }
  await loadFromArchives(archives, paths);
  if (gen === null) return;
  await Promise.all(want.map(async ([file, path]) => {
    const key = `${gen}:${file}`;
    const arc = archives.find((a) => a.has(path));
    if (!arc || (typeof arc.loaded === 'function' && !arc.loaded(path))) return;
    let image;
    try { image = await decodeTextureOffThread(path, arc.get(path)); } catch (err) {
      // A decoder refusal is cached too, since the same bytes fail on any thread and would be decoded again.
      if (err?.decoderError && !TEXTURE_CACHE.has(key)) TEXTURE_CACHE.set(key, { ok: false, path, error: err.message, image: warningImage() });
      return;
    }
    if (!TEXTURE_CACHE.has(key)) TEXTURE_CACHE.set(key, { ok: true, path, image });
  }));
}

const mwNow = () => (typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
  ? performance.now() : Date.now());

export const WOLFSKIN = 'meshes/wolf/skin.nif';
export const WOLFSKIN_1ST = 'meshes/wolf/skin.1st.nif';

export function fpSkeletonPath({ female = false, beast = false, werewolf = false } = {}) {
  // The werewolf skeleton takes precedence over sex and race, as in the reference getActorSkeleton.
  if (werewolf) return WOLFSKIN_1ST;
  if (beast) return 'meshes/base_animkna.1st.nif';
  if (female) return 'meshes/base_anim_female.1st.nif';
  return 'meshes/xbase_anim.1st.nif';
}

export function tpSkeletonPath({ female = false, beast = false, werewolf = false } = {}) {
  if (werewolf) return WOLFSKIN;
  if (beast) return 'meshes/base_animkna.nif';
  if (female) return 'meshes/base_anim_female.nif';
  return 'meshes/base_anim.nif';
}
export const FP_CLIP_PATH = 'meshes/xbase_anim.1st.kf';

export const FP_IDLE_BASE = 'idle';
// Spells and fists carry the two-handed flag, so they hide the torch and the shield as in the reference.
export const carriedLeftVisible = (type) => !(weaponFlags(type) & MW_TWO_HANDED);
export const FP_IDLE_SNEAK = 'idlesneak';
export const TORCH_GROUP = 'torch';
export function idleBaseFor({ sneaking = false, inJump = false, hasGroup = () => false } = {}) {
  return sneaking && !inJump && hasGroup(FP_IDLE_SNEAK) ? FP_IDLE_SNEAK : FP_IDLE_BASE;
}

// The roll counts wraps, not plays: 1 to 4 wraps give the 2 to 5 plays the reference describes.
export const FP_IDLE_LOOPS = () => 1 + Math.floor(Math.random() * 4);

export function animWeaponType(mwType, sheathed, spellReady = false) {
  // A readied spell wins over the sheathed test and the equipped weapon, as in the reference getWeaponType.
  if (spellReady) return MW_WEAPON_TYPE.Spell;
  if (sheathed) return MW_WEAPON_TYPE.None;
  return mwType === MW_WEAPON_TYPE.None ? MW_WEAPON_TYPE.HandToHand : mwType;
}

// The values are ordered numbers because accurateAiming compares upper-body states with >.
export const UPPER_BODY = Object.freeze({
  None: 0,
  Equipping: 1,
  Unequipping: 2,
  WeaponEquipped: 3,
  AttackWindUp: 4,
  AttackRelease: 5,
  AttackEnd: 6,
  Casting: 7,
});

export const UPPER_BODY_NAME = Object.freeze(
  Object.fromEntries(Object.entries(UPPER_BODY).map(([k, v]) => [v, k])),
);

export function spellAttackType(rangeType) {
  if (rangeType === 1) return 'touch';
  if (rangeType === 0 || rangeType === 3) return 'self';
  return 'target';
}

export const accurateAiming = (upper) => upper > UPPER_BODY.WeaponEquipped;

// The ratio is not clamped, and a zero-length clip is complete once it stops playing, as in the reference.
export function clipCompletion(state) {
  if (!state) return 0;
  const span = state.stopTime - state.startTime;
  if (span > 0) return (state.time - state.startTime) / span;
  return state.playing ? 0 : 1;
}

export function strideOppositeTime(state, time = state?.time, keys = null) {
  if (!state || !Number.isFinite(time)) return null;
  // The window comes from the group keys, not the state's loop fields, which take the loop stop only once crossed.
  const keyIn = (name) => { for (const k of keys ?? []) if (k.text === `${state.group}: ${name}` && k.time >= state.startTime && k.time <= state.stopTime) return k.time; return NaN; };
  let a = keyIn('loop start'), b = keyIn('loop stop');
  if (!(b > a)) { a = state.startTime; b = state.stopTime; }
  const span = b - a;
  if (!(span > 0)) return null;
  return a + ((((time - a + span / 2) % span) + span) % span);
}

export const BLOW_RATE_MAX = 12;
export const BLOW_RATE_MIN = 0.1;
export const BLOW_LEFT_MIN = 1 / 60;

export function blowRate(span, left) {
  if (!(span > 0)) return 1;
  return Math.min(BLOW_RATE_MAX, Math.max(BLOW_RATE_MIN, span / Math.max(left, BLOW_LEFT_MIN)));
}

export function releaseSkip(keys, group, attackType, strength) {
  const k = attackKeys(attackType, strength);
  const keyTime = (name) => getTextKeyTime(keys, `${group}: ${name}`);
  return releaseStartPoint(strength, {
    minAttackTime: keyTime(k.minAttack),
    maxAttackTime: keyTime(k.maxAttack),
    minHitTime: keyTime(k.minHit),
    hitTime: keyTime(k.hitKey),
  });
}

// Morrowind NIFs are Z-up with +Y forward; this turns them into the renderer's Y-up, -Z forward basis.
export const NIF_TO_PASS = trs(0, 0, 0, -90, 0, 0);

export function spriteBoxUnion(a, b) {
  const lo = Math.min(a.center[1] - a.halfH, b.center[1] - b.halfH), hi = Math.max(a.center[1] + a.halfH, b.center[1] + b.halfH);
  const dx = b.center[0] - a.center[0], dz = b.center[2] - a.center[2], d = Math.hypot(dx, dz);
  let cx = a.center[0], cz = a.center[2], r = a.halfW;
  if (d + b.halfW <= a.halfW) { }
  else if (d + a.halfW <= b.halfW) { cx = b.center[0]; cz = b.center[2]; r = b.halfW; }
  else {
    r = (d + a.halfW + b.halfW) / 2;
    const k = (r - a.halfW) / (d || 1);
    cx = a.center[0] + dx * k; cz = a.center[2] + dz * k;
  }
  return { center: [cx, (lo + hi) / 2, cz], halfW: r, halfH: (hi - lo) / 2 };
}

export const FP_FIELD_OF_VIEW = Math.PI / 3;
export function fpFrameWindow(rect, W, H, pw, ph, cap = CHAR_SPRITE_RT_SIZE) {
  const cw = rect.w / pw, ch = rect.h / ph;
  const k0 = Math.floor(-rect.x / cw + 1e-9), r0 = Math.floor(-rect.y / ch + 1e-9);
  const nx = Math.min(cap, Math.ceil((W - rect.x) / cw - 1e-9) - k0);
  const ny = Math.min(cap, Math.ceil((H - rect.y) / ch - 1e-9) - r0);
  return { k0, r0, nx, ny, dst: { x: rect.x + k0 * cw, y: rect.y + r0 * ch, w: nx * cw, h: ny * ch } };
}
// This stays out of world/mat4.js because the relay bundles that module and a client-only lens must not change it.
export function frustum(left, right, bottom, top, near, far) {
  const out = new Float32Array(16);
  out[0] = (2 * near) / (right - left);
  out[5] = (2 * near) / (top - bottom);
  out[8] = (right + left) / (right - left);
  out[9] = (top + bottom) / (top - bottom);
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

// Floats per vertex: position, color, normal, uv, and emission; the pack and the vertex layout must agree.
export const FP_FLOATS = 14;

export function firstPersonEye(mats, cameraRef) {
  const node = mats && mats.get(cameraRef);
  if (!node) return null;
  const [x, y, z] = node.t;
  return [x, z, -y];
}

export function armReach(eye, unionBounds) {
  if (!eye || !unionBounds) return 1;
  let far = 0;
  for (const x of [unionBounds.minX, unionBounds.maxX]) {
    for (const y of [unionBounds.minY, unionBounds.maxY]) {
      for (const z of [unionBounds.minZ, unionBounds.maxZ]) {
        const d = Math.hypot(x - eye[0], z - eye[1], -y - eye[2]);
        if (d > far) far = d;
      }
    }
  }
  return far || 1;
}

// A mirrored piece has reversed winding, so its computed face normal is negated; a posed vertex normal is not.
export function packFpArm(pieces, out = null) {
  let tris = 0;
  for (const p of pieces) tris += (p.indices ? p.indices.length : 0) / 3;
  const buf = out && out.packed && out.packed.length === tris * 3 * FP_FLOATS
    ? out.packed : new Float32Array(tris * 3 * FP_FLOATS);
  // Ranges carry the mesh's textures once hung, so repacking the same pieces returns the same range objects.
  const ranges = sameRanges(out, pieces) ? out.ranges : [];
  const rebuild = ranges.length === 0;
  let o = 0;
  let first = 0;
  for (const p of pieces) {
    const pos = p.positions;
    const idx = p.indices;
    if (!pos || !idx) continue;
    const lanes = pieceLanes(p);
    const flip = p.mirrored ? -1 : 1;
    const nrm = p.normals && p.normals.length === pos.length ? p.normals : null;
    const textured = !!(p.uvs && p.material && p.material.textureFile);
    let l = 0;
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i] * 3; const b = idx[i + 1] * 3; const c = idx[i + 2] * 3;
      // A zero vertex normal falls back to the face normal, since the shader cannot normalize it.
      let nx = 0; let ny = 1; let nz = 0;
      if (!nrm || zeroAt(nrm, a) || zeroAt(nrm, b) || zeroAt(nrm, c)) {
        const ux = pos[b] - pos[a]; const uy = pos[b + 1] - pos[a + 1]; const uz = pos[b + 2] - pos[a + 2];
        const vx = pos[c] - pos[a]; const vy = pos[c + 1] - pos[a + 1]; const vz = pos[c + 2] - pos[a + 2];
        nx = (uy * vz - uz * vy) * flip;
        ny = (uz * vx - ux * vz) * flip;
        nz = (ux * vy - uy * vx) * flip;
        const len = Math.hypot(nx, ny, nz);
        if (len > 1e-8) { nx /= len; ny /= len; nz /= len; } else { nx = 0; ny = 1; nz = 0; }
      }
      for (let k = 0; k < 3; k++) {
        const v = k === 0 ? a : k === 1 ? b : c;
        buf[o++] = pos[v]; buf[o++] = pos[v + 1]; buf[o++] = pos[v + 2];
        buf[o++] = lanes[l]; buf[o++] = lanes[l + 1]; buf[o++] = lanes[l + 2];
        if (nrm && !zeroAt(nrm, v)) { buf[o++] = nrm[v]; buf[o++] = nrm[v + 1]; buf[o++] = nrm[v + 2]; } else { buf[o++] = nx; buf[o++] = ny; buf[o++] = nz; }
        buf[o++] = lanes[l + 3]; buf[o++] = lanes[l + 4];
        buf[o++] = lanes[l + 5]; buf[o++] = lanes[l + 6]; buf[o++] = lanes[l + 7];
        l += LANE_FLOATS;
      }
    }
    const count = (idx.length / 3) * 3;
    if (rebuild) ranges.push({ first, count, slot: p.slot, piece: p, textureFile: textured ? p.material.textureFile : null, tex: null, hidden: false });
    first += count;
  }
  return { packed: buf, ranges };
}

const zeroAt = (n, v) => n[v] === 0 && n[v + 1] === 0 && n[v + 2] === 0;

const LANE_FLOATS = 8;
export function pieceLanes(p) {
  const idx = p.indices, uvs = p.uvs || null, cols = p.colors || null, mat = p.material || null;
  const have = p._packLanes;
  if (have && have.idx === idx && have.uvs === uvs && have.cols === cols && have.mat === mat) return have.lanes;
  const lanes = new Float32Array(idx.length * LANE_FLOATS);
  let l = 0;
  for (let i = 0; i < idx.length; i++) {
    const vi = idx[i] * 2;
    const [dr, dg, db] = diffuseAt(mat, cols, idx[i]);
    lanes[l++] = dr; lanes[l++] = dg; lanes[l++] = db;
    lanes[l++] = uvs ? uvs[vi] : 0;
    lanes[l++] = uvs ? uvs[vi + 1] : 0;
    const [er, eg, eb] = emissiveAt(mat, cols, idx[i]);
    lanes[l++] = er; lanes[l++] = eg; lanes[l++] = eb;
  }
  p._packLanes = { idx, uvs, cols, mat, lanes };
  return lanes;
}

function sameRanges(out, pieces) {
  const r = out && out.ranges;
  if (!r) return false;
  let k = 0;
  for (const p of pieces) {
    if (!p.positions || !p.indices) continue;
    const range = r[k++];
    if (!range || range.piece !== p || range.count !== (p.indices.length / 3) * 3) return false;
  }
  return k === r.length;
}

export function foldRangeBoxes(ranges) {
  for (const r of ranges) {
    const piece = r.piece;
    const p = piece && piece.positions;
    if (!p || p.length < 3) { r.box = null; continue; }
    const src = piece.box || meshBounds([piece]);
    if (!src) { r.box = null; continue; }
    const b = r.box || (r.box = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 });
    b.minX = src.minX; b.minY = src.minY; b.minZ = src.minZ; b.maxX = src.maxX; b.maxY = src.maxY; b.maxZ = src.maxZ;
  }
}

export const CARRIED_SLOTS = Object.freeze(['weapon', 'arrow', 'torch', 'paper', ...HOLSTER_SLOTS]);

export function visibleRangeBounds(ranges, out, skip = null) {
  if (!ranges) return null;
  let any = false;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const r of ranges) {
    const b = r.hidden || (skip && skip.includes(r.slot)) ? null : r.box;
    if (!b || !(b.maxX >= b.minX)) continue;
    any = true;
    if (b.minX < minX) minX = b.minX; if (b.maxX > maxX) maxX = b.maxX;
    if (b.minY < minY) minY = b.minY; if (b.maxY > maxY) maxY = b.maxY;
    if (b.minZ < minZ) minZ = b.minZ; if (b.maxZ > maxZ) maxZ = b.maxZ;
  }
  if (!any) return null;
  out.minX = minX; out.minY = minY; out.minZ = minZ; out.maxX = maxX; out.maxY = maxY; out.maxZ = maxZ;
  return out;
}

export function portraitWindow(ranges, model, bodyBox) {
  const body = visibleRangeBounds(ranges, bodyBox, CARRIED_SLOTS) || visibleRangeBounds(ranges, bodyBox);
  if (!body) return null;
  const midZ = (body.minZ + body.maxZ) / 2;
  const cz = model[10] * midZ + model[14];
  let loX = Infinity, hiX = -Infinity, loY = Infinity, hiY = -Infinity;
  for (const r of ranges) {
    const b = r.hidden ? null : r.box;
    if (!b || !(b.maxX >= b.minX)) continue;
    for (let k = 0; k < 8; k++) {
      const x = k & 1 ? b.maxX : b.minX, y = k & 2 ? b.maxY : b.minY, z = k & 4 ? b.maxZ : b.minZ;
      const wx = model[0] * x + model[4] * y + model[8] * z + model[12];
      const wy = model[1] * x + model[5] * y + model[9] * z + model[13];
      if (wx < loX) loX = wx;
      if (wx > hiX) hiX = wx;
      if (wy < loY) loY = wy;
      if (wy > hiY) hiY = wy;
    }
  }
  return { center: [(loX + hiX) / 2, (loY + hiY) / 2, cz], halfW: (hiX - loX) / 2, halfH: (hiY - loY) / 2 };
}

function parseNifOnce(bytes, cache = parseNifOnce.cache) {
  if (cache.has(bytes)) return cache.get(bytes);
  const nif = parseNif(bytes);
  cache.set(bytes, nif);
  parseNifOnce.parses++;
  return nif;
}
parseNifOnce.cache = new WeakMap();
parseNifOnce.parses = 0;
export const nifParseCount = () => parseNifOnce.parses;

// Textures are shared per renderer by image and wrap with a hold count; the last release deletes the GL texture.
const SHARED_TEXTURES = new WeakMap();
const TEXTURE_HOLDS = new WeakMap();
export function acquireCharacterTexture(renderer, mips, wrap) {
  let byMips = SHARED_TEXTURES.get(renderer);
  if (!byMips) SHARED_TEXTURES.set(renderer, (byMips = new Map()));
  let byWrap = byMips.get(mips);
  if (!byWrap) byMips.set(mips, (byWrap = new Map()));
  const key = `${wrap.wrapS}:${wrap.wrapT}`;
  let held = byWrap.get(key);
  if (!held) {
    held = { tex: renderer.createCharacterTexture(mips, wrap), holds: 0 };
    byWrap.set(key, held);
    if (held.tex && typeof held.tex === 'object') TEXTURE_HOLDS.set(held.tex, { byMips, mips, byWrap, key });
  }
  held.holds++;
  return held.tex;
}
export function releaseCharacterTexture(renderer, tex) {
  const slot = tex && typeof tex === 'object' ? TEXTURE_HOLDS.get(tex) : null;
  if (!slot) { renderer?.gl?.deleteTexture(tex); return true; }
  const held = slot.byWrap.get(slot.key);
  if (!held || held.tex !== tex) return false;
  if (--held.holds > 0) return false;
  slot.byWrap.delete(slot.key);
  if (!slot.byWrap.size) slot.byMips.delete(slot.mips);
  TEXTURE_HOLDS.delete(tex);
  renderer?.gl?.deleteTexture(tex);
  return true;
}

const ESM_MASTERS = Object.freeze(['morrowind.esm', 'tribunal.esm', 'bloodmoon.esm']);
// The store lists masters alphabetically, but the record walks let the last record of an id win, so order matters.
/** @param {string[]} names */
export function esmLoadOrder(names) {
  // Masters match by whole file name, so a patch such as Morrowind Patch.esm is not ranked as its master.
  const rank = (n) => { const i = ESM_MASTERS.indexOf(String(n).split(/[\\/]/).pop().toLowerCase()); return i < 0 ? ESM_MASTERS.length : i; };
  return names.map((n, i) => [n, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([n]) => n);
}

export const NIF_COPY_CAP = 384;
// Bytes are copied once per archive and path, so the parse memo keyed by those bytes serves every body.
const NIF_COPIES = new WeakMap();
export function nifBytes(arc, path) {
  if (!arc) return undefined;
  let m = NIF_COPIES.get(arc);
  if (!m) NIF_COPIES.set(arc, (m = new Map()));
  let b = m.get(path);
  if (b) { m.delete(path); m.set(path, b); return b; }
  const src = arc.get(path);
  if (!src) return src;
  b = src.slice();
  m.set(path, b);
  if (m.size > NIF_COPY_CAP) m.delete(m.keys().next().value);
  return b;
}

function skeletonHasBone(skeletonBytes, name) {
  try {
    const skel = buildSkeleton(parseNifOnce(skeletonBytes));
    return skel.byName.has(String(name).toLowerCase());
  } catch { return false; }
}
function boneProbe(skeletonBytes, boneSources) {
  let skel = null;
  try {
    skel = buildSkeleton(parseNifOnce(skeletonBytes));
    for (const src of boneSources ?? []) { try { injectSkeletonNodes(skel, parseNifOnce(src.bytes)); } catch { } }
  } catch { skel = null; }
  return (name) => !!skel && skel.byName.has(String(name).toLowerCase());
}

const ESM_WALK_CACHE = new Map();
const CLIP_REPORT_CACHE = new Map();
async function cachedClipReport(gen, skeletonPath, name, bytesOf, skeleton) {
  if (gen === null || gen === undefined) return clipReport({ kfBytes: bytesOf(), skeleton, group: FP_IDLE_BASE });
  const key = `${gen}:${skeletonPath}:${name}`;
  let hit = CLIP_REPORT_CACHE.get(key);
  if (hit === undefined) {
    hit = await clipReport({ kfBytes: bytesOf(), skeleton, group: FP_IDLE_BASE });
    CLIP_REPORT_CACHE.set(key, hit);
  }
  return hit;
}
const TEXTURE_CACHE = new Map();
const SKINNED_MIPS = new WeakMap();
function skinnedMipsOf(image, skin, use) {
  let per = SKINNED_MIPS.get(image);
  if (!per) { per = new Map(); SKINNED_MIPS.set(image, per); }
  const key = skinUseKey(skin, use);
  let mips = per.get(key);
  if (!mips) { mips = skinMips(image.mips, skin, use); per.set(key, mips); }
  return mips;
}
async function preskinTextures(pieces, textures, skin) {
  if (!skin) return;
  for (const piece of pieces ?? []) {
    const file = piece?.material?.textureFile;
    const entry = file ? textures.get(file) : null;
    if (!entry?.image?.mips) continue;
    const use = skinUseOf(piece, file);
    if (SKINNED_MIPS.get(entry.image)?.has(skinUseKey(skin, use))) continue;
    skinnedMipsOf(entry.image, skin, use);
    await new Promise((r) => setTimeout(r, 0));
  }
}
const FACE_MATCH_CACHE = new Map();

const RACES_MAP = new WeakMap();
export function armRecordsOf(records, kind) {
  switch (kind) {
    case 'parts': return records.parts;
    case 'races': {
      let m = RACES_MAP.get(records);
      if (!m) { m = new Map(records.races); RACES_MAP.set(records, m); }
      return m;
    }
    case 'armors': return records.armors;
    case 'clothes': return records.clothes;
    case 'weapons': return records.weapons;
    case 'lights': return records.lights;
    case 'magicEffects': return records.magicEffects ?? [];
    case 'statics': return records.statics ?? [];
    case 'creatures': return records.creatures ?? [];
    case 'gmst-sneak': return { v: Object.hasOwn(records.gmst, GMST_SNEAK_DELTA) ? records.gmst[GMST_SNEAK_DELTA] : null };
    default: throw new Error(`fpArm: no derived answer for walk kind "${kind}" (MW-LOAD)`);
  }
}

const fnv = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
};

const CLOT_COLOUR_CACHE = new Map();
// The preload and the measure both derive the mesh path here, so they cannot read different files.
function clothingMeshPath(rec, parts) {
  const ref = (rec.parts ?? []).find((r) => r.male || r.female);
  const body = ref ? (parts ?? []).find((b) => String(b.id || '').toLowerCase() === (ref.male || ref.female)) : null;
  const model = body ? body.model : rec.model;
  return `meshes/${model}`;
}

function clothingTexturePath(rec, parts, archives) {
  const path = clothingMeshPath(rec, parts);
  const arc = findLoaded(archives, path);
  if (!arc) return null;
  const batches = flattenNif(parseNif(arc.get(path).slice()));
  const file = batches.map((b) => b.material && b.material.textureFile).find(Boolean);
  return file ? correctTexturePath(file, (p) => archives.some((a) => a.has(p))) : null;
}
function garmentColourOf(m0) {
  const f = hairFeatures(m0.rgba, m0.width, m0.height, 0);
  return f && f.colour ? f.colour.map((v) => Math.round(v * 255)) : null;
}

function clothingColourOf(rec, parts, archives, gen) {
  const key = `${gen}:${rec.id}`;
  if (CLOT_COLOUR_CACHE.has(key)) return CLOT_COLOUR_CACHE.get(key);
  let rgb = null;
  try {
    const tpath = clothingTexturePath(rec, parts, archives);
    const tarc = tpath && findLoaded(archives, tpath);
    if (tarc) {
      rgb = garmentColourOf(decodeTextureImage(tpath, tarc.get(tpath).slice(), { levels: 1 }).mips[0]);
    }
  } catch (err) {
    // A read that ran ahead of its preload is not cached as null, since the memo outlives the data generation.
    if (err && /^MW-LOAD:/.test(err.message || '')) return null;
    rgb = null;
  }
  CLOT_COLOUR_CACHE.set(key, rgb);
  return rgb;
}

async function preloadClothingColour(rec, parts, archives, gen) {
  const key = `${gen}:${rec.id}`;
  if (CLOT_COLOUR_CACHE.has(key)) return;
  await loadFromArchives(archives, [clothingMeshPath(rec, parts)]);
  let tpath;
  try { tpath = clothingTexturePath(rec, parts, archives); } catch { return; }
  if (!tpath) return;
  await loadFromArchives(archives, [tpath]);
  const tarc = archives.find((a) => a.has(tpath));
  if (!tarc || (typeof tarc.loaded === 'function' && !tarc.loaded(tpath))) return;
  let rgb;
  try { rgb = garmentColourOf((await decodeTextureOffThread(tpath, tarc.get(tpath), { levels: 1 })).mips[0]); }
  catch (err) { if (!err?.decoderError) return; rgb = null; }
  if (!CLOT_COLOUR_CACHE.has(key)) CLOT_COLOUR_CACHE.set(key, rgb);
}

export const MEASURE_LANES = 8;
export async function inLanes(list, fn, lanes = MEASURE_LANES) {
  const out = new Array(list.length);
  let next = 0;
  const lane = async () => { while (next < list.length) { const i = next++; out[i] = await fn(list[i]); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(lanes, list.length)) }, lane));
  return out;
}

// The probe run only records the candidates the resolver asks about; its result is discarded.
async function prepareClothingColours(resolve, parts, archives, gen) {
  const asked = [];
  const probe = (rec) => {
    asked.push(rec);
    return CLOT_COLOUR_CACHE.get(`${gen}:${rec.id}`) ?? null;
  };
  try { resolve(probe); } catch { }
  const seen = new Set();
  const once = asked.filter((rec) => !seen.has(rec.id) && seen.add(rec.id));
  await inLanes(once, (rec) => preloadClothingColour(rec, parts, archives, gen));
}

const ITEM_ICON_CACHE = new Map();
const MOUNT_ASKS = new Map();

// The memos hold only the store's current generation; unload() re-reads it, so an old data set goes with the rig.
let memoGen = null;
let memoGenOf = null;
function adoptMemoGeneration(genOf) {
  if (typeof genOf !== 'function') return null;
  memoGenOf = genOf;
  const gen = genOf();
  if (gen !== memoGen) {
    memoGen = gen;
    for (const m of [ESM_WALK_CACHE, CLIP_REPORT_CACHE, TEXTURE_CACHE, FACE_MATCH_CACHE, CLOT_COLOUR_CACHE, ITEM_ICON_CACHE, HEAD_PORTRAIT_CACHE]) m.clear();
    headCatalog = null;
  }
  return gen;
}
export const _memoEntryCount = () => ESM_WALK_CACHE.size + CLIP_REPORT_CACHE.size + TEXTURE_CACHE.size
  + FACE_MATCH_CACHE.size + CLOT_COLOUR_CACHE.size + ITEM_ICON_CACHE.size;

export function mountFrame(bounds, px, { air = 1.04, cap = CHAR_SPRITE_RT_SIZE } = {}) {
  const lo = [bounds.minX, bounds.minY, bounds.minZ];
  const hi = [bounds.maxX, bounds.maxY, bounds.maxZ];
  const ext = [0, 1, 2].map((k) => Math.max(hi[k] - lo[k], 1e-4));
  const [thin, mid, long] = [0, 1, 2].sort((a, b) => ext[a] - ext[b]);
  const centre = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
  const span = Math.hypot(ext[0], ext[1], ext[2]);
  const eye = centre.map((c, k) => (k === thin ? c + span * 2 : c));
  const up = [0, 0, 0];
  up[long] = 1;
  const halfW = (ext[mid] / 2) * air;
  const halfH = (ext[long] / 2) * air;
  const ph = Math.min(cap, Math.max(8, px | 0));
  return {
    view: lookAt(eye, centre, up), proj: ortho(halfW, halfH, 0.01, span * 8),
    w: halfW * 2, h: halfH * 2, pw: Math.max(8, Math.round((ph * halfW) / halfH)), ph,
  };
}

export function iconFrame(bounds, { air = 1.12 } = {}) {
  const cx = (bounds.minX + bounds.maxX) / 2; const cy = (bounds.minY + bounds.maxY) / 2; const cz = (bounds.minZ + bounds.maxZ) / 2;
  const dir = [0.55, 0.65, 0.85];
  const dl = Math.hypot(...dir);
  const d = dir.map((v) => v / dl);
  const span = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ) || 1;
  const eye = [cx + d[0] * span * 2, cy + d[1] * span * 2, cz + d[2] * span * 2];
  const view = lookAt(eye, [cx, cy, cz], [0, 1, 0]);
  let hw = 0; let hh = 0;
  for (const x of [bounds.minX, bounds.maxX]) for (const y of [bounds.minY, bounds.maxY]) for (const z of [bounds.minZ, bounds.maxZ]) {
    const p = transformPoint(view, x, y, z);
    hw = Math.max(hw, Math.abs(p[0])); hh = Math.max(hh, Math.abs(p[1]));
  }
  const half = Math.max(hw, hh) * air || 1;
  return { view, proj: ortho(half, half, 0.1, span * 8), eye };
}

async function measurePart(record, archives, kind) {
  const exists = (p) => archives.some((a) => a.has(p));
  const path = `meshes/${record.model}`;
  await loadFromArchives(archives, [path]);
  const arc = archives.find((a) => a.has(path));
  if (!arc) return null;
  let batches;
  try { batches = flattenNif(parseNif(arc.get(path).slice())); } catch { return null; }
  const file = batches.map((b) => b.material && b.material.textureFile).find(Boolean);
  if (!file) return null;
  const tpath = correctTexturePath(file, exists);
  await loadFromArchives(archives, [tpath]);
  const tarc = archives.find((a) => a.has(tpath));
  if (!tarc) return null;
  let img;
  try { img = await decodeTextureOffThread(tpath, tarc.get(tpath), { levels: 1 }); } catch { return null; }
  const m0 = img.mips[0];
  if (kind === 'head') {
    return headFeatures(m0.rgba, m0.width, m0.height, batches.map((b) => ({ positions: b.positions, uvs: b.uvs })));
  }
  const shapes = batches.filter((b) => b.positions && b.positions.length);
  const bounds = shapes.length ? meshBounds(shapes) : null;
  return hairFeatures(m0.rgba, m0.width, m0.height, bounds ? bounds.maxZ - bounds.minZ : 0);
}

export async function matchFaceFor({ race, female, faceIndex, pools, archives, deps }) {
  faceIndex = classicFaceRecord(faceIndex);
  const reasons = [];
  let portrait = null;
  try {
    const art = raceArt(dfRaceKeyOf(race), female ? 'female' : 'male');
    const cif = new CifRciFile();
    const bytes = await deps.fetchArena2Bytes(art.heads);
    const pal = new DFPalette();
    pal.load(await deps.fetchArena2Bytes(cif.paletteName || 'ART_PAL.COL'), cif.paletteName || 'ART_PAL.COL');
    cif.load(bytes, art.heads, pal);
    portrait = portraitFeatures(cif.getDFBitmap(faceIndex | 0, 0), pal);
  } catch (err) {
    reasons.push(`portrait unreadable: ${err.message}`);
  }
  if (!portrait) return { head: null, hair: null, reasons: [...reasons, 'the walk stands'] };
  const measured = await inLanes([...pools.heads.map((rec) => [rec, 'head']), ...pools.hairs.map((rec) => [rec, 'hair'])],
    async ([rec, kind]) => ({ id: rec.id, f: await measurePart(rec, archives, kind) }));
  const heads = measured.slice(0, pools.heads.length);
  const hairs = measured.slice(pools.heads.length);
  const m = matchFace(portrait, heads, hairs, { female });
  const hex = (c) => `#${c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')}`;
  reasons.push(`portrait ${faceIndex | 0}: skin ${hex(portrait.skin)}, hair ${portrait.bald ? 'none' : hex(portrait.hair)}, `
    + `length ${portrait.length.toFixed(2)}, beard ${portrait.beard.toFixed(2)}`);
  return { head: m.head, hair: m.hair, reasons: [...reasons, ...m.reasons] };
}

export function wornVerdicts(pieces, worn) {
  const rows = [];
  for (const p of pieces ?? []) {
    const label = p.kind === 'clothing'
      ? (p.name ?? `garment ${p.templateIndex}`)
      : p.kind === 'outfit' ? `outfit ${p.id}`
        : `armor ${p.templateIndex} (material ${p.material ?? 0})`;
    const dressed = (worn?.adds ?? []).filter((a) => a.piece === p).map((a) => a.slot);
    const reason = (worn?.notes ?? []).find((n) => n.startsWith(label.split(' (')[0]) || (p.kind !== 'clothing' && n.startsWith(`armor ${p.templateIndex}:`)));
    rows.push({ label, dressed, reason: dressed.length ? null : (reason ?? 'no part reached the rig') });
  }
  return rows;
}

export function wornEquipKeyOf(pieces) {
  return (pieces ?? []).map((p) => `${p.kind || 'armor'}:${p.templateIndex ?? p.id}:${p.material ?? ''}:${p.dye ?? ''}`).join('|');
}

const drawnOpts = (o) => (o && (drawnPiece(o.weapon) !== o.weapon || drawnPiece(o.offWeapon) !== o.offWeapon) ? { ...o, weapon: drawnPiece(o.weapon), offWeapon: drawnPiece(o.offWeapon) } : o);
export function fpWeaponKey(item, hasAmmo) {
  const hand = item && item.werecreatureClaws ? null : item;
  return `${dfWeaponToMw(hand, WEAPONS)}:${hand ? materialName(hand) : ''}:${hasAmmo ? 1 : 0}:${dfWeaponShape(hand, WEAPONS) ?? ''}`;
}

export function rigPointToBody(t, { weight = 1, height = 1 } = {}) {
  const u = 1 / MW_UNITS_PER_METER;
  return [t[0] * u * weight, t[2] * u * height, t[1] * u * weight];
}

export function armBonesInBody(arm, names, raceScale = null) {
  if (!arm || !arm.mats || !arm.skeleton) return null;
  const rs = raceScale || { weight: 1, height: 1 }, out = {};
  for (const name of names) {
    const ref = arm.skeleton.byName.get(String(name).toLowerCase());
    const m = ref !== undefined ? arm.mats.get(ref) : null;
    out[name] = m ? rigPointToBody(m.t, rs) : null;
  }
  return out;
}

export function weaponRestSide(arm, bone) {
  const ref = arm && arm.skeleton && arm.skeleton.byName.get(String(bone || '').toLowerCase());
  const node = ref !== undefined && arm.mats ? arm.mats.get(ref) : null;
  if (!node) return 'unknown';
  const x = node.t[0];
  return x > 1e-4 ? 'right' : x < -1e-4 ? 'left' : 'centre';
}

export const hasDaggerfallArrows = (items) => ammoCountFor(items, null) > 0;
export const hasAmmoFor = (items, weapon) => ammoCountFor(items, weapon) > 0;

// This asks the same record questions as resolveWeaponParts in the same order, so the preload matches the read.
export function weaponPartPaths({ weapon, hasAmmo = false, allWeapons, has = null }) {
  const paths = [];
  const mwType = dfWeaponToMw(weapon, WEAPONS);
  if (mwType === MW_WEAPON_TYPE.None) return paths;
  const rec = pickWeaponRecord(allWeapons, mwType, weapon ? materialName(weapon) : null, { has, shape: dfWeaponShape(weapon, WEAPONS) });
  if (rec) paths.push(`meshes/${rec.model}`);
  const ammoType = ammoTypeFor(mwType);
  if (ammoType !== MW_WEAPON_TYPE.None && hasAmmo) {
    const ammoRec = pickWeaponRecord(allWeapons, ammoType, null, { has });
    if (ammoRec) paths.push(`meshes/${ammoRec.model}`);
  }
  return paths;
}

export function torchPartPaths({ torch = false, allLights, has = null }) {
  if (!torch) return [];
  const rec = pickTorchRecord(allLights, { has });
  return rec ? [`meshes/${rec.model}`] : [];
}

export const TORCH_BONE = 'Shield Bone';
// Only a held light gets this extra -90 degree X attitude, as in the reference ActorAnimation::attach.
export const LIGHT_ATTITUDE = Object.freeze({
  a: Object.freeze([1, 0, 0, 0, 0, 1, 0, -1, 0]),
  t: Object.freeze([0, 0, 0]),
});
export function resolveTorchPart({ torch = false, allLights, find, skeletonBytes, has = null, hasBone = null }) {
  const notes = [];
  const parts = [];
  let torchInfo = null;
  if (!torch) return { parts, torchInfo, notes };
  const rec = pickTorchRecord(allLights, { has });
  if (!rec) { notes.push('torch: your archives carry no carriable Morrowind torch (a LIGH record named torch, with its mesh)'); return { parts, torchInfo, notes }; }
  const path = `meshes/${rec.model}`;
  const arc = find(path);
  if (!arc) { notes.push(`torch: ${path} (${rec.id}) is not in your archives`); return { parts, torchInfo, notes }; }
  const carries = hasBone ? hasBone(TORCH_BONE) : skeletonHasBone(skeletonBytes, TORCH_BONE);
  if (!carries) { notes.push(`torch: this skeleton has no "${TORCH_BONE}" - nowhere to hold it`); return { parts, torchInfo, notes }; }
  parts.push({ slot: 'torch', bones: [TORCH_BONE], bytes: nifBytes(arc, path), preTransform: LIGHT_ATTITUDE });
  torchInfo = { id: rec.id, name: rec.name, model: rec.model, bone: TORCH_BONE, fire: !!rec.fire, attitude: true };
  return { parts, torchInfo, notes };
}

export const HIP_LIGHT_BONE = 'Bip01 Pelvis';
export const HIP_LIGHT_SLOT = 'hiplight';
export const HIP_LANTERN_HOOK = Object.freeze([14, 5, 9.5]);
const PLUMB = Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1]);
export function hipLanternPartPaths({ hipLight = false, allLights, has = null }) {
  if (!hipLight) return [];
  const rec = pickLanternRecord(allLights, { has });
  return rec ? [`meshes/${rec.model}`] : [];
}
export function resolveHipLanternPart({ hipLight = false, allLights, find, skeletonBytes, has = null, hasBone = null }) {
  const notes = [];
  const parts = [];
  let hipInfo = null;
  if (!hipLight) return { parts, hipInfo, notes };
  const rec = pickLanternRecord(allLights, { has });
  if (!rec) { notes.push('hiplight: your archives carry no carriable Morrowind lantern (a LIGH record named lantern, with its mesh)'); return { parts, hipInfo, notes }; }
  const path = `meshes/${rec.model}`;
  const arc = find(path);
  if (!arc) { notes.push(`hiplight: ${path} (${rec.id}) is not in your archives`); return { parts, hipInfo, notes }; }
  const carries = hasBone ? hasBone(HIP_LIGHT_BONE) : skeletonHasBone(skeletonBytes, HIP_LIGHT_BONE);
  if (!carries) { notes.push(`hiplight: this skeleton has no "${HIP_LIGHT_BONE}" - nowhere to hang it`); return { parts, hipInfo, notes }; }
  const hang = { rot: Float32Array.from(PLUMB), hookLocal: null, anchor: null };
  parts.push({ slot: HIP_LIGHT_SLOT, bones: [HIP_LIGHT_BONE], bytes: nifBytes(arc, path), hang });
  hipInfo = { id: rec.id, name: rec.name, model: rec.model, bone: HIP_LIGHT_BONE, fire: !!rec.fire };
  return { parts, hipInfo, notes };
}
export const hipLanternSize = (height) => (height > 1e-6 ? (HIP_LANTERN_HEIGHT * MW_UNITS_PER_METER) / height : 1);
export function hangHipLight(arm) {
  const piece = arm?.pieces?.find((p) => p.slot === HIP_LIGHT_SLOT && p.hang);
  if (!piece) return null;
  const hang = piece.hang;
  hang.hookLocal = hookOnBone(arm, HIP_LIGHT_BONE, HIP_LANTERN_HOOK) ?? [...HIP_LANTERN_HOOK];
  hangAnchor(arm.pieces, hang);
  hang.size = hipLanternSize(hang.height);
  return hang;
}

export function fitThirdPersonCloak(arm, underSlots) {
  const isCloak = (p) => isCloakSlot(p.slot);
  const isGear = (p) => HOLSTER_SLOTS.includes(p.slot);
  const covered = (slot) => underSlots.has(slot) && slot !== 'tail' && !/^shield\b/.test(slot);
  const cloak = underSlots ? fitCloakOver(arm, { isCloak, isUnder: (p) => covered(p.slot) }) : null;
  const gear = fitStowedGear(arm, { isCloak, isGear });
  const follow = followCloak(arm, { isCloak, isGear });
  const notes = (gear ?? []).filter((r) => r.how === 'unresolved').map((r) => (r.slung
    ? `holster @ ${r.bone}: over the cloak it would hang more than ${SLUNG_MOVE_LIMIT} units off the back - it hangs as it was`
    : `holster @ ${r.bone}: no pitch within ${HIP_PITCH_LIMIT} degrees keeps it in front of the cloak - it hangs as it was`));
  if (cloak?.deep) notes.push(`cloak: something under it stands more than ${CLOAK_PUSH_LIMIT} units through it (${cloak.deep} points) - left through, not chased`);
  return { cloak, gear, follow, notes };
}

// This asks the directory, not findLoaded, because a candidate is checked before the preload that reads it.
export const archiveHas = (archives) => (p) => (archives ?? []).some((a) => a.has(p));

import { ammoCountFor } from '../items/inventory.js';
import { glowUnit } from '../render/weaponGlowGlsl.js';
import { drawnPiece } from '../net/appearanceLaw.js';

const saidArrow = new Set();
function sayNoArrow(notes) {
  const why = notes.filter((n) => n.startsWith('arrow')).join('; ') || 'no reason recorded';
  if (saidArrow.has(why)) return;
  saidArrow.add(why);
  console.warn(`[mw] the bow carries no arrow - ${why}`);
}

// Parts on a node whose name holds "Left" are mirrored, so a sword hung here is the right hand's sword mirrored.
export const OFF_WEAPON_BONE = weaponAttachBone(MW_WEAPON_TYPE.MarksmanBow);
const GUARD_SURFACE_H = 200;
export const GUARD_LENS_DROP = Math.atan((GUARD.DOWN / GUARD_SURFACE_H) * 2 * Math.tan(FP_FIELD_OF_VIEW / 2));
const pictureBone = (sk, p) => (p.slot === 'offweapon' ? sk.byName.get(counterpartName(sk.nodes.get(p.attachRef)?.name)) : p.attachRef);
export function bladePictureHeight(arm, mats, cameraRef, p) {
  const eye = mats?.get(cameraRef)?.t;
  if (!eye || !p?.source || p.attachRef == null || !arm?.skeleton) return 0;
  const sk = arm.skeleton;
  const bone = pictureBone(sk, p);
  const at = bone != null ? mats.get(bone) : null;
  if (!at) return 0;
  const v = placeAtBone(p.source, at, false, undefined, p.boneOffset);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < v.length; i += 3) {
    const ahead = v[i + 1] - eye[1];
    if (!(ahead > 1e-6)) continue;
    const up = (v[i + 2] - eye[2]) / ahead;
    if (up < lo) lo = up;
    if (up > hi) hi = up;
  }
  const edge = Math.tan(FP_FIELD_OF_VIEW / 2);
  const shown = Math.min(hi, edge) - Math.max(lo, -edge);
  return shown > 0 ? shown : 0;
}
export function bladeInnerEdge(arm, mats, cameraRef, pieces, spread = 0) {
  const eye = mats?.get(cameraRef)?.t;
  const sk = arm?.skeleton;
  const plan = eye && sk && arm.fns ? mirrorPlan(sk, GRAPH_ROOT, arm.fns.skelMats) : null;
  const pivot = plan && plan.arms.R.length ? mats.get(plan.arms.R[0])?.t : null;
  if (!pivot) return null;
  const out = plan.outward.R, edge = Math.tan(FP_FIELD_OF_VIEW / 2);
  const c = Math.cos(-out * spread), s = Math.sin(-out * spread);
  const turned = (at) => {
    const a = at.a, dx = at.t[0] - pivot[0], dy = at.t[1] - pivot[1];
    return {
      a: [c * a[0] - s * a[3], c * a[1] - s * a[4], c * a[2] - s * a[5], s * a[0] + c * a[3], s * a[1] + c * a[4], s * a[2] + c * a[5], a[6], a[7], a[8]],
      t: [pivot[0] + c * dx - s * dy, pivot[1] + s * dx + c * dy, at.t[2]],
    };
  };
  let inner = Infinity;
  for (const p of pieces ?? []) {
    if (!p?.source || p.attachRef == null) continue;
    const bone = pictureBone(sk, p);
    const at = bone != null ? mats.get(bone) : null;
    if (!at) continue;
    const v = placeAtBone(p.source, spread ? turned(at) : at, false, undefined, p.boneOffset);
    const n = v.length / 3, across = new Float64Array(n), up = new Float64Array(n), ahead = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const d = v[i * 3 + 1] - eye[1];
      if (!(d > 1e-6)) continue;
      ahead[i] = 1;
      across[i] = (out * (v[i * 3] - eye[0])) / d;
      up[i] = (v[i * 3 + 2] - eye[2]) / d;
    }
    const edgeOf = (a, b) => {
      if (!ahead[a] || !ahead[b]) return;
      let lo = 0, hi = 1;
      const dy = up[b] - up[a];
      if (Math.abs(dy) > 1e-12) {
        const t0 = (-edge - up[a]) / dy, t1 = (edge - up[a]) / dy;
        lo = Math.max(0, Math.min(t0, t1));
        hi = Math.min(1, Math.max(t0, t1));
        if (lo > hi) return;
      } else if (Math.abs(up[a]) > edge) return;
      const dx = across[b] - across[a];
      inner = Math.min(inner, across[a] + dx * lo, across[a] + dx * hi);
    };
    const idx = p.indices;
    if (idx && idx.length >= 3) for (let t = 0; t + 2 < idx.length; t += 3) { edgeOf(idx[t], idx[t + 1]); edgeOf(idx[t + 1], idx[t + 2]); edgeOf(idx[t + 2], idx[t]); }
    else for (let i = 0; i < n; i++) edgeOf(i, i);
  }
  return Number.isFinite(inner) ? Math.atan(inner) : null;
}
export function pairBladeMeasure(b, memo, measure) {
  if (!b || !b.ok || !b.arm) return null;
  const right = b.arm.pieces.find((p) => p.slot === 'weapon') ?? null, left = b.arm.pieces.find((p) => p.slot === 'offweapon') ?? null;
  if (memo && memo.of === b && memo.right === right && memo.left === left) return memo;
  return { of: b, right, left, ...measure(b, b.restMats ?? b.arm.mats, right, left) };
}
export function guardMeasure(b, mats, right, left) {
  const drop = { R: guardLensDrop(b.arm, mats, b.cameraRef, right), L: guardLensDrop(b.arm, mats, b.cameraRef, left) };
  return { drop, dip: pairGuardDip(b.arm, b.cameraRef, mats, drop) };
}
export function spreadMeasure(b, mats) {
  const rights = b.arm.pieces.filter((p) => p.slot === 'weapon'), lefts = b.arm.pieces.filter((p) => p.slot === 'offweapon');
  const innerAt = (a) => ({ R: bladeInnerEdge(b.arm, mats, b.cameraRef, rights, a), L: bladeInnerEdge(b.arm, mats, b.cameraRef, lefts, a) });
  const angle = pairSpreadAngle(innerAt, FP_FIELD_OF_VIEW);
  return { angle, inner: innerAt(angle) };
}
export function pairSpreadStep(angle, want, dt) {
  const a = easeTo(angle, want, PAIR_SPREAD.TAU, dt);
  return want === 0 && a < 1e-5 ? 0 : a;
}
export function guardLensDrop(arm, mats, cameraRef, p) {
  const h = p ? bladePictureHeight(arm, mats, cameraRef, p) : 0;
  return h > 0 ? Math.atan(GUARD.LOWER * h) : GUARD_LENS_DROP;
}
export function pairGuardDip(arm, cameraRef, mats = arm?.mats, drop = { L: GUARD_LENS_DROP, R: GUARD_LENS_DROP }) {
  const plan = arm?.skeleton && mats && arm.fns ? mirrorPlan(arm.skeleton, GRAPH_ROOT, arm.fns.skelMats) : null;
  const eye = mats?.get(cameraRef)?.t;
  const side = (s) => {
    const sh = plan?.uppers?.[s] != null ? mats.get(plan.uppers[s])?.t : null, wr = plan?.hands?.[s] != null ? mats.get(plan.hands[s])?.t : null;
    if (!eye || !sh || !wr) return 0;
    const reach = Math.hypot(wr[0] - sh[0], wr[1] - sh[1], wr[2] - sh[2]);
    return reach > 1e-6 ? drop[s] * Math.hypot(wr[0] - eye[0], wr[1] - eye[1], wr[2] - eye[2]) / reach : 0;
  };
  return { L: side('L'), R: side('R') };
}
const noBoneNote = (slot, bone, what) => `${slot}: this skeleton has no "${bone}" bone to hang ${what} on`;
const swapFailedNote = (slot, msg) => `${slot}: the swap to this weapon failed - ${msg}`;
export function resolveOffWeaponParts({ weapon, allWeapons, find, skeletonBytes, has = null, hasBone = null }) {
  if (!weapon) return { parts: [], info: null, notes: [] };
  const r = resolveWeaponParts({ weapon, hasAmmo: false, allWeapons, find, skeletonBytes, has });
  const main = r.parts.find((p) => p.slot === 'weapon');
  const notes = r.notes.filter((n) => /^weapon[ :@]/.test(n)).map((n) => n.replace(/^weapon/, 'offweapon'));
  if (!main) return { parts: [], info: null, notes };
  const carries = hasBone ? hasBone(OFF_WEAPON_BONE) : skeletonHasBone(skeletonBytes, OFF_WEAPON_BONE);
  if (!carries) {
    return { parts: [], info: null, notes: [...notes, noBoneNote('offweapon', OFF_WEAPON_BONE, r.weaponInfo?.name ?? main.slot)] };
  }
  return { parts: [{ slot: 'offweapon', bones: [OFF_WEAPON_BONE], bytes: main.bytes, ...(main.preTransform ? { preTransform: main.preTransform } : {}) }], info: { ...r.weaponInfo, bone: OFF_WEAPON_BONE }, notes };
}

export function resolveWeaponParts({ weapon, hasAmmo = false, allWeapons, find, skeletonBytes, has = null }) {
  const notes = [];
  const parts = [];
  let weaponInfo = null;
  let arrowInfo = null;
  const mwType = dfWeaponToMw(weapon, WEAPONS);
  if (mwType !== MW_WEAPON_TYPE.None) {
    const rec = pickWeaponRecord(allWeapons, mwType, weapon ? materialName(weapon) : null, { has, shape: dfWeaponShape(weapon, WEAPONS) });
    if (!rec) {
      notes.push(`weapon: your archives carry no unenchanted Morrowind weapon of type ${mwType}`);
    } else {
      const path = `meshes/${rec.model}`;
      const arc = find(path);
      if (!arc) notes.push(`weapon: ${path} (${rec.id}) is not in your archives`);
      else {
        // The typed attach bone is used only when the rig carries it, else Weapon Bone, as in the reference.
        const typed = weaponAttachBone(mwType);
        const bone = typed === 'Weapon Bone' || skeletonHasBone(skeletonBytes, typed)
          ? typed : 'Weapon Bone';
        const weaponBytes = nifBytes(arc, path);
        parts.push({ slot: 'weapon', bones: [bone], bytes: weaponBytes });
        weaponInfo = { id: rec.id, name: rec.name, model: rec.model, type: mwType, bone,
          speed: rec.speed || 1 };

        const ammoType = ammoTypeFor(mwType);
        if (ammoType !== MW_WEAPON_TYPE.None && hasAmmo) {
          const ammoRec = pickWeaponRecord(allWeapons, ammoType, null, { has });
          if (!ammoRec) {
            notes.push(`arrow: your archives carry no unenchanted Morrowind ammunition of type ${ammoType}`);
          } else {
            const ammoPath = `meshes/${ammoRec.model}`;
            const ammoArc = find(ammoPath);
            if (!ammoArc) notes.push(`arrow: ${ammoPath} (${ammoRec.id}) is not in your archives`);
            else {
              // The arrow bone on the actor comes first, else the ArrowBone node in the weapon mesh.
              const skelBone = arrowAttachBone(mwType);
              const onActor = skelBone && skeletonHasBone(skeletonBytes, skelBone);
              let pre = null;
              let preClip = null;
              let arrowBone = skelBone;
              if (!onActor) {
                const weaponNif = parseNifOnce(weaponBytes);
                pre = nodeTransformOf(weaponNif, ARROW_FALLBACK_NODE);
                arrowBone = pre ? bone : null;
                if (pre) preClip = { nif: weaponNif, node: ARROW_FALLBACK_NODE };
              }
              if (!arrowBone) {
                notes.push(`arrow: neither this skeleton's "${skelBone}" bone nor an `
                  + `"${ARROW_FALLBACK_NODE}" node in ${weaponInfo.model} - nowhere to put it`);
              } else {
                parts.push({
                  // The ammo part is instanced bare, with no bone offset, as in the reference attachArrow.
                  slot: 'arrow', bones: [arrowBone], bytes: nifBytes(ammoArc, ammoPath), preTransform: pre, preClip,
                  ammo: true,
                });
                arrowInfo = {
                  id: ammoRec.id, name: ammoRec.name, model: ammoRec.model, type: ammoType,
                  bone: arrowBone, viaWeaponMesh: !onActor,
                };
              }
            }
          }
        }
      }
    }
  } else if (weapon) {
    notes.push('weapon: Morrowind has no weapon type for what you are holding');
  }
  if (hasAmmo && weaponInfo && ammoTypeFor(mwType) !== MW_WEAPON_TYPE.None && !arrowInfo) sayNoArrow(notes);
  return { mwType, parts, weaponInfo, arrowInfo, notes };
}

export function ownBodyPaths(add, rows) {
  return (add.skinFrom ?? []).flatMap((slot) => rows
    .filter((r) => r.record && r.slot === slot).map((r) => ({ slot, path: `meshes/${r.record.model}` })));
}

export function ownBodyPart(add, rows, find) {
  if (!add.skinFrom) return {};
  return {
    skinFrom: ownBodyPaths(add, rows).map((b) => ({ slot: b.slot, bytes: nifBytes(find(b.path), b.path) })).filter((b) => b.bytes),
    fitTo: add.fitTo ?? null,
  };
}

const capsHead = (a) => a.partName === 'head' || a.partName === 'hair' || (a.hides ?? []).some((h) => h === 'head' || h === 'hair');

export function bareHeadRows(rows, worn, pieces, werewolf = false) {
  if (werewolf) return [];
  const hidden = ['head', 'hair'].filter((slot) => (worn?.shadows ?? []).includes(slot));
  if (!hidden.length) return [];
  const caps = new Set((worn?.adds ?? []).filter(capsHead).map((a) => a.slot));
  if ((pieces ?? []).some((p) => caps.has(p.slot))) return [];
  return (rows ?? []).filter((r) => r.record && hidden.includes(r.slot)).map((r) => ({ slot: r.slot, bones: PART_BONES[r.slot] ?? [], model: r.record.model }));
}

async function buildTpBody({
  race, female, beast, faceIndex, faceMatch, weapon, hasAmmo, worn, archives, parts, allWeapons, find, gen = null,
  torch = false, allLights = [],
  sheathing = true, ammoCount = null,
  hipLight = false,
  werewolf = false,
  skin = null,
  vampire = false,
  walk = null,
  ownHeads = false,
}) {
  const exists = (p) => archives.some((a) => a.has(p));
  const settingsSkeleton = tpSkeletonPath({ female, beast, werewolf });
  const skeletonPath = correctActorModelPath(settingsSkeleton, exists);
  try {
    await loadFromArchives(archives, [skeletonPath]);
    const skelArc = find(skeletonPath);
    if (!skelArc) return { ok: false, stage: 'skeleton', error: `${skeletonPath} is not in your archives` };
    const skeletonBytes = nifBytes(skelArc, skeletonPath);

    const rows = werewolf ? werewolfHeadRows(parts) : playerBodyRows(parts, race, female, { beast, faceIndex, faceMatch, vampire, walk, has: exists, ownHeads });
    const missing = [];
    missing.push(...worn.notes);
    let skinRows = shadowSkinRows(
      rows.filter((r) => r.record).map((r) => ({ slot: r.slot, bones: PART_BONES[r.slot] ?? [], model: r.record.model })),
      worn.shadows);
    // When worn gear hides a werewolf's head, its hair goes too, as in the reference part priorities.
    if (werewolf && worn.shadows.includes('head')) skinRows = skinRows.filter((r) => r.slot !== 'hair');
    for (const row of rows) {
      if (!row.record) missing.push(werewolf ? `${row.slot}: no Werewolf${row.slot === 'head' ? 'Head' : 'Hair'} BODY record - Bloodmoon.esm carries it` : `${row.slot}: no third-person record for this actor`);
    }
    const bodyUnder = (add) => ownBodyPaths(add, rows);
    await loadFromArchives(archives, [
      ...[...skinRows, ...worn.adds].map((row) => `meshes/${row.model}`),
      ...worn.adds.flatMap(bodyUnder).map((b) => b.path),
      ...weaponPartPaths({ weapon, hasAmmo, allWeapons, has: archiveHas(archives) }),
      ...torchPartPaths({ torch, allLights, has: archiveHas(archives) }),
      ...hipLanternPartPaths({ hipLight, allLights, has: archiveHas(archives) }),
    ]);
    const partBytes = [];
    for (const row of [...skinRows, ...worn.adds]) {
      const path = `meshes/${row.model}`;
      const arc = find(path);
      if (!arc) { missing.push(`${row.slot}: ${path} is not in your archives`); continue; }
      partBytes.push({ slot: row.slot, partName: row.partName, bones: row.bones, bytes: nifBytes(arc, path),
        ...ownBodyPart(row, rows, find) });
    }
    if (!partBytes.length) {
      return { ok: false, stage: 'parts', error: werewolf ? 'no werewolf body mesh resolved - its robe, head and hair are Bloodmoon\'s' : `no third-person body mesh resolved for race "${race}"`, notes: missing, rows };
    }
    const resolvedWeapon = resolveWeaponParts({ weapon, hasAmmo, allWeapons, find, skeletonBytes, has: archiveHas(archives) });
    partBytes.push(...resolvedWeapon.parts);
    const resolvedTorch = resolveTorchPart({ torch, allLights, find, skeletonBytes, has: archiveHas(archives) });
    partBytes.push(...resolvedTorch.parts);
    // The werewolf takes no bone addons; the reference reads them only under an option that is off by default.
    const boneSourcePaths = werewolf ? [] : boneSourcesFor(TP_BASE_MODEL, skeletonPath, archives);
    await loadFromArchives(archives, [...boneSourcePaths, ...holsterPartPaths({ weaponModel: resolvedWeapon.weaponInfo?.model })]);
    const boneSources = boneSourcePaths.map((path) => ({ name: path, bytes: nifBytes(find(path), path) })).filter((b) => b.bytes);
    const resolvedHolster = sheathing
      ? resolveHolsterParts({
        mwType: resolvedWeapon.mwType, weaponModel: resolvedWeapon.weaponInfo?.model,
        weaponBytes: resolvedWeapon.parts.find((p) => p.slot === 'weapon')?.bytes ?? null,
        ammo: resolvedWeapon.arrowInfo ? { bytes: resolvedWeapon.parts.find((p) => p.slot === 'arrow')?.bytes ?? null, type: resolvedWeapon.arrowInfo.type } : null,
        ammoCount: ammoCount ?? (hasAmmo ? Number.MAX_SAFE_INTEGER : 0),
        find, hasBone: boneProbe(skeletonBytes, boneSources), parseNif: parseNifOnce,
      })
      : { parts: [], info: null, notes: [] };
    partBytes.push(...resolvedHolster.parts);
    const resolvedHip = resolveHipLanternPart({ hipLight, allLights, find, skeletonBytes, has: archiveHas(archives), hasBone: boneProbe(skeletonBytes, boneSources) });
    partBytes.push(...resolvedHip.parts);

    let arm = await assembleFirstPersonArm({ skeletonBytes, parts: partBytes, boneSources, parseNif: parseNifOnce, offWeaponBone: true });
    if (!arm.ok) {
      return { ok: false, stage: arm.stage || 'assembly', error: arm.error, notes: [...missing, ...(arm.notes || [])], rows };
    }
    const bare = bareHeadRows(rows, worn, arm.pieces, werewolf);
    if (bare.length) {
      await loadFromArchives(archives, bare.map((r) => `meshes/${r.model}`));
      const back = bare.flatMap((r) => {
        const path = `meshes/${r.model}`, arc = find(path);
        return arc ? [{ slot: r.slot, bones: r.bones, bytes: nifBytes(arc, path) }] : [];
      });
      const again = back.length ? await assembleFirstPersonArm({ skeletonBytes, parts: [...partBytes, ...back], boneSources, parseNif: parseNifOnce, offWeaponBone: true }) : null;
      if (again?.ok) {
        arm = again;
        skinRows.push(...bare);
        const cap = worn.adds.find(capsHead);
        missing.push(`${cap?.partName === 'outfit' ? cap.slot : 'helm'}: none of it bound - the ${bare.map((r) => r.slot).join(' and ')} drawn bare`);
      }
    }
    hangHipLight(arm);
    const cloakFit = fitThirdPersonCloak(arm, new Set([...skinRows, ...worn.adds].map((row) => row.slot)));
    await preloadArmTextures([...arm.pieces, ...(arm.effects ?? [])], archives, gen);
    const textures = collectArmTextures([...arm.pieces, ...(arm.effects ?? [])], archives, gen);
    if (werewolf) await preskinTextures(arm.pieces, textures, skin);

    const sourcePaths = tpAnimSources(skeletonPath, exists, { werewolf });
    if (!sourcePaths.length) {
      return {
        ok: false, stage: 'clip',
        error: werewolf ? `no werewolf animation file - ${animSourceName(skeletonPath)} is not in your archives`
          : `no third-person animation file - neither ${animSourceName(TP_BASE_MODEL)} `
          + `nor ${animSourceName(skeletonPath)} is in your archives`,
        notes: missing, rows,
      };
    }
    await loadFromArchives(archives, sourcePaths);
    const sources = [];
    for (const p of sourcePaths) {
      const one = await cachedClipReport(gen, skeletonPath, p, () => find(p).get(p).slice(), arm.skeleton);
      if (!one.ok) return { ok: false, stage: 'clip', error: `${p}: ${one.error}`, notes: missing, rows };
      sources.push({
        name: p, keys: one.keys, groups: one.groups, groupSet: new Set(one.groups),
        trackMap: one.trackMap, binding: one.binding,
        wouldAccumRoot: accumRootRef(arm.skeleton, one.trackMap),
      });
    }
    const groupSet = new Set(sources.flatMap((so) => so.groups));
    const idleProbe = composeStanceGroup(FP_IDLE_BASE, animWeaponType(resolvedWeapon.mwType, true), (n) => groupSet.has(n));
    if (!idleProbe.group) {
      return { ok: false, stage: 'clip', error: `this .kf names no "${FP_IDLE_BASE}" group and no weapon-suffixed variant of one`, notes: missing, rows };
    }
    const idlePick = pickAnimSource(sources, idleProbe.group, resetClip, { loopFallback: true });
    if (!idlePick) {
      return { ok: false, stage: 'clip', error: `no source gives group "${idleProbe.group}" a start and a stop key`, notes: missing, rows };
    }
    const accumRoot = sources.reduce((acc, so) => (acc ?? so.wouldAccumRoot), null) ?? null;
    for (const so of sources) so.accumRoot = accumRoot;
    poseAssembly(arm, { tracks: idlePick.source.trackMap, sampleTrack, time: idlePick.state.startTime, accumRoot });

    return {
      ok: true,
      arm,
      tracks: idlePick.source.trackMap,
      accumRoot,
      keys: idlePick.source.keys,
      sources,
      sourcePaths,
      clip: idlePick.state,
      groups: [...groupSet].sort(),
      groupSet,
      mwType: resolvedWeapon.mwType,
      textures,
      skeletonPath,
      settingsSkeleton,
      weapon: resolvedWeapon.weaponInfo,
      arrow: resolvedWeapon.arrowInfo,
      torch: resolvedTorch.torchInfo,
      hipLight: resolvedHip.hipInfo,
      hipLightTried: !!hipLight,
      holster: resolvedHolster.info,
      boneSources: boneSourcePaths,
      sheathing,
      werewolf: !!werewolf,
      leftArm: blendMaskBones(arm.skeleton),
      rows,
      notes: [...missing, ...resolvedWeapon.notes, ...resolvedTorch.notes, ...resolvedHip.notes, ...resolvedHolster.notes, ...cloakFit.notes, ...(arm.notes || [])],
      pieces: armPieceRows(arm.pieces).length,
      skeletonBytes,
    };
  } catch (err) {
    return { ok: false, stage: 'build', error: err && err.message ? err.message : String(err) };
  }
}

async function buildCreatureBody({ creature, flies = false, deps = null }) {
  const ids = [].concat(creature).map((c) => String(c || '').toLowerCase());
  try {
    const d = deps || await import('../scenes/dataSource.js');
    const archives = await d.loadMorrowindArchives();
    if (!archives.length) return { ok: false, stage: 'data', error: 'no Morrowind .bsa attached' };
    const esmNames = esmLoadOrder((await d.storedMorrowindNames()).filter((n) => /\.esm$/i.test(n)));
    if (!esmNames.length) return { ok: false, stage: 'data', error: 'no Morrowind .esm attached - the creature records live there' };
    const gen = adoptMemoGeneration(d.morrowindDataGeneration);
    const found = new Map();
    for (const n of esmNames) {
      const records = typeof d.loadMorrowindArmRecords === 'function' ? await d.loadMorrowindArmRecords(n) : null;
      let list;
      if (records) list = armRecordsOf(records, 'creatures');
      else {
        const bytes = await d.loadMorrowindFile(n);
        const key = gen === null ? null : `${gen}:${n}:${bytes.byteLength}:creatures`;
        list = key ? ESM_WALK_CACHE.get(key) : undefined;
        if (list === undefined) { list = creatureRecords(bytes); if (key) ESM_WALK_CACHE.set(key, list); }
      }
      for (const c of list) if (ids.includes(c.id)) found.set(c.id, c);
    }
    const rec = ids.map((i) => found.get(i)).find(Boolean) ?? null;
    if (!rec) return { ok: false, stage: 'record', error: `no CREA record ${ids.map((i) => `"${i}"`).join(' or ')} in ${esmNames.join(', ')}` };
    if (flies && (rec.flags & CREA_FLAG.Flies) === 0) return { ok: false, stage: 'record', error: `"${rec.id}" does not fly - a flyer keeps its sprite` };
    const exists = (p) => archives.some((a) => a.has(p));
    const find = (p) => findLoaded(archives, p);
    const modelPath = correctActorModelPath(`meshes/${rec.model}`, exists);
    await loadFromArchives(archives, [modelPath]);
    const arc = find(modelPath);
    if (!arc) return { ok: false, stage: 'model', error: `${modelPath} is not in your archives` };
    const modelBytes = nifBytes(arc, modelPath);
    const arm = await assembleCreature({ modelBytes, parseNif: parseNifOnce });
    if (!arm.ok) return { ok: false, stage: arm.stage || 'assembly', error: arm.error, notes: arm.notes || [] };
    await preloadArmTextures([...arm.pieces, ...(arm.effects ?? [])], archives, gen);
    const textures = collectArmTextures([...arm.pieces, ...(arm.effects ?? [])], archives, gen);
    const bipedal = (rec.flags & CREA_FLAG.Bipedal) !== 0;
    const sourcePaths = creatureAnimSources(modelPath, exists, { bipedal });
    if (!sourcePaths.length) return { ok: false, stage: 'clip', error: `no animation file - ${animSourceName(modelPath)} is not in your archives`, notes: arm.notes };
    await loadFromArchives(archives, sourcePaths);
    const sources = [];
    for (const p of sourcePaths) {
      const one = await cachedClipReport(gen, modelPath, p, () => find(p).get(p).slice(), arm.skeleton);
      if (!one.ok) return { ok: false, stage: 'clip', error: `${p}: ${one.error}`, notes: arm.notes };
      sources.push({ name: p, keys: one.keys, groups: one.groups, groupSet: new Set(one.groups), trackMap: one.trackMap, binding: one.binding,
        wouldAccumRoot: accumRootRef(arm.skeleton, one.trackMap) });
    }
    const groupSet = new Set(sources.flatMap((so) => so.groups));
    const idlePick = groupSet.has(FP_IDLE_BASE) ? pickAnimSource(sources, FP_IDLE_BASE, resetClip, { loopFallback: true }) : null;
    if (!idlePick) return { ok: false, stage: 'clip', error: `no source gives "${FP_IDLE_BASE}" a start and a stop key`, notes: arm.notes };
    const accumRoot = sources.reduce((acc, so) => (acc ?? so.wouldAccumRoot), null) ?? null;
    for (const so of sources) so.accumRoot = accumRoot;
    poseAssembly(arm, { tracks: idlePick.source.trackMap, sampleTrack, time: idlePick.state.startTime, accumRoot });
    const third = {
      ok: true, arm, tracks: idlePick.source.trackMap, accumRoot, keys: idlePick.source.keys, sources, sourcePaths,
      clip: idlePick.state, groups: [...groupSet].sort(), groupSet, mwType: MW_WEAPON_TYPE.None, textures,
      skeletonPath: modelPath, settingsSkeleton: modelPath,
      weapon: null, arrow: null, torch: null, hipLight: null, hipLightTried: false, holster: null, boneSources: [], sheathing: false,
      werewolf: false, leftArm: new Set(), rows: [], notes: [...(arm.notes || [])], pieces: armPieceRows(arm.pieces).length, skeletonBytes: modelBytes,
    };
    const scale = Number.isFinite(rec.scale) && rec.scale > 0 ? rec.scale : 1;
    const bb = arm.bounds;
    const height = bb ? ((bb.maxZ - Math.min(bb.minZ, 0)) * scale) / MW_UNITS_PER_METER : null;
    return {
      ...third, third,
      creature: { id: rec.id, name: rec.name, flags: rec.flags, bipedal, scale, height },
      raceScale: { weight: scale, height: scale },
      catalog: null, cameraRef: -1, reach: 0, idleReach: 0, allWeapons: [], allLights: [], worn: [], face: null,
    };
  } catch (err) {
    return { ok: false, stage: 'build', error: err && err.message ? err.message : String(err) };
  }
}

async function faceMatchOf({ race, female, faceIndex, werewolf = false, npcFace = null, pools, archives, gen, d }) {
  faceIndex = classicFaceRecord(faceIndex);
  let faceMatch;
  if (werewolf) {
    faceMatch = { head: null, hair: null, reasons: ['werewolf: the head is WerewolfHead'] };
  } else if (npcFace) {
    faceMatch = { head: null, hair: null, reasons: ['an NPC: its head and hair walked off its seed'] };
  } else if (curatedAnswersFace(pools, race, female, faceIndex)) {
    faceMatch = { head: null, hair: null, reasons: [t('body.face.curated', 'head and hair matched from the curated table')] };
  } else if (!d.fetchArena2Bytes) {
    faceMatch = { head: null, hair: null, reasons: ['no Daggerfall data door - the walk stands'] };
  } else {
    const measured = [...pools.heads, ...pools.hairs].map((r) => r.id).join('\n');
    const fkey = `${gen}:${race}:${female ? 'f' : 'm'}:${faceIndex | 0}:${fnv(measured)}`;
    faceMatch = FACE_MATCH_CACHE.get(fkey);
    // The stored verdict also keys on the measured ids, since the port's own heads are not in the data fingerprint.
    const print = typeof d.morrowindDataFingerprint === 'function' ? d.morrowindDataFingerprint() : null;
    const dkey = print !== null && typeof d.loadDerivedJson === 'function' && typeof d.storeDerivedJson === 'function'
      ? `mw-face-match:v${FACE_MATCH_VERSION}:${race}:${female ? 'f' : 'm'}:${faceIndex | 0}:${fnv(print)}:${fnv(measured)}` : null;
    if (!faceMatch && dkey) {
      const kept = await d.loadDerivedJson(dkey);
      if (kept && (kept.head || kept.hair)) { faceMatch = kept; FACE_MATCH_CACHE.set(fkey, kept); }
    }
    if (!faceMatch) {
      faceMatch = await matchFaceFor({ race, female, faceIndex, pools, archives, deps: d });
      if (dkey && (faceMatch.head || faceMatch.hair)) {
        try { await d.storeDerivedJson(dkey, faceMatch); } catch (e) { console.warn('[mw] face verdict could not be kept -', e?.message ?? e); }
      }
      // A miss is not cached, since the first build of a session can run before the portrait data arrives.
      if (faceMatch.head || faceMatch.hair) FACE_MATCH_CACHE.set(fkey, faceMatch);
    }
  }
  return faceMatch;
}

const HEAD_PORTRAIT_CACHE = new Map();
let headCatalog = null;

function headCatalogOf(d) {
  const gen = adoptMemoGeneration(d.morrowindDataGeneration);
  if (gen !== null && headCatalog && headCatalog.gen === gen) return headCatalog.promise;
  const promise = (async () => {
    const archives = await d.loadMorrowindArchives();
    if (!archives.length) return null;
    const esmNames = esmLoadOrder((await d.storedMorrowindNames()).filter((n) => /\.esm$/i.test(n)));
    if (!esmNames.length) return null;
    const parts = [], armors = [], races = new Map();
    for (const n of esmNames) {
      const records = typeof d.loadMorrowindArmRecords === 'function' ? await d.loadMorrowindArmRecords(n) : null;
      const bytes = records ? null : await d.loadMorrowindFile(n);
      parts.push(...(records ? armRecordsOf(records, 'parts') : bodyParts(bytes)));
      armors.push(...((records ? armRecordsOf(records, 'armors') : armorRecords(bytes)) ?? []));
      for (const [k, v] of (records ? (records.races ? armRecordsOf(records, 'races') : new Map()) : raceRecords(bytes))) races.set(k, v);
    }
    return { archives, parts, armors, races, gen };
  })();
  const forget = () => { if (headCatalog && headCatalog.promise === promise) headCatalog = null; };
  if (gen !== null) headCatalog = { gen, promise };
  promise.then((c) => { if (!c) forget(); }, forget);
  return promise;
}

export function headFrame(bounds, { air = 1.08, aspect = 1 } = {}) {
  const c = [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, (bounds.minZ + bounds.maxZ) / 2];
  const span = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, bounds.maxZ - bounds.minZ) || 1;
  const eye = [c[0], c[1], c[2] + span * 2];
  const view = lookAt(eye, c, [0, 1, 0]);
  let hw = 0; let hh = 0;
  for (const x of [bounds.minX, bounds.maxX]) for (const y of [bounds.minY, bounds.maxY]) for (const z of [bounds.minZ, bounds.maxZ]) {
    const p = transformPoint(view, x, y, z);
    hw = Math.max(hw, Math.abs(p[0])); hh = Math.max(hh, Math.abs(p[1]));
  }
  const a = aspect > 0 ? aspect : 1;
  const halfH = Math.max(hh, hw / a) * air || 1;
  return { view, proj: ortho(halfH * a, halfH, 0.1, span * 8), eye };
}

export const headPortraitModel = () => multiply(trs(0, 0, 0, 0, 180, 0, -1 / MW_UNITS_PER_METER, 1 / MW_UNITS_PER_METER, 1 / MW_UNITS_PER_METER), NIF_TO_PASS);

export function headBounds(pieces, model, heads, hoods) {
  const box = () => ({ minX: Infinity, minY: Infinity, minZ: Infinity, maxX: -Infinity, maxY: -Infinity, maxZ: -Infinity });
  const grow = (b, q) => {
    if (q[0] < b.minX) b.minX = q[0]; if (q[0] > b.maxX) b.maxX = q[0];
    if (q[1] < b.minY) b.minY = q[1]; if (q[1] > b.maxY) b.maxY = q[1];
    if (q[2] < b.minZ) b.minZ = q[2]; if (q[2] > b.maxZ) b.maxZ = q[2];
  };
  const b = box();
  for (const p of pieces) {
    if (!heads.has(p.slot)) continue;
    for (let i = 0; i < p.positions.length; i += 3) grow(b, transformPoint(model, p.positions[i], p.positions[i + 1], p.positions[i + 2]));
  }
  if (!(b.maxX > b.minX)) return null;
  const c = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2];
  const r = 0.75 * Math.hypot(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
  for (const p of pieces) {
    if (!hoods.has(p.slot)) continue;
    for (let i = 0; i < p.positions.length; i += 3) {
      const q = transformPoint(model, p.positions[i], p.positions[i + 1], p.positions[i + 2]);
      if (Math.hypot(q[0] - c[0], q[1] - c[1], q[2] - c[2]) < r) grow(b, q);
    }
  }
  return b;
}

async function renderHeadAssembly(renderer, cat, { skeletonPath, skinRows, heads, rows, worn, werewolf, skin }, pw, ph) {
  const find = (p) => cat.archives.find((a) => a.has(p)) ?? null;
  await loadFromArchives(cat.archives, [skeletonPath, ...[...skinRows, ...heads].map((r) => `meshes/${r.model}`), ...heads.flatMap((a) => ownBodyPaths(a, rows)).map((b) => b.path)]);
  const skelArc = find(skeletonPath);
  if (!skelArc) return null;
  const skeletonBytes = nifBytes(skelArc, skeletonPath);
  const partOf = (row) => {
    const path = `meshes/${row.model}`, arc = find(path);
    return arc ? { slot: row.slot, partName: row.partName, bones: row.bones, bytes: nifBytes(arc, path), ...ownBodyPart(row, rows, find) } : null;
  };
  const parts = [...skinRows, ...heads].map(partOf).filter(Boolean);
  let arm = await assembleFirstPersonArm({ skeletonBytes, parts, parseNif: parseNifOnce });
  if (!arm.ok) return null;
  const given = bareHeadRows(rows, worn, arm.pieces, werewolf);
  if (given.length) {
    await loadFromArchives(cat.archives, given.map((r) => `meshes/${r.model}`));
    const again = await assembleFirstPersonArm({ skeletonBytes, parts: [...parts, ...given.map(partOf).filter(Boolean)], parseNif: parseNifOnce });
    if (again.ok) arm = again;
  }
  poseAssembly(arm);
  const pieces = arm.pieces.filter((p) => p.positions && p.indices);
  const model = headPortraitModel();
  const headSlots = new Set(['head', 'hair', ...heads.filter((a) => !(a.hides ?? []).length).map((a) => a.slot)]);
  const hoodSlots = new Set(heads.filter((a) => (a.hides ?? []).length).map((a) => a.slot));
  const bounds = headBounds(pieces, model, headSlots, hoodSlots);
  if (!bounds) return null;
  await preloadArmTextures(pieces, cat.archives, cat.gen);
  if (texturesUnread(pieces, cat.archives, cat.gen)) return null;
  const w = Math.min(CHAR_SPRITE_RT_SIZE, Math.max(16, pw | 0)), h = Math.min(CHAR_SPRITE_RT_SIZE, Math.max(16, ph | 0));
  const { view, proj } = headFrame(bounds, { aspect: w / h });
  const packed = packFpArm(pieces);
  const mesh = renderer.createCharacterMesh(packed.packed, { uv: true });
  mesh.ranges = packed.ranges;
  const textures = collectArmTextures(pieces, cat.archives, cat.gen);
  for (const r of mesh.ranges) {
    const entry = r.textureFile ? textures.get(r.textureFile) : null;
    if (!entry) continue;
    const m = r.piece.material;
    r.tex = acquireCharacterTexture(renderer, skin ? skinnedMipsOf(entry.image, skin, skinUseOf(r.piece, r.textureFile)) : entry.image.mips, wrapModes(m ? m.clampMode : 3));
    r.alphaCut = m && m.alphaTest ? (m.alphaThreshold || 0) / 255 : 0;
  }
  try {
    return renderer.renderCharacterSpriteImage(mesh, model, proj, view, w, h);
  } finally {
    if (renderer.gl) {
      renderer.gl.deleteVertexArray(mesh.vao);
      for (const b of mesh.buffers || []) renderer.gl.deleteBuffer(b);
    }
    for (const r of mesh.ranges) if (r.tex) { releaseCharacterTexture(renderer, r.tex); r.tex = null; }
  }
}

const beastWearPref = () => ({ feet: getPref('mwBeastFeet'), helm: getPref('mwBeastHelm') });

/** @param {{ renderer?: any, race?: string|null, female?: boolean, faceIndex?: number, npcFace?: { head: number, hair: number }|null, ownHeads?: boolean, vampire?: boolean, werewolf?: boolean, skin?: string|null, armor?: any[]|null, px?: number, ph?: number, deps?: any }} [opts] */
export async function headPortrait({ renderer, race, female = false, faceIndex = 0, npcFace = null, vampire = false, werewolf = false, skin = null, armor = null, ownHeads = false, px = 128, ph = px, deps = null } = {}) {
  faceIndex = classicFaceRecord(faceIndex);
  if (!renderer || !race) return null;
  const d = deps || await import('../scenes/dataSource.js');
  const cat = await headCatalogOf(d);
  if (!cat) return null;
  const exists = archiveHas(cat.archives);
  const raceRec = cat.races.get(String(race).toLowerCase());
  const beast = !!(raceRec && raceRec.radt && raceRec.beast);
  const pools = werewolf || npcFace ? null : facePools(cat.parts, race, female, { has: exists, own: ownHeads });
  const faceMatch = await faceMatchOf({ race, female, faceIndex, werewolf, npcFace, pools, archives: cat.archives, gen: cat.gen, d });
  const rows = (werewolf ? werewolfHeadRows(cat.parts) : playerBodyRows(cat.parts, race, female, { beast, faceIndex, faceMatch, vampire, walk: npcFace, has: exists, ownHeads }))
    .filter((r) => r.slot === 'head' || r.slot === 'hair');
  if (!rows.some((r) => r.slot === 'head' && r.record)) return null;
  const pieces = werewolf ? [] : (armor ?? []).filter((p) => p && p.kind !== 'clothing');
  const worn = pieces.length
    ? composeWornArmor({ pieces, armors: cat.armors, clothes: [], bodyPool: cat.parts, female, helmStyle: getPref('mwSteelHelm'), beast, beastWear: beastWearPref() })
    : { adds: [], shadows: [], notes: [] };
  const heads = worn.adds.filter((a) => capsHead(a) || (a.bones ?? []).some((b) => /^head$/i.test(b)));
  let skinRows = shadowSkinRows(rows.filter((r) => r.record).map((r) => ({ slot: r.slot, bones: PART_BONES[r.slot] ?? [], model: r.record.model })), worn.shadows);
  if (werewolf && worn.shadows.includes('head')) skinRows = skinRows.filter((r) => r.slot !== 'hair');
  const skeletonPath = correctActorModelPath(tpSkeletonPath({ female, beast, werewolf }), exists);
  const key = [cat.gen, skeletonPath, ...skinRows.map((r) => r.model), ...heads.map((a) => `${a.slot}=${a.model}`), werewolf ? 'wolf' : '', skin ?? '', `${px | 0}x${ph | 0}`].join(':');
  const hit = HEAD_PORTRAIT_CACHE.get(key);
  if (hit) return hit;
  const picture = renderHeadAssembly(renderer, cat, { skeletonPath, skinRows, heads, rows, worn, werewolf, skin }, px, ph).catch(() => null);
  HEAD_PORTRAIT_CACHE.set(key, picture);
  picture.then((img) => { if (!img && HEAD_PORTRAIT_CACHE.get(key) === picture) HEAD_PORTRAIT_CACHE.delete(key); });
  return picture;
}

export async function buildFpArm({
  race, female = false, beast = null, faceIndex = 0, weapon = null, hasAmmo = false, armor = null, deps = null,
  torch = false,
  sheathing = true, ammoCount = null,
  hipLight = false,
  werewolf = false,
  skin = null,
  reachSweep = true,
  creature = null,
  vampire = false,
  flies = false,
  npcFace = null,
  ownHeads = false,
  offWeapon = null,
} = {}) {
  faceIndex = classicFaceRecord(faceIndex);
  if (creature) return buildCreatureBody({ creature, flies, deps });
  const d = deps || await import('../scenes/dataSource.js');
  if (werewolf) { weapon = null; hasAmmo = false; ammoCount = null; torch = false; hipLight = false; sheathing = false; }
  if (werewolf) offWeapon = null;
  let settingsSkeleton = null;
  let skeletonPath = null;
  const t0 = mwNow();
  const spans = { archives: 0, esm: 0, meshes: 0, textures: 0, sweep: 0 };
  let stageMark = t0;
  const stage = (name) => { const n = mwNow(); spans[name] += n - stageMark; stageMark = n; };
  try {
    const archives = await d.loadMorrowindArchives();
    stage('archives');
    if (!archives.length) return { ok: false, stage: 'data', error: 'no Morrowind .bsa attached' };

    const esmNames = esmLoadOrder((await d.storedMorrowindNames()).filter((n) => /\.esm$/i.test(n)));
    if (!esmNames.length) {
      return { ok: false, stage: 'data', error: 'no Morrowind .esm attached - the body records live there, not in the .bsa' };
    }
    const esmBytes = [];
    for (const n of esmNames) {
      const records = typeof d.loadMorrowindArmRecords === 'function' ? await d.loadMorrowindArmRecords(n) : null;
      esmBytes.push(records ? { name: n, records } : { name: n, bytes: await d.loadMorrowindFile(n) });
    }
    const gen = adoptMemoGeneration(d.morrowindDataGeneration);
    const walk = (e, kind, fn) => {
      if (e.records) return armRecordsOf(e.records, kind);
      // With no generation nothing is cached, since test fixtures can share a name and length but not bytes.
      if (gen === null) return fn(e.bytes);
      const key = `${gen}:${e.name}:${e.bytes.byteLength}:${kind}`;
      let hit = ESM_WALK_CACHE.get(key);
      if (hit === undefined) { hit = fn(e.bytes); ESM_WALK_CACHE.set(key, hit); }
      return hit;
    };
    const raceKey = String(race || '').toLowerCase();
    if (beast === null) {
      beast = false;
      for (const e of esmBytes) {
        const rrec = walk(e, 'races', raceRecords).get(raceKey);
        if (rrec && rrec.radt) beast = rrec.beast;
      }
    }
    // The drawn body scales x and y by race weight and z by height, as in the reference adjustScale.
    let raceScale = { weight: 1, height: 1 };
    for (const e of esmBytes) {
      const rrec = walk(e, 'races', raceRecords).get(raceKey);
      if (rrec && rrec.radt) {
        raceScale = { weight: rrec.weight[female ? 1 : 0], height: rrec.height[female ? 1 : 0] };
      }
    }
    settingsSkeleton = fpSkeletonPath({ female, beast, werewolf });
    skeletonPath = correctActorModelPath(settingsSkeleton, (p) => archives.some((a) => a.has(p)));
    const parts = esmBytes.flatMap((e) => walk(e, 'parts', bodyParts));
    const armors = esmBytes.flatMap((e) => walk(e, 'armors', armorRecords));
    const clothes = esmBytes.flatMap((e) => walk(e, 'clothes', clothingRecords));
    const allWeapons = esmBytes.flatMap((e) => walk(e, 'weapons', weaponRecords));
    const allLights = esmBytes.flatMap((e) => walk(e, 'lights', lightRecords));
    const magic = { effects: new Map(), statics: new Map() };
    for (const e of esmBytes) {
      for (const m of walk(e, 'magicEffects', magicEffectRecords)) magic.effects.set(m.index, m);
      for (const st of walk(e, 'statics', vfxStaticRecords)) magic.statics.set(st.id, st.model);
    }
    let sneakDelta = null;
    for (const e of esmBytes) {
      const g = walk(e, 'gmst-sneak', (b) => ({ v: gmstValue(b, GMST_SNEAK_DELTA) }));
      if (typeof g.v === 'number') sneakDelta = g.v;
    }

    stage('esm');
    const find = (p) => findLoaded(archives, p);
    await loadFromArchives(archives, [skeletonPath]);
    const skelArc = find(skeletonPath);
    if (!skelArc) return { ok: false, stage: 'skeleton', error: `${skeletonPath} is not in your archives` };
    const skeletonBytes = nifBytes(skelArc, skeletonPath);

    const colourOf = (c) => clothingColourOf(c, parts, archives, gen);
    const robe = werewolf ? werewolfRobeOf(clothes) : null;
    const helmStyle = getPref('mwSteelHelm');
    const beastWear = beastWearPref();
    if (!werewolf) {
      await prepareClothingColours(
        (probe) => composeWornArmor({ pieces: armor ?? [], armors: armors ?? [], clothes: clothes ?? [], bodyPool: parts, female, colourOf: probe, helmStyle, beast, beastWear }),
        parts, archives, gen);
    }
    const worn = werewolf
      ? composeWornArmor({ pieces: robe ? [{ kind: 'record', record: robe, reserve: 'robe' }] : [], armors: [], clothes: [], bodyPool: parts, female })
      : composeWornModest({ pieces: armor ?? [], armors: armors ?? [], clothes: clothes ?? [], bodyPool: parts, female, colourOf, helmStyle, beast, beastWear }, showNudity());
    if (werewolf && !robe) {
      worn.notes.push(esmNames.some((n) => /^bloodmoon\.esm$/i.test(n))
        ? 'werewolfrobe: Bloodmoon.esm is attached and no CLOT record here names it'
        : 'werewolfrobe: no CLOT record carries it - Bloodmoon.esm does, and it is not attached');
    }
    const pools = werewolf || npcFace ? null : facePools(parts, race, female, { has: archiveHas(archives), own: ownHeads });
    const faceMatch = await faceMatchOf({ race, female, faceIndex, werewolf, npcFace, pools, archives, gen, d });

    const rows = werewolf ? [] : armReport(parts, race, female);
    const wanted = armMeshPaths(rows);
    // Non-arm slots take only .1st records, which retail lacks; a missing one is not noted, as in the reference.
    const fpAll = werewolf ? new Map() : resolveBodyParts(parts, race, female, { firstPerson: true });
    for (const [slot, rec] of fpAll) {
      if (ARM_PARTS.includes(slot)) continue;
      if (rec && rec.model) wanted.push({ slot, record: rec.id, firstPerson: true, path: `meshes/${rec.model}` });
    }
    const partBytes = [];
    const missing = [];
    const fpRows = shadowSkinRows(
      wanted.filter((w) => w.path).map((w) => ({ slot: w.slot, bones: PART_BONES[w.slot] ?? [], path: w.path })),
      worn.fpShadows ?? worn.shadows);
    for (const w of wanted) {
      if (!w.path) { missing.push(`${w.slot}: no record for this actor`); continue; }
    }
    const sourcePaths = fpAnimSources(skeletonPath, (p) => archives.some((a) => a.has(p)), { werewolf });
    const fpAdds = werewolf ? firstPersonPartGroup(robe, parts, female).adds : fpWornAdds(worn.adds);
    await loadFromArchives(archives, [
      ...fpRows.map((w) => w.path),
      ...fpAdds.map((add) => `meshes/${add.model}`),
      ...weaponPartPaths({ weapon, hasAmmo, allWeapons, has: archiveHas(archives) }),
      ...(offWeapon ? weaponPartPaths({ weapon: offWeapon, allWeapons, has: archiveHas(archives) }) : []),
      ...torchPartPaths({ torch, allLights, has: archiveHas(archives) }),
      ...sourcePaths,
    ]);
    for (const w of fpRows) {
      const arc = find(w.path);
      if (!arc) { missing.push(`${w.slot}: ${w.path} is not in your archives`); continue; }
      partBytes.push({ slot: w.slot, bones: w.bones, bytes: nifBytes(arc, w.path) });
    }
    missing.push(...worn.notes);
    for (const add of fpAdds) {
      const path = `meshes/${add.model}`;
      const arc = find(path);
      if (!arc) { missing.push(`${add.slot}: ${path} is not in your archives`); continue; }
      partBytes.push({ slot: add.slot, partName: add.partName, bones: add.bones, bytes: nifBytes(arc, path) });
    }
    const resolvedWeapon = resolveWeaponParts({ weapon, hasAmmo, allWeapons, find, skeletonBytes, has: archiveHas(archives) });
    partBytes.push(...resolvedWeapon.parts);
    const resolvedTorch = resolveTorchPart({ torch, allLights, find, skeletonBytes, has: archiveHas(archives) });
    partBytes.push(...resolvedTorch.parts);
    const weaponNotes = [...resolvedWeapon.notes, ...resolvedTorch.notes];
    const weaponInfo = resolvedWeapon.weaponInfo;
    const arrowInfo = resolvedWeapon.arrowInfo;
    const mwType = resolvedWeapon.mwType;

    const sourceBytes = sourcePaths.map((p) => ({ name: p, bytes: find(p).get(p).slice() }));

    if (!partBytes.length) {
      return {
        ok: false,
        stage: 'parts',
        error: werewolf ? 'no werewolf arm mesh resolved - its robe is Bloodmoon\'s' : `no arm mesh resolved for race "${race}"`,
        notes: missing,
        rows: wanted,
        esm: esmDiagnosis(esmNames, parts, race),
      };
    }
    const arm = await assembleFirstPersonArm({ skeletonBytes, parts: partBytes, parseNif: parseNifOnce, offWeaponBone: true });
    stage('meshes');
    if (arm.ok) await preloadArmTextures([...arm.pieces, ...(arm.effects ?? [])], archives, gen);
    const textures = arm.ok ? collectArmTextures([...arm.pieces, ...(arm.effects ?? [])], archives, gen) : new Map();
    if (arm.ok && werewolf) await preskinTextures(arm.pieces, textures, skin);
    stage('textures');
    const catalog = { archives, parts, armors, clothes, weapons: allWeapons, gen };
    catalog.magic = magic;
    const tpBody = (wornNow) => buildTpBody({ race, female, beast, faceIndex, faceMatch, weapon, hasAmmo, worn: wornNow, archives, parts, allWeapons, find, gen, torch, allLights, sheathing, ammoCount, hipLight, werewolf, skin: werewolf ? skin : null, vampire: !!vampire, walk: npcFace, ownHeads: !!ownHeads });
    let third = arm.ok ? await tpBody(worn) : null;
    let wornBuilt = worn;
    const lost = third?.ok ? worn.adds.filter((a) => isOutfitSlot(a.slot) && !third.arm.pieces.some((p) => p.slot === a.slot)) : [];
    if (lost.length) {
      const without = composeWornModest({ pieces: (armor ?? []).filter((p) => !lost.some((a) => a.piece === p)), armors: armors ?? [], clothes: clothes ?? [], bodyPool: parts, female, colourOf, helmStyle, beast, beastWear }, showNudity());
      without.notes.push(...lost.map((a) => `outfit ${a.recordId}: ${t('body.outfit.unbound', 'none of it bound - drawn without it')}`));
      const again = await tpBody(without);
      if (again.ok) { third = again; wornBuilt = without; }
    }
    const offBound = { first: null, third: null };
    if (offWeapon && arm.ok) {
      for (const [key, r] of /** @type {const} */ ([['first', { arm, textures, skeletonBytes }], ['third', third?.ok ? third : null]])) {
        if (!r) continue;
        const res = resolveOffWeaponParts({ weapon: offWeapon, allWeapons, find, skeletonBytes: r.skeletonBytes, has: archiveHas(archives), hasBone: (n) => r.arm.skeleton.byName.has(String(n).toLowerCase()) });
        bindPartsInto(r.arm, res.parts);
        const fresh = r.arm.pieces.filter((p) => p.slot === 'offweapon');
        await preloadArmTextures(fresh, archives, gen);
        for (const [file, tex] of collectArmTextures(fresh, archives, gen)) if (!r.textures.has(file)) r.textures.set(file, tex);
        offBound[key] = res;
      }
      if (third?.ok && offBound.third) {
        third.offWeapon = offBound.third.info;
        third.notes = [...(third.notes || []), ...offBound.third.notes];
        third.pieces = armPieceRows(third.arm.pieces).length;
      }
    }
    stage('meshes');
    // The archive array is the data source's shared cache, so it is not emptied here.
    if (!arm.ok) {
      return { ok: false, stage: arm.stage || 'assembly', error: arm.error, notes: [...missing, ...(arm.notes || [])], rows: wanted };
    }
    if (!sourceBytes.length) {
      return {
        ok: false, stage: 'clip',
        error: werewolf ? `no werewolf animation file - ${animSourceName(skeletonPath)} is not in your archives`
          : `no first-person animation file - neither ${animSourceName(FP_BASE_MODEL)} `
          + `nor ${animSourceName(skeletonPath)} is in your archives`,
        notes: [...missing, ...(arm.notes || [])], rows: wanted,
      };
    }
    const sources = [];
    for (const sb of sourceBytes) {
      const one = await cachedClipReport(gen, skeletonPath, sb.name, () => sb.bytes, arm.skeleton);
      if (!one.ok) {
        return {
          ok: false, stage: 'clip', error: `${sb.name}: ${one.error}`,
          notes: [...missing, ...(arm.notes || [])], rows: wanted,
        };
      }
      sources.push({
        name: sb.name, keys: one.keys, groups: one.groups, groupSet: new Set(one.groups),
        trackMap: one.trackMap, binding: one.binding,
        wouldAccumRoot: accumRootRef(arm.skeleton, one.trackMap),
      });
    }
    const groupSet = new Set(sources.flatMap((so) => so.groups));
    const idleProbe = composeStanceGroup(FP_IDLE_BASE, animWeaponType(mwType, true), (n) => groupSet.has(n));
    if (!idleProbe.group) {
      return {
        ok: false, stage: 'clip',
        error: `this .kf names no "${FP_IDLE_BASE}" group and no weapon-suffixed variant of one`,
        notes: [...missing, ...(arm.notes || [])], rows: wanted,
      };
    }
    const idlePick = pickAnimSource(sources, idleProbe.group, resetClip, { loopFallback: true });
    if (!idlePick) {
      return {
        ok: false, stage: 'clip',
        error: `no source gives group "${idleProbe.group}" a start and a stop key`,
        notes: [...missing, ...(arm.notes || [])], rows: wanted,
      };
    }
    const idleCheck = idlePick.state;
    const tracks = idlePick.source.trackMap;
    // The first source that resolves an accum root picks it, in push order, and it is one value for the whole rig.
    const accumRoot = sources.reduce((acc, so) => (acc ?? so.wouldAccumRoot), null) ?? null;
    for (const so of sources) so.accumRoot = accumRoot;
    const poseAt = (t) => poseAssembly(arm, { tracks, sampleTrack, time: t, accumRoot });
    stage('meshes');
    const sweep = reachSweep ? clipSweepTimes(sources, idleCheck) : null;
    const union = sweep ? clipUnionBounds(arm, poseAt, sweep) : null;
    const c = idleCheck;
    const idleTimes = Array.from({ length: 25 }, (_, i) => c.startTime + ((c.stopTime - c.startTime) * i) / 24);
    poseAt(c.startTime);

    const cameraRef = firstPersonCameraRef(arm.skeleton);
    if (cameraRef < 0) {
      return {
        ok: false,
        stage: 'camera',
        error: 'this skeleton has no "Camera" bone and no "Head" bone '
          + 'for the view to follow',
        notes: [...missing, ...(arm.notes || [])],
        rows: wanted,
      };
    }
    // The far plane takes the swept reach and the near plane the idle reach, so a wide swing cannot push near out.
    const eye = firstPersonEye(arm.mats, cameraRef);
    const idleReach = armReach(eye, clipUnionBounds(arm, poseAt, idleTimes));
    const reach = union ? armReach(eye, union) : idleReach;
    poseAt(c.startTime);
    if (weaponInfo) weaponInfo.side = weaponRestSide(arm, weaponInfo.bone);
    if (arrowInfo) arrowInfo.side = weaponRestSide(arm, arrowInfo.bone);

    stage('sweep');
    const timings = {
      archives: Math.round(spans.archives),
      esm: Math.round(spans.esm),
      meshes: Math.round(spans.meshes),
      textures: Math.round(spans.textures),
      sweep: Math.round(spans.sweep),
      total: Math.round(mwNow() - t0),
    };
    console.log(`[mw] arm built in ${timings.total} ms - archives ${timings.archives}, `
      + `esm ${timings.esm}, meshes ${timings.meshes}, textures ${timings.textures}, sweep ${timings.sweep}`);

    return {
      ok: true,
      arm,
      tracks,
      accumRoot,
      keys: idlePick.source.keys,
      worn: wornVerdicts(armor ?? [], wornBuilt),
      face: faceMatch,
      catalog,
      sources,
      sourcePaths,
      clip: c,
      groups: [...groupSet].sort(),
      groupSet,
      mwType,
      textures,
      cameraRef,
      reach,
      idleReach,
      skeletonPath,
      settingsSkeleton,
      sneakDelta,
      cameraBone: arm.skeleton.byName.has('camera') ? 'Camera'
        : arm.skeleton.byName.has('head') ? 'Head (rule 54 fallback)' : null,
      rows: wanted,
      weapon: weaponInfo,
      arrow: arrowInfo,
      allWeapons,
      torch: resolvedTorch.torchInfo,
      allLights,
      leftArm: blendMaskBones(arm.skeleton),
      skeletonBytes,
      esm: esmDiagnosis(esmNames, parts, race),
      notes: [...missing, ...weaponNotes, ...(offBound.first?.notes ?? []), ...(arm.notes || [])],
      offWeapon: offBound.first?.info ?? null,
      binding: idlePick.source.binding,
      pieces: armPieceRows(arm.pieces).length,
      raceScale,
      restMats: arm.mats,
      third,
      werewolf: !!werewolf,
      timings,
    };
  } catch (err) {
    return { ok: false, stage: 'build', error: err && err.message ? err.message : String(err) };
  }
}

export function collectArmTextures(pieces, archives, gen = null) {
  const out = new Map();
  const exists = (p) => archives.some((a) => a.has(p));
  for (const piece of pieces ?? []) {
    const file = piece.material && piece.material.textureFile;
    if (!file || out.has(file)) continue;
    // Entries are read-only downstream, so the memo is shared across rebuilds.
    if (gen !== null) {
      const memo = TEXTURE_CACHE.get(`${gen}:${file}`);
      if (memo) { out.set(file, memo); continue; }
    }
    const path = correctTexturePath(file, exists);
    const arc = archives.find((a) => a.has(path));
    if (!arc) {
      const entry = { ok: false, path, error: 'not in your archives', image: warningImage() };
      out.set(file, entry);
      if (gen !== null) TEXTURE_CACHE.set(`${gen}:${file}`, entry);
      continue;
    }
    try {
      // Decoding goes by extension, because the path ladder can return an authored .tga or .bmp.
      const entry = { ok: true, path, image: decodeTextureImage(path, arc.get(path).slice()) };
      out.set(file, entry);
      if (gen !== null) TEXTURE_CACHE.set(`${gen}:${file}`, entry);
    } catch (err) {
      const entry = { ok: false, path, error: err.message, image: warningImage() };
      out.set(file, entry);
      // A texture whose load failed is not cached, so a fetch failure does not leave the warning image all session.
      if (gen !== null && !(typeof arc.loaded === 'function' && !arc.loaded(path))) TEXTURE_CACHE.set(`${gen}:${file}`, entry);
    }
  }
  return out;
}

function texturesUnread(pieces, archives, gen = null) {
  const exists = (p) => archives.some((a) => a.has(p));
  for (const piece of pieces ?? []) {
    const file = piece.material && piece.material.textureFile;
    if (!file || (gen !== null && TEXTURE_CACHE.has(`${gen}:${file}`))) continue;
    const path = correctTexturePath(file, exists);
    const arc = archives.find((a) => a.has(path));
    if (arc && typeof arc.loaded === 'function' && !arc.loaded(path)) return true;
  }
  return false;
}

export function esmDiagnosis(names, parts, race) {
  const races = [...new Set((parts ?? []).filter((p) => p.skin && p.playable).map((p) => p.race))].sort();
  return {
    files: names,
    bodyRecords: (parts ?? []).length,
    firstPerson: (parts ?? []).filter((p) => p.firstPerson).length,
    raceWanted: race,
    racesFound: races,
    raceIsThere: races.includes(String(race || '').toLowerCase()),
  };
}

// The arms follow the screen like the classic sprite, not the reference's trailing look; setFollowCamera switches.
// The version suffix abandons older stored values, so do not reuse an earlier key.
const FOLLOW_CAMERA_KEY = 'dagger.mwArmsFollowCamera3';
let screenTransform = null;
function readFollowCamera() {
  try { return (appStorage()?.getItem(FOLLOW_CAMERA_KEY) ?? 'true') !== 'false'; }
  catch { return true; }
}

export function effectPlacement(effect, mats, attachmentTransform) {
  const bone = attachmentTransform(mats, effect.attachRef);
  const at = effect.hang ? hangAffine(bone, effect.hang) : bone;
  const mirror = {
    a: Float32Array.from([effect.mirrored ? -1 : 1, 0, 0, 0, 1, 0, 0, 0, 1]),
    t: effect.boneOffset ? [effect.boneOffset[0], effect.boneOffset[1], effect.boneOffset[2]] : [0, 0, 0],
  };
  let m = affineMul(at, mirror);
  if (effect.pre) m = affineMul(m, effect.pre);
  return affineMul(m, affineOfTransform(effect.desc.world));
}

// Under LocalSpace particles stay in node space and move with the hand; otherwise they stay in rig space and trail.
export function stepRigEffects(assembly, { dt, clock = null, hidden = () => false, renderer = null, mesh = null, textures = null } = {}) {
  const list = assembly && assembly.effects ? assembly.effects : [];
  if (!list.length || !assembly.mats || !assembly.fns) return 0;
  let live = 0;
  for (let i = 0; i < list.length; i++) {
    const eff = list[i];
    const m = effectPlacement(eff, assembly.mats, assembly.fns.attachmentTransform);
    if (!eff.sim) eff.sim = createParticleSystem(eff.desc);
    const local = eff.desc.localSpace;
    eff.sim.update(dt, clock, local ? null : m);
    const quads = eff.sim.quads();
    const packed = packParticleQuads(quads, eff.packed || null, {
      place: local ? (x, y, z) => affineApply(m, x, y, z) : null,
      sizeScale: affineScale(m),
    });
    eff.packed = packed.packed; eff.count = packed.count;
    live += quads.length;
    if (renderer && mesh) {
      if (!mesh.effects) mesh.effects = [];
      let gpu = mesh.effects[i];
      if (!gpu) {
        gpu = renderer.createParticleEffect(eff.sim.quota, particleDrawState(eff.material));
        const file = eff.material && eff.material.textureFile;
        const entry = file && textures ? textures.get(file) : null;
        if (entry && entry.image) gpu.tex = renderer.createCharacterTexture(entry.image.mips, wrapModes(eff.material.clampMode ?? 3));
        mesh.effects[i] = gpu;
      }
      gpu.hidden = !!hidden(eff);
      renderer.updateParticleEffect(gpu, packed.packed, packed.count);
    }
  }
  return live;
}

const CATALOG_WEAPONS = new WeakMap();
export function mwVisualModel(cat, id) {
  const key = String(id || '').toLowerCase();
  if (!cat || !key) return null;
  const st = cat.magic?.statics?.get(key);
  if (st) return `meshes/${st}`;
  let w = CATALOG_WEAPONS.get(cat);
  if (!w) { w = new Map((cat.weapons ?? []).map((r) => [r.id, r.model])); CATALOG_WEAPONS.set(cat, w); }
  return w.has(key) ? `meshes/${w.get(key)}` : null;
}

export function mwSpellPlan(cat, spell) {
  if (!cat?.magic?.effects?.size) return null;
  return spellFxPlan(spell, cat.magic.effects, (id) => mwVisualModel(cat, id), { schoolOf: effectSchool });
}

const EFFECT_MESH_CACHE = new Map();
export function loadMwEffectMesh(cat, path) {
  if (!cat || !path) return Promise.resolve(null);
  const key = `${cat.gen}:${path}`;
  const hit = EFFECT_MESH_CACHE.get(key);
  if (hit) return hit;
  const job = (async () => {
    await loadFromArchives(cat.archives, [path]);
    const arc = (cat.archives ?? []).find((a) => a.has(path));
    if (!arc || (typeof arc.loaded === 'function' && !arc.loaded(path))) return null;
    try { return vfxOf(parseNif(arc.get(path).slice())); } catch { return null; }
  })();
  if (cat.gen !== null && cat.gen !== undefined) {
    EFFECT_MESH_CACHE.set(key, job);
    job.then((d) => { if (!d) EFFECT_MESH_CACHE.delete(key); });
  }
  return job;
}

export async function loadMwEffectTextures(cat, files) {
  const pieces = [...new Set((files ?? []).filter(Boolean))].map((f) => ({ material: { textureFile: f } }));
  if (!cat || !pieces.length) return new Map();
  await preloadArmTextures(pieces, cat.archives, cat.gen);
  return collectArmTextures(pieces, cat.archives, cat.gen);
}

export const VFX_HAND_BONES = Object.freeze(['bip01 l hand', 'bip01 r hand']);

export function gpuSkinOn(renderer, search) {
  return !!(renderer && typeof renderer.createSkinnedCharacterMesh === 'function') && pageParam('gpuskin', search) !== 'off';
}

export function createFpArm() {
  let renderer = null;
  let camera = null;
  let built = null;
  const listeners = new Set();
  const castFx = [];
  // A teardown bumps this, so a glow still loading is discarded.
  let castFxGen = 0;
  let pendingWorn = null;
  let pendingWerewolf = null;
  let pendingVampire = null;
  let pendingWeapon = null;
  let pendingTorch = null;
  let pendingBuild = null;
  let buildingOpts = null;
  // Each unload() bumps this, so a build that lands after it is discarded.
  let buildGen = 0;
  let mesh = null;
  let packed = null;
  let reason = 'not built';
  let frames = 0;
  let busy = false;
  let wornKey = null;
  let buildDeps = null;
  let wornEquipKey = null;
  let lastBuildOpts = null;

  // While a weapon animation plays it wins every bone, so these slots form a winner ladder, not a per-bone blend.
  let idleState = null;
  let actionState = null;
  let idleGroup = null;
  let weaponGroup = null;
  let movementState = null;
  let movementGroup = null;
  let movementSource = null;
  let movementBase = null;
  let movementStance = null;
  let movementRate = 1;
  // The ladder is action, movement, jump, idle; in the air the movement slot empties, so the jump shows.
  let jumpState = null;
  let jumpGroup = null;
  let jumpSource = null;
  let jumpStance = null;
  let jumpKind = null;
  // The turn animation holds 0.05 s past the last rotation, as in the reference, so jitter does not flicker it.
  let lastYaw = null;
  let turnHold = 0;
  let turnDir = 0;
  let upper = UPPER_BODY.None;
  let spellReady = false;
  let spellHand = false, spellInHand = false;
  let unreadyAfterCast = false;
  let castReleased = false;
  let castRate = 1;
  let castPaced = false;
  // The torch plays on the left-arm mask, so the right arm keeps swinging; hit and death play on every bone.
  let hitState = null;
  let hitSource = null;
  let deathState = null;
  let deathSource = null;
  let posedGroup = null;
  let dead = false;
  let torchLit = false;
  // The glow is laid only while the mesh holds the weapon it was asked for, since a swap waits on its archives.
  let weaponGlowSpec = null, glowItem = null, glowKey = null, wornWeaponKey = null;
  const glowShown = () => (climbHands ? null : weaponGlowSpec && glowKey === wornWeaponKey && weaponInHand() ? weaponGlowSpec : null);
  let offGlowSpec = null, offGlowItem = null, offGlowKey = null;
  const offGlowShown = () => (offGlowSpec && offGlowKey != null && offGlowKey === offKey && !climbHands && handsMode === 'dual' && weaponInHand() ? offGlowSpec : null);
  let torchState = null;
  let torchSource = null;
  let torchGroup = null;
  let torchMissRig = null;
  let hipLit = false;
  let pendingHipLight = null;
  const hipLantern = createHipLantern();
  const motion = createBodyMotion();
  // The frame path allocates nothing after the first pack, so the merged track map is rebuilt only on change.
  let overlayMemo = null;
  let overlayClock = 0;
  const overlaySample = overlaySampler(sampleTrack, () => overlayClock);
  let held = null;
  const climbLaw = new ClimbPose();
  let climbLast = null;
  let climbHands = false;
  let handsMode = 'single', leadHand = 'R', attackHand = null;
  let offKey = null, pendingOff;
  const mirrorCarry = { first: {}, third: {} };
  const strikeSides = new Map();
  const runPump = { wanted: false, speed: 0, w: 0, phase: 0, given: null, targets: null };
  const pairGuard = { L: 0, R: 0 };
  let guardDipMemo = null;
  let pairSpread = 0, spreadMemo = null;
  let heldMemo = null;
  let lastFrame = null;
  let drawnArm = null, drawnMats = null;
  let drewLast = false;
  const placeSheet = (node) => {
    const eye = node.t;
    if (!held.piece || !built.arm.pieces.includes(held.piece)) {
      held.piece = paperPiece(eye, held.spec.paper, held.aspect);
      built.arm.pieces = built.arm.pieces.filter((p) => p.slot !== 'paper');
      built.arm.pieces.push(held.piece);
      releaseMesh(); packed = null;
    }
    const far = refreshPaperSource(held.piece, eye, held.spec.paper, held.aspect);
    held.eye = [eye[0], eye[1], eye[2]];
    if (held.built !== built) { held.built = built; held.reach0 = built.reach; }
    built.reach = Math.max(held.reach0, far * 1.25 / 4);
  };
  const heldTracksFor = (base, inner) => {
    if (!heldMemo || heldMemo.base !== base || heldMemo.spec !== held.spec || heldMemo.inner !== inner) {
      heldMemo = { base, spec: held.spec, inner, tracks: deltaTracks(base, held.spec, built.arm.skeleton), sampler: heldSampler(inner) };
    }
    return heldMemo;
  };
  const overlayFor = (base, mask) => {
    const overlay = torchSource.trackMap;
    if (!overlayMemo || overlayMemo.base !== base || overlayMemo.overlay !== overlay || overlayMemo.mask !== mask) {
      overlayMemo = { base, overlay, mask, tracks: overlayTracks(base, overlay, mask) };
    }
    return overlayMemo.tracks;
  };
  let attackType = null;
  let attackReversed = false;
  const ATTACK_PHASES = new Set([UPPER_BODY.AttackWindUp, UPPER_BODY.AttackRelease, UPPER_BODY.AttackEnd]);
  const reversedNow = () => attackReversed && ATTACK_PHASES.has(upper);
  const poseTime = (state) => (state && state.reversed ? state.startTime + state.stopTime - state.time : state.time);
  let attackStrength = 1;
  let sheathed = true;
  let weaponShown = false;
  // The reference attaches no round until a shoot attach key fires, so a freshly drawn bow is empty.
  let arrowShown = false;
  let shootReleased = false;
  let holdWindUp = false;
  let resetIdleOnAttackEnd = false;
  let blowPlan = null;
  // As in the reference, a ranged weapon clock starts at the first group key and holds where a section ended.
  let weaponClock = { group: null, value: 0 };
  let partClock = 0;
  const WEAPON_SECTIONS = new Set([UPPER_BODY.Equipping, UPPER_BODY.Unequipping, UPPER_BODY.AttackWindUp, UPPER_BODY.AttackRelease, UPPER_BODY.AttackEnd]);
  function noteWeaponClock() {
    if (!actionState || !weaponGroup || !built || !built.ok || !WEAPON_SECTIONS.has(upper)) return;
    const ranged = WEAPON_CLASS[built.mwType] === MW_WEAPON_CLASS.Ranged;
    const start = ranged ? getStartTime((actionSource || rig()).keys, weaponGroup) : 0;
    weaponClock = { group: weaponGroup, value: poseTime(actionState) - start };
  }
  const weaponClockValue = () => (weaponClock.group && weaponClock.group === weaponGroup ? weaponClock.value : 0);
  // The aiming factor is state that eases between frames, as the reference's mAimingFactor does.
  let aimFactor = 0;
  let followCam = readFollowCamera();
  // The neck takes this offset once and the lens adds it again, as in the reference, so the arms sink and bob.
  let fpOffset = [0, 0, 0];
  let sneaking = false;
  let idleSource = null;
  let actionSource = null;
  const notes = [];

  // One state machine drives both rigs; groups, sources, and keys come from rig(), the active one.
  let viewMode = 'first';
  let standIn = false;
  let thirdBuilt = null;
  let thirdMesh = null;
  let thirdPacked = null;
  let thirdSkin = null;
  let thirdSkinRefused = null;
  const thirdDrawBox = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
  const thirdBodyBox = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
  const figureBodyBox = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0 };
  const rig = () => (viewMode === 'third' && thirdBuilt && thirdBuilt.ok ? thirdBuilt : built);
  const nonBiped = () => !!(built && built.ok && built.creature && !built.creature.bipedal);
  const stanceOf = () => {
    const t = animWeaponType(built.mwType, sheathed, spellReady);
    return nonBiped() && !isRealWeapon(t) ? MW_WEAPON_TYPE.None : t;
  };

  const active = () => !standIn && !!(built && built.ok && mesh && renderer && camera && (actionState || movementState || jumpState || idleState)
    && viewMode === 'first');
  const thirdActive = () => !standIn && !!(built && built.ok && thirdBuilt && thirdBuilt.ok && thirdMesh
    && renderer && (actionState || movementState || jumpState || idleState || hitState || deathState) && viewMode === 'third');

  // Gating update() on active() would deadlock: update() creates the mesh, and active() requires it.
  const ready = () => !!(built && built.ok && (actionState || movementState || jumpState || idleState || hitState || deathState) && renderer);

  function releaseGpu(m) {
    releaseCastFx((c) => c.mesh === m);
    if (m && renderer && renderer.gl) {
      const gl = renderer.gl;
      gl.deleteVertexArray(m.vao);
      for (const b of m.buffers || []) gl.deleteBuffer(b);
      // Ranges survive a repack, so each range drops its texture handle when the texture is released.
      for (const r of m.ranges || []) if (r.tex) { releaseCharacterTexture(renderer, r.tex); r.tex = null; }
      for (const e of m.effects || []) renderer.releaseParticleEffect(e);
      m.effects = null;
      if (m.skin) renderer.releaseCharacterSkin(m);
      // A shadow record made before the release is replayed next frame, so this flag makes it cast nothing.
      m._dead = true;
    }
  }
  function releaseMesh() { releaseGpu(mesh); mesh = null; }

  function releaseCastFx(which = () => true) {
    for (let i = castFx.length - 1; i >= 0; i--) {
      const c = castFx[i];
      if (!which(c)) continue;
      c.gpu?.release();
      castFx.splice(i, 1);
    }
  }

  function spawnCastHands(spell) {
    if (!spell || getPref('mwSpellEffects') === false) return;
    const cat = built && built.ok ? built.catalog : null;
    const plan = mwSpellPlan(cat, spell);
    if (!plan?.hands) return;
    const gen = castFxGen;
    const view = viewMode === 'third' && thirdBuilt && thirdBuilt.ok ? 'third' : 'first';
    (async () => {
      const desc = await loadMwEffectMesh(cat, plan.hands.model);
      if (!desc) return;
      const textures = await loadMwEffectTextures(cat, [...vfxTextures(desc), plan.hands.texture]);
      if (gen !== castFxGen || !built || built.catalog !== cat) return;
      for (const bone of VFX_HAND_BONES) {
        castFx.push({ view, bone, fx: createVfx(desc, { textureOverride: plan.hands.texture }), textures, capacity: vfxCapacity(desc), gpu: null, mesh: null });
      }
    })().catch(() => { });
  }

  function stepCastFx(view, assembly, target, dt) {
    if (!castFx.length || !target) return;
    const intensity = spellVisualIntensity(view === 'third');
    let changed = false;
    for (let i = castFx.length - 1; i >= 0; i--) {
      const c = castFx[i];
      if (c.view !== view) continue;
      const ref = assembly?.skeleton?.byName.get(c.bone);
      const bone = ref !== undefined ? assembly.mats?.get(ref) : null;
      if ((c.mesh && c.mesh !== target) || !bone) { c.gpu?.release(); castFx.splice(i, 1); changed = true; continue; }
      const r = c.fx.update(dt, { place: bone });
      if (r.done) { c.gpu?.release(); castFx.splice(i, 1); changed = true; continue; }
      if (!renderer || !intensity) continue;
      if (!c.gpu) { c.gpu = createVfxGpu(renderer, c.textures, c.capacity); c.mesh = target; changed = true; }
      c.gpu.sync(r.streams, intensity, intensity < 1);
    }
    const own = (assembly?.effects ?? []).length;
    const mine = intensity ? castFx.filter((c) => c.view === view && c.mesh === target && c.gpu).flatMap((c) => c.gpu.effects()) : [];
    if (!changed && (target.effects?.length ?? 0) === own + mine.length) return;
    const head = Array.from({ length: own }, (_, i) => target.effects?.[i] ?? null);
    target.effects = [...head, ...mine];
  }

  const bodySkin = () => (built && built.werewolf && lastBuildOpts && lastBuildOpts.skin) || null;

  function hangRangeTextures(ranges, textures, { skin = null } = {}) {
    for (const r of ranges) {
      if (!r.textureFile) continue;
      const entry = textures.get(r.textureFile);
      if (!entry) continue;
      const m = r.piece.material;
      r.tex = acquireCharacterTexture(renderer, skin ? skinnedMipsOf(entry.image, skin, skinUseOf(r.piece, r.textureFile)) : entry.image.mips, wrapModes(m ? m.clampMode : 3));
      r.alphaCut = m && m.alphaTest ? (m.alphaThreshold || 0) / 255 : 0;
    }
  }

  function renderGroundMesh(nifBytes, archives, gen, size, { face = false } = {}) {
    let batches;
    try { batches = Array.isArray(nifBytes) ? nifBytes : flattenNif(parseNif(nifBytes)); } catch { return null; }
    const pieces = batches.filter((b) => b.positions && b.indices).map((b) => ({ ...b, slot: 'item', mirrored: false }));
    if (!pieces.length) return null;
    const u = 1 / MW_UNITS_PER_METER;
    const model = multiply(trs(0, 0, 0, 0, 0, 0, u, u, u), NIF_TO_PASS);
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const p of pieces) {
      for (let i = 0; i < p.positions.length; i += 3) {
        const q = transformPoint(model, p.positions[i], p.positions[i + 1], p.positions[i + 2]);
        if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0];
        if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1];
        if (q[2] < minZ) minZ = q[2]; if (q[2] > maxZ) maxZ = q[2];
      }
    }
    if (!(maxX > minX)) return null;
    const packed = packFpArm(pieces);
    const mesh = renderer.createCharacterMesh(packed.packed, { uv: true });
    mesh.ranges = packed.ranges;
    hangRangeTextures(mesh.ranges, collectArmTextures(pieces, archives, gen));
    const bounds = { minX, minY, minZ, maxX, maxY, maxZ };
    const f = face ? mountFrame(bounds, size) : null;
    const { view, proj } = f ?? iconFrame(bounds);
    const px = Math.min(CHAR_SPRITE_RT_SIZE, Math.max(8, size | 0));
    let img = null;
    try { img = renderer.renderCharacterSpriteImage(mesh, model, proj, view, f ? f.pw : px, f ? f.ph : px); }
    finally { releaseGpu(mesh); }
    if (!face) return img;
    return img ? { image: img, w: f.w, h: f.h } : null;
  }
  function iconRecordOf(cat, item) {
    try {
      if (item.group === 'Weapons') {
        const mwType = dfWeaponToMw(item, WEAPONS);
        return mwType !== MW_WEAPON_TYPE.None ? pickWeaponRecord(cat.weapons, mwType, materialName(item), { shape: dfWeaponShape(item, WEAPONS) }) : null;
      }
      if (item.group === 'Armor') {
        return mwArmorRecords(cat.armors, item.templateIndex, item.material ?? 0).records[0] ?? null;
      }
      if (item.group === 'MensClothing' || item.group === 'WomensClothing') {
        const cloak = ownCloakFor({ kind: 'clothing', name: CLOTHING_NAME[item.templateIndex], dye: item.dye ?? 0 });
        if (cloak) return { id: `${cloak.id}_${cloak.painting}`, model: cloak.model };
        const colourOf = (c) => clothingColourOf(c, cat.parts, cat.archives, cat.gen);
        return mwClothingRecord(cat.clothes, CLOTHING_NAME[item.templateIndex], { dye: item.dye ?? 0, colourOf }).record;
      }
    } catch { return null; }
    return null;
  }

  // The icon getter must stay synchronous, so its first ask starts the loads and returns null; listeners repaint.
  const iconPending = new Set();
  const iconReady = new Set();
  const archivesAreLazy = (archives) => (archives ?? []).some((a) => a && a.lazy === true);
  function preloadIcon(cat, item, key) {
    if (iconPending.has(key) || iconReady.has(key)) return;
    iconPending.add(key);
    (async () => {
      try {
        if ((item.group === 'MensClothing' || item.group === 'WomensClothing') && !ownCloakFor({ kind: 'clothing', name: CLOTHING_NAME[item.templateIndex], dye: item.dye ?? 0 })) {
          await prepareClothingColours(
            (probe) => mwClothingRecord(cat.clothes, CLOTHING_NAME[item.templateIndex], { dye: item.dye ?? 0, colourOf: probe }),
            cat.parts, cat.archives, cat.gen);
        }
        const rec = iconRecordOf(cat, item);
        if (rec && rec.model) {
          const path = `meshes/${rec.model}`;
          await loadFromArchives(cat.archives, [path]);
          const arc = cat.archives.find((a) => a.has(path));
          if (arc) await preloadArmTextures(flattenNif(parseNif(arc.get(path).slice())), cat.archives, cat.gen);
        }
      } catch { }
      finally {
        iconPending.delete(key);
        iconReady.add(key);
        for (const fn of listeners) { try { fn(); } catch { } }
      }
    })();
  }

  function releaseThirdMesh() { releaseGpu(thirdMesh); thirdMesh = null; thirdSkin = null; }
  const thirdUnit = (grow) => (grow > 1 ? grow : 1) / MW_UNITS_PER_METER;
  // The yaw adds a half-turn because a Morrowind actor faces +Y, and x is negated because the world lens mirrors X.
  function thirdModel(feet, yaw, grow = 1) {
    const u = thirdUnit(grow);
    const yawDeg = (yaw * 180 / Math.PI) + 180;
    const rs = (built && built.raceScale) || { weight: 1, height: 1 };
    return multiply(trs(feet[0], feet[1], feet[2], 0, yawDeg, 0, -u * rs.weight, u * rs.height, u * rs.weight), NIF_TO_PASS);
  }
  function thirdBox() {
    let box = visibleRangeBounds(thirdMesh.ranges, thirdDrawBox);
    if (!(box && box.maxX > box.minX)) box = thirdBuilt.arm.bounds;
    if (!(box && box.maxX > box.minX)) box = meshBounds(thirdBuilt.arm.pieces);
    return box && box.maxX > box.minX ? box : null;
  }
  const castSphere = new Float32Array(4);
  function castBody(model, center, halfW, halfH, anchored = false) {
    castSphere[0] = center[0]; castSphere[1] = center[1]; castSphere[2] = center[2];
    castSphere[3] = Math.hypot(halfW, halfH);
    renderer.recordShadowBody(thirdMesh, model, castSphere, anchored);
  }
  // This is asked before the pose, since the answer decides whether poseAssembly skins the pieces on the CPU.
  function thirdSkinReady(t) {
    if (!gpuSkinOn(renderer)) { if (thirdMesh && thirdMesh.skin) releaseThirdMesh(); return false; }
    if (thirdSkin && skinSamePieces(thirdSkin, t.arm.pieces)) return true;
    if (thirdSkinRefused === t.arm.pieces) return false;
    const layout = skinLayout(t.arm.pieces);
    if (!layout.ok) {
      thirdSkinRefused = t.arm.pieces;
      const say = `third body: skinned on the CPU - ${layout.reason}`;
      if (!notes.includes(say)) notes.push(say);
      return false;
    }
    if (thirdMesh) releaseThirdMesh();
    thirdSkin = layout;
    return true;
  }

  function uploadThirdMesh(t) {
    if (thirdSkin && gpuSkinOn(renderer) && skinSamePieces(thirdSkin, t.arm.pieces)) {
      if (!thirdMesh) {
        const packed = packSkinStream(thirdSkin, pieceLanes);
        thirdMesh = renderer.createSkinnedCharacterMesh(packed.stream, { floats: packed.floats, pairs: thirdSkin.pairs, width: thirdSkin.width, height: thirdSkin.height });
        thirdMesh.ranges = packed.ranges;
        hangRangeTextures(thirdMesh.ranges, t.textures, { skin: bodySkin() });
      } else {
        for (const m of restreamMovedRows(thirdSkin, pieceLanes)) renderer.updateSkinStream(thirdMesh, m.offset, m.data);
      }
      writeSkinPalette(thirdSkin, t.arm);
      renderer.updateSkinPalette(thirdMesh, thirdSkin.palette);
      foldRangeBoxes(thirdMesh.ranges);
      return thirdMesh;
    }
    if (thirdMesh && thirdMesh.skin) releaseThirdMesh();
    thirdPacked = packFpArm(t.arm.pieces, thirdPacked);
    if (!thirdMesh) {
      thirdMesh = renderer.createCharacterMesh(thirdPacked.packed, { uv: true, bounds: false });
      thirdMesh.ranges = thirdPacked.ranges;
      hangRangeTextures(thirdMesh.ranges, t.textures, { skin: bodySkin() });
    } else {
      renderer.updateCharacterMesh(thirdMesh, thirdPacked.packed);
    }
    foldRangeBoxes(thirdMesh.ranges);
    return thirdMesh;
  }

  const hasGroup = (n) => { const r = rig(); return !!r && !!r.sources && anySourceHasGroup(r.sources, n); };

  const portraitPicks = new WeakMap();
  function portraitPose(t) {
    if (!t || !t.ok || !t.sources) return null;
    const type = animWeaponType(t.mwType ?? (built && built.mwType), false, spellReady);
    const composed = composeStanceGroup(FP_IDLE_BASE, type, (n) => anySourceHasGroup(t.sources, n));
    if (!composed.group) return null;
    let memo = portraitPicks.get(t);
    if (!memo) { memo = new Map(); portraitPicks.set(t, memo); }
    if (!memo.has(composed.group)) memo.set(composed.group, pickAnimSource(t.sources, composed.group, resetClip, { loopFallback: true }));
    return memo.get(composed.group);
  }

  // The caller supplies the roll, so the same blow plays the same recoil on every machine.
  function chooseRandomGroup(prefix, roll) {
    const r = rig();
    if (!r || !r.sources) return null;
    let n = 0;
    while (anySourceHasGroup(r.sources, `${prefix}${n + 1}`)) n++;
    if (!n) return null;
    return `${prefix}${1 + ((((roll | 0) % n) + n) % n)}`;
  }

  let poseSource = null;

  // As in the reference, getTextKeyTime searches every source in reverse.
  const keyTime = (action) => (weaponGroup && rig()
    ? sourcesKeyTime(rig().sources, `${weaponGroup}: ${action}`) : -1);

  function playAction(start, stop, startPoint = 0, reversed = false) {
    if (!rig() || !weaponGroup) return false;
    const pick = pickAnimSource(rig().sources, weaponGroup, resetClip, { start, stop, startPoint });
    if (!pick) {
      actionState = null;
      notes.push(`${weaponGroup}: no source has "${weaponGroup}: ${start}" and "${weaponGroup}: ${stop}"`);
      return false;
    }
    actionState = pick.state;
    actionState.reversed = !!reversed;
    actionSource = pick.source;
    return true;
  }

  // Called every frame, as in the reference; a playing idle of the right group is left alone.
  function refreshIdle(force = false) {
    if (!built || !built.ok || dead) return;
    // A non-biped drops its idle while an upper-body action, a movement, or a recoil plays, as in the reference.
    if (nonBiped() && ((upper !== UPPER_BODY.None && upper !== UPPER_BODY.WeaponEquipped) || movementState || hitState)) {
      idleState = null; idleGroup = null; idleSource = null;
      return;
    }
    const type = stanceOf();
    const base = idleBaseFor({ sneaking, inJump: !!jumpState, hasGroup });
    const compose = () => (base === FP_IDLE_SNEAK ? { group: base } : composeStanceGroup(base, type, hasGroup));
    if (!force && idleState && idleState.playing) {
      const composed = compose();
      if (composed.group === idleGroup) return;
    }
    const composed = compose();
    if (!composed.group) { idleState = null; idleGroup = null; return; }
    const short = base === FP_IDLE_SNEAK ? null : weaponShortGroup(type);
    const loopCount = short ? FP_IDLE_LOOPS() : Infinity;
    const startPoint = idleGroup === composed.group ? clipCompletion(idleState) : 0;
    const pick = pickAnimSource(rig().sources, composed.group, resetClip,
      { loopFallback: true, loopCount, startPoint });
    if (!pick) {
      idleState = null; idleGroup = null;
      notes.push(`idle: no source gives "${composed.group}" a start and a stop key`);
      return;
    }
    idleGroup = composed.group;
    idleState = pick.state;
    idleSource = pick.source;
  }

  function resetIdle() { idleState = null; idleGroup = null; refreshIdle(true); }
  function spellHandReady(want) {
    spellInHand = want;
    const step = spellHandStanceStep({ upper, spellReady }, UPPER_BODY);
    if (step === 'afterCast') unreadyAfterCast = true;
    if (step !== 'drop') return false;
    spellReady = false; refreshWeaponGroup(); resetIdle(); resetMovement();
    return true;
  }

  function thirdSeat(cam) {
    const rs = (built && built.raceScale) || { weight: 1, height: 1 };
    return seatRequestFor(cam && cam.seat, { unitsPerMetre: MW_UNITS_PER_METER, weight: rs.weight, height: rs.height });
  }
  function thirdSaddle(cam) {
    const rs = (built && built.raceScale) || { weight: 1, height: 1 };
    return saddleRequestFor(cam && cam.saddle, { unitsPerMetre: MW_UNITS_PER_METER, weight: rs.weight, height: rs.height });
  }
  function thirdClimb(cw, cam) {
    if (cam && cam.seat) { climbLast = null; return thirdSeat(cam); }
    if (cam && cam.saddle) { climbLast = null; return thirdSaddle(cam); }
    if (!(cw && cw.w > 0)) { climbLast = null; return null; }
    const snap = cam && cam.climb;
    if (snap && snap.feet) {
      const rs = (built && built.raceScale) || { weight: 1, height: 1 };
      climbLast = climbRequestToRig(cw, { feet: snap.feet, yaw: snap.yaw, unitsPerMetre: MW_UNITS_PER_METER, weight: rs.weight, height: rs.height });
      return climbLast;
    }
    return climbLast ? { ...climbLast, w: cw.w,
      // A completed vault may release after its last mapped frame, when the motor has already removed the snapshot.
      hands: cw.hands.L.w > 0 || cw.hands.R.w > 0 ? climbLast.hands : null,
    } : null;
  }
  function firstClimb(cw, cam) {
    if (!(cw && cw.w > 0) || !cam || !cam.pos || !built.arm.mats) return null;
    const node = built.arm.mats.get(built.cameraRef);
    if (!node) return null;
    const rigEye = [node.t[0] + fpOffset[0], node.t[1] + fpOffset[1], node.t[2] + fpOffset[2]];
    return climbRequestToFirstPerson(cw, { eye: cam.pos, yaw: cam.yaw || 0, pitch: cam.pitch || 0, fov: fieldOfView(), lensFov: FP_FIELD_OF_VIEW, lensPitch: followCam ? 0 : (cam.pitch || 0), rigEye, unitsPerMetre: MW_UNITS_PER_METER });
  }
  const attackingNow = () => upper === UPPER_BODY.AttackWindUp || upper === UPPER_BODY.AttackRelease || upper === UPPER_BODY.AttackEnd;
  const offShown = (r) => handsMode === 'dual' && weaponInHand() && !!(r && r.offWeapon);
  const pairHeld = () => handsMode === 'dual' && !handsTaken(built) && (weaponShown || upper === UPPER_BODY.Equipping || upper === UPPER_BODY.Unequipping);
  const handsTaken = (r) => !r || !r.ok || dead || nonBiped() || !!held || climbHands || spellStance() || !!r.werewolf;
  const heldClips = createHeldClips({ pick: (r, g) => pickAnimSource(r.sources, g, resetClip, { loopFallback: true }), step: advanceClip, sampleTrack });
  const stanceIdle = (r, type, spell = false) => composeStanceGroup(FP_IDLE_BASE, animWeaponType(type, false, spell), (n) => anySourceHasGroup(r.sources, n)).group;
  const spellHandArm = (r, dt) => (spellHand && !(!r || !r.ok || dead || nonBiped() || held || climbHands || r.werewolf) ? spellHandLimbs({
    casting: upper === UPPER_BODY.Casting, ready: spellInHand,
    weaponIdle: upper === UPPER_BODY.Casting ? heldClips.clip(r, stanceIdle(r, r.mwType ?? built.mwType), dt) : null,
    spellIdle: spellInHand && upper !== UPPER_BODY.Casting ? heldClips.clip(r, stanceIdle(r, r.mwType ?? built.mwType, true), dt) : null,
  }) : null);
  const idleClip = () => (idleState && idleSource ? { tracks: idleSource.trackMap, sampleTrack, time: poseTime(idleState) } : null);
  const strideOpposite = () => {
    if (deathState || actionState || hitState || !movementState || !movementSource) return null;
    const time = strideOppositeTime(movementState, poseTime(movementState), movementSource.keys);
    return time == null ? null : { tracks: movementSource.trackMap, sampleTrack, time };
  };
  function clipStrikeSide(rigKey, r, type) {
    const key = `${rigKey}:${weaponGroup}:${type}`;
    if (strikeSides.has(key)) return strikeSides.get(key);
    let side = null;
    const pick = weaponGroup && r.sources ? pickAnimSource(r.sources, weaponGroup, resetClip, { start: `${type} start`, stop: `${type} hit` }) : null;
    const t0 = pick ? getTextKeyTime(pick.source.keys, `${weaponGroup}: ${type} start`) : -1;
    const t1 = pick ? getTextKeyTime(pick.source.keys, `${weaponGroup}: ${type} hit`) : -1;
    if (t0 >= 0 && t1 >= 0 && r.arm && r.arm.fns && r.arm.skeleton) {
      const at = (time) => r.arm.fns.poseSkeleton(r.arm.skeleton, pick.source.trackMap, sampleTrack, time, { accumRoot: r.accumRoot });
      side = strikingSide(r.arm.skeleton, GRAPH_ROOT, r.arm.fns.skelMats, at(t0), at(t1));
    }
    strikeSides.set(key, side);
    return side;
  }
  function mirrorFor(rigKey, r, dt) {
    const req = { carry: { key: 'none', dt, tau: POSE.LIMB_TAU, state: mirrorCarry[rigKey] }, dip: null };
    if (rigKey === 'first' && r && r.cameraRef != null) req.plane = { ref: r.cameraRef, dx: fpOffset[0] };
    const sh = spellHandArm(r, dt);
    if (sh) { req.limbs = sh.limbs; req.carry.key = sh.key; return req; }
    if (handsTaken(r)) { req.carry.key = 'taken'; return req; }
    req.dip = pairDip();
    if (req.plane && pairSpread > 0) req.spread = pairSpread;
    const idle = idleClip();
    if (pairHeld()) {
      if (attackingNow() && attackHand === 'L') {
        req.full = true;
        if (idle) req.limbs = { R: { clip: idle, side: 'R', mirror: false } };
        req.carry.key = 'dual:L';
      } else if (attackingNow()) {
        const offClip = idle;
        req.limbs = { L: offClip ? { clip: offClip, side: 'R', mirror: true } : { pose: null, side: 'R', mirror: true } };
        req.carry.key = 'dual:R';
      } else {
        const stride = strideOpposite();
        const offClip = stride;
        req.limbs = { L: offClip ? { clip: offClip, side: 'R', mirror: true } : { pose: null, side: 'R', mirror: true } };
        req.carry.key = stride ? 'dual:stride' : 'dual';
      }
      return req;
    }
    if (handsMode === 'fists' && attackingNow() && attackHand && attackType) {
      const side = clipStrikeSide(rigKey, r, attackType);
      if (side && side !== attackHand) {
        req.full = true;
        if (idle) req.limbs = { [side]: { clip: idle, side, mirror: false } };
        req.carry.key = `fists:${attackHand}`;
      }
    }
    return req;
  }
  function stepPairGuard(dt) {
    for (const h of /** @type {const} */ (['L', 'R'])) {
      pairGuard[h] = guardStep(pairGuard[h], pairHeld() && attackingNow() && !!attackHand && attackHand !== h, dt);
      if (pairGuard[h] < 1e-3) pairGuard[h] = 0;
    }
  }
  function stepPairSpread(dt) {
    if (pairHeld()) spreadMemo = pairBladeMeasure(built, spreadMemo, spreadMeasure);
    pairSpread = pairSpreadStep(pairSpread, pairHeld() ? spreadMemo?.angle ?? 0 : 0, dt);
  }
  const pairDip = () => {
    if (!(pairGuard.L > 0 || pairGuard.R > 0)) return null;
    const d = guardDipNow();
    return { L: pairGuard.L * (d?.L ?? 0), R: pairGuard.R * (d?.R ?? 0) };
  };
  function guardDipNow() {
    guardDipMemo = pairBladeMeasure(built, guardDipMemo, guardMeasure);
    return guardDipMemo?.dip ?? null;
  }
  const portraitMirror = () => (handsMode === 'dual' ? { limbs: { L: { pose: null, side: 'R', mirror: true } } } : null);
  function stepRunPump(dt) {
    const fresh = !(runPump.w > 0);
    runPump.w = runWeightStep(runPump.w, runPump.wanted && viewMode === 'first', attackingNow(), dt);
    if (!runPump.wanted && runPump.w < 1e-3) runPump.w = 0;
    if (runPump.wanted || runPump.w > 0) runPump.phase = runPhaseFollow(runPump.phase, runPump.given, runPump.speed, dt, fresh);
  }
  function firstRun(cam) {
    runPump.targets = null;
    if (!(runPump.w > 0) || !cam || !built.arm.mats) return null;
    const node = built.arm.mats.get(built.cameraRef);
    if (!node) return null;
    const eye = [node.t[0] + fpOffset[0], node.t[1] + fpOffset[1], node.t[2] + fpOffset[2]];
    const tanV = Math.tan(FP_FIELD_OF_VIEW / 2);
    const aspect = lastFrame && lastFrame.rect && lastFrame.rect.h > 0 ? lastFrame.rect.w / lastFrame.rect.h : 16 / 9;
    const lensPitch = followCam ? 0 : (cam.pitch || 0);
    const cl = Math.cos(lensPitch), sl = Math.sin(lensPitch);
    const lens = (x, y, z) => [x, y * cl - z * sl, y * sl + z * cl];
    const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const hand = (side) => {
      const p = pumpTarget3D(runPump.phase, side);
      const out = side === 'R' ? 1 : -1;
      const dir = unit(lens(out * p.x * tanV * aspect, 1, p.y * tanV));
      const k = p.d * MW_UNITS_PER_METER;
      return {
        at: [eye[0] + dir[0] * k, eye[1] + dir[1] * k, eye[2] + dir[2] * k],
        fingers: unit(lens(-out * 0.25, 0.9, 0.35)), palm: lens(-out, 0, 0), pole: unit(lens(out * 0.5, -0.6, -0.6)),
        curl: RUN_3D.CURL, w: 1,
      };
    };
    const hands = { L: hand('L'), R: hand('R') };
    runPump.targets = { eye, L: hands.L.at, R: hands.R.at };
    return { w: runPump.w, hands };
  }
  function torchVisible() {
    if (!torchLit || !built || !built.ok) return false;
    // A light that resolved to nothing on this rig is not in the carried-left slot; each rig resolves its own.
    const r = rig();
    if (!r || !r.torch) return false;
    return carriedLeftVisible(animWeaponType(built.mwType, sheathed, spellReady));
  }
  function hipVisible() {
    return hipLit && !!(thirdBuilt && thirdBuilt.ok && thirdBuilt.hipLight);
  }
  function effectHidden(eff) {
    if (eff.slot === 'torch') return !torchVisible();
    const bladeAway = climbHands || (viewMode === 'first' && !!held);
    if (eff.slot === 'offweapon') return !offShown(rig()) || bladeAway;
    if (eff.slot === HIP_LIGHT_SLOT) return !hipVisible();
    if (eff.slot === 'weapon') return !weaponInHand() || bladeAway;
    return false;
  }
  // The Spell stance shows no weapon, as in the reference, so a readied spell or a cast empties the hands.
  const spellStance = () => spellReady || upper === UPPER_BODY.Casting;
  const weaponInHand = () => weaponShown && (!spellStance() || spellHand);
  function refreshTorch(force = false) {
    if (!torchVisible()) { torchState = null; torchSource = null; torchGroup = null; return; }
    if (!force && torchState && torchState.playing) return;
    const r = rig();
    if (!force && torchMissRig === r) return;
    const pick = r ? pickAnimSource(r.sources, TORCH_GROUP, resetClip, { loopFallback: true }) : null;
    if (!pick) {
      torchState = null; torchSource = null; torchGroup = null; torchMissRig = r;
      const say = `torch: no source gives "${TORCH_GROUP}" a start and a stop key - the light hangs in the idle's left hand`;
      if (!notes.includes(say)) notes.push(say);
      return;
    }
    torchMissRig = null;
    torchGroup = TORCH_GROUP; torchState = pick.state; torchSource = pick.source;
  }

  function resetMovement() {
    movementState = null; movementGroup = null; movementSource = null; movementBase = null;
    movementStance = null;
  }

  function resetJump() {
    jumpState = null; jumpGroup = null; jumpSource = null; jumpStance = null;
    jumpKind = null;
  }

  let movementAnimSpeed = MOVEMENT_FALLBACK_SPEED.walk;

  // A forced re-pick in the same state starts at loop start, so a mid-air stance change does not replay the
  // takeoff. Data without a "jump: loop stop" key plays no landing, as in the reference.
  function refreshJump(mv) {
    if (!built || !built.ok || dead) return false;
    const derived = jumpAnimState({
      grounded: mv ? mv.grounded !== false : true,
      swimming: !!(mv && mv.swimming),
      levitating: !!(mv && mv.levitating),
      jumpQueued: !!(mv && mv.jumping),
      priorInAir: jumpKind === 'inair',
      jumpPlaying: !!(jumpState && jumpState.playing),
    });
    const stance = stanceOf();
    const force = !!jumpState && jumpStance !== stance;
    if (!force && derived.jump === jumpKind) return derived.inJump;
    if (!derived.jump) {
      if (jumpState) { resetJump(); resetIdle(); }
      else resetJump();
      return derived.inJump;
    }
    const composed = composeStanceGroup('jump', stance, hasGroup);
    if (!composed.group) {
      if (jumpState) { resetJump(); resetIdle(); }
      else resetJump();
      return derived.inJump;
    }
    const startAtLoop = derived.jump === jumpKind;
    const pick = derived.jump === 'inair'
      ? pickAnimSource(rig().sources, composed.group, resetClip,
        { start: startAtLoop ? 'loop start' : 'start', stop: 'stop', loopCount: Infinity })
      : pickAnimSource(rig().sources, composed.group, resetClip,
        { start: 'loop stop', stop: 'stop', loopCount: 0 });
    if (!pick) {
      if (jumpState) { resetJump(); resetIdle(); }
      else resetJump();
      return derived.inJump;
    }
    jumpState = pick.state;
    jumpSource = pick.source;
    jumpGroup = composed.group;
    jumpStance = stance;
    jumpKind = derived.jump;
    return derived.inJump;
  }

  function refreshMovement(cam, dt, inJump = false) {
    if (!built || !built.ok || dead) return;
    const yaw = cam ? (cam.yaw || 0) : 0;
    let yawRate = 0;
    if (lastYaw != null && dt > 0) {
      // A peer's rig reads this camera too, so yaw can come from the wire.
      const d = wrapAngle(yaw - lastYaw);
      yawRate = d / dt;
      if (d !== 0) { turnDir = Math.sign(d); turnHold = 0.05; }
      else { turnHold -= dt; if (turnHold <= 0) turnDir = 0; }
    }
    lastYaw = yaw;
    const mv = (cam && cam.move) || null;
    const base = inJump ? null : movementAnimState({
      forward: mv ? mv.forward : 0,
      strafe: mv ? mv.strafe : 0,
      running: !!(mv && mv.running),
      sneaking,
      turning: turnDir,
      thirdPerson: viewMode === 'third' && !nonBiped(),
    });
    if (!base) {
      // When movement empties, the idle resets with it, so it replays with fresh loop dice as in the reference.
      if (movementState) { resetMovement(); resetIdle(); }
      return;
    }
    const isTurn = base.startsWith('turn');
    // The stance is part of the early-out key, so drawing a weapon mid-walk recomposes the group that frame.
    const stance = stanceOf();
    const fresh = !(movementState && movementState.playing
      && movementBase === base && movementStance === stance);
    if (fresh) {
      const composed = composeMovementGroup(base, stance, hasGroup);
      if (!composed.group) {
        if (movementState) { resetMovement(); resetIdle(); }
        movementBase = base; movementStance = stance;
        return;
      }
      if (!(movementState && movementState.playing && movementGroup === composed.group)) {
        const startPoint = movementGroup === composed.group ? clipCompletion(movementState) : 0;
        const pick = pickAnimSource(rig().sources, composed.group, resetClip,
          { loopFallback: true, loopCount: Infinity, startPoint });
        if (!pick) {
          resetMovement();
          notes.push(`movement: no source gives "${composed.group}" a start and a stop key`);
          movementBase = base; movementStance = stance;
          return;
        }
        movementGroup = composed.group;
        movementState = pick.state;
        movementSource = pick.source;
      }
      movementBase = base; movementStance = stance;
      // The velocity comes from the source that won the pick, not the reference's multi-source walk, to match the
      // clip shown. Switching to the multi-source walk changes the third-person sprint.
      const vel = movementSource ? sourceVelocityOf(movementSource, movementGroup) : 0;
      movementAnimSpeed = vel > 1 ? vel
        : sneaking ? MOVEMENT_FALLBACK_SPEED.sneak
          : (mv && mv.running) ? MOVEMENT_FALLBACK_SPEED.run : MOVEMENT_FALLBACK_SPEED.walk;
    }
    movementRate = isTurn
      ? turnAnimSpeed(yawRate)
      : Math.min(MOVEMENT_SPEED_CAP,
        ((mv && mv.speed ? mv.speed : 0) * MW_UNITS_PER_METER) / movementAnimSpeed);
  }

  function refreshWeaponGroup() {
    if (!built || !built.ok) { weaponGroup = null; return; }
    const type = animWeaponType(built.mwType, sheathed, spellReady);
    weaponGroup = composeWeaponGroup(type, hasGroup).group;
  }

  function onActionKey(text, time, mine) {
    if (!mine || !weaponGroup) return;
    const action = text.slice(weaponGroup.length + 2);
    if (action === EQUIP_KEYS.attach) weaponShown = true;
    else if (action === UNEQUIP_KEYS.detach) weaponShown = false;
    else if (action === 'shoot attach' || action === 'shoot follow attach') arrowShown = true;
    // The release is signaled to the rig; damage stays with the Daggerfall weapon machine.
    else if (action === 'shoot release') { arrowShown = false; shootReleased = true; }
    // The spell's release is signaled the same way; the Daggerfall engine still resolves the spell.
    else if (upper === UPPER_BODY.Casting && attackType && action === `${attackType} release`) castReleased = true;
  }

  function windUpStrength() {
    if (!actionState) return 1;
    const f = calculateWindUp(actionState.time, keyTime(`${attackType} min attack`),
      keyTime(`${attackType} max attack`));
    // A group with no wind-up window gets a random strength from 0.1 to 1, so keyless attacks still vary.
    return f === -1 ? Math.min(1, 0.1 + Math.random()) : f;
  }

  function beginRelease() {
    attackStrength = windUpStrength();
    upper = UPPER_BODY.AttackRelease;
    const k = attackKeys(attackType, attackStrength, { reversed: attackReversed });
    const startPoint = releaseSkip(rig().keys, weaponGroup, attackType, attackStrength);
    if (!playAction(k.release.start, k.release.stop, startPoint, k.reversed)) beginFollow();
    else if (blowPlan) blowPlan.rate = blowRate(actionState.stopTime - actionState.time, blowPlan.hitAt - blowPlan.clock);
  }

  function beginFollow() {
    upper = UPPER_BODY.AttackEnd;
    const k = attackKeys(attackType, attackStrength, { reversed: attackReversed });
    if (!playAction(k.follow.start, k.follow.stop, 0, k.reversed)) endAttack();
    else if (blowPlan) blowPlan.rate = blowRate(actionState.stopTime - actionState.time, blowPlan.seconds - blowPlan.clock);
  }

  function endAttack() {
    actionState = null;
    actionSource = null;
    reloadCrossbow();
    upper = UPPER_BODY.WeaponEquipped;
    attackType = null;
    attackHand = null;
    blowPlan = null;
    if (resetIdleOnAttackEnd) { resetIdleOnAttackEnd = false; resetIdle(); }
  }

  function creatureAttack(roll, blow) {
    if (dead) return null;
    if (upper === UPPER_BODY.AttackEnd) endAttack();
    if (upper !== UPPER_BODY.WeaponEquipped) return null;
    const g = chooseRandomGroup('attack', roll);
    const pick = g ? pickAnimSource(rig().sources, g, resetClip, { start: 'start', stop: 'stop', loopCount: 0 }) : null;
    if (!pick) return null;
    actionState = pick.state; actionSource = pick.source;
    upper = UPPER_BODY.AttackEnd;
    attackType = g; holdWindUp = false; attackStrength = 1;
    resetIdleOnAttackEnd = true;
    blowPlan = null;
    if (blow && blow.hitAt > 0 && blow.seconds >= blow.hitAt && Number.isFinite(blow.seconds)) {
      const st = actionState;
      const hit = getTextKeyTime(pick.source.keys, `${g}: hit`);
      const rate = hit > st.startTime ? blowRate(hit - st.startTime, blow.hitAt) : blowRate(st.stopTime - st.startTime, blow.seconds);
      blowPlan = { seconds: blow.seconds, hitAt: blow.hitAt, clock: 0, rate };
    }
    refreshIdle();
    return g;
  }
  let creatureCasts = 0;

  function blowPace(blow, k) {
    if (!blow || attackType === MW_SHOOT_ATTACK || holdWindUp) return null;
    if (!(blow.hitAt > 0) || !(blow.seconds >= blow.hitAt) || !Number.isFinite(blow.seconds)) return null;
    const span = (a, b) => { const t0 = keyTime(a); const t1 = keyTime(b); return t0 >= 0 && t1 > t0 ? t1 - t0 : 0; };
    const toHit = (actionState ? actionState.stopTime - actionState.startTime : 0) + span(k.release.start, k.release.stop);
    if (!(toHit > 0)) return null;
    return { seconds: blow.seconds, hitAt: blow.hitAt, clock: 0, rate: blowRate(toHit, blow.hitAt) };
  }

  function reloadCrossbow() {
    if (built && built.ok && built.arrow && reloadsItself(built.mwType)) arrowShown = true;
  }

  function stepUpper() {
    const playing = !!(actionState && actionState.playing);
    if (playing) return;
    switch (upper) {
      case UPPER_BODY.Equipping:
        actionState = null; actionSource = null;
        // The reference reloads when Equipping or AttackEnd finishes, so the crossbow comes up loaded.
        reloadCrossbow();
        upper = UPPER_BODY.WeaponEquipped;
        if (resetIdleOnAttackEnd) { resetIdleOnAttackEnd = false; resetIdle(); }
        break;
      case UPPER_BODY.Unequipping:
        // This is where the weapon type becomes None, as in the reference, so the stance drops to the bare idle.
        actionState = null; actionSource = null;
        upper = UPPER_BODY.None;
        sheathed = true;
        refreshWeaponGroup();
        refreshIdle(true);
        break;
      case UPPER_BODY.AttackWindUp:
        // Only a held wind-up waits here; Daggerfall's uncharged melee swing releases at full strength.
        if (!holdWindUp) beginRelease();
        break;
      case UPPER_BODY.AttackRelease:
        beginFollow();
        break;
      case UPPER_BODY.AttackEnd:
        endAttack();
        break;
      case UPPER_BODY.Casting:
        actionState = null;
        actionSource = null;
        upper = sheathed ? UPPER_BODY.None : UPPER_BODY.WeaponEquipped;
        attackType = null;
        if (resetIdleOnAttackEnd) { resetIdleOnAttackEnd = false; resetIdle(); }
        if (unreadyAfterCast) { unreadyAfterCast = false; spellReady = false; refreshWeaponGroup(); resetIdle(); resetMovement(); }
        break;
      default:
        if (actionState) actionState = null;
        break;
    }
  }

  // Every path that holds busy flushes through here, so a change queued behind any of them is applied.
  function flushPending() {
    if (pendingBuild) {
      const o = pendingBuild; pendingBuild = null; pendingWorn = null; pendingWeapon = null; pendingTorch = null; pendingHipLight = null; pendingWerewolf = null; pendingVampire = null; pendingOff = undefined;
      api.build(o);
      return;
    }
    // The form goes first, since the table below waits on its build.
    if (pendingWerewolf !== null) { const w = pendingWerewolf; pendingWerewolf = null; api.setWerewolf(w.want, { skin: w.skin }); }
    if (pendingVampire !== null) { const v = pendingVampire; pendingVampire = null; api.setVampire(v); }
    if (pendingWorn) { const p = pendingWorn; pendingWorn = null; api.setWorn(p); }
    if (pendingWeapon) { const w = pendingWeapon; pendingWeapon = null; api.setWeapon(w.item, { hasAmmo: w.hasAmmo, ammoCount: w.ammoCount }); }
    if (pendingOff !== undefined) { const o = pendingOff; pendingOff = undefined; api.setOffWeapon(o); }
    if (pendingTorch !== null) { const l = pendingTorch; pendingTorch = null; api.setTorch(l); }
    if (pendingHipLight !== null) { const l = pendingHipLight; pendingHipLight = null; api.setHipLight(l); }
  }

  const api = {
    attach(r, cam) { renderer = r || null; camera = cam || null; },
    active,
    ready,
    // The rig is a module singleton, so callers compare this identity; ready() only says that some arm is built.
    builtFor() { return built && built.ok && lastBuildOpts ? { race: lastBuildOpts.race ?? null, female: !!lastBuildOpts.female, faceIndex: lastBuildOpts.faceIndex | 0, werewolf: !!lastBuildOpts.werewolf, vampire: !!lastBuildOpts.vampire } : null; },
    buildingFor() {
      const o = pendingBuild ?? buildingOpts;
      return o ? { race: o.race ?? null, female: !!o.female, faceIndex: o.faceIndex | 0, werewolf: !!o.werewolf, vampire: !!o.vampire } : null;
    },
    get frames() { return frames; },

    async build(opts) {
      opts = drawnOpts(opts);
      // A build arriving mid-build is queued and runs once the current one settles, replacing what was queued.
      if (busy) { pendingBuild = opts; return { ok: false, stage: 'build', error: 'already building - queued behind it', queued: true }; }
      busy = true;
      buildingOpts = opts ?? null;
      const gen = buildGen;
      try {
        const res = await buildFpArm(opts);
        if (gen !== buildGen) return { ok: false, stage: 'build', error: 'unloaded while building' };
        releaseMesh();
        releaseThirdMesh();
        built = res;
        packed = null;
        thirdPacked = null;
        thirdBuilt = res && res.ok ? (res.third || null) : null;
        viewMode = res && res.ok && res.creature && thirdBuilt ? 'third' : 'first';
        wornKey = fpWeaponKey(opts && opts.weapon, !!(opts && opts.hasAmmo));
        offKey = res && res.ok && !res.werewolf && opts && opts.offWeapon ? fpWeaponKey(opts.offWeapon, false) : null;
        strikeSides.clear(); mirrorCarry.first = {}; mirrorCarry.third = {};
        wornWeaponKey = fpWeaponKey(opts && opts.weapon, false);
        wornEquipKey = wornEquipKeyOf(opts && opts.armor);
        lastBuildOpts = opts ? { ...opts } : null;
        buildDeps = (opts && opts.deps) || null;
        idleState = null; actionState = null; idleGroup = null; weaponGroup = null; weaponClock = { group: null, value: 0 };
        movementState = null; movementGroup = null; movementSource = null; movementBase = null;
        jumpState = null; jumpGroup = null; jumpSource = null; jumpStance = null; jumpKind = null;
        lastYaw = null; turnDir = 0; turnHold = 0;
        upper = UPPER_BODY.None; attackType = null; holdWindUp = false;
        attackHand = null;
        weaponShown = false; arrowShown = false; notes.length = 0; aimFactor = 0; sneaking = false;
        idleSource = null; actionSource = null; poseSource = null;
        // A rebuilt arm starts sheathed, so no stale attack state waits on a clip that no longer exists.
        sheathed = true;
        torchLit = !!(opts && opts.torch);
        torchState = null; torchSource = null; torchGroup = null; torchMissRig = null;
        hipLit = !!(opts && opts.hipLight);
        if (thirdBuilt && thirdBuilt.ok) thirdBuilt.hipHang = thirdBuilt.arm.pieces.find((p) => p.slot === HIP_LIGHT_SLOT)?.hang ?? null;
        hipLantern.reset();
        if (!res.ok) { reason = `${res.stage}: ${res.error}`; built = res; return res; }
        refreshWeaponGroup();
        refreshIdle(true);
        refreshTorch(true);
        if (!idleState) {
          built = null;
          reason = 'clip: no idle group this stance can reach';
          return { ok: false, stage: 'clip', error: reason };
        }
        reason = 'built';
        return res;
      } finally {
        busy = false;
        buildingOpts = null;
        for (const fn of listeners) { try { fn(); } catch { } }
        flushPending();
      }
    },

    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    unload() {
      buildGen += 1;
      adoptMemoGeneration(memoGenOf);
      pendingBuild = null; lastBuildOpts = null;
      buildingOpts = null;
      castFxGen += 1; releaseCastFx();
      releaseMesh(); built = null; packed = null;
      offKey = null; pendingOff = undefined; strikeSides.clear(); mirrorCarry.first = {}; mirrorCarry.third = {};
      held = null; heldMemo = null; lastFrame = null; drewLast = false;
      releaseThirdMesh(); thirdBuilt = null; thirdPacked = null; viewMode = 'first';
      movementState = null; movementGroup = null; movementSource = null; movementBase = null;
      jumpState = null; jumpGroup = null; jumpSource = null; jumpStance = null; jumpKind = null;
      lastYaw = null; turnDir = 0; turnHold = 0;
      idleState = null; actionState = null; idleGroup = null; weaponGroup = null; weaponClock = { group: null, value: 0 };
      upper = UPPER_BODY.None; attackType = null; holdWindUp = false;
      attackHand = null;
      weaponShown = false; arrowShown = false;
      notes.length = 0; aimFactor = 0; sneaking = false;
      idleSource = null; actionSource = null; poseSource = null;
      torchLit = false; torchState = null; torchSource = null; torchGroup = null; torchMissRig = null;
      hipLit = false; pendingHipLight = null; hipLantern.reset();
      pendingWerewolf = null;
      pendingVampire = null;
      reason = 'unloaded';
      for (const fn of listeners) { try { fn(); } catch { } }
    },

    setSheathed(next) {
      const want = !!next;
      if (!built || !built.ok) return false;
      if (want === sheathed) return false;
      // Drawing switches the weapon type as the equip section starts; sheathing keeps the old type until the
      // unequip section ends. Switching early would look for unequip keys in the bare-handed group.
      if (want) {
        if (upper === UPPER_BODY.Unequipping) return false;
        // A sheathe may cut the wind-up but not the release or the follow-through, as in the reference.
        if (upper === UPPER_BODY.AttackRelease || upper === UPPER_BODY.AttackEnd) return false;
        if (upper === UPPER_BODY.None || !weaponGroup) {
          sheathed = true; weaponShown = false; arrowShown = false;
          refreshWeaponGroup(); refreshIdle(true);
          return true;
        }
        upper = UPPER_BODY.Unequipping;
        // Without an "unequip detach" key the weapon hides at once, as in the reference.
        const detach = keyTime(UNEQUIP_KEYS.detach);
        if (!playAction(UNEQUIP_KEYS.start, UNEQUIP_KEYS.stop, 0)) {
          upper = UPPER_BODY.None; sheathed = true; weaponShown = false; arrowShown = false;
          refreshWeaponGroup(); refreshIdle(true);
          return true;
        }
        if (detach < 0) weaponShown = false;
        arrowShown = false;
        return true;
      }
      sheathed = false;
      if (drawsIntoSpellHand({ spellHand, spellReady, casting: upper === UPPER_BODY.Casting })) { spellReady = false; spellInHand = true; }
      refreshWeaponGroup();
      upper = UPPER_BODY.Equipping;
      resetIdleOnAttackEnd = true;
      const attach = keyTime(EQUIP_KEYS.attach);
      if (!playAction(EQUIP_KEYS.start, EQUIP_KEYS.stop, 0)) { upper = UPPER_BODY.WeaponEquipped; weaponShown = true; }
      // Without an "equip attach" key the weapon shows at once, as in the reference.
      if (attach < 0) weaponShown = true;
      refreshIdle(true);
      return true;
    },

    // A worn change rebuilds the whole rig, because worn verdicts reshape the skin rows as well as the attachments.
    setWorn(pieces) {
      if (!built || !built.ok || !lastBuildOpts) return false;
      // This queues before the key compare, because mid-build the key belongs to the in-flight table.
      if (busy) { pendingWorn = pieces; return false; }
      const key = wornEquipKeyOf(pieces);
      if (key === wornEquipKey) return false;
      wornEquipKey = key;
      if (lastBuildOpts.werewolf) { lastBuildOpts = { ...lastBuildOpts, armor: pieces }; return false; }
      return this.build({ ...lastBuildOpts, armor: pieces, weapon: lastBuildOpts.weapon });
    },
    // This compares against the last build's opts, which a refusal keeps, so it works without a built rig.
    setWerewolf(on, { skin = null } = {}) {
      const want = !!on;
      const wantSkin = want ? (skin ?? null) : null;
      if (busy) {
        if (pendingBuild) pendingBuild = { ...pendingBuild, werewolf: want, skin: wantSkin };
        else pendingWerewolf = { want, skin: wantSkin };
        return false;
      }
      if (!lastBuildOpts) return false;
      if (want === !!lastBuildOpts.werewolf && wantSkin === (lastBuildOpts.skin ?? null)) return false;
      return this.build({ ...lastBuildOpts, werewolf: want, skin: wantSkin });
    },
    setVampire(on) {
      const want = !!on;
      if (busy) {
        if (pendingBuild) pendingBuild = { ...pendingBuild, vampire: want };
        else pendingVampire = want;
        return false;
      }
      if (!lastBuildOpts) return false;
      if (want === !!lastBuildOpts.vampire) return false;
      return this.build({ ...lastBuildOpts, vampire: want });
    },
    setWeapon(item, { hasAmmo = false, ammoCount = null } = {}) {
      item = drawnPiece(item);
      if (!built || !built.ok) return false;
      // The whole request queues before the key compare, since the key is the old hand until a swap lands.
      if (busy) { pendingWeapon = { item, hasAmmo, ammoCount }; return false; }
      // A cast finishes before the hand changes, as in the reference; the swap lands the frame the cast ends.
      if (upper === UPPER_BODY.Casting) return false;
      if (built.werewolf) return false;
      const key = fpWeaponKey(item, hasAmmo);
      if (key === wornKey) return false;
      // A swap that failed on this rig is not retried by the per-frame caller.
      if (built.weaponFailed === key) return false;
      busy = true;
      const token = built;
      token.weaponFailed = null;
      return (async () => {
        try {
          const d = buildDeps || await import('../scenes/dataSource.js');
          const archives = await d.loadMorrowindArchives();
          if (built !== token) return false;
          const find = (p) => findLoaded(archives, p);
          // Both rigs' resolves pick the same records from the same weapon list, so one load serves both.
          await loadFromArchives(archives, weaponPartPaths({ weapon: item, hasAmmo, allWeapons: token.allWeapons, has: archiveHas(archives) }));
          const resolved = resolveWeaponParts({
            weapon: item, hasAmmo, allWeapons: token.allWeapons, find,
            skeletonBytes: token.skeletonBytes, has: archiveHas(archives),
          });
          // Both rigs resolve before either changes, since findLoaded throws for a failed load.
          const t = thirdBuilt && thirdBuilt.ok ? thirdBuilt : null;
          let tResolved = null;
          let tHolster = null;
          if (t) {
            tResolved = resolveWeaponParts({
              weapon: item, hasAmmo, allWeapons: token.allWeapons, find,
              skeletonBytes: t.skeletonBytes, has: archiveHas(archives),
            });
            await loadFromArchives(archives, holsterPartPaths({ weaponModel: tResolved.weaponInfo?.model }));
            tHolster = t.sheathing !== false
              ? resolveHolsterParts({
                mwType: tResolved.mwType, weaponModel: tResolved.weaponInfo?.model,
                weaponBytes: tResolved.parts.find((p) => p.slot === 'weapon')?.bytes ?? null,
                ammo: tResolved.arrowInfo ? { bytes: tResolved.parts.find((p) => p.slot === 'arrow')?.bytes ?? null, type: tResolved.arrowInfo.type } : null,
                ammoCount: ammoCount ?? (hasAmmo ? Number.MAX_SAFE_INTEGER : 0),
                find, hasBone: (n) => t.arm.skeleton.byName.has(String(n).toLowerCase()), parseNif: parseNifOnce,
              })
              : { parts: [], info: null, notes: [] };
          }
          const gen = token.catalog?.gen ?? null;
          const arm = token.arm;
          arm.pieces = arm.pieces.filter((p) => p.slot !== 'weapon' && p.slot !== 'arrow');
          bindPartsInto(arm, resolved.parts);
          const fresh = arm.pieces.filter((p) => p.slot === 'weapon' || p.slot === 'arrow');
          await preloadArmTextures(fresh, archives, gen);
          for (const [file, tex] of collectArmTextures(fresh, archives, gen)) {
            if (!token.textures.has(file)) token.textures.set(file, tex);
          }
          const oldType = token.mwType;
          token.mwType = resolved.mwType;
          token.weapon = resolved.weaponInfo;
          token.arrow = resolved.arrowInfo;
          token.notes = [
            ...(token.notes || []).filter((n) => !/^(weapon|arrow)[ :@]/.test(n)),
            ...resolved.notes,
          ];
          token.pieces = armPieceRows(arm.pieces).length;
          const poseAt = (t) => poseAssembly(arm, {
            tracks: token.tracks, sampleTrack, time: t, accumRoot: token.accumRoot,
          });
          const c = token.clip;
          const times = Array.from({ length: 25 }, (_, i) => c.startTime + ((c.stopTime - c.startTime) * i) / 24);
          token.reach = armReach(firstPersonEye(arm.mats, token.cameraRef), clipUnionBounds(arm, poseAt, times));
          poseAt(c.startTime);
          if (token.weapon) token.weapon.side = weaponRestSide(arm, token.weapon.bone);
          if (token.arrow) token.arrow.side = weaponRestSide(arm, token.arrow.bone);
          if (t) {
            const swapped = new Set(['weapon', 'arrow', ...HOLSTER_SLOTS]);
            t.arm.pieces = t.arm.pieces.filter((p) => !swapped.has(p.slot));
            bindPartsInto(t.arm, [...tResolved.parts, ...tHolster.parts]);
            const tFit = fitThirdPersonCloak(t.arm, null);
            t.holster = tHolster.info;
            t.notes = [...(t.notes || []).filter((n) => !/^holster[ :@]/.test(n)), ...tHolster.notes, ...tFit.notes];
            const tFresh = t.arm.pieces.filter((p) => swapped.has(p.slot));
            await preloadArmTextures(tFresh, archives, gen);
            for (const [file, tex] of collectArmTextures(tFresh, archives, gen)) {
              if (!t.textures.has(file)) t.textures.set(file, tex);
            }
            t.mwType = tResolved.mwType;
            t.weapon = tResolved.weaponInfo;
            t.arrow = tResolved.arrowInfo;
            t.pieces = armPieceRows(t.arm.pieces).length;
            releaseThirdMesh();
            thirdPacked = null;
          }
          releaseMesh();
          packed = null;
          actionState = null; actionSource = null; attackType = null; holdWindUp = false;
          wornKey = key;
          wornWeaponKey = fpWeaponKey(item, false);
          if (lastBuildOpts) { lastBuildOpts.weapon = item; lastBuildOpts.hasAmmo = hasAmmo; lastBuildOpts.ammoCount = ammoCount; }
          const wasDrawn = !sheathed;
          // A drawn weapon-to-weapon swap plays no unequip or equip section, as in the reference.
          const stillWeapon = wasDrawn && isRealWeapon(oldType) && isRealWeapon(resolved.mwType);
          if (stillWeapon) {
            weaponShown = true;
            arrowShown = false;
            upper = UPPER_BODY.WeaponEquipped;
            refreshWeaponGroup();
            resetIdle();
          } else {
            weaponShown = false; arrowShown = false;
            sheathed = true;
            upper = UPPER_BODY.None;
            refreshWeaponGroup();
            refreshIdle(true);
            if (wasDrawn) { busy = false; api.setSheathed(false); }
          }
          return true;
        } catch (err) {
          // Every caller drops this promise, so a failure returns the rig's verdict instead of throwing.
          const msg = err?.message ?? String(err);
          token.weaponFailed = key;
          token.notes = [...(token.notes || []).filter((n) => !/^weapon: the swap /.test(n)), swapFailedNote('weapon', msg)];
          console.warn(`[mw] weapon swap failed - ${msg}`);
          return false;
        } finally {
          busy = false;
          // Listeners are notified in finally, so a panel repaints after the swap even when it threw.
          for (const fn of listeners) { try { fn(); } catch { } }
          flushPending();
        }
      })();
    },

    attack(strike, { hold = false, blow = null, roll = 0, hand = null } = {}) {
      if (!built || !built.ok || sheathed || dead) return null;
      if (nonBiped()) return creatureAttack(roll, blow);
      // A strike arriving in the follow-through is a blow the machine has finished, so it cuts the follow-through.
      if (upper === UPPER_BODY.AttackEnd) endAttack();
      if (upper !== UPPER_BODY.WeaponEquipped) return null;
      // The shoot test comes from the weapon class (ranged or thrown), as in the reference, not from a caller flag.
      const blowHand = hand === 'L' || hand === 'R' ? hand : leadHand;
      const type = mwAttackType(strike, {
        bow: shootsRatherThanSwings(animWeaponType(built.mwType, sheathed)),
      });
      if (!type) return null;
      attackType = type;
      attackHand = blowHand;
      attackStrength = 1;
      resetIdleOnAttackEnd = true;
      // The hold flag comes from the caller; the in-game bow never holds, so tying it to bows would hang the arm.
      holdWindUp = !!hold;
      upper = UPPER_BODY.AttackWindUp;
      // A blow thrown in the mirror plays the mirror strike's clip, so it keeps the direction the player asked for.
      const inMirror = !!mirrorFor(viewMode, rig(), 0).full;
      attackReversed = type === 'slash' && strikeReversed(inMirror ? mirrorStrike(strike) : strike);
      const k = attackKeys(type, 1, { reversed: attackReversed });
      // The arrow shows as the draw begins even without a shoot attach key; a bow at rest is never nocked.
      if (type === MW_SHOOT_ATTACK && built.arrow) arrowShown = true;
      // A release key this draw has not reached belongs to an earlier shot, so it is cleared here.
      if (type === MW_SHOOT_ATTACK) shootReleased = false;
      if (!playAction(k.windUp.start, k.windUp.stop, 0, attackReversed)) {
        upper = UPPER_BODY.WeaponEquipped;
        attackType = null;
        attackHand = null;
        holdWindUp = false;
        blowPlan = null;
        return null;
      }
      blowPlan = blowPace(blow, k);
      return type;
    },

    climbPosed() { return climbHands && viewMode === 'first' && !held; },
    holdPaper(spec = null, { aspect = 1.6 } = {}) {
      if (!built || !built.ok || viewMode !== 'first') return false;
      const node = built.arm.mats && built.arm.mats.get(built.cameraRef);
      if (!node) return false;
      const s = normaliseHeldPose(spec, held ? held.spec : HELD_POSE_DEFAULT);
      const prev = held;
      held = { spec: s, piece: null, aspect, eye: null, built: prev?.built ?? null, reach0: prev?.reach0 ?? 0 };
      heldMemo = null;
      placeSheet(node);
      return true;
    },
    releasePaper() {
      if (!held) return false;
      if (built && built.ok) {
        built.arm.pieces = built.arm.pieces.filter((p) => p.slot !== 'paper');
        if (held.built === built) built.reach = held.reach0;
      }
      held = null; heldMemo = null;
      if (built && built.ok) { releaseMesh(); packed = null; }
      return true;
    },
    drewLast() { return drewLast; },
    heldPose() { return held ? held.spec : null; },
    holdingPaper() { return !!held; },
    setHeldPose(spec) { return held ? api.holdPaper(spec, { aspect: held.aspect }) : false; },
    paperCorners() {
      if (!held || !lastFrame || !mesh) return null;
      return projectPaperCorners(held.piece.positions, lastFrame, lastFrame.rect);
    },

    setHands({ mode = 'single', lead = 'R' } = {}) {
      handsMode = mode === 'fists' || mode === 'dual' ? mode : 'single';
      leadHand = lead === 'L' ? 'L' : 'R';
    },
    setSpellHand(on) { spellHand = !!on; if (!spellHand) spellInHand = false; },
    setRunHands(wanted, { speed = 0, phase = null } = {}) {
      runPump.wanted = !!wanted;
      runPump.speed = Number.isFinite(speed) ? speed : 0;
      runPump.given = Number.isFinite(phase) ? phase : null;
    },
    runPosed() { return viewMode === 'first' && runPump.w >= 0.5 && !held && !climbHands; },
    handsState() {
      const arm = built && built.ok ? built.arm : null;
      const plan = arm && arm.mats && arm.fns ? mirrorPlan(arm.skeleton, GRAPH_ROOT, arm.fns.skelMats) : null;
      const wrist = (s) => (plan && plan.hands[s] != null ? arm.mats.get(plan.hands[s])?.t?.slice() ?? null : null);
      return {
        mode: handsMode, lead: leadHand, attackHand, offKey, offWeapon: arm ? built.offWeapon ?? null : null,
        pair: pairHeld(),
        composed: mirrorCarry[viewMode]?.key ?? null,
        guard: { ...pairGuard },
        guardDrop: guardDipMemo && guardDipMemo.of === built ? { ...guardDipMemo.drop } : null,
        spread: pairSpread, spreadInner: spreadMemo && spreadMemo.of === built ? { ...spreadMemo.inner } : null,
        offPieces: arm ? arm.pieces.filter((p) => p.slot === 'offweapon').length : 0,
        offHidden: mesh && mesh.ranges ? mesh.ranges.filter((r) => r.slot === 'offweapon').map((r) => !!r.hidden) : [],
        mirrored: arm ? arm.mirrored ?? null : null,
        wrists: { L: wrist('L'), R: wrist('R') }, run: { ...runPump },
      };
    },
    setOffWeapon(item) {
      item = drawnPiece(item);
      if (!built || !built.ok) return false;
      if (busy) { pendingOff = item ?? null; return false; }
      if (built.werewolf) return false;
      const key = item ? fpWeaponKey(item, false) : null;
      if (key === offKey) return false;
      if (key && built.offFailed === key) return false;
      busy = true;
      const token = built;
      token.offFailed = null;
      return (async () => {
        try {
          const d = buildDeps || await import('../scenes/dataSource.js');
          const archives = await d.loadMorrowindArchives();
          if (built !== token) return false;
          const find = (p) => findLoaded(archives, p);
          if (item) await loadFromArchives(archives, weaponPartPaths({ weapon: item, hasAmmo: false, allWeapons: token.allWeapons, has: archiveHas(archives) }));
          const boneOf = (r) => (n) => r.arm.skeleton.byName.has(String(n).toLowerCase());
          const res = resolveOffWeaponParts({ weapon: item, allWeapons: token.allWeapons, find, skeletonBytes: token.skeletonBytes, has: archiveHas(archives), hasBone: boneOf(token) });
          const t = thirdBuilt && thirdBuilt.ok ? thirdBuilt : null;
          const tRes = t ? resolveOffWeaponParts({ weapon: item, allWeapons: token.allWeapons, find, skeletonBytes: t.skeletonBytes, has: archiveHas(archives), hasBone: boneOf(t) }) : null;
          const gen = token.catalog?.gen ?? null;
          for (const [r, parts] of t ? [[token, res.parts], [t, tRes.parts]] : [[token, res.parts]]) {
            r.arm.pieces = r.arm.pieces.filter((p) => p.slot !== 'offweapon');
            bindPartsInto(r.arm, parts);
            const fresh = r.arm.pieces.filter((p) => p.slot === 'offweapon');
            await preloadArmTextures(fresh, archives, gen);
            for (const [file, tex] of collectArmTextures(fresh, archives, gen)) if (!r.textures.has(file)) r.textures.set(file, tex);
            r.pieces = armPieceRows(r.arm.pieces).length;
          }
          token.offWeapon = res.info;
          token.notes = [...(token.notes || []).filter((n) => !/^offweapon[ :@]/.test(n)), ...res.notes];
          if (t) {
            t.offWeapon = tRes.info;
            t.notes = [...(t.notes || []).filter((n) => !/^offweapon[ :@]/.test(n)), ...tRes.notes];
            releaseThirdMesh(); thirdPacked = null;
          }
          releaseMesh();
          packed = null;
          offKey = key;
          if (lastBuildOpts) lastBuildOpts.offWeapon = item ?? null;
          return true;
        } catch (err) {
          const msg = err?.message ?? String(err);
          token.offFailed = key;
          token.notes = [...(token.notes || []).filter((n) => !/^offweapon: the swap /.test(n)), swapFailedNote('offweapon', msg)];
          console.warn(`[mw] left-hand weapon swap failed - ${msg}`);
          return false;
        } finally {
          busy = false;
          for (const fn of listeners) { try { fn(); } catch { } }
          flushPending();
        }
      })();
    },
    setWeaponGlow(spec, item = null) {
      item = drawnPiece(item);
      weaponGlowSpec = spec ?? null;
      if (item !== glowItem) { glowItem = item; glowKey = fpWeaponKey(item, false); }
    },
    weaponGlow() { return glowShown(); },
    setOffWeaponGlow(spec, item = null) {
      item = drawnPiece(item);
      offGlowSpec = item ? spec ?? null : null;
      if (item !== offGlowItem) { offGlowItem = item; offGlowKey = item ? fpWeaponKey(item, false) : null; }
    },
    offWeaponGlow() { return offGlowShown(); },

    setTorch(lit) {
      const want = !!lit;
      if (!built || !built.ok) return false;
      if (busy) { pendingTorch = want; return false; }
      if (built.werewolf) { if (lastBuildOpts) lastBuildOpts.torch = want; return false; }
      if (torchLit === want) return false;
      torchLit = want;
      if (lastBuildOpts) lastBuildOpts.torch = want;
      // A bind that failed once on this rig is remembered, so lighting up again does not reopen the archives.
      if (!want || built.torch || built.torchTried || !pickTorchRecord(built.allLights)) {
        refreshTorch(true);
        for (const fn of listeners) { try { fn(); } catch { } }
        return true;
      }
      busy = true;
      const token = built;
      return (async () => {
        try {
          const d = buildDeps || await import('../scenes/dataSource.js');
          const archives = await d.loadMorrowindArchives();
          if (built !== token) return false;
          const find = (p) => findLoaded(archives, p);
          await loadFromArchives(archives, torchPartPaths({ torch: true, allLights: token.allLights, has: archiveHas(archives) }));
          const resolveFor = (rigBuilt) => resolveTorchPart({ torch: true, allLights: token.allLights, find, skeletonBytes: rigBuilt.skeletonBytes, has: archiveHas(archives) });
          const tRig = thirdBuilt && thirdBuilt.ok ? thirdBuilt : null;
          const fpResolved = resolveFor(token);
          const tpResolved = tRig ? resolveFor(tRig) : null;
          const gen = token.catalog?.gen ?? null;
          const bindTorch = async (rigBuilt, resolved) => {
            rigBuilt.arm.pieces = rigBuilt.arm.pieces.filter((p) => p.slot !== 'torch');
            rigBuilt.arm.effects = (rigBuilt.arm.effects ?? []).filter((e) => e.slot !== 'torch');
            bindPartsInto(rigBuilt.arm, resolved.parts);
            const fresh = [...rigBuilt.arm.pieces.filter((p) => p.slot === 'torch'), ...rigBuilt.arm.effects.filter((e) => e.slot === 'torch')];
            await preloadArmTextures(fresh, archives, gen);
            for (const [file, tex] of collectArmTextures(fresh, archives, gen)) {
              if (!rigBuilt.textures.has(file)) rigBuilt.textures.set(file, tex);
            }
            rigBuilt.torch = resolved.torchInfo;
            rigBuilt.torchTried = true;
            rigBuilt.notes = [...(rigBuilt.notes || []).filter((n) => !/^torch[ :]/.test(n)), ...resolved.notes];
            rigBuilt.pieces = armPieceRows(rigBuilt.arm.pieces).length;
          };
          await bindTorch(token, fpResolved);
          if (tRig) await bindTorch(tRig, tpResolved);
          releaseMesh(); packed = null;
          releaseThirdMesh(); thirdPacked = null;
          refreshTorch(true);
          return true;
        } catch (err) {
          // The flag stays lit, so the per-frame caller does not ask again; dousing and relighting retries.
          const msg = err?.message ?? String(err);
          token.notes = [...(token.notes || []).filter((n) => !/^torch: the light /.test(n)), `torch: the light could not be hung - ${msg}`];
          console.warn(`[mw] torch bind failed - ${msg}`);
          return false;
        } finally {
          busy = false;
          for (const fn of listeners) { try { fn(); } catch { } }
          flushPending();
        }
      })();
    },

    setHipLight(lit) {
      const want = !!lit;
      if (!built || !built.ok) return false;
      if (busy) { pendingHipLight = want; return false; }
      if (built.werewolf) { if (lastBuildOpts) lastBuildOpts.hipLight = want; return false; }
      if (hipLit === want) return false;
      hipLit = want;
      if (lastBuildOpts) lastBuildOpts.hipLight = want;
      if (want) hipLantern.reset();
      const tRig = thirdBuilt && thirdBuilt.ok ? thirdBuilt : null;
      if (!want || !tRig || tRig.hipLight || tRig.hipLightTried || !pickLanternRecord(built.allLights)) {
        for (const fn of listeners) { try { fn(); } catch { } }
        return true;
      }
      busy = true;
      const token = built;
      return (async () => {
        try {
          const d = buildDeps || await import('../scenes/dataSource.js');
          const archives = await d.loadMorrowindArchives();
          if (built !== token || thirdBuilt !== tRig) return false;
          const find = (p) => findLoaded(archives, p);
          await loadFromArchives(archives, hipLanternPartPaths({ hipLight: true, allLights: token.allLights, has: archiveHas(archives) }));
          const resolved = resolveHipLanternPart({ hipLight: true, allLights: token.allLights, find, skeletonBytes: tRig.skeletonBytes, has: archiveHas(archives), hasBone: (b) => tRig.arm.skeleton.byName.has(String(b).toLowerCase()) });
          const gen = token.catalog?.gen ?? null;
          tRig.arm.pieces = tRig.arm.pieces.filter((p) => p.slot !== HIP_LIGHT_SLOT);
          tRig.arm.effects = (tRig.arm.effects ?? []).filter((e) => e.slot !== HIP_LIGHT_SLOT);
          bindPartsInto(tRig.arm, resolved.parts);
          tRig.hipHang = hangHipLight(tRig.arm);
          const fresh = [...tRig.arm.pieces.filter((p) => p.slot === HIP_LIGHT_SLOT), ...tRig.arm.effects.filter((e) => e.slot === HIP_LIGHT_SLOT)];
          await preloadArmTextures(fresh, archives, gen);
          for (const [file, tex] of collectArmTextures(fresh, archives, gen)) {
            if (!tRig.textures.has(file)) tRig.textures.set(file, tex);
          }
          tRig.hipLight = tRig.hipHang ? resolved.hipInfo : null;
          tRig.hipLightTried = true;
          tRig.notes = [...(tRig.notes || []).filter((n) => !/^hiplight[ :]/.test(n)), ...resolved.notes];
          tRig.pieces = armPieceRows(tRig.arm.pieces).length;
          releaseThirdMesh(); thirdPacked = null;
          return true;
        } catch (err) {
          const msg = err?.message ?? String(err);
          tRig.notes = [...(tRig.notes || []).filter((n) => !/^hiplight: the lantern /.test(n)), `hiplight: the lantern could not be hung - ${msg}`];
          console.warn(`[mw] hip lantern bind failed - ${msg}`);
          return false;
        } finally {
          busy = false;
          for (const fn of listeners) { try { fn(); } catch { } }
          flushPending();
        }
      })();
    },

    readySpell(ready) {
      const want = !!ready;
      if (!built || !built.ok || (want && built.werewolf)) return false;
      if (spellHand) return spellHandReady(want);
      // No stance flips during an equip or unequip, as in the reference, since their keys belong to that group.
      if (upper === UPPER_BODY.Equipping || upper === UPPER_BODY.Unequipping) return false;
      if (want) unreadyAfterCast = false;
      if (spellReady === want) return false;
      // Daggerfall clears the readied spell at the release, so a cast in flight finishes before the stance drops.
      if (!want && upper === UPPER_BODY.Casting) { unreadyAfterCast = true; return false; }
      spellReady = want;
      refreshWeaponGroup();
      resetIdle();
      resetMovement();
      return true;
    },

    hurt(roll = 0) {
      if (!built || !built.ok || dead || hitState) return false;
      const g = chooseRandomGroup('hit', roll);
      const pick = g ? pickAnimSource(rig().sources, g, resetClip, {}) : null;
      if (!pick) return false;
      hitState = pick.state; hitSource = pick.source;
      return true;
    },

    die(roll = 0, { startPoint = 0 } = {}) {
      if (!built || !built.ok) return false;
      const g = chooseRandomGroup('death', roll);
      const pick = g ? pickAnimSource(rig().sources, g, resetClip, { startPoint, loopCount: 0 }) : null;
      dead = true;
      actionState = null; actionSource = null; holdWindUp = false; attackType = null; blowPlan = null;
      upper = sheathed ? UPPER_BODY.None : UPPER_BODY.WeaponEquipped;
      movementState = null; movementSource = null; movementGroup = null;
      jumpState = null; jumpSource = null; jumpKind = null;
      hitState = null; hitSource = null;
      idleState = null; idleSource = null; idleGroup = null;
      deathState = pick ? pick.state : null; deathSource = pick ? pick.source : null;
      return !!pick;
    },

    revive() {
      if (!dead && !deathState) return;
      dead = false; deathState = null; deathSource = null; hitState = null; hitSource = null;
      refreshIdle(true);
    },

    isDead: () => dead,

    // The key pair follows the spell range (self, touch, or target); a missing clip only adds a note.
    castSpell(rangeType = 2, rate = 1, releaseIn = 0) {
      castPaced = false;
      if (dead) return false;
      if (nonBiped()) return creatureAttack(++creatureCasts, null) !== null;
      if (!built || !built.ok || built.werewolf) return false;
      // A sheathed arm casts too: the cast plays from None and stepUpper returns the arm to None.
      if (upper === UPPER_BODY.AttackEnd) endAttack();
      if (upper !== UPPER_BODY.WeaponEquipped && upper !== UPPER_BODY.Casting && !(upper === UPPER_BODY.None && sheathed)) return false;
      // A caster-only spell is readied and cast in one call, so the cast latches its own stance before it plays.
      if (!spellReady) { spellReady = true; refreshWeaponGroup(); resetIdle(); resetMovement(); }
      const type = spellAttackType(rangeType);
      attackType = type;
      castReleased = false;
      castRate = validCastRate(rate);
      unreadyAfterCast = false;
      attackReversed = false;
      attackStrength = 1;
      resetIdleOnAttackEnd = true;
      const from = upper;
      upper = UPPER_BODY.Casting;
      if (!playAction(`${type} start`, `${type} stop`, 0)) {
        upper = from;
        attackType = null;
        return false;
      }
      const lead = releaseIn > 0 ? keyTime(`${type} release`) - actionState.startTime : 0;
      if (lead > 0) { castRate = blowRate(lead, releaseIn); castPaced = true; }
      return true;
    },

    castPaced: () => castPaced,

    castHands(spell) {
      if (!built || !built.ok || upper !== UPPER_BODY.Casting) return false;
      spawnCastHands(spell);
      return true;
    },

    mwMagicCatalog() { return built && built.ok && built.catalog?.magic?.effects?.size ? built.catalog : null; },
    castFxCount() { return castFx.length; },

    takeCastRelease() {
      if (!castReleased) return false;
      castReleased = false;
      return true;
    },

    castInFlight() { return !!built && built.ok && upper === UPPER_BODY.Casting; },

    // The flag is consumed on read; an arm that is not driving returns false, so the rig uses the classic frame.
    takeShootRelease() {
      if (!shootReleased) return false;
      shootReleased = false;
      return true;
    },

    // The rig starts no shot while this returns true, so one click is one draw and one arrow.
    shotBusy() {
      if (!built || !built.ok) return false;
      return upper === UPPER_BODY.Equipping || upper === UPPER_BODY.AttackWindUp || upper === UPPER_BODY.AttackRelease;
    },

    release() {
      if (upper !== UPPER_BODY.AttackWindUp) return false;
      holdWindUp = false;
      if (actionState && actionState.playing) return true;
      beginRelease();
      return true;
    },

    // Per frame: synchronous, no await, and no allocation after the first pack. With pose false the clocks step but
    // the skin does not; the caller banks the skipped dt and passes it as effectsDt.
    update(dt, { pose = true, effectsDt = dt } = {}) {
      if (!built || !built.ok || !renderer) return;
      partClock += dt;
      const cam = seatedCamera(camera && camera());
      sneaking = !!(cam && cam.sneaking);
      const climbWorld = climbLaw.update(dt, (cam && cam.climb) || null);
      climbHands = climbWorld.w >= 0.5 && !!(cam && cam.climb);
      stepRunPump(dt);
      stepPairGuard(dt);
      stepPairSpread(dt);
      // The weapon state steps first, then movement, and the idle last, as in the reference. Each clip advances
      // against the text keys of its own source.
      if (actionState) {
        // The weapon record's speed scales only the three attack sections, as in the reference.
        const attacking = upper === UPPER_BODY.AttackWindUp
          || upper === UPPER_BODY.AttackRelease || upper === UPPER_BODY.AttackEnd;
        const striking = blowWeaponOf({ hand: attackHand, weapon: built.weapon, offWeapon: built.offWeapon });
        const weapSpeed = attacking && striking && Number.isFinite(striking.speed)
          ? striking.speed : 1;
        const paced = attacking && blowPlan;
        if (paced) blowPlan.clock += dt;
        // A cast plays at its own rate, where the reference plays the spellcast group at 1.
        const speed = paced ? blowPlan.rate : upper === UPPER_BODY.Casting ? castRate : weapSpeed;
        advanceClip(actionState, (actionSource || rig()).keys, dt * speed, onActionKey);
        noteWeaponClock();
        stepUpper();
      }
      if (hitState) { advanceClip(hitState, (hitSource || rig()).keys, dt, null); if (!hitState.playing) { hitState = null; hitSource = null; } }
      if (deathState) advanceClip(deathState, (deathSource || rig()).keys, dt, null);
      // The jump refreshes before movement, in the reference order, and its inJump gates the movement ladder.
      const inJump = refreshJump((cam && cam.move) || null);
      refreshMovement(cam, dt, inJump);
      if (movementState) advanceClip(movementState, (movementSource || rig()).keys, dt * movementRate, null);
      if (jumpState) advanceClip(jumpState, (jumpSource || rig()).keys, dt, null);
      if (idleState) advanceClip(idleState, (idleSource || rig()).keys, dt, null);
      refreshIdle();
      refreshTorch();
      if (torchState) advanceClip(torchState, (torchSource || rig()).keys, dt, null);
      aimFactor = aimingFactor(aimFactor, accurateAiming(upper), dt);
      motion.step(dt, motionWord({
        cam, third: viewMode === 'third', rig: thirdBuilt, built, dead, hit: !!hitState && !actionState, climb: climbWorld.w, upper: UPPER_BODY_NAME[upper],
        attackType, reversed: attackReversed, hand: attackHand, progress: actionState ? clipCompletion(actionState) : 0, strength: attackStrength,
        shown: weaponInHand(), hands: handsMode, torch: torchVisible(), spell: spellStance(), spellHand: spellHand && spellInHand, guard: pairDip(),
      }));
      if (!actionState && !movementState && !jumpState && !idleState && !hitState && !deathState) return;
      const state = deathState || actionState || hitState || movementState || jumpState || idleState;
      posedGroup = state.group;
      // The tracks come from the same file as the winning clip; another file's tracks would give a bind pose.
      poseSource = deathState ? deathSource : actionState ? actionSource : hitState ? hitSource : (movementState ? movementSource : (jumpState ? jumpSource : idleSource));
      // The pitch must be in the pose before any matrix is composed, because the camera node hangs off the neck.
      // The third-person body takes no neck pitch or sneak delta, which are first-person rules.
      if (viewMode === 'third') {
        const t = thirdBuilt;
        if (!t || !t.ok) return;
        const tBase = poseSource ? poseSource.trackMap : t.tracks;
        const tOverlay = torchState && torchSource && !deathState && t.leftArm && t.leftArm.size;
        if (tOverlay) overlayClock = torchState.time;
        if (hipVisible() && thirdBuilt.hipHang) hipLantern.step(cam, dt, motion.stride().move > 0.5 ? motion.stride().phase : movementState ? clipCompletion(movementState) % 1 : null, thirdBuilt.hipHang.rot, motion.stride().hipYaw);
        if (pose) {
          posePartClocks(t.arm, weaponClockValue(), { frameTime: partClock });
          poseAssembly(t.arm, {
            tracks: tOverlay ? overlayFor(tBase, t.leftArm) : tBase,
            sampleTrack: tOverlay ? overlaySample : sampleTrack,
            time: poseTime(state),
            accumRoot: t.accumRoot,
            climb: thirdClimb(climbWorld, cam),
            mirror: mirrorFor('third', t, dt),
            motion: motion.slot,
            aim: cam?.pitch && upper > UPPER_BODY.WeaponEquipped ? spineAimSlot(-cam.pitch * spinePitchFactor({ upper: UPPER_BODY_NAME[upper], weaponType: stanceOf(), group: weaponGroup, time: actionState ? actionState.time : -1, startTime: keyTime(attackKeys(attackType).windUp.start), minAttackTime: keyTime(attackKeys(attackType).minAttack), completion: clipCompletion(actionState) })) : null,
            skin: !thirdSkinReady(t),
          });
          uploadThirdMesh(t);
          stepRigEffects(t.arm, { dt: effectsDt, clock: tOverlay ? overlayClock : poseTime(state), renderer, mesh: thirdMesh, textures: t.textures, hidden: effectHidden });
          stepCastFx('third', t.arm, thirdMesh, effectsDt);
          frames++;
        }
        if (!thirdMesh) return;
        for (const r of thirdMesh.ranges) {
          if (r.slot === 'weapon') r.hidden = !weaponInHand() || climbHands;
          else if (r.slot === 'offweapon') r.hidden = !offShown(t) || climbHands;
          else if (r.slot === 'arrow') r.hidden = !arrowShown;
          else if (r.slot === 'torch') r.hidden = !torchVisible();
          else if (r.slot === HIP_LIGHT_SLOT) r.hidden = !hipVisible();
          else if (HOLSTER_SLOTS.includes(r.slot)) r.hidden = holsterHidden(r.slot, weaponShown, { arrowShown, tag: r.piece?.tag });
        }
        return;
      }
      const fBase = poseSource ? poseSource.trackMap : built.tracks;
      const fOverlay = torchState && torchSource && !deathState && built.leftArm && built.leftArm.size;
      if (fOverlay) overlayClock = torchState.time;
      let fTracks = fOverlay ? overlayFor(fBase, built.leftArm) : fBase;
      let fSampler = fOverlay ? overlaySample : sampleTrack;
      if (held) {
        const node = built.arm.mats && built.arm.mats.get(built.cameraRef);
        if (!node) { held = null; heldMemo = null; }
        else if (!built.arm.pieces.includes(held.piece)) placeSheet(node);
        else if (node.t[0] !== held.eye[0] || node.t[1] !== held.eye[1] || node.t[2] !== held.eye[2]) placeSheet(node);
      }
      if (held) {
        const hm = heldTracksFor(fTracks, fSampler);
        fTracks = hm.tracks; fSampler = hm.sampler;
      }
      const fClimb = held ? null : firstClimb(climbWorld, cam);
      posePartClocks(built.arm, weaponClockValue(), { frameTime: partClock });
      poseAssembly(built.arm, {
        tracks: fTracks,
        sampleTrack: fSampler,
        time: poseTime(state),
        climb: fClimb,
        // The run is solved under the climb request, so each wrist blends toward the climb by the climb weight.
        run: firstRun(cam),
        mirror: mirrorFor('first', built, dt),
        accumRoot: built.accumRoot,
        // Negated because the reference's rot[0] counts pitch downward and cam.pitch counts upward. In follow mode
        // the look does not enter the arms pass at all, here or at the lens.
        neckPitch: (followCam || !cam) ? 0 : -(cam.pitch || 0),
        neckAim: followCam ? 1 : aimFactor,
        neckOffset: (() => {
          // Follow mode zeroes the offset at both applications; zeroing one alone would bring the slide back.
          if (followCam) { fpOffset[0] = 0; fpOffset[1] = 0; fpOffset[2] = 0; return null; }
          const sneak = sneakOffset(sneaking, built.sneakDelta);
          const bobZ = cam && cam.bob ? (cam.bob[1] || 0) * MW_UNITS_PER_METER : 0;
          fpOffset = [sneak[0], sneak[1], sneak[2] + bobZ];
          return fpOffset;
        })(),
      });
      packed = packFpArm(built.arm.pieces, packed);
      if (!mesh) {
        mesh = renderer.createCharacterMesh(packed.packed, { uv: true });
        mesh.ranges = packed.ranges;
        hangRangeTextures(mesh.ranges, built.textures, { skin: bodySkin() });
      } else {
        renderer.updateCharacterMesh(mesh, packed.packed);
      }
      stepRigEffects(built.arm, { dt, clock: fOverlay ? overlayClock : poseTime(state), renderer, mesh, textures: built.textures, hidden: effectHidden });
      stepCastFx('first', built.arm, mesh, dt);
      // The reference removes a hidden weapon part; here a range flag hides the vertices, so the ranges survive.
      for (const r of mesh.ranges) {
        if (r.slot === 'weapon') r.hidden = !weaponInHand();
        else if (r.slot === 'offweapon') r.hidden = !offShown(built);
        else if (r.slot === 'arrow') r.hidden = !arrowShown;
        else if (r.slot === 'torch') r.hidden = !torchVisible();
        else if (r.slot === 'paper') r.hidden = !held;
        if (held && (r.slot === 'weapon' || r.slot === 'arrow' || r.slot === 'torch')) r.hidden = true;
        if (climbHands && (r.slot === 'weapon' || r.slot === 'arrow' || r.slot === 'torch')) r.hidden = true;
        if ((held || climbHands) && r.slot === 'offweapon') r.hidden = true;
      }
      frames++;
    },

    draw(canvas) {
      drewLast = false;
      if (!active() || !canvas) return false;
      const cam = camera();
      if (!cam) return false;
      const pixel = mwModelPixel();
      const wantW = canvas.clientWidth / pixel;
      const wantH = canvas.clientHeight / pixel;
      const spare = screenTransform ? 1 : 0;
      const edge = renderer.charSpriteRoom?.(Math.ceil(Math.max(wantW, wantH)) + spare) ?? CHAR_SPRITE_RT_SIZE;
      const s = Math.min(1, (edge - spare) / wantW, (edge - spare) / wantH);
      const pw = Math.max(2, Math.round(wantW * s));
      const ph = Math.max(2, Math.round(wantH * s));

      const eye = firstPersonEye(built.arm.mats, built.cameraRef);
      if (!eye) return false;
      eye[0] += fpOffset[0];
      eye[1] += fpOffset[2];
      eye[2] -= fpOffset[1];
      const pitch = followCam ? 0 : (cam.pitch || 0);
      const fwd = [0, Math.sin(pitch), -Math.cos(pitch)];
      const lens = lookAt(eye, [eye[0] + fwd[0], eye[1] + fwd[1], eye[2] + fwd[2]], [0, 1, 0]);
      // Recoil and reload move the whole viewmodel in front of the lens, not the neck, so follow mode shows them.
      const view = lens;

      // No mirror: this pass is chirality-true, so the right hand of the actor lands at screen right.
      const near = Math.max((built.idleReach ?? built.reach) / 200, 1e-4);
      const far = built.reach * 4;
      const hh = near * Math.tan(FP_FIELD_OF_VIEW / 2);
      const hw = hh * (pw / ph);
      const W = canvas.clientWidth || canvas.width, H = canvas.clientHeight || canvas.height;
      const rect = screenTransform ? screenTransform({ x: 0, y: 0, w: W, h: H }) : null;
      if (rect && !(rect.w > 0 && rect.h > 0)) return false;
      const win = rect ? fpFrameWindow(rect, W, H, pw, ph, edge) : null;
      const fw = win ? win.nx : pw, fh = win ? win.ny : ph;
      const px = (2 * hw) / pw, py = (2 * hh) / ph;
      const proj = win ? frustum(-hw + win.k0 * px, -hw + (win.k0 + fw) * px, hh - (win.r0 + fh) * py, hh - win.r0 * py, near, far) : perspective(FP_FIELD_OF_VIEW, pw / ph, near, far);
      const vmLight = fpLightingOn() ? (renderer.flatLightAt?.() ?? null) : null;
      lastFrame = { model: NIF_TO_PASS, view, proj, rect: win ? win.dst : { x: 0, y: 0, w: W, h: H } };
      drewLast = true;
      mesh.offWeaponGlow = offGlowShown();
      mesh.weaponGlow = glowShown();
      mesh.glowUnit = glowUnit(ph);
      const tex = renderer.renderCharacterSprite(mesh, NIF_TO_PASS, proj, view, fw, fh, { lensLocal: true, viewmodelLight: vmLight });
      if (win) {
        renderer.drawScreenQuad(tex, win.dst, { u0: 0, v0: fh / edge, u1: fw / edge, v1: 0 });
        return true;
      }
      renderer.drawScreenOverlayQuad(tex, pw / edge, ph / edge);
      return true;
    },

    // The action slot empties, the stance re-resolves on the new rig, and weaponShown and sheathed carry over.
    setViewMode(mode) {
      const want = mode === 'third' ? 'third' : 'first';
      if (want === viewMode) return true;
      if (want === 'third' && standIn) return false;
      if (want === 'first' && built && built.creature) return false;
      if (want === 'third' && !(thirdBuilt && thirdBuilt.ok)) {
        notes.push(`view: no third-person body - ${thirdBuilt ? `${thirdBuilt.stage}: ${thirdBuilt.error}` : 'not built'}`);
        return false;
      }
      viewMode = want;
      actionState = null; actionSource = null; attackType = null; holdWindUp = false;
      attackHand = null;
      mirrorCarry.first = {}; mirrorCarry.third = {};
      resetMovement();
      resetJump();
      if (upper !== UPPER_BODY.None && upper !== UPPER_BODY.WeaponEquipped) {
        upper = weaponShown ? UPPER_BODY.WeaponEquipped : UPPER_BODY.None;
      }
      refreshWeaponGroup();
      resetIdle();
      refreshTorch(true);
      return true;
    },
    viewMode: () => viewMode,
    followCamera: () => followCam,
    setScreenTransform(fn) { screenTransform = typeof fn === 'function' ? fn : null; },
    screenTransform: () => screenTransform,
    setFollowCamera(v) {
      followCam = !!v;
      try { appStorage()?.setItem(FOLLOW_CAMERA_KEY, followCam ? 'true' : 'false'); } catch { }
      return followCam;
    },
    thirdActive,
    torchShown: () => torchVisible(),
    upperBodyReady: () => !busy && !actionState
      && (upper === UPPER_BODY.None || upper === UPPER_BODY.WeaponEquipped),
    canThirdPerson: () => !standIn && !!(thirdBuilt && thirdBuilt.ok),
    shoulderStance: () => (spellReady || !sheathed ? 'combat' : camera?.()?.move?.swimming ? 'swimming' : null),
    setStandIn(v) { const was = standIn; standIn = !!v; return was !== standIn; },
    standingIn: () => standIn,
    wolfStanding: () => !!(built && built.ok && built.werewolf),
    // Bones come from the pose last drawn, not the latest pose; do not keep the result.
    thirdBones(names) {
      if (!thirdActive() || !thirdBuilt) return null;
      const arm = thirdBuilt.arm, drawn = drawnArm === arm ? drawnMats : null;
      return armBonesInBody(drawn ? { skeleton: arm.skeleton, mats: drawn } : arm, names, built && built.raceScale);
    },

    raceHeightScale: () => (built && built.ok && built.raceScale ? built.raceScale.height : 1),
    bodyHeight: () => (built && built.ok && built.creature && built.creature.height > 0 ? built.creature.height : null),

    drawThird(canvas, { proj, view, eye, feet, yaw, hitFlash = 0, conceal = null, grow = 1, up = null, fx = null, cast = false, anchored = false, horse = null }) {
      if (!thirdActive() || !canvas || !feet) return false;
      const t = thirdBuilt;
      const u = thirdUnit(grow);
      const rs = (built && built.raceScale) || { weight: 1, height: 1 };
      const model = thirdModel(feet, yaw, grow);
      drawnArm = t.arm; drawnMats = t.arm.mats;
      const box = thirdBox();
      if (!box) return false;
      const { minX, minY, minZ, maxX, maxY, maxZ } = box;
      const glow = glowShown();
      thirdMesh.weaponGlow = glow;
      const glowLook = glow ? glow.look : null;
      const offGlow = offGlowShown();
      thirdMesh.offWeaponGlow = offGlow;
      const padLooks = offGlow ? [glowLook, offGlow.look].filter(Boolean) : glowLook;
      const halfH = ((maxZ - minZ) * u * rs.height) / 2;
      const halfW = (Math.hypot(maxX - minX, maxY - minY) * u * rs.weight) / 2;
      const center = transformPoint(model, (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
      if (cast && !conceal && renderer.recordShadowBody) castBody(model, center, halfW, halfH, anchored);
      // The sprite anchors on the axis of the actor at body mid-height, so carried gear does not move or shrink it.
      const body = visibleRangeBounds(thirdMesh.ranges, thirdBodyBox, CARRIED_SLOTS);
      const anchor = transformPoint(model, 0, 0, body ? (body.minZ + body.maxZ) / 2 : (minZ + maxZ) / 2);
      if (horse && horse.mesh && horse.model && horse.box) {
        const u = spriteBoxUnion({ center, halfW, halfH }, horse.box);
        drawBodyPicture(renderer, canvas, thirdMesh, model, { ...u, anchor: horse.box.anchor, hitFlash, conceal, up, fx, also: [{ mesh: horse.mesh, model: horse.model }], glowLook: padLooks }, proj, view, eye);
        return true;
      }
      drawBodyPicture(renderer, canvas, thirdMesh, model, { center, halfW, halfH, anchor, hitFlash, conceal, up, fx, glowLook: padLooks }, proj, view, eye);
      return true;
    },

    castThird({ feet, yaw, grow = 1, anchored = false }) {
      if (!thirdActive() || !feet || !renderer || !renderer.recordShadowBody) return false;
      const box = thirdBox();
      if (!box) return false;
      const rs = (built && built.raceScale) || { weight: 1, height: 1 };
      const u = thirdUnit(grow);
      const { minX, minY, minZ, maxX, maxY, maxZ } = box;
      const halfH = ((maxZ - minZ) * u * rs.height) / 2;
      const halfW = (Math.hypot(maxX - minX, maxY - minY) * u * rs.weight) / 2;
      const reach = renderer.shadowReachSphere;
      const mid = Math.hypot(((minX + maxX) / 2) * u * rs.weight, ((minY + maxY) / 2) * u * rs.weight, ((minZ + maxZ) / 2) * u * rs.height);
      if (reach && !renderer.shadowReachSphere(feet[0], feet[1], feet[2], Math.hypot(halfW, halfH) + mid)) return false;
      const model = thirdModel(feet, yaw, grow);
      const center = transformPoint(model, (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
      if (reach && !renderer.shadowReachSphere(center[0], center[1], center[2], Math.hypot(halfW, halfH))) return false;
      castBody(model, center, halfW, halfH, anchored);
      return true;
    },

    itemIcon(item, { size = 96 } = {}) {
      if (!(built && built.ok && built.catalog && renderer) || !item) return null;
      const cat = built.catalog;
      const askKey = `${cat.gen}:${item.group ?? ''}:${item.templateIndex}:${item.material ?? ''}:${item.dye ?? ''}`;
      if (archivesAreLazy(cat.archives) && !iconReady.has(askKey)) {
        preloadIcon(cat, item, askKey);
        return null;
      }
      const dye = (item.group === 'MensClothing' || item.group === 'WomensClothing') ? String(item.dye ?? 0) : '';
      const rec = iconRecordOf(cat, item);
      if (!rec || !rec.model) return null;
      const ckey = `${cat.gen}:${rec.id}:${size}:${dye}`;
      if (ITEM_ICON_CACHE.has(ckey)) return ITEM_ICON_CACHE.get(ckey);
      let img = null;
      try {
        const path = `meshes/${rec.model}`;
        const arc = cat.archives.find((a) => a.has(path));
        if (arc) img = renderGroundMesh(arc.get(path).slice(), cat.archives, cat.gen, size);
      } catch { img = null; }
      ITEM_ICON_CACHE.set(ckey, img);
      return img;
    },

    async mountPicture(item, { px = 256 } = {}) {
      if (!(built && built.ok && built.catalog && renderer) || !item) return null;
      const cat = built.catalog;
      const stamp = api.mountPictureStamp();
      const rec = iconRecordOf(cat, item);
      if (!rec || !rec.model) return null;
      const ckey = `mount:${cat.gen}:${rec.id}:${px | 0}`;
      if (ITEM_ICON_CACHE.has(ckey)) return ITEM_ICON_CACHE.get(ckey);
      if (MOUNT_ASKS.has(ckey)) return MOUNT_ASKS.get(ckey);
      const ask = (async () => {
        const path = `meshes/${rec.model}`;
        await loadFromArchives(cat.archives, [path]);
        const arc = cat.archives.find((a) => a.has(path));
        if (!arc || (typeof arc.loaded === 'function' && !arc.loaded(path))) return null;
        let pic = null;
        try {
          const pieces = flattenNif(parseNif(arc.get(path).slice()));
          await preloadArmTextures(pieces, cat.archives, cat.gen);
          if (api.mountPictureStamp() !== stamp) return null;
          // A texture whose bytes never came would be drawn as the warning color for the whole generation, so
          // nothing is cached: the next ask loads again.
          if (texturesUnread(pieces, cat.archives, cat.gen)) return null;
          pic = renderGroundMesh(pieces, cat.archives, cat.gen, px, { face: true });
        } catch { pic = null; }
        if (pic) pic.key = ckey;
        ITEM_ICON_CACHE.set(ckey, pic);
        return pic;
      })().finally(() => MOUNT_ASKS.delete(ckey));
      MOUNT_ASKS.set(ckey, ask);
      return ask;
    },

    // The stamp is the generation as a string, not the catalog object, since every build makes a new catalog.
    mountPictureStamp() { return built && built.ok && built.catalog ? String(built.catalog.gen) : null; },

    figure({ yaw = 0, height = 384 } = {}) {
      // This needs a built body, not an active wheel, since the inventory opens from first person.
      if (!(built && built.ok && thirdBuilt && thirdBuilt.ok && renderer)) return null;
      const t = thirdBuilt;
      // The portrait poses itself at the stance idle's start from the body sources; the wheel never poses it here.
      const pose = portraitPose(t);
      thirdSkinReady(t);
      if (pose) {
        if (t.hipHang) t.hipHang.rot.set(PLUMB);
        poseAssembly(t.arm, {
          tracks: pose.source.trackMap,
          sampleTrack,
          time: pose.state.startTime,
          accumRoot: t.accumRoot,
          mirror: portraitMirror(),
        });
      }
      uploadThirdMesh(t);
      // A portrait shows what is carried, so a sheathed weapon is drawn; the arrow still follows its shoot keys.
      for (const r of thirdMesh.ranges) {
        if (r.slot === 'weapon') r.hidden = false;
        else if (r.slot === 'offweapon') r.hidden = !(handsMode === 'dual' && t.offWeapon);
        else if (r.slot === 'arrow') r.hidden = !arrowShown;
        else if (r.slot === 'torch') r.hidden = !torchLit;
        else if (r.slot === HIP_LIGHT_SLOT) r.hidden = !hipLit;
        else if (HOLSTER_SLOTS.includes(r.slot)) r.hidden = holsterHidden(r.slot, true, { arrowShown, tag: r.piece?.tag });
      }
      const u = 1 / MW_UNITS_PER_METER;
      const rs = (built && built.raceScale) || { weight: 1, height: 1 };
      const yawDeg = (yaw * 180 / Math.PI) + 180;
      const model = multiply(trs(0, 0, 0, 0, yawDeg, 0, -u * rs.weight, u * rs.height, u * rs.weight), NIF_TO_PASS);
      const win = portraitWindow(thirdMesh.ranges, model, figureBodyBox);
      if (!(win && win.halfW > 0 && win.halfH > 0)) return null;
      const halfH = win.halfH * 1.06;
      const halfW = win.halfW * 1.06;
      const center = win.center;
      const ph = Math.min(CHAR_SPRITE_RT_SIZE, Math.max(2, Math.round(height)));
      const pw = Math.min(CHAR_SPRITE_RT_SIZE, Math.max(2, Math.round(ph * halfW / halfH)));
      const eye = [center[0], center[1], center[2] + 4];
      const view = lookAt(eye, center, [0, 1, 0]);
      return renderer.renderCharacterSpriteImage(thirdMesh, model, ortho(halfW, halfH, 0.1, 8), view, pw, ph);
    },

    status() {
      return {
        active: active(),
        reason: active() ? 'built' : reason,
        skeletonPath: built && built.skeletonPath,
        pieces: built && built.ok ? built.pieces : 0,
        rows: built && built.rows,
        notes: built && built.notes,
        binding: built && built.binding,
        weapon: built && built.ok ? built.weapon : null,
        spellReady,
        casting: upper === UPPER_BODY.Casting,
        weaponInHand: weaponInHand(),
        unreadyAfterCast,
        raceScale: built && built.ok ? built.raceScale : null,
        worn: built && built.ok ? built.worn : null,
        face: built && built.ok ? built.face : null,
        esm: built && built.esm ? built.esm : null,
        cameraBone: built && built.ok ? built.cameraBone : null,
        reach: built && built.ok ? built.reach : null,
        idleReach: built && built.ok ? built.idleReach ?? null : null,
        clip: built && built.ok ? { start: built.clip.startTime, stop: built.clip.stopTime } : null,
        idleGroup,
        weaponGroup,
        hit: hitState ? { group: hitState.group, time: hitState.time } : null,
        death: deathState ? { group: deathState.group, time: deathState.time, stop: deathState.stopTime } : null,
        dead,
        posedGroup,
        upper,
        upperName: UPPER_BODY_NAME[upper],
        weaponClock: weaponClockValue(),
        aimFactor,
        attackType,
        attackReversed: reversedNow(),
        blow: blowPlan ? { ...blowPlan } : null,
        sheathed,
        sneaking,
        sneakDelta: built && built.ok ? built.sneakDelta : null,
        weaponShown,
        arrowShown,
        arrow: built && built.ok ? built.arrow : null,
        torch: built && built.ok ? built.torch : null,
        torchLit,
        torchShown: torchVisible(),
        torchGroup,
        torchSource: torchSource && torchSource.name,
        hipLight: thirdBuilt && thirdBuilt.ok ? thirdBuilt.hipLight ?? null : null,
        hipLit,
        hipShown: hipVisible(),
        hipSwing: { fore: hipLantern.swing.fore, side: hipLantern.swing.side },
        motion: motion.status(),
        loopsLeft: idleState && Number.isFinite(idleState.loopCount) ? idleState.loopCount : null,
        groups: built && built.ok ? built.groups : null,
        sources: built && built.ok ? built.sourcePaths : null,
        idleSource: idleSource && idleSource.name,
        actionSource: actionSource && actionSource.name,
        movementGroup,
        movementRate: movementState ? +movementRate.toFixed(3) : null,
        movementSource: movementSource && movementSource.name,
        jumpGroup,
        jumpKind,
        jumpSource: jumpSource && jumpSource.name,
        clipNotes: notes.slice(-6),
        time: actionState ? actionState.time : (idleState ? idleState.time : null),
        poseTime: actionState ? poseTime(actionState) : (idleState ? idleState.time : null),
        frames,
        viewMode,
        third: thirdBuilt
          ? (thirdBuilt.ok
            ? { ok: true, pieces: thirdBuilt.pieces, skeletonPath: thirdBuilt.skeletonPath,
                weapon: thirdBuilt.weapon, groups: thirdBuilt.groups ? thirdBuilt.groups.length : 0,
                offWeapon: thirdBuilt.offWeapon ?? null,
                skin: thirdMesh ? (thirdMesh.skin ? 'gpu' : 'cpu') : null }
            : { ok: false, stage: thirdBuilt.stage, error: thirdBuilt.error })
          : null,
      };
    },

    rows: () => (built && built.ok ? armPieceRows(built.arm.pieces).map((r) => ({ ...r })) : null),
    mesh: () => mesh,
    thirdMesh: () => thirdMesh,
    built: () => built,
    trace({ dt = 0.2, steps = 40, loopCount = 2, group = null } = {}) {
      if (!built || !built.ok) return null;
      const s2 = resetClip(built.keys, group || idleGroup, { loopCount, loopFallback: true });
      if (!s2.ok) return null;
      const out = [];
      for (let i = 0; i < steps && s2.playing; i++) {
        advanceClip(s2, built.keys, dt, null);
        poseAssembly(built.arm, {
          tracks: built.tracks, sampleTrack, time: s2.time, accumRoot: built.accumRoot,
        });
        const rh = armPieceRows(built.arm.pieces).find((r) => r.bone === 'right hand');
        out.push({
          time: s2.time,
          playing: s2.playing,
          loopStartTime: s2.loopStartTime,
          loopStopTime: Number.isFinite(s2.loopStopTime) ? s2.loopStopTime : null,
          rightHandMaxX: rh && rh.bounds ? rh.bounds.maxX : null,
        });
      }
      return out;
    },
  };
  return api;
}

export const fpArm = createFpArm();

export const _skinPainted = (image, skin, use) => !!SKINNED_MIPS.get(image)?.has(skinUseKey(skin, use));
