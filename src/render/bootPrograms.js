// @ts-check
// Starts compiling the world programs in the background, from the menu and again when the boot begins.
// Does nothing on the classic skin or without parallel compile.
import { EL_LANE, enhancedLightingOn } from './enhancedLighting.js';
import { airOn } from './airPass.js';
import { VolumetricClouds } from './volumetricClouds.js';
import { EnhancedSkyRenderer } from './enhancedSky.js';
import { DynamicSkiesRenderer } from './dynamicSkiesRenderer.js';
import { FarRingRenderer, ringDisabled } from './farRing.js';
import { isEnhanced } from '../ui/uiSkin.js';
import { getPref } from '../ui/uiPrefs.js';
import { modSetting } from '../mods/modSettings.js';

/** @param {URLSearchParams} params */
export function skyChoice(params) {
  const sky = params.get('sky');
  const enhancedLane = !!(isEnhanced() && sky !== 'classic' && getPref('enhancedEnvironments'));
  const dynamicOn = enhancedLane && (sky === 'dynamic' || (sky === null && !!modSetting('dynamic-skies', 'Enabled')));
  return { enhancedLane, dynamicOn, clouds: enhancedLane && params.get('clouds') !== 'off' };
}

/** @param {any} renderer @param {URLSearchParams} params */
export function startBootPrograms(renderer, params) {
  if (!isEnhanced()) return;
  const search = `?${params}`;
  const lane = enhancedLightingOn(search) ? EL_LANE : null;
  const sky = skyChoice(params);
  const skyPass = sky.dynamicOn ? DynamicSkiesRenderer : sky.enhancedLane ? EnhancedSkyRenderer : null;
  const pairs = [...(sky.clouds ? VolumetricClouds.bootPrograms() : []), ...(skyPass?.bootPrograms() ?? []), ...(ringDisabled(search) ? [] : FarRingRenderer.bootPrograms(lane))];
  // The boot builds the terrain clip only with Deep Waters on, and the terrain snow only on the enhanced sky.
  renderer.startWorldPrograms(lane, pairs, { clip: modSetting('iliac-puddle-no-more', 'Enabled') === true, snow: sky.enhancedLane, air: airOn(search) });
}
