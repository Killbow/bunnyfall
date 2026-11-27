// @ts-check
// A Unity prefab instantiated as a node tree that a mod's C# walks by name.

import { multiply } from './mat4.js';
import { mat4FromQuatPosScale, quatMultiply, quatRotate } from './quat.js';

const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const ZERO3 = Object.freeze([0, 0, 0]), ONE3 = Object.freeze([1, 1, 1]);
const _rotScratch = new Float32Array(16);
let _shapeCount = 0;
const topOf = (n) => { let r = n; while (r.parent) r = r.parent; return r; };
const reshaped = (n) => { topOf(n)._treeStamp = ++_shapeCount; };
/**
 * @param {PrefabNode} node
 */
export const prefabShapeStamp = (node) => topOf(node)._treeStamp;
/**
 * @param {PrefabNode} node
 */
export const prefabSwitchStamp = (node) => topOf(node)._treeSwitch;

export class PrefabNode {
  /**
   * @param {string} name
   * @param {{ active?: boolean, layer?: number, tag?: number, position?: number[], rotation?: number[], scale?: number[], components?: any[] }} [o]
   */
  constructor(name, { active = true, layer = 0, tag = 0, position = [0, 0, 0], rotation = [0, 0, 0, 1], scale = [1, 1, 1], components = [] } = {}) {
    this.name = name;
    this.activeSelf = active;
    this.layer = layer;
    this.tag = tag;
    this.localPosition = [...position];
    this.localRotation = [...rotation];
    this.localScale = [...scale];
    /** @type {any[]} */
    this.components = components;
    /** @type {PrefabNode|null} */
    this.parent = null;
    /** @type {PrefabNode[]} */
    this.children = [];
    this._treeStamp = 0;
    this._treeSwitch = 0;
    /** @type {PrefabNode|null} */
    this.prefabRoot = null;
    /** @type {Map<string, PrefabNode>|null} */
    this.prefabPaths = null;
    /** @type {any} */ this._w = null;
    /** @type {Float64Array|null} */ this._wk = null;
    /** @type {PrefabNode|null|undefined} */ this._wParent = undefined;
    /** @type {any} */ this._wParentM = undefined;
    /** @type {any} */ this._r = null;
    /** @type {Float64Array|null} */ this._rk = null;
    /** @type {PrefabNode|null|undefined} */ this._rParent = undefined;
    /** @type {any} */ this._rParentQ = undefined;
  }

  get childCount() { return this.children.length; }
  getChild(i) { return this.children[i]; }

  setParent(parent) {
    for (let p = parent; p; p = p.parent) if (p === this) throw new Error(`PrefabNode.setParent: '${this.name}' cannot hang under itself or a node of its own ('${parent.name}')`);
    const left = topOf(this);
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = parent;
    if (parent) parent.children.push(this);
    reshaped(left); reshaped(this);
    return this;
  }

  setParentKeepWorld(parent) {
    const worldPosition = this.position;
    const worldRotation = this.rotation;
    const worldRS = rs3(this.worldMatrix());
    this.setParent(parent);
    this.rotation = worldRotation;
    this.position = worldPosition;
    this.localScale = [1, 1, 1];
    const m = mul3(inv3(rs3(this.worldMatrix())), worldRS);
    this.localScale = [m[0], m[4], m[8]];
    return this;
  }

  get position() { const m = this.worldMatrix(); return [m[12], m[13], m[14]]; }
  set position(p) { this.localPosition = this.parent ? this.parent.inverseTransformPoint(p) : [...p]; }
  get rotation() {
    const p = this.parent, pr = p ? p._rotationKept() : null, q = this.localRotation, k = this._rk;
    if (!(k && this._rParent === p && this._rParentQ === pr && k[0] === q[0] && k[1] === q[1] && k[2] === q[2] && k[3] === q[3])) {
      this._r = pr ? quatMultiply(pr, q) : [...q];
      const kk = (this._rk ??= new Float64Array(4));
      kk[0] = q[0]; kk[1] = q[1]; kk[2] = q[2]; kk[3] = q[3];
      this._rParent = p; this._rParentQ = pr;
    }
    return [...this._r];
  }
  _rotationKept() { this.rotation; return this._r; }
  set rotation(q) { this.localRotation = this.parent ? normalizeQuat(quatMultiply(quatInverse(this.parent.rotation), q)) : [...q]; }
  get lossyScale() { return this.lossyScaleOf(this.worldMatrix()); }
  lossyScaleOf(world, out = undefined) {
    const R = mat4FromQuatPosScale(this.rotation, ZERO3, ONE3, _rotScratch);
    if (out) {
      out[0] = R[0] * world[0] + R[1] * world[1] + R[2] * world[2];
      out[1] = R[4] * world[4] + R[5] * world[5] + R[6] * world[6];
      out[2] = R[8] * world[8] + R[9] * world[9] + R[10] * world[10];
      return out;
    }
    const m = mul3(transpose3(rs3(R)), rs3(world));
    return [m[0], m[4], m[8]];
  }
  inverseTransformPoint(p) {
    const m = this.worldMatrix();
    const inv = inv3(rs3(m));
    const d = [p[0] - m[12], p[1] - m[13], p[2] - m[14]];
    return [inv[0] * d[0] + inv[1] * d[1] + inv[2] * d[2], inv[3] * d[0] + inv[4] * d[1] + inv[5] * d[2], inv[6] * d[0] + inv[7] * d[1] + inv[8] * d[2]];
  }
  inverseTransformVector(v) {
    const inv = inv3(rs3(this.worldMatrix()));
    return [inv[0] * v[0] + inv[1] * v[1] + inv[2] * v[2], inv[3] * v[0] + inv[4] * v[1] + inv[5] * v[2], inv[6] * v[0] + inv[7] * v[1] + inv[8] * v[2]];
  }
  get forward() { return quatRotate(this.rotation, [0, 0, 1]); }

