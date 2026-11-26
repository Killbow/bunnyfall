// @ts-check
import { PrefabNode, instantiatePrefab, prefabShapeStamp } from '../../world/prefabNode.js';
import { applyRuntimeMaterials, bundleSlots, dfMaterial, gameTextureFromName } from './comeSailAwayModels.js';
import { createAnimator } from '../../world/unityAnimator.js';
import { instanceParticleSystems } from '../../world/unityParticles.js';
import { HULL_NAMES, HULL_PRICES, HULL_WEIGHTS, VARIANT_NAMES, PACKED_WEIGHT_MAX, packedHullWeight } from './comeSailAwayHulls.js';

export const FIRST_HULL_MODEL_ID = 112410;
export const TRIGGER_MODEL = Object.freeze({ drive: 112400, board: 112401, cargo: 112402, door: 112403, variant: 112404, status: 112405, position: 112406 });
export { HULL_NAMES, HULL_PRICES, HULL_WEIGHTS, VARIANT_NAMES };
export { PACKED_WEIGHT_MAX, packedHullWeight };
export const HULL_VARIANT_COUNTS = Object.freeze([0, 7, 0, 0, 0]);
export const SAIL_ANIMATION_SPEED = 2;
export const AUDIO_CLIPS = Object.freeze(['SmallShipAmbience', 'ShipExteriorAmbience2', 'Oars_In', 'Oars_Sweep', 'Oars_Out']);
export const ARCHIVE_START = '-', RECORD_START = '_', ALIGNMENT_START = ':';
export const BED_MODEL_ID = 41000;
export const FIRE_OBJECT_FLAT = Object.freeze([210, 1]);
export const LIGHT_ARCHIVE = 210;
export const LANTERN_LIGHT = Object.freeze({ color: Object.freeze([1, 147 / 255, 41 / 255, 1]), intensity: 1, range: 20, lightType: 'Point', shadows: 'Hard', shadowStrength: 1, spotAngle: 140 });
export const DUNGEON_LIGHT_HANDLER = Object.freeze({ unscaledBlockRange: 2060, updateInSeconds: 0.4 });
export const NEW_GAME_OBJECT = 'New Game Object';
export const CARGO_CONTAINER_IMAGE = 6;

const V_UP = [0, 1, 0];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];

