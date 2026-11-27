// @ts-check

import { toScreenOrder } from '../formats/color32Order.js';
import { decodePng } from '../render/textureReplacement.js';
import { SHIELD_TEXTURE_COUNT, shieldTextureName } from './shieldWidget.js';
import { cachedLoad } from '../assets/loadCache.js';

export const SHIELD_WIDGET_MOD = Object.freeze({
  guid: 'e59d8114-e9a2-4e8e-84e8-4666475dbb9f',
  title: 'Shield Widget',
  version: '1.6',
  author: 'RedRoryOTheGlen',
});

export function shieldTextureFileName(index) {
  const { archive, record, frame } = shieldTextureName(index);
  return `${archive}_${record}-${frame}`;
}

export const shieldSpritePath = (index) => `vendor/shield-widget/Textures/${shieldTextureFileName(index)}.png`;

// Archive, record, and frame are interpolated separately so the bundler carries all 600 files.
// vite.config.js refuses to inline anything under vendor/.
export const shieldSpriteUrl = (index) => {
  const { archive, record, frame } = shieldTextureName(index);
  return new URL(`../../vendor/shield-widget/Textures/${archive}_${record}-${frame}.png`, import.meta.url).href;
};

// The widget measures a sprite before any texture uploads. Archives: 112360 Buckler, 112361 Round, 112362 Kite,
// and 112363 Tower.
export const SHIELD_ARCHIVE_SIZES = Object.freeze({
  112360: Object.freeze({ width: 134, height: 131 }),
  112361: Object.freeze({ width: 157, height: 132 }),
  112362: Object.freeze({ width: 157, height: 125 }),
  112363: Object.freeze({ width: 196, height: 146 }),
});

export function shieldWidgetSize(index) {
  if (!(index >= 0 && index < SHIELD_TEXTURE_COUNT)) return null;
  return SHIELD_ARCHIVE_SIZES[shieldTextureName(index).archive] ?? null;
}

const _images = new Map();

// The PNG rows are already top-down for a screen quad, so this uses toScreenOrder and not the toColor32 flip.
export function shieldWidgetImage(index) {
  if (!(index >= 0 && index < SHIELD_TEXTURE_COUNT)) return Promise.resolve(null);
  return cachedLoad(_images, index, async () => {
    const res = await fetch(shieldSpriteUrl(index));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return toScreenOrder(await decodePng(new Uint8Array(await res.arrayBuffer())));
  }).catch((e) => {
    console.warn(`[shield widget] ${shieldTextureFileName(index)} would not load:`, e?.message ?? e);
    return null;
  });
}

export const shieldWidgetTextures = Object.freeze({ size: shieldWidgetSize, image: shieldWidgetImage });

export const SHIELD_ARCHIVES = Object.freeze(Object.keys(SHIELD_ARCHIVE_SIZES).map(Number));
