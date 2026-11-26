// Sprites of the Detailed Ships mod, registered as stand-ins of archives 1210 and 1230. Nine are rebuilt from the
// player's own classic textures and four come as PNG files.
import DERIVED from '../../../vendor/detailed-ships/Textures/derived.json' with { type: 'json' };
import { addVendorTextures } from '../../render/textureReplacement.js';
import { registerBillboardXml } from '../../world/billboardXml.js';
import { buildDerivedPicture } from '../../formats/derivedTexture.js';
import { modSetting } from '../../mods/modSettings.js';
import { installDetStandIns } from '../../world/detStandIns.js';

export const DETAILED_SHIPS_VENDOR = 'detailed-ships';
export const detailedShipsOn = () => modSetting(DETAILED_SHIPS_VENDOR, 'Enabled') === true;

// Town mods show these pictures too, so they appear while a town mod is on, whatever this mod's own switch says.
const _sharedArt = new Set();
export function shareDetailedShipsArt(isOn) { if (typeof isOn === 'function') _sharedArt.add(isOn); }
export const detailedShipsArtOn = () => {
  if (detailedShipsOn()) return true;
  for (const g of _sharedArt) if (g() === true) return true;
  return false;
};

export const DETAILED_SHIPS_OWN_ART = Object.freeze(['1210_10-0', '1210_11-0', '1210_12-0', '1230_30-0']);
export const DETAILED_SHIPS_DERIVED = DERIVED;

export const DETAILED_SHIPS_XML = Object.freeze({
  1210: Object.freeze({ 1: Object.freeze([0.5, 0.5]), 3: Object.freeze([0.75, 0.75]), 4: Object.freeze([0.5, 0.5]), 17: Object.freeze([0.5, 0.5]), 18: Object.freeze([0.75, 0.75]) }),
  1230: Object.freeze({ 30: Object.freeze([0.2, 0.2]) }),
});

export const detailedShipsArtUrl = (name) => new URL(`../../../vendor/detailed-ships/Textures/${name}.png`, import.meta.url).href;
const parseName = (name) => { const m = /^(\d+)_(\d+)-(\d+)$/.exec(name); return { archive: Number(m[1]), record: Number(m[2]), frame: Number(m[3]) }; };

let _installed = false;
export function installDetailedShipsArt({ fetchBytes = null } = {}) {
  if (_installed) return 0;
  _installed = true;
  registerBillboardXml(DETAILED_SHIPS_VENDOR, DETAILED_SHIPS_XML, detailedShipsArtOn);
  const load = fetchBytes ?? (async (name) => { const r = await fetch(detailedShipsArtUrl(name)); if (!r.ok) throw new Error(`${name}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); });
  const own = DETAILED_SHIPS_OWN_ART.map((name) => ({ ...parseName(name), fileName: name, standIn: true, gate: detailedShipsArtOn, load }));
  const derived = Object.entries(DERIVED).map(([name, spec]) => ({
    ...parseName(name), fileName: name, standIn: true, gate: detailedShipsArtOn,
    build: (ctx) => buildDerivedPicture(spec, ctx.classicRgba),
  }));
  installDetStandIns(detailedShipsOn);
  return addVendorTextures([...own, ...derived]);
}
export function _resetDetailedShipsArt() { _installed = false; _sharedArt.clear(); }
