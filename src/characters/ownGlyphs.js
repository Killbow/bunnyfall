import { storedSession, SESSION_KEY } from '../net/accountClient.js';
import { appStorage } from '../platform/appStorage.js';
import { werewolfSkinOf } from './werewolfSkin.js';
import { AURAS, ICONS } from '../net/identityToken.js';

let _raw;
let _glyphs = [];
let _aura = null;
let _icon = null;
let _nameAsAt = null;
function read(storage) {
  let raw = null;
  try { raw = storage?.getItem?.(SESSION_KEY) ?? null; } catch { raw = null; }
  if (raw === _raw) return;
  _raw = raw;
  const s = storedSession(storage);
  _glyphs = Array.isArray(s?.glyphs) ? s.glyphs : [];
  _aura = typeof s?.aura === 'string' && AURAS.includes(s.aura) ? s.aura : null;
  _icon = typeof s?.icon === 'string' && ICONS.includes(s.icon) ? s.icon : null;
  _nameAsAt = Number.isSafeInteger(s?.nameAsAt) && s.nameAsAt > 0 ? s.nameAsAt : null;
}
export function ownGlyphs(storage = appStorage()) { read(storage); return _glyphs; }
export function ownAura(storage = appStorage()) { read(storage); return _aura; }
export function ownIcon(storage = appStorage()) { read(storage); return _icon; }
export function ownNameAsAt(storage = appStorage()) { read(storage); return _nameAsAt; }

export const ownWerewolfSkin = (storage = appStorage()) => werewolfSkinOf(ownGlyphs(storage));
