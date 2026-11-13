// @ts-check
// BUNNYFALL: where the two currencies' pictures live (public/art/bunnyfall-currency/) - a leaf file, so a style sheet can
// name them without the texture door (systems/currencyArt.js, which registers the Dusk Token's picture for the item lists).
import { APP_ROOT } from './appRoot.js';

const root = () => APP_ROOT ?? globalThis.document?.baseURI ?? 'http://localhost/';
/** The Imperial Argent's coin, as a page picture. */
export const argentUrl = (r = root()) => new URL('art/bunnyfall-currency/imperial-argent.png', r).href;
/** The Dusk Token's card, as a page picture. */
export const duskTokenUrl = (r = root()) => new URL('art/bunnyfall-currency/dusk-token.png', r).href;
