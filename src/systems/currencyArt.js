// @ts-check
// BUNNYFALL (Killbunny: "i have settled on Imperial Argents and Dusk Tokens, i have sent you pics for them"): THE TWO
// CURRENCIES' PICTURES. The Imperial Argent (the account's silver, "Marks" in the code) is the Imperial coin with the
// crowned eagle; the Dusk Token (the Cromwark reach's coin, `nyx` in the code) is the purple star card. Both ship as
// PNGs under public/art/bunnyfall-currency/, trimmed of their blank margin.
//
// The Argent is a picture for the page (a feed card's coin, the wallet): `argentUrl()`. The Dusk Token is also an ITEM,
// so it needs a place in the item lists' picture book: a numbered pseudo-archive of the port's own (CURRENCY_ARCHIVE,
// world/eliteGates/pseudoArchives.js), record 0, registered as a stand-in the way the Emperor's statue is
// (world/emperorMemorial.js). The pack, the Stores and the shop draw it through `registerOwnItemImage`
// (systems/wild/nyxShop.js).
import { APP_ROOT } from './appRoot.js';
import { addVendorTextures, decodePng } from './textureReplacement.js';

/** The currencies' pseudo-archive: record 0 the Dusk Token's picture. */
export const CURRENCY_ARCHIVE = 38331;
export const DUSK_TOKEN_RECORD = 0;

const root = () => APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/';
/** The Imperial Argent's coin, as a page picture. */
export const argentUrl = (r = root()) => new URL('art/bunnyfall-currency/imperial-argent.png', r).href;
/** The Dusk Token's card, as a page picture. */
export const duskTokenUrl = (r = root()) => new URL('art/bunnyfall-currency/dusk-token.png', r).href;

let _installed = false;
/** Register the Dusk Token's picture once, before the archives load. `fetchBytes()` is the test seam. @returns {number} */
export function installCurrencyArt({ fetchBytes = null } = {}) {
  if (_installed) return 0;
  _installed = true;
  const get = fetchBytes ?? (async () => {
    const r = await fetch(duskTokenUrl());
    if (!r.ok) throw new Error(`dusk-token: ${r.status}`);
    return new Uint8Array(await r.arrayBuffer());
  });
  return addVendorTextures([{
    archive: CURRENCY_ARCHIVE, record: DUSK_TOKEN_RECORD, frame: 0, standIn: true, fileName: 'bunnyfall-dusk-token',
    build: async () => ({ ...(await decodePng(await get())) }),
  }]);
}
export function _resetCurrencyArt() { _installed = false; }
