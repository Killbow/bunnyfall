// Daggerfall Enemy Expansion's sprites on the texture door, each registered as the stand-in archive it is.

import { DEX_ART } from './dexArt.js';
import DERIVED from '../../../vendor/daggerfall-enemy-expansion/derived.json' with { type: 'json' };
import { addVendorTextures } from '../../render/textureReplacement.js';
import { buildDerivedPicture } from '../../formats/derivedTexture.js';
import { registerBillboardXml } from '../../world/billboardXml.js';
import { APP_ROOT } from '../../platform/appRoot.js';

export const DEX_OWN_ART = 'art/daggerfall-enemy-expansion/';
export const DEX_REPAINTED_ART = 'art/daggerfall-enemy-expansion-repainted/';
const artUrl = (dir, name) => new URL(`${dir}${name}.png`, APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/').href;
async function fetchPng(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`[DEX] ${url}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

export function dexSpriteEntries({ fetchBytes = fetchPng } = {}) {
  const out = [];
  for (const [a, art] of Object.entries(DEX_ART)) {
    const archive = Number(a), dir = art.from === 'repainted' ? DEX_REPAINTED_ART : DEX_OWN_ART;
    const source = (name) => (DERIVED[name] ? { build: (ctx) => buildDerivedPicture(DERIVED[name], ctx.classicRgba) } : { load: () => fetchBytes(artUrl(dir, name)) });
    art.frames.forEach((n, record) => {
      const maps = new Set(art.emissive?.[record] ?? []);
      for (let frame = 0; frame < n; frame++) {
        const name = `${archive}_${record}-${frame}`;
        out.push({ archive, record, frame, map: 'Albedo', standIn: true, readOnly: true, fileName: name, ...source(name) });
        if (maps.has(frame)) out.push({ archive, record, frame, map: 'Emission', standIn: true, readOnly: true, fileName: `${name}_Emission`, ...source(`${name}_Emission`) });
        else if (art.emission) out.push({ archive, record, frame, map: 'Emission', standIn: true, readOnly: true, fileName: `${name}_Emission`, ...source(name) });
      }
    });
  }
  return out;
}

export function dexXmlScales() {
  const out = {};
  for (const [a, art] of Object.entries(DEX_ART)) if (art.scale) out[a] = art.scale;
  return out;
}

let _installed = false;
export function installDexSprites(opts = {}) {
  if (_installed) return 0;
  _installed = true;
  registerBillboardXml('daggerfall-enemy-expansion', dexXmlScales());
  return addVendorTextures(dexSpriteEntries(opts));
}
export function _resetDexSprites() { _installed = false; }
