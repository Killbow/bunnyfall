// @ts-check

import { t } from '../ui/textManager.js';
import { isShop } from '../trade/shopStock.js';
import { seededRng } from '../weather/wind.js';

export const LAMP_KEEPER_ODDS = 25;
export const LAMP_KEEPER_ARCHIVE = 182;
export const LAMP_KEEPER_RECORDS = Object.freeze([0, 1, 2]);
export const LAMP_CLASSIC = Object.freeze({ archive: 197, record: 6 });
// A port-only archive key listed in eliteGates/pseudoArchives.js, so a pack's replacement for 197_6 never replaces
// the lamp.
export const LAMP_ARCHIVE = 38232;
// Must match TITLES in net/identityToken.js and LAMP_TITLE in server-account/src/lamp.js.
export const LAMP_TITLE = 'ilovelamp';
export const LAMP_SALT = 0x4c414d50;

// `buildingFactionId` is the building's own RMB faction, never a FACTION.TXT lookup, so every client makes the same
// pick.
export const isLampCandidate = (pn, buildingType, buildingFactionId = 0) => !!pn && isShop(buildingType)
  && ((pn.textureArchive === LAMP_KEEPER_ARCHIVE && LAMP_KEEPER_RECORDS.includes(pn.textureRecord))
    || (!!buildingFactionId && pn.factionID === buildingFactionId));

/**
 * @param {any} pn
 * @param {{ buildingType?: number, buildingFactionId?: number, buildingKey?: number, mapId?: number, day?: number }} where
 */
export function isLampKeeper(pn, { buildingType = -1, buildingFactionId = 0, buildingKey = 0, mapId = 0, day = 0 } = {}) {
  if (!isLampCandidate(pn, buildingType, buildingFactionId)) return false;
  const seed = ((mapId >>> 0) ^ Math.imul(buildingKey | 0, 0x9e3779b1) ^ Math.imul(day | 0, 0x85ebca6b) ^ Math.imul((pn.position ?? 0) | 0, 0xc2b2ae35) ^ LAMP_SALT) >>> 0;
  return Math.floor(seededRng(seed)() * LAMP_KEEPER_ODDS) === 0;
}

export const LAMP_LINES = Object.freeze([
  () => [t('lamp.line.0a', 'The lamp regards you.'), t('lamp.line.0b', '"Yes, I am a lamp. No, I do not wish to discuss it. Are you buying or not?"')],
  () => [t('lamp.line.1a', 'The lamp flickers, a little embarrassed.'), t('lamp.line.1b', '"I was an ordinary shopkeeper until the business in Kludge Town. Now I am a lamp. Trade has never been better."')],
  () => [t('lamp.line.2a', 'The flame leans toward you.'), t('lamp.line.2b', '"Do not stare at the wick, friend. It is rude, and it is also my face."')],
  () => [t('lamp.line.3a', 'The lamp burns a little brighter.'), t('lamp.line.3b', '"Twenty years behind this counter and nobody’s ever asked how the lamp is doing. You’re the first. I love you. I mean... I love lamp."')],
]);
export const lampLines = (day = 0) => LAMP_LINES[((day | 0) % LAMP_LINES.length + LAMP_LINES.length) % LAMP_LINES.length]();

export const LAMP_TEXT = Object.freeze({
  name: () => t('lamp.name', 'Lamp'),
  trade: () => t('lamp.trade', 'Trade'),
  leave: () => t('lamp.leave', 'Leave'),
  granted: () => t('lamp.granted', 'The lamp glows warmly. You have earned the title I Love Lamp.'),
  guest: () => t('lamp.guest', 'Add a username to your account to keep the title I Love Lamp.'),
  offline: () => t('lamp.offline', 'I Love Lamp is a title for your account. Speak to a lamp online to earn it.'),
  signin: () => t('lamp.signin', 'Sign in to an account to earn the title I Love Lamp.'),
});

/** @param {{ claim?: (() => Promise<any>) | null, account?: () => (string|null), say?: (text: string) => void, announce?: (kind: 'title', key: string) => any }} deps */
export function createLampTitle({ claim = null, account = () => null, say = () => {}, announce = () => {} } = {}) {
  let busy = false, done = false, whose = /** @type {string|null|undefined} */ (undefined);
  const told = new Set();
  const tell = (k, text) => { if (!told.has(k)) { told.add(k); say(text); } };
  const who = () => account?.() ?? null;
  return {
    async speak() {
      const id = who();
      if (id !== whose) { whose = id; done = false; told.clear(); }
      if (done) return 'done';
      if (!claim) { tell('offline', LAMP_TEXT.offline()); return 'offline'; }
      if (busy) return 'busy';
      busy = true;
      let a;
      try { a = await claim(); } catch { a = { ok: false, error: 'offline' }; } finally { busy = false; }
      // The account changed while the claim was in flight, so its answer is dropped.
      if (who() !== id) return 'failed';
      if (a?.ok && a.data?.granted === true) { done = true; say(LAMP_TEXT.granted()); announce('title', LAMP_TITLE); return 'granted'; }
      if (a?.ok && a.data?.why === 'held') { done = true; return 'held'; }
      if (a?.ok && a.data?.why === 'guest') { tell('guest', LAMP_TEXT.guest()); return 'guest'; }
      if (a?.error === 'no-session' || a?.error === 'auth') { tell('signin', LAMP_TEXT.signin()); return 'signin'; }
      return 'failed';
    },
  };
}