export class Boat {
  constructor(hullTarget = 0, variantTarget = 0) {
    this.hull = hullTarget;
    this.variant = variantTarget;
    this.uid = 0;
    this.packable = false;
    this.crewed = false;
    this.itemValue = null;
    this.groundAsked = false;
    /** @type {any} */ this.charter = null;
    this.way = 0;
    this.modifierMoveSpeedOar = 0; this.modifierMoveAccelerationOar = 0;
    this.modifierMoveSpeedSail = 0; this.modifierMoveAccelerationSail = 0;
    this.modifierTurnSpeedOar = 0; this.modifierTurnAccelerationOar = 0;
    this.modifierTurnSpeedSail = 0; this.modifierTurnAccelerationSail = 0;
    this.modifierAnimation = 0; this.modifierRudder = 0;
    this.modifierAudioVolume = 0; this.modifierAudioRange = 0; this.modifierAudioSpatialBlend = 0;
    this.modifierCargoThreshold = 0;
    /** @type {PrefabNode|null} */ this.GameObject = null;
    /** @type {PrefabNode|null} */ this.MeshObject = null;
    this.MeshObjectOffset = [0, 0, 0];
    /** @type {any} */ this.MeshCollider = null;
    /** @type {PrefabNode|null} */ this.FireObject = null;
    /** @type {PrefabNode|null} */ this.BedObject = null;
    /** @type {PrefabNode[]} */ this.BoardTriggers = [];
    /** @type {PrefabNode[]} */ this.DoorTriggers = [];
    /** @type {PrefabNode|null} */ this.DriveTrigger = null;
    /** @type {PrefabNode|null} */ this.DrivePosition = null;
    /** @type {PrefabNode|null} */ this.CargoTrigger = null;
    /** @type {PrefabNode|null} */ this.StatusTrigger = null;
    /** @type {PrefabNode|null} */ this.PositionTrigger = null;
    /** @type {PrefabNode|null} */ this.VariantTrigger = null;
    /** @type {PrefabNode|null} */ this.VariantObject = null;
    /** @type {PrefabNode|null} */ this.WakeObject = null;
    /** @type {any} */ this.WakeEmitter = null;
    /** @type {any} */ this.WakeEmitterMain = null;
    /** @type {PrefabNode|null} */ this.FlagObject = null;
    /** @type {any} */ this.FlagEmitter = null;
    /** @type {any} */ this.FlagEmitterMain = null;
    /** @type {PrefabNode|null} */ this.RudderObject = null;
    /** @type {any} */ this.RudderAnimator = null;
    /** @type {any[]} */ this.RudderEmitters = [];
    /** @type {PrefabNode|null} */ this.ActiveObject = null;
    /** @type {PrefabNode|null} */ this.IdleObject = null;
    /** @type {(PrefabNode|null)[]} */ this.Nodes = [null, null, null, null, null];
    this.NodeTileMapIndices = [0, 0, 0, 0, 0];
    /** @type {PrefabNode[]} */ this.Booms = [];
    /** @type {PrefabNode[]} */ this.Sails = [];
    /** @type {PrefabNode[]} */ this.SailsSquare = [];
    /** @type {PrefabNode[]} */ this.SailsLateen = [];
    /** @type {PrefabNode[]} */ this.SailsGaff = [];
    /** @type {PrefabNode[]} */ this.SailsStay = [];
    /** @type {PrefabNode[]} */ this.SailsSmall = [];
    /** @type {PrefabNode[]} */ this.SailsLarge = [];
    this.LightOn = false;
    /** @type {any[]} */ this.Lights = [];
    /** @type {{X:number, Y:number}|null} */ this.MapPixel = null;
    this.Position = [0, 0, 0];
    this.Direction = [0, 0, 0];
    this.inside = false;
    /** @type {any} */ this.Cargo = null;
    /** @type {any} */ this.DFAudioSource = null;
    /** @type {any} */ this.AudioSourceSlow = null;
    /** @type {any} */ this.AudioSourceFast = null;
    /** @type {any[]} */ this.OarParticles = [];
    /** @type {any[] | null} */ this.particleSystems = null;
  }
  get GetVariantCount() { return this.VariantObject ? this.VariantObject.childCount : 0; }
}

export const goModelName = (modelId) => `DaggerfallMesh [ID=${modelId}]`;
export const goFlatName = (archive, record) => `DaggerfallBillboard [TEXTURE.${String(archive).padStart(3, '0')}, Index=${record}]`;

export function importCustomGameobject(ctx, modelId, parent) {
  const tree = ctx.models.prefab(modelId);
  if (!tree) return null;
  const go = instantiatePrefab(tree, ctx.models.components);
  for (const n of go.walk()) {
    applyRuntimeMaterials(n);
    for (const c of n.getComponents('Animator')) c.animator = createAnimator(n, c, ctx.models.animation ?? {});
  }
  instanceParticleSystems(go, { random: ctx.particleRandom });
  go.name = `${goModelName(modelId)} [Replacement]`;
  // The mod always passes the player matrix, so an instance starts at the player pose; triggers whose
  // local rotation is never reset keep it, as in the mod.
  const player = ctx.player();
  go.setParentKeepWorld(parent);
  go.position = player.position;
  go.rotation = player.rotation;
  return go;
}

function newChild(name, parent) {
  const go = new PrefabNode(name);
  if (parent) go.setParentKeepWorld(parent);
  return go;
}

export function createDaggerfallBillboardGameObject(ctx, archive, record, parent) {
  const go = newChild(goFlatName(archive, record), parent);
  const size = ctx.billboardSize?.(archive, record) ?? null;
  go.addComponent({ type: 'DaggerfallBillboard', Summary: { Archive: archive, Record: record, Size: size ? [size[0], size[1]] : [0, 0] } });
  go.addComponent({ type: 'MeshRenderer', m_Enabled: true, materials: [{ ...dfMaterial(archive, record), billboard: true }], emissionColor: null });
  return go;
}

