// World of Daggerfall data shapes and their readers.

export function newLocationInstance() {
  return {
    locationID: 0,
    name: 'DF_Rocks',
    type: 0,
    prefab: '',
    worldX: 0,
    worldY: 0,
    terrainX: 0,
    terrainY: 0,
  };
}

export function newLocationPrefab() {
  return { height: 8, width: 8, obj: [] };
}

export function newLocationObject() {
  return {
    type: 0,
    name: '',
    objectID: 0,
    pos: { x: 0, y: 0, z: 0 },
    rot: { x: 0, y: 0, z: 0, w: 1 },
    scale: { x: 1, y: 1, z: 1 },
  };
}

const WS = '[\\t\\n\\v\\f\\r ]*';
const INT_RE = new RegExp(`^${WS}([+-]?)([0-9]+)${WS}$`);
const FLOAT_RE = new RegExp(`^${WS}[+-]?(?:[0-9][0-9,]*(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?${WS}$`);

export function tryParseInt32(s) {
  const m = INT_RE.exec(s);
  if (!m) return 0;
  const digits = m[2].replace(/^0+(?=\d)/, '');
  const limit = m[1] === '-' ? '2147483648' : '2147483647';
  if (digits.length > limit.length || (digits.length === limit.length && digits > limit)) return 0;
  const v = Number(digits);
  return m[1] === '-' ? (v === 0 ? 0 : -v) : v;
}

export function tryParseSingle(s) {
  if (!FLOAT_RE.test(s)) return 0;
  const v = Number(s.trim().replace(/,/g, ''));
  if (!Number.isFinite(v)) return 0;
  const f = Math.fround(v);
  return Number.isFinite(f) ? f : 0;
}

function parseInt32OrNull(s) {
  const m = INT_RE.exec(s);
  if (!m) return null;
  const digits = m[2].replace(/^0+(?=\d)/, '');
  const limit = m[1] === '-' ? '2147483648' : '2147483647';
  if (digits.length > limit.length || (digits.length === limit.length && digits > limit)) return null;
  return tryParseInt32(s);
}

/**
 * @param {string} xml
 * @returns {{ root: object, elements: object[] }}
 */
export function parseXml(xml) {
  const elements = [];
  const stack = [];
  let root = null;
  let i = 0;
  const n = xml.length;
  const fail = (why) => { throw new Error(`XmlException: ${why} at offset ${i}`); };
  while (i < n) {
    const lt = xml.indexOf('<', i);
    const textEnd = lt < 0 ? n : lt;
    if (textEnd > i) {
      const text = xml.slice(i, textEnd);
      if (stack.length) stack[stack.length - 1].text += text;
      else if (/\S/.test(text)) fail('text outside the root element');
      i = textEnd;
      continue;
    }
    const gt = xml.indexOf('>', i);
    if (gt < 0) fail('unterminated tag');
    const body = xml.slice(i + 1, gt);
    if (body.startsWith('/')) {
      const tag = body.slice(1).trim();
      const top = stack.pop();
      if (!top || top.tag !== tag) fail(`mismatched </${tag}>`);
    } else {
      const selfClosing = body.endsWith('/');
      const tag = (selfClosing ? body.slice(0, -1) : body).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(tag)) fail(`unsupported markup <${body}>`);
      const el = { tag, text: '', children: [] };
      if (stack.length) stack[stack.length - 1].children.push(el);
      else if (root) fail('a second root element');
      else root = el;
      elements.push(el);
      if (!selfClosing) stack.push(el);
    }
    i = gt + 1;
  }
  if (stack.length) fail(`unclosed <${stack[stack.length - 1].tag}>`);
  if (!root) fail('no root element');
  return { root, elements };
}

function byTag(doc, tag) {
  return doc.elements.filter((e) => e.tag === tag);
}

function innerXml(list, i) {
  const el = list[i];
  if (!el) throw new TypeError(`NullReferenceException: GetElementsByTagName(...)[${i}] is null`);
  return el.children.length ? fail() : el.text;
  function fail() { throw new Error('InnerXml of a non-leaf element is outside the subset'); }
}

