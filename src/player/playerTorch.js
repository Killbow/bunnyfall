import { templateByIndex } from '../items/itemTemplates.js';
import { isLightSource, expandItemMacro } from '../items/useItem.js';
import { getBool } from '../platform/settings.js';
import { setLightSource } from '../items/lightSource.js';
import { modSetting } from '../mods/modSettings.js';
import { localizedText } from '../ui/textManager.js';

export const TORCH_TICK_SECONDS = 20;
export const GUTTERING_CONDITION = 3;
export const ITEM_BASED_TORCH_INTENSITY = 1.25;
export const GUTTER_BASE = 0.85;
export const GUTTER_SWING = 0.2;
export const GUTTER_STEP_LOW = -0.02;
export const GUTTER_STEP_HIGH = 0.06;
export const TORCH_OFFSET = Object.freeze({ left: 0.3, up: 1.2, forward: 0.2 });
export const LIGHT_DIES_TEXT = 'Your %it flickers and dies.';
export const LANTERN_TEMPLATE = 248;

export const torchRange = (item) =>
  (item ? templateByIndex(item.templateIndex)?.capacityOrTarget ?? 0 : 0);

const torchStateOf = (entity) => (entity._torch ??= { tickTimeBuffer: 0, guttering: 0 });

/**
 * @param entity
 * @param dtSeconds
 * @param fromItems
 * @param say
 * @param rolls
 * @param nameOf
 * @returns {{ lit: boolean, range: number, died: (object|null) }}
 */
export function tickPlayerTorch(entity, dtSeconds, { fromItems = null, say = null, rolls = Math.random, nameOf = null } = {}) {
  const enabled = fromItems ?? getBool('Enhancements', 'PlayerTorchFromItems');
  const st = torchStateOf(entity);
  const source = entity?.lightSource ?? null;
  if (!enabled || !source || !isLightSource(source)) {
    st.tickTimeBuffer = 0;
    st.guttering = 0;
    st.range = 0;
    return { lit: false, range: 0, died: null };
  }
  let lit = true;
  let died = null;
  const lantern = source.templateIndex === LANTERN_TEMPLATE;
  st.tickTimeBuffer = lantern ? 0 : st.tickTimeBuffer + dtSeconds;
  if (st.tickTimeBuffer > TORCH_TICK_SECONDS) {
    st.tickTimeBuffer = 0;
    if ((source.currentCondition ?? 0) > 0) source.currentCondition--;
    if (source.currentCondition === 0 && entity.lightSource === source) {
      say?.(expandItemMacro(localizedText('lightDies', LIGHT_DIES_TEXT), source, nameOf?.(source)));
      lit = false;
      setLightSource(entity, null);
      const items = entity.items ?? [];
      const i = items.indexOf(source);
      if (i >= 0) items.splice(i, 1);
      died = source;
    }
  }
  if (!lit) { st.guttering = 0; st.range = 0; return { lit: false, range: 0, died }; }
  let mod = ITEM_BASED_TORCH_INTENSITY;
  if (!lantern && (source.currentCondition ?? 0) < GUTTERING_CONDITION) {
    mod = GUTTER_BASE + Math.cos(st.guttering) * GUTTER_SWING;
    st.guttering += GUTTER_STEP_LOW + rolls() * (GUTTER_STEP_HIGH - GUTTER_STEP_LOW);
  } else {
    st.guttering = 0;
  }
  st.range = torchRange(source) * (mod / ITEM_BASED_TORCH_INTENSITY);
  return { lit: true, range: st.range, died };
}

export function playerTorchLight(entity, feet, yaw = 0) {
  const st = entity?._torch;
  if (!st || !(st.range > 0) || !feet) return null;
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const f = [sy, 0, cy];
  const r = [cy, 0, -sy];
  const o = lanternAtWaist(entity?.lightSource) ? (_waistOverride ?? LANTERN_HIP) : (_offsetOverride ?? TORCH_OFFSET);
  return {
    x: feet[0] - r[0] * o.left + f[0] * o.forward,
    y: feet[1] + o.up,
    z: feet[2] - r[2] * o.left + f[2] * o.forward,
    range: st.range,
    carried: true,
  };
}

let _offsetOverride = null;
export function setPlayerTorchOffsetOverride(o) { _offsetOverride = o ? { left: +o.left || 0, up: +o.up || 0, forward: +o.forward || 0 } : null; }
export const playerTorchOffsetOverride = () => _offsetOverride;

export const LANTERN_HIP = Object.freeze({ left: -0.2, up: 1.0, forward: 0.1 });

export function lanternAtWaist(item) {
  if (!item || item.templateIndex !== LANTERN_TEMPLATE) return false;
  if (item.beltLantern === true) return true;
  return modSetting('handheld-torches', 'Enabled') === true && modSetting('handheld-torches', 'Handling.LanternsAtWaist') === true;
}

export const waistLanternPoseBit = (light) => (lanternAtWaist(light) ? 1 : undefined);

let _waistOverride = null;
const _waistPoint = { left: 0, up: 0, forward: 0 };
export function setPlayerWaistLightOverride(o) {
  if (!o) { _waistOverride = null; return; }
  _waistPoint.left = +o.left || 0; _waistPoint.up = +o.up || 0; _waistPoint.forward = +o.forward || 0;
  _waistOverride = _waistPoint;
}
export const playerWaistLightOverride = () => _waistOverride;

export const PEER_LIGHT_RADIUS_MAX = 63;
let _peerRangeMax = 0;
export const peerLightRangeMax = () => (_peerRangeMax ||= Math.max(1, ...[247, 248, 253].map((templateIndex) => torchRange({ templateIndex }))));

export function torchPoseByte(entity) {
  const st = entity?._torch, src = entity?.lightSource;
  if (!st || !(st.range > 0) || !src) return undefined;
  const r = Math.max(1, Math.min(PEER_LIGHT_RADIUS_MAX, Math.round(torchRange(src))));
  return r * 2 + (src.templateIndex !== LANTERN_TEMPLATE && (src.currentCondition ?? 0) < GUTTERING_CONDITION ? 1 : 0);
}

export function peerTorchLight(pose, feet, phase = 0) {
  const lt = pose?.lt | 0;
  if (!(lt > 1) || !feet) return null;
  let range = Math.min(lt >> 1, peerLightRangeMax());
  if (lt & 1) range *= (GUTTER_BASE + Math.cos(phase * 1.2) * GUTTER_SWING) / ITEM_BASED_TORCH_INTENSITY;
  const yaw = Number.isFinite(pose.yaw) ? pose.yaw : 0;
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const o = pose.hl ? LANTERN_HIP : TORCH_OFFSET;
  return {
    x: feet[0] - cy * o.left + sy * o.forward,
    y: feet[1] + o.up,
    z: feet[2] + sy * o.left + cy * o.forward,
    range,
    carried: true,
  };
}