export function createDaggerfallMeshGameObject(ctx, modelId, parent) {
  const go = newChild(goModelName(modelId), parent);
  go.addComponent({ type: 'DaggerfallMesh', modelId });
  go.addComponent({ type: 'MeshRenderer', m_Enabled: true, classicModel: modelId });
  go.addComponent({ type: 'MeshCollider', m_Enabled: true, m_Convex: false, m_IsTrigger: false, classicModel: modelId });
  return go;
}

export const BUILTIN_BOUNDS = Object.freeze({
  Plane: Object.freeze({ center: [0, 0, 0], extent: [5, 0, 5] }),
  Cube: Object.freeze({ center: [0, 0, 0], extent: [0.5, 0.5, 0.5] }),
  Sphere: Object.freeze({ center: [0, 0, 0], extent: [0.5, 0.5, 0.5] }),
});

export function meshLocalBounds(ctx, meshRef) {
  if (!meshRef) return null;
  if (meshRef.builtin) return BUILTIN_BOUNDS[meshRef.builtin] ?? null;
  if (meshRef.mesh) return ctx.models.meshes[meshRef.mesh]?.aabb ?? null;
  return null;
}
function classicLocalBounds(ctx, modelId) {
  const b = ctx.modelBounds?.(modelId);
  if (!b) return null;
  return { center: scale3(add3(b.min, b.max), 0.5), extent: scale3(sub3(b.max, b.min), 0.5) };
}

/** @returns {{ center:number[], extents:number[], size:number[], min:number[], max:number[] }} */
export function worldBounds(node, local) {
  const m = node.worldMatrix();
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const l = [0, 1, 2].map((d) => local.center[d] + ((i >> d) & 1 ? local.extent[d] : -local.extent[d]));
    const w = [0, 1, 2].map((d) => m[d] * l[0] + m[4 + d] * l[1] + m[8 + d] * l[2] + m[12 + d]);
    for (let d = 0; d < 3; d++) { if (w[d] < min[d]) min[d] = w[d]; if (w[d] > max[d]) max[d] = w[d]; }
  }
  const center = scale3(add3(min, max), 0.5), size = sub3(max, min);
  return { center, extents: scale3(size, 0.5), size, min, max };
}

export function colliderBounds(ctx, node, collider) {
  const local = collider.classicModel != null ? classicLocalBounds(ctx, collider.classicModel) : meshLocalBounds(ctx, collider.m_Mesh);
  return local ? worldBounds(node, local) : null;
}
/** @returns {{ center:number[], extents:number[], size:number[], min:number[], max:number[] } | null} */
export function colliderBoundsInChildren(ctx, node) {
  if (!node?.activeInHierarchy) return null;
  const first = (n) => {
    const c = n.components.find((k) => k.type === 'BoxCollider' || k.type === 'MeshCollider');
    if (c) return { n, c };
    for (const ch of n.children) {
      if (!ch.activeSelf) continue;
      const found = first(ch);
      if (found) return found;
    }
    return null;
  };
  const hit = first(node);
  if (!hit) return null;
  if (hit.c.type === 'MeshCollider') return colliderBounds(ctx, hit.n, hit.c);
  const { m_Center: c = { x: 0, y: 0, z: 0 }, m_Size: s = { x: 1, y: 1, z: 1 } } = hit.c;
  return worldBounds(hit.n, { center: [c.x, c.y, c.z], extent: [s.x / 2, s.y / 2, s.z / 2] });
}
export function classicRendererBounds(ctx, node, modelId) {
  const local = classicLocalBounds(ctx, modelId);
  return local ? worldBounds(node, local) : null;
}