/**
 * @param {?string} xml
 * @returns {?Array<object>}
 */
export function loadLocationInstance(xml) {
  if (xml == null) return null;
  const doc = parseXml(xml);
  if (!doc.elements.some((e) => e.tag === 'locations')) return null;
  const inst = byTag(doc, 'locationInstance');
  const t = {
    name: byTag(doc, 'name'), locationID: byTag(doc, 'locationID'), type: byTag(doc, 'type'),
    prefab: byTag(doc, 'prefab'), worldX: byTag(doc, 'worldX'), worldY: byTag(doc, 'worldY'),
    terrainX: byTag(doc, 'terrainX'), terrainY: byTag(doc, 'terrainY'),
  };
  const out = [];
  for (let i = 0; i < inst.length; i++) {
    if (innerXml(t.prefab, i) === '') continue;
    const tmp = newLocationInstance();
    tmp.name = innerXml(t.name, i);
    tmp.locationID = tryParseInt32(innerXml(t.locationID, i));
    tmp.type = tryParseInt32(innerXml(t.type, i));
    tmp.prefab = innerXml(t.prefab, i);
    tmp.worldX = tryParseInt32(innerXml(t.worldX, i));
    tmp.worldY = tryParseInt32(innerXml(t.worldY, i));
    tmp.terrainX = tryParseInt32(innerXml(t.terrainX, i));
    tmp.terrainY = tryParseInt32(innerXml(t.terrainY, i));
    out.push(tmp);
  }
  return out;
}

const OBJ_INT = ['type', 'objectID'];

/**
 * @param {?string} xml
 * @returns {?{height:number,width:number,obj:Array<object>}}
 */
export function loadLocationPrefab(xml) {
  if (xml == null) return null;
  const doc = parseXml(xml);
  if (!doc.elements.some((e) => e.tag === 'locationPrefab')) return null;
  const p = newLocationPrefab();
  p.height = tryParseInt32(innerXml(byTag(doc, 'height'), 0));
  p.width = tryParseInt32(innerXml(byTag(doc, 'width'), 0));
  const count = byTag(doc, 'object').length;
  const L = {};
  for (const tag of ['type', 'name', 'objectID', 'posX', 'posY', 'posZ',
    'scaleX', 'scaleY', 'scaleZ', 'rotW', 'rotX', 'rotY', 'rotZ']) L[tag] = byTag(doc, tag);
  for (let i = 0; i < count; i++) {
    const o = newLocationObject();
    p.obj.push(o);
    for (const k of OBJ_INT) o[k] = tryParseInt32(innerXml(L[k], i));
    o.name = innerXml(L.name, i);
    o.pos.x = tryParseSingle(innerXml(L.posX, i));
    o.pos.y = tryParseSingle(innerXml(L.posY, i));
    o.pos.z = tryParseSingle(innerXml(L.posZ, i));
    o.scale.x = tryParseSingle(innerXml(L.scaleX, i));
    o.scale.y = tryParseSingle(innerXml(L.scaleY, i));
    o.scale.z = tryParseSingle(innerXml(L.scaleZ, i));
    o.rot.w = tryParseSingle(innerXml(L.rotW, i));
    o.rot.x = tryParseSingle(innerXml(L.rotX, i));
    o.rot.y = tryParseSingle(innerXml(L.rotY, i));
    o.rot.z = tryParseSingle(innerXml(L.rotZ, i));
  }
  return p;
}

export function validateValue(type, name) {
  if (type === 0) return parseInt32OrNull(name) !== null;
  if (type === 1) {
    const arg = name.split('.');
    return arg.length === 2 && parseInt32OrNull(arg[0]) !== null && parseInt32OrNull(arg[1]) !== null;
  }
  return false;
}

export function ntfsCompare(a, b) {
  const A = a.toUpperCase();
  const B = b.toUpperCase();
  return A < B ? -1 : A > B ? 1 : 0;
}
