// Daggerfall Unity reads text records from its Internal_RSC string table first and falls back to TEXT.RSC only for
// missing keys. The table was edited after extraction, so where they differ, these rows are what DFU players see.

import { loadStringTableCsv } from '../ui/textManager.js';

export const INTERNAL_RSC = Object.freeze({
  7333: Object.freeze([
    '%di of here',
    "%di of where we're standing",
    'that way, just keep going %di',
    'that way, %di',
    'a way %di of here',
    "not too far to the %di, if you don't mind walking",
    "%di of here, unless I'm mistaken",
    '%di of here, I think',
    '%di, with a bit of a walk',
  ]),
});

// Literal newlines in the CSV are stripped, as in DFU, because TEXT.RSC marks line breaks with markup instead.
export function parseRscMarkup(value) {
  const variants = [];
  let cur = '';
  const s = String(value ?? '').replace(/\r?\n/g, '');
  const re = /\[\/(record|end|left|center|newline|input|pos[^\]]*|font[^\]]*|color[^\]]*|scale[^\]]*|image[^\]]*)\]/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    cur += s.slice(last, m.index);
    last = m.index + m[0].length;
    const tag = m[1];
    if (tag === 'record') { variants.push(cur); cur = ''; continue; }
    if (tag === 'end') { variants.push(cur); cur = null; break; }
    if (tag === 'left' || tag === 'center' || tag === 'newline') cur += '\n';
  }
  if (cur !== null) variants.push(cur + s.slice(last));
  return variants;
}

export function parseRscCsv(text) {
  const out = new Map();
  for (const [key, value] of loadStringTableCsv(text) ?? []) if (/^\d+$/.test(key)) out.set(Number(key), value);
  return out;
}