/** @param {Boat} newBoat */
export function spawnBoat(newBoat, ctx) {
  newBoat.GameObject = new PrefabNode('Boat');
  newBoat.GameObject.position = [0, 0, 0];
  const val = importCustomGameobject(ctx, FIRST_HULL_MODEL_ID + newBoat.hull, newBoat.GameObject);
  if (!val) throw new Error(`Come Sail Away: no hull prefab ${FIRST_HULL_MODEL_ID + newBoat.hull}`);
  val.localPosition = [0, 0, 0];
  val.localRotation = [0, 0, 0, 1];
  newBoat.MeshCollider = val.getComponentInChildren('MeshCollider');
  newBoat.MeshObject = nodeOf(val, newBoat.MeshCollider);
  newBoat.MeshObjectOffset = [...newBoat.MeshObject.localPosition];
  const bounds = colliderBounds(ctx, newBoat.MeshObject, newBoat.MeshCollider);
  const { center: c, extents: e } = bounds;
  const node = (i, name, p) => {
    const n = newChild(name, newBoat.GameObject);
    newBoat.Nodes[i] = n;
    newBoat.NodeTileMapIndices[i] = -1;
    n.localPosition = p;
  };
  node(0, 'Center', [c[0], c[1], c[2]]);
  node(1, 'Fore', [c[0], c[1], c[2] + e[2]]);
  node(2, 'Aft', [c[0], c[1], c[2] - e[2]]);
  node(3, 'Starboard', [c[0] + e[0], c[1], c[2]]);
  node(4, 'Port', [c[0] - e[0], c[1], c[2]]);
  getBoatTransforms(newBoat, newBoat.GameObject, ctx);
  if (newBoat.Sails.length > 0) {
    for (const sail of newBoat.Sails) {
      const component = animatorOf(sail);
      if (component != null) {
        component.CrossFade('Stowed', ctx.sailAnimationSpeed ?? SAIL_ANIMATION_SPEED);
        component.SetBool('Stowed', true);
      }
    }
  }
  newBoat.IdleObject.setActive(true);
  newBoat.ActiveObject.setActive(false);
  setLights(newBoat, newBoat.LightOn);
  const clips = ctx.audioClips ?? AUDIO_CLIPS;
  const meshBounds = meshLocalBounds(ctx, newBoat.MeshCollider.m_Mesh);
  const loop = (name, clip) => {
    const go = newChild(name, newBoat.GameObject);
    go.localPosition = [0, 0, 0];
    const src = go.addComponent({ type: 'AudioSource', clip, loop: true, spatialBlend: 1, minDistance: 0, maxDistance: 0, volume: 1, isPlaying: false });
    src.minDistance = Math.fround(meshBounds.extent[2] * 0.5);
    src.maxDistance = Math.fround(src.minDistance * 2);
    return src;
  };
  newBoat.AudioSourceSlow = loop('BoatSFXSlow', clips[0]);
  newBoat.AudioSourceFast = loop('BoatSFXFast', clips[1]);
  const val9 = newChild('BoatSFXOneShot', newBoat.GameObject);
  val9.localPosition = [0, 0, 0];
  val9.addComponent({ type: 'AudioSource' });
  newBoat.DFAudioSource = val9.addComponent({ type: 'DaggerfallAudioSource' });
  const val10 = newChild('BoatCargo', newBoat.GameObject);
  val10.localPosition = [0, 0, 0];
  newBoat.Cargo = val10.addComponent({ type: 'DaggerfallLoot', ContainerImage: CARGO_CONTAINER_IMAGE, playerOwned: true, Items: [] });
  return newBoat;
}

export function nodeOf(root, component) {
  if (!component) return null;
  for (const n of root.walk()) if (n.components.includes(component)) return n;
  return null;
}

export function applyBoatVariant(boat, ctx) {
  if (boat.VariantObject == null) return;
  for (let i = 0; i < boat.GetVariantCount; i++) boat.VariantObject.getChild(i).setActive(i === boat.variant);
  reinitializeBoat(boat, ctx);
}
export function reinitializeBoat(boat, ctx) {
  boat.Sails.length = 0; boat.SailsGaff.length = 0; boat.SailsLarge.length = 0; boat.SailsLateen.length = 0;
  boat.SailsSmall.length = 0; boat.SailsSquare.length = 0; boat.SailsStay.length = 0;
  boat.Booms.length = 0;
  boat.FlagObject = null;
  getBoatTransforms(boat, boat.GameObject, ctx, true);
}
export function setBoatVariant(boat, variant, ctx) {
  boat.variant = variant;
  applyBoatVariant(boat, ctx);
}

