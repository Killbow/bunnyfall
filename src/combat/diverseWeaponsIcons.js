import { addVendorTextures, vendorTextureCount } from '../render/textureReplacement.js';
import { DYE_COLORS, dyeToken } from '../characters/dyes.js';
import { moddedWeaponHUDAnimsEnabled } from './diverseWeapons.js';
import { diverseWeaponsSpriteUrl } from './diverseWeaponsAssets.js';
import { DIVERSE_WEAPONS_STEMS, DIVERSE_WEAPONS_METALS, DIVERSE_WEAPONS_BARE } from './diverseWeaponsIndex.js';

const ICON_STEM = /^(\d{3})_(\d+)-(\d+)$/;
export const ICON_ARCHIVES = Object.freeze([233, 234, 432, 433]);

export function diverseWeaponsIconEntries(stems = DIVERSE_WEAPONS_STEMS) {
  const out = [];
  for (const [stem, bits] of Object.entries(stems)) {
    const m = ICON_STEM.exec(stem);
    if (!m) continue;
    const archive = Number(m[1]), record = Number(m[2]), frame = Number(m[3]);
    if (!ICON_ARCHIVES.includes(archive)) continue;
    for (let i = 0; i < DIVERSE_WEAPONS_METALS.length; i++) {
      if (!(bits & (1 << i))) continue;
      const dye = DYE_COLORS[DIVERSE_WEAPONS_METALS[i]];
      // Silver uses the Unchanged dye, which has no name token, so its file would collide with the bare stem's key.
      if (!dyeToken(dye)) continue;
      out.push({ archive, record, frame, dye, fileName: `${stem}_${DIVERSE_WEAPONS_METALS[i]}` });
    }
    if (bits & DIVERSE_WEAPONS_BARE) out.push({ archive, record, frame, dye: null, fileName: stem });
  }
  return out;
}

let _installed = false;
export function installDiverseWeaponsIcons({ fetchBytes = null } = {}) {
  if (_installed && vendorTextureCount() > 0) return 0;
  _installed = true;
  const load = fetchBytes ?? (async (name) => { const r = await fetch(diverseWeaponsSpriteUrl(name)); if (!r.ok) throw new Error(`${name}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); });
  return addVendorTextures(diverseWeaponsIconEntries().map((e) => ({ ...e, load, gate: moddedWeaponHUDAnimsEnabled, lazy: true })));
}

export function _resetDiverseWeaponsIcons() { _installed = false; }
