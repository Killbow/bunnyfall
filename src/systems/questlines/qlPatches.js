// @ts-check
import { applyTextPatches } from '../quest/questPatches.js';
import { questlinesOn } from './qlLaw.js';
import { QL_FAMILY_NAMES } from './qlFamilies.js';
import FIGHTERS_GUILD from './patches/fightersGuild.json' with { type: 'json' };
import KNIGHTLY_ORDERS from './patches/knightlyOrders.json' with { type: 'json' };
import MAGES_GUILD from './patches/magesGuild.json' with { type: 'json' };
import THIEVES_GUILD from './patches/thievesGuild.json' with { type: 'json' };
import DARK_BROTHERHOOD from './patches/darkBrotherhood.json' with { type: 'json' };
import HOLY_ORDERS from './patches/holyOrders.json' with { type: 'json' };
import NOBILITY from './patches/nobility.json' with { type: 'json' };
import MERCHANTS from './patches/merchants.json' with { type: 'json' };
import COMMONERS from './patches/commoners.json' with { type: 'json' };
import WITCHES from './patches/witches.json' with { type: 'json' };
import VAMPIRES from './patches/vampires.json' with { type: 'json' };

// Classic scripts number messages from 1000 and none uses 1900 to 1999, so a branch's own messages start here.
export const QL_MESSAGE_BASE = 1900;

export const QL_PATCH_FAMILIES = Object.freeze([FIGHTERS_GUILD, KNIGHTLY_ORDERS, MAGES_GUILD, THIEVES_GUILD, DARK_BROTHERHOOD, HOLY_ORDERS, NOBILITY, MERCHANTS, COMMONERS, WITCHES, VAMPIRES]);

export const QL_PATCHES = (() => {
  const map = new Map();
  for (const fam of QL_PATCH_FAMILIES) {
    if (!QL_FAMILY_NAMES.includes(fam.family)) throw new Error(`qlPatches: ${fam.family} is no family`);
    for (const [name, list] of Object.entries(fam.patches ?? {})) {
      const key = name.toUpperCase();
      if (map.has(key)) throw new Error(`qlPatches: ${name} is patched by two families`);
      map.set(key, Object.freeze(list.map((p) => Object.freeze({ old: p.old, new: p.new, count: p.count }))));
    }
  }
  return map;
})();

export const hasQuestlinePatch = (name) => QL_PATCHES.has(String(name ?? '').toUpperCase());

export function applyQuestlinePatches(name, text) {
  const patches = QL_PATCHES.get(String(name ?? '').toUpperCase());
  return patches ? applyTextPatches('QL-PATCH', name, patches, text) : text;
}

// A branch is patched in only while the switch is on as the script is read, matching the stamp its start decides.
const _warned = new Set();
/**
 * @param {string} name
 * @param {string[]|null} lines
 * @param {boolean} [on]
 */
export function questlineLines(name, lines, on = questlinesOn()) {
  if (!lines || !on || !hasQuestlinePatch(name)) return lines;
  try {
    return applyQuestlinePatches(name, lines.join('\n')).split('\n');
  } catch (e) {
    if (!_warned.has(name)) { _warned.add(name); console.warn(`[questlines] ${e?.message ?? e} - ${name} read without its branch`); }
    return lines;
  }
}