export function helperField(name, sep, length) {
  const i = name.indexOf(sep) + 1;
  if (i + length > name.length) throw new RangeError(`ArgumentOutOfRangeException: "${name}".Substring(${i}, ${length})`);
  const s = name.substring(i, i + length);
  if (!/^\s*[+-]?\d+\s*$/.test(s)) throw new TypeError(`FormatException: Convert.ToInt32("${s}")`);
  return Number.parseInt(s.trim(), 10);
}
export const billboardHelperFields = (name) => ({ archive: helperField(name, ARCHIVE_START, 3), record: helperField(name, RECORD_START, 3), alignment: helperField(name, ALIGNMENT_START, 1) });
export const modelHelperFields = (name) => ({ modelId: helperField(name, ARCHIVE_START, 5), alignment: helperField(name, ALIGNMENT_START, 1) });

export function setupBillboardHelper(boat, parent, ctx) {
  const { archive: num, record: num2, alignment: num3 } = billboardHelperFields(parent.name);
  const val = createDaggerfallBillboardGameObject(ctx, num, num2, parent);
  val.localPosition = [0, 0, 0];
  val.localScale = [1, 1, 1];
  const component = val.getComponent('DaggerfallBillboard');
  if (num3 === 1) val.localPosition = add3(val.localPosition, scale3(V_UP, Math.fround(component.Summary.Size[1] / 2)));
  else if (num3 === 2) val.localPosition = sub3(val.localPosition, scale3(V_UP, Math.fround(component.Summary.Size[1] / 2)));
  if (num === LIGHT_ARCHIVE) boat.Lights.push(addBillboardLight(component, val, ctx));
}

export function addBillboardLight(billboard, billboardNode, ctx, alignment = 0) {
  const val = newChild('DungeonLight(Clone)', billboardNode);
  val.position = billboardNode.position;
  const component = val.addComponent({ type: 'Light', enabled: true, ...LANTERN_LIGHT, color: [...LANTERN_LIGHT.color] });
  val.addComponent({ type: 'DaggerfallLight', enabled: true, Animate: false, InteriorLight: false, lastCityLightsFlag: null });
  val.addComponent({ type: 'DungeonLightHandler', enabled: true, UnscaledBlockRange: DUNGEON_LIGHT_HANDLER.unscaledBlockRange, UpdateInSeconds: DUNGEON_LIGHT_HANDLER.updateInSeconds, timer: 0 });
  if (alignment === 1) val.localPosition = add3(val.localPosition, scale3(V_UP, billboard.Summary.Size[1] / 2));
  else if (alignment === 2) val.localPosition = sub3(val.localPosition, scale3(V_UP, billboard.Summary.Size[1] / 2));
  component.node = val;
  return component;
}

export function setupModelHelper(boat, parent, ctx) {
  const { modelId: num, alignment: num2 } = modelHelperFields(parent.name);
  const val = createDaggerfallMeshGameObject(ctx, num, parent);
  val.localPosition = [0, 0, 0];
  val.localScale = [1, 1, 1];
  const position = val.position;
  let bounds = classicRendererBounds(ctx, val, num);
  if (!bounds) return;
  const val2 = sub3(position, bounds.center);
  val.localPosition = add3(val.localPosition, val2);
  if (num2 === 1) { bounds = classicRendererBounds(ctx, val, num); val.localPosition = add3(val.localPosition, scale3(V_UP, bounds.extents[1])); }
  else if (num2 === 2) { bounds = classicRendererBounds(ctx, val, num); val.localPosition = sub3(val.localPosition, scale3(V_UP, bounds.extents[1])); }
}

export function setLights(boat, value) {
  if (boat.Lights.length < 1) return;
  boat.LightOn = value;
  for (const light of boat.Lights) {
    light.enabled = value;
    light.node.getComponent('DaggerfallLight').enabled = value;
    light.node.getComponent('DungeonLightHandler').enabled = value;
    const component = light.node.parent.getComponent('MeshRenderer');
    component.emissionColor = value ? [1, 1, 1, 1] : [0, 0, 0, 1];
  }
}