  setActive(v) {
    const on = !!v;
    if (this.activeSelf !== on) { this.activeSelf = on; topOf(this)._treeSwitch = ++_shapeCount; }
  }
  get activeInHierarchy() {
    for (let n = /** @type {PrefabNode|null} */ (this); n; n = n.parent) if (!n.activeSelf) return false;
    return true;
  }

  localMatrix() { return mat4FromQuatPosScale(this.localRotation, this.localPosition, this.localScale); }
  worldMatrix() {
    const p = this.parent;
    const pw = p ? p.worldMatrix() : null;
    const q = this.localRotation, t = this.localPosition, s = this.localScale, k = this._wk;
    if (k && this._wParent === p && this._wParentM === pw && k[0] === q[0] && k[1] === q[1] && k[2] === q[2] && k[3] === q[3]
      && k[4] === t[0] && k[5] === t[1] && k[6] === t[2] && k[7] === s[0] && k[8] === s[1] && k[9] === s[2]) return this._w;
    const local = mat4FromQuatPosScale(q, t, s);
    const w = pw ? multiply(pw, local) : local;
    const kk = (this._wk ??= new Float64Array(10));
    kk[0] = q[0]; kk[1] = q[1]; kk[2] = q[2]; kk[3] = q[3]; kk[4] = t[0]; kk[5] = t[1]; kk[6] = t[2]; kk[7] = s[0]; kk[8] = s[1]; kk[9] = s[2];
    this._w = w; this._wParent = p; this._wParentM = pw;
    return w;
  }
  transformPoint(p) {
    const m = this.worldMatrix();
    return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  }

  getComponent(type) { return this.components.find((c) => c.type === type) ?? null; }
  getComponents(type) { return this.components.filter((c) => c.type === type); }
  addComponent(c) { this.components.push(c); reshaped(this); return c; }

  getComponentInChildren(type) {
    return this.activeInHierarchy ? findActive(this, type) : null;
  }
  getComponentsInChildren(type, out = []) {
    if (this.activeInHierarchy) collectActive(this, type, out);
    return out;
  }

  find(path) {
    if (!path) return this;
    let n = /** @type {PrefabNode|null} */ (this);
    for (const part of path.split('/')) { n = n?.children.find((c) => c.name === part) ?? null; if (!n) return null; }
    return n;
  }
  pathFrom(root) {
    const parts = [];
    for (let n = /** @type {PrefabNode|null} */ (this); n && n !== root; n = n.parent) parts.unshift(n.name);
    return parts.join('/');
  }
  *walk() { yield this; for (const ch of this.children) yield* ch.walk(); }
}

function findActive(n, type) {
  const own = n.getComponent(type);
  if (own) return own;
  for (const ch of n.children) {
    if (!ch.activeSelf) continue;
    const found = findActive(ch, type);
    if (found) return found;
  }
  return null;
}
function collectActive(n, type, out) {
  out.push(...n.getComponents(type));
  for (const ch of n.children) if (ch.activeSelf) collectActive(ch, type, out);
}

const rs3 = (m) => [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
const mul3 = (a, b) => {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
  return o;
};
const transpose3 = (a) => [a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]];
function inv3(a) {
  const [a00, a01, a02, a10, a11, a12, a20, a21, a22] = a;
  const c00 = a11 * a22 - a12 * a21, c01 = a12 * a20 - a10 * a22, c02 = a10 * a21 - a11 * a20;
  const det = a00 * c00 + a01 * c01 + a02 * c02;
  // A singular matrix inverts to zeros, never NaN, as in Matrix3x3f::Invert.
  if (!det) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const k = 1 / det;
  return [
    c00 * k, (a02 * a21 - a01 * a22) * k, (a01 * a12 - a02 * a11) * k,
    c01 * k, (a00 * a22 - a02 * a20) * k, (a02 * a10 - a00 * a12) * k,
    c02 * k, (a01 * a20 - a00 * a21) * k, (a00 * a11 - a01 * a10) * k,
  ];
}
const quatInverse = (q) => { const n = q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3] || 1; return [-q[0] / n, -q[1] / n, -q[2] / n, q[3] / n]; };
const normalizeQuat = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };

const copy = (c) => (c && typeof c === 'object' ? JSON.parse(JSON.stringify(c)) : c);

/**
 * @param {{ name:string, active:boolean, layer:number, tag:number, position:number[], rotation:number[], scale:number[], components:number[], children:any[] }} tree
 * @param {any[]} components
 */
export function instantiatePrefab(tree, components) {
  /** @type {Map<string, PrefabNode>} */
  const byPath = new Map();
  const build = (t, path) => {
    const node = new PrefabNode(t.name, {
      active: t.active, layer: t.layer, tag: t.tag, position: t.position, rotation: t.rotation, scale: t.scale,
      components: t.components.map((i) => copy(components[i])),
    });
    if (!byPath.has(path)) byPath.set(path, node);
    for (const ch of t.children) build(ch, `${path}/${ch.name}`).setParent(node);
    return node;
  };
  const root = build(tree, tree.name);
  for (const n of root.walk()) n.prefabRoot = root;
  root.prefabPaths = byPath;
  return root;
}

export function resolveNodePointer(node, pointer) {
  if (!pointer || typeof pointer.node !== 'string') return null;
  return node.prefabRoot?.prefabPaths?.get(pointer.node) ?? null;
}

export const IDENTITY_MATRIX = IDENTITY;
