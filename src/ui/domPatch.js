// A repaint in place: a screen built again from its state is laid over the live one, unit by unit (the children of
// `lists`). A unit built from the same inputs (UNIT_INPUTS) that comes out the same is kept; any other is swapped.
// Outside the units the two trees must match, or nothing is touched and the caller paints in full. Live-only attributes
// (`skip`) are not compared; classes a full repaint loses (`drop`) are compared without and taken off.

export const UNIT_INPUTS = Symbol('unitInputs');

const HANDLERS = ['onclick', 'oninput', 'onchange', 'onkeydown', 'onkeyup', 'onpointerdown', 'onwheel', 'onscroll', 'onfocus', 'onblur'];
const DRAWN = 'CANVAS,VIDEO,IFRAME';
const FIELDS = new Set(['INPUT', 'SELECT', 'TEXTAREA']);

/** @typedef {{ lists: string, skip: (name: string) => boolean, drop: string[], ops: Array<() => void> }} Cx */

/** @param {string | null} s @param {boolean} [own] */
const styleOf = (s, own = true) => (s ?? '').split(';').map((d) => d.trim()).filter((d) => d && (own || !d.startsWith('--'))).join(';');

/** @param {string} v @param {Cx} cx */
const classOf = (v, cx) => (cx.drop.length ? v.split(/\s+/).filter((c) => c && !cx.drop.includes(c)).join(' ') : v);

/** @param {Element} a @param {string} name @param {Cx} cx */
const attrOf = (a, name, cx) => {
  const v = a.getAttribute(name);
  return v == null ? v : name === 'class' ? classOf(v, cx) : name === 'style' ? styleOf(v) : v;
};

/** @param {Element} a @param {Cx} cx */
const attrsOf = (a, cx) => [...a.attributes].filter((x) => !cx.skip(x.name)).map((x) => `${x.name}=${attrOf(a, x.name, cx)}`)
  .filter((x) => x !== 'class=' && x !== 'style=').sort().join('\n');

/** @param {Node} a @param {Node} b @param {Cx} cx */
function same(a, b, cx) {
  if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) return false;
  if (a.nodeType !== 1) return a.nodeValue === b.nodeValue;
  const ea = /** @type {any} */ (a), eb = /** @type {any} */ (b);
  if (DRAWN.includes(ea.tagName)) return false;
  if (FIELDS.has(ea.tagName) && (ea.value !== eb.value || ea.checked !== eb.checked)) return false;
  if (attrsOf(ea, cx) !== attrsOf(eb, cx)) return false;
  const ka = a.childNodes, kb = b.childNodes;
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) if (!same(ka[i], kb[i], cx)) return false;
  return true;
}

/** @param {any} a @param {any} b @param {Cx} cx */
const keeps = (a, b, cx) => (a.nodeType === 1 ? a[UNIT_INPUTS] !== undefined && a[UNIT_INPUTS] === b[UNIT_INPUTS] : true) && same(a, b, cx);

/** @param {Element} a @param {Element} b @param {Cx} cx */
function shell(a, b, cx) {
  const ea = /** @type {any} */ (a), eb = /** @type {any} */ (b);
  if (a.tagName !== b.tagName || HANDLERS.some((h) => ea[h] || eb[h])) return false;
  // A custom property an observer wrote on the live element stays.
  if (styleOf(a.getAttribute('style'), false) !== styleOf(b.getAttribute('style'), false)) return false;
  for (const { name, value } of [...b.attributes]) if (name !== 'style' && !cx.skip(name) && attrOf(a, name, cx) !== value) cx.ops.push(() => a.setAttribute(name, value));
  for (const { name } of [...a.attributes]) if (name !== 'style' && !cx.skip(name) && !b.hasAttribute(name)) cx.ops.push(() => a.removeAttribute(name));
  return true;
}

/** @param {Node} a @param {Node} b @param {Cx} cx */
function plan(a, b, cx) {
  if (a.nodeType !== 1 || b.nodeType !== 1) return same(a, b, cx);
  const ea = /** @type {Element} */ (a), eb = /** @type {Element} */ (b);
  const list = ea.matches(cx.lists);
  if (!list && !ea.querySelector(cx.lists)) return same(a, b, cx);
  if (list !== eb.matches(cx.lists) || !shell(ea, eb, cx)) return false;
  const ka = [...a.childNodes], kb = [...b.childNodes];
  if (list) {
    kb.forEach((n, i) => {
      if (i >= ka.length) cx.ops.push(() => a.appendChild(n));
      else if (!keeps(ka[i], n, cx)) cx.ops.push(() => a.replaceChild(n, ka[i]));
    });
    for (const n of ka.slice(kb.length)) cx.ops.push(() => a.removeChild(n));
    return true;
  }
  return ka.length === kb.length && ka.every((n, i) => plan(n, kb[i], cx));
}

/**
 * Lay `fresh` (built off the page) over `live`; returns true when it did. The units it swaps in move out of `fresh`.
 * @param {Element} live
 * @param {Element} fresh
 * @param {string} lists
 * @param {{ skip?: (name: string) => boolean, drop?: string[] }} [opts]
 */
export function patchInPlace(live, fresh, lists, { skip = () => false, drop = [] } = {}) {
  if (!live || !fresh) return false;
  /** @type {Cx} */
  const cx = { lists, skip, drop, ops: [] };
  if (!plan(live, fresh, cx)) return false;
  for (const op of cx.ops) op();
  for (const c of drop) for (const n of live.querySelectorAll(`.${c}`)) n.classList.remove(c);
  return true;
}