export const animatorOf = (node) => node?.getComponent('Animator')?.animator ?? null;
// Keyed by tree shape stamp; the returned list is shared, so callers must not change it.
const _animators = new WeakMap();
export const boatAnimators = (boat) => {
  const root = boat.GameObject, stamp = prefabShapeStamp(root);
  const had = _animators.get(root);
  if (had && had.stamp === stamp) return had.list;
  const list = [...root.walk()].flatMap((n) => n.getComponents('Animator').map((c) => c.animator).filter(Boolean));
  _animators.set(root, { stamp, list });
  return list;
};
export const boatParticleSystems = (boat) => [...boat.GameObject.walk()].flatMap((n) => n.getComponents('ParticleSystem').map((c) => c.particleSystem).filter(Boolean));

/**
 * @param {Boat} boat
 * @param {PrefabNode} parent
 */
export function getBoatTransforms(boat, parent, ctx, reinitialize = false) {
  // The bound is read each step, so children the walk adds to `parent` are visited too, as in the mod.
  for (let i = 0; i < parent.childCount; i++) {
    const child = parent.getChild(i);
    if (!child.activeSelf) continue;
    const name = child.name;
    if (boat.VariantObject == null && name === 'Variants') {
      boat.VariantObject = child;
      const v = boat.VariantObject.getChild(boat.variant);
      if (!v) throw new Error(`Come Sail Away: Transform child out of bounds (variant ${boat.variant} of ${boat.VariantObject.childCount})`);
      v.setActive(true);
    }
    if (name.includes('BillboardHelper') && !reinitialize) setupBillboardHelper(boat, child, ctx);
    if (name.includes('ModelHelper') && !reinitialize) setupModelHelper(boat, child, ctx);
    if (name === 'Crewed') boat.crewed = boat.packable = true;
    if (name === 'Packable') boat.packable = true;
    if (name.includes('Handling')) {
      if (name.includes('Oar')) {
        boat.modifierMoveSpeedOar = child.localPosition[0];
        boat.modifierMoveAccelerationOar = child.localPosition[1];
        boat.modifierTurnSpeedOar = child.localScale[0];
        boat.modifierTurnAccelerationOar = child.localScale[1];
      }
      if (name.includes('Sail')) {
        boat.modifierMoveSpeedSail = child.localPosition[0];
        boat.modifierMoveAccelerationSail = child.localPosition[1];
        boat.modifierTurnSpeedSail = child.localScale[0];
        boat.modifierTurnAccelerationSail = child.localScale[1];
      }
      if (name.includes('Rudder')) boat.modifierRudder = child.localPosition[0];
      if (name.includes('Animation')) boat.modifierAnimation = child.localPosition[0];
    }
    if (name === 'Cargo') boat.modifierCargoThreshold = child.localPosition[0];
    if (name.includes('Audio')) {
      boat.modifierAudioVolume = 1;
      boat.modifierAudioRange = child.localPosition[1];
      boat.modifierAudioSpatialBlend = child.localPosition[2];
    }
    if (boat.FlagObject == null && name === 'FlagObject') {
      boat.FlagObject = child;
      boat.FlagEmitter = boat.FlagObject.getComponentInChildren('ParticleSystem').particleSystem;
      boat.FlagEmitterMain = boat.FlagEmitter.main;
    }
    if (boat.WakeObject == null && name === 'WakeObject') {
      boat.WakeObject = child;
      boat.WakeEmitter = boat.WakeObject.getComponent('ParticleSystem').particleSystem;
      boat.WakeEmitterMain = boat.WakeEmitter.main;
    }
    if (boat.DriveTrigger == null && name === 'DriveTrigger') {
      boat.DriveTrigger = importCustomGameobject(ctx, TRIGGER_MODEL.drive, child);
      boat.DriveTrigger.localPosition = [0, 0, 0];
      boat.DriveTrigger.localRotation = [0, 0, 0, 1];
    }
    if (boat.CargoTrigger == null && name === 'CargoTrigger') {
      boat.CargoTrigger = importCustomGameobject(ctx, TRIGGER_MODEL.cargo, child);
      boat.CargoTrigger.localPosition = [0, 0, 0];
      boat.CargoTrigger.localRotation = [0, 0, 0, 1];
    }
    if (name === 'BoardTrigger' && !reinitialize) {
      const val = importCustomGameobject(ctx, TRIGGER_MODEL.board, child);
      val.localPosition = [0, 0, 0];
      val.localRotation = [0, 0, 0, 1];
      val.localScale = [1, 1, 1];
      boat.BoardTriggers.push(val);
    }
    if (name === 'DoorTrigger' && !reinitialize) {
      const val2 = importCustomGameobject(ctx, TRIGGER_MODEL.door, child.parent);
      val2.localPosition = [0, 0, 0];
      val2.localRotation = [0, 0, 0, 1];
      const component = child.parent.getComponent('MeshCollider');
      const component2 = val2.getComponent('BoxCollider');
      const b = colliderBounds(ctx, child.parent, component);
      const c = val2.inverseTransformPoint(b.center);
      component2.m_Center = { x: c[0], y: c[1], z: c[2] };
      component2.m_Size = { x: Math.fround(b.size[0] + 0.01), y: Math.fround(b.size[1] + 0.01), z: Math.fround(b.size[2] + 0.01) };
      // As in the mod, the door trigger joins BoardTriggers and DoorTriggers stays empty.
      boat.BoardTriggers.push(val2);
    }
    if (boat.BedObject == null && name.includes('BedObject')) {
      boat.BedObject = createDaggerfallMeshGameObject(ctx, BED_MODEL_ID, child);
      boat.BedObject.localPosition = [0, 0, 0];
      boat.BedObject.localRotation = [0, 0, 0, 1];
      if (name.includes('0')) {
        boat.BedObject.getComponent('MeshRenderer').m_Enabled = false;
        const component3 = boat.BedObject.getComponent('MeshCollider');
        component3.m_Convex = true;
        component3.m_IsTrigger = true;
      }
    }
    if (boat.FireObject == null && name === 'FireObject') {
      boat.FireObject = createDaggerfallBillboardGameObject(ctx, FIRE_OBJECT_FLAT[0], FIRE_OBJECT_FLAT[1], child);
      boat.FireObject.localScale = [0.5, 0.5, 0.5];
      boat.FireObject.localPosition = add3([0, 0, 0], scale3(V_UP, Math.fround(boat.FireObject.getComponent('DaggerfallBillboard').Summary.Size[1] / 4)));
      boat.FireObject.getComponent('MeshRenderer').m_Enabled = false;
    }
    if (boat.VariantTrigger == null && name === 'VariantTrigger') {
      boat.VariantTrigger = importCustomGameobject(ctx, TRIGGER_MODEL.variant, child);
      boat.VariantTrigger.localPosition = [0, 0, 0];
      boat.VariantTrigger.localScale = [1, 1, 1];
    }
    if (boat.StatusTrigger == null && name === 'StatusTrigger') {
      boat.StatusTrigger = importCustomGameobject(ctx, TRIGGER_MODEL.status, child);
      boat.StatusTrigger.localPosition = [0, 0, 0];
      boat.StatusTrigger.localScale = [1, 1, 1];
    }
    if (boat.PositionTrigger == null && name === 'PositionTrigger') {
      boat.PositionTrigger = importCustomGameobject(ctx, TRIGGER_MODEL.position, child);
      boat.PositionTrigger.localPosition = [0, 0, 0];
      boat.PositionTrigger.localScale = [1, 1, 1];
    }
    if (boat.DrivePosition == null && name === 'DrivePosition') boat.DrivePosition = child;
    if (boat.RudderObject == null && name === 'RudderObject') {
      boat.RudderObject = child;
      boat.RudderAnimator = child.getComponent('Animator');
      boat.RudderObject.addComponent({ type: 'RudderAnimationEventListener' });
    }
    if (name === 'RudderEffect' && !reinitialize) boat.RudderEmitters.push(child.getComponent('ParticleSystem')?.particleSystem ?? null);
    if (name === 'OarEffect' && !reinitialize) boat.OarParticles.push(child.getComponent('ParticleSystem')?.particleSystem ?? null);
    if (boat.IdleObject == null && name === 'IdleObject') boat.IdleObject = child;
    if (boat.ActiveObject == null && name === 'ActiveObject') boat.ActiveObject = child;
    if (name.includes('Boom')) boat.Booms.push(child);
    if (name.includes('Sail') && !name.includes('Skelly') && !name.includes('Mesh') && !name.includes('Bones') && !name.includes('Handling')) {
      boat.Sails.push(child);
      if (name.includes('Small')) boat.SailsSmall.push(child);
      else if (name.includes('Large')) boat.SailsLarge.push(child);
      if (name.includes('Square')) boat.SailsSquare.push(child);
      else if (name.includes('Lateen')) boat.SailsLateen.push(child);
      else if (name.includes('Gaff')) boat.SailsGaff.push(child);
      else if (name.includes('Stay')) boat.SailsStay.push(child);
    }
    if (child.getComponent('SkinnedMeshRenderer') && child.getComponent('ApplyGameTextures') == null) {
      applyGameTextures(child.addComponent({ type: 'ApplyGameTextures', hasAppliedMaterials: false }), child);
      const val3 = new PrefabNode(NEW_GAME_OBJECT);
      val3.setParentKeepWorld(child);
      val3.localPosition = [0, 0, 0];
      val3.localRotation = [0, 0, 0, 1];
      const cadence = child.getComponent('BakeCadence');
      fixDeformationsAwake(val3.addComponent({ type: 'FixDeformations', interval: 0.1, timer: cadence?.timer ?? 0, ...(cadence?.everyFrame ? { everyFrame: true } : {}) }), val3);
    }
    getBoatTransforms(boat, child, ctx, reinitialize);
  }
}

