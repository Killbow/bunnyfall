// @ts-check

/**
 * @param {string} tag
 * @param {Record<string, any> | null} [props]
 * @param {...(Node | string | null | false | undefined)} kids
 * @returns {HTMLElement}
 */
export function h(tag, props = null, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, /** @type {any} */ (fn));
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && k !== 'list') /** @type {any} */ (el)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

/** @param {Element} el */
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