export function applyGameTextures(script, node) {
  const component = node.getComponent('SkinnedMeshRenderer');
  if (!component) return false;
  const shared = component.materials ? [...component.materials] : bundleSlots(component);
  for (let i = 0; i < shared.length; i++) {
    if (node.childCount >= 1) {
      const ch = node.getChild(i);
      const m = ch ? gameTextureFromName(ch.name) : null;
      // As in the C#, a bad name leaves the slots unchanged and the component unapplied.
      if (!m) return false;
      shared[i] = m;
    }
  }
  component.materials = shared;
  script.hasAppliedMaterials = true;
  return true;
}

export function fixDeformationsAwake(script, node) {
  const skinned = node.parent.getComponent('SkinnedMeshRenderer');
  script.skinnedMeshRenderer = skinned;
  skinned.m_Enabled = false;
  script.meshFilter = node.addComponent({ type: 'MeshFilter', m_Mesh: null, baked: true });
  script.meshRenderer = node.addComponent({ type: 'MeshRenderer', m_Enabled: true, materials: (skinned.materials ?? bundleSlots(skinned)).map((s) => (s ? { ...s } : null)) });
  script.bakedMesh = null;
}

export function boatAssetNeeds(ctx, hull) {
  const flats = new Set(), models = new Set();
  const tree = ctx.models.prefab(FIRST_HULL_MODEL_ID + hull);
  const visit = (n) => {
    try {
      if (n.name.includes('BillboardHelper')) { const f = billboardHelperFields(n.name); flats.add(`${f.archive}_${f.record}`); }
      if (n.name.includes('ModelHelper')) models.add(modelHelperFields(n.name).modelId);
    } catch { }
    if (n.name.includes('BedObject')) models.add(BED_MODEL_ID);
    if (n.name === 'FireObject') flats.add(`${FIRE_OBJECT_FLAT[0]}_${FIRE_OBJECT_FLAT[1]}`);
    for (const c of n.children) visit(c);
  };
  if (tree) visit(tree);
  return { flats: [...flats].map((k) => k.split('_').map(Number)), models: [...models] };
}
