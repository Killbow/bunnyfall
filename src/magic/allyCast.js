// @ts-check
// Beneficial spells cast on party members and, by switch, on strangers. A player's vitals belong to their own
// client, so a cast on an ally is a `cast` frame the receiver applies itself, keeping only the effects it allows.
import { MAX_EFFECTS_PER_SPELL, SPELL_ICON_TOTAL } from './spellMaker.js';
import { TOUCH_RANGE, TOUCH_SPHERE_CAST_RADIUS } from './spellcast.js';
import { CAST_LEVEL_MAX } from '../net/wire.js';

// Matches PERSON_HIT_RADIUS in townTalk.js, copied so this module does not import a scene.
export const PERSON_RADIUS = 0.45;
// The touch reach against an enemy plus the person radius, because the ray distance is measured to their axis.
export const ALLY_TOUCH_REACH = TOUCH_RANGE + TOUCH_SPHERE_CAST_RADIUS + PERSON_RADIUS;
export const ALLY_RANGE_REACH = 24;

// Classic Daggerfall effect types. Harmful families such as Paralyze, Damage, Drain, Transfer, and Dispel are left
// out on purpose.
export const ALLY_CAST_TYPES = Object.freeze(new Set([3, 8, 9, 10, 13, 14, 15, 18, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 31, 35, 39, 44]));

export const allyEffect = (e) => !!e && Number.isInteger(e.type) && e.type >= 0 && ALLY_CAST_TYPES.has(e.type);

export function allyCastable(spell) {
  const fx = Array.isArray(spell?.effects) ? spell.effects.filter((e) => e && Number.isInteger(e.type) && e.type >= 0) : [];
  return fx.length > 0 && fx.every(allyEffect);
}

// Light, Detect, and Comprehend Languages are read only off the player, so on a companion they would do nothing.
export const COMPANION_UNREAD_TYPES = Object.freeze(new Set([15, 39, 44]));
export const companionEffect = (e) => allyEffect(e) && !COMPANION_UNREAD_TYPES.has(e.type);
export function companionCastable(spell) {
  return allyCastable(spell) && spell.effects.some(companionEffect);
}

// A CasterOnly gift arms while a party member is within this radius. The click then goes to the member under the
// crosshair, or else to the caster.
export const ALLY_ARM_RADIUS = 10;
export const ALLY_ARMED_LINE = 'Aim at a party member to cast it on them, or anywhere else to cast it on yourself.';
export const COMPANION_ARMED_LINE = 'Aim at your companion to cast it on them, or anywhere else to cast it on yourself.';
export const GIFT_LINE_QUIET_S = 10;
// Asking inside the window does not extend it, and the real clock is used so a paused game never stretches it.
export function createGiftLineGate(nowMs = () => performance.now()) {
  const said = new Map();
  const windowMs = GIFT_LINE_QUIET_S * 1000;
  return (key, fresh = false) => {
    const t = nowMs();
    const last = said.get(key);
    if (!fresh && last !== undefined && t - last < windowMs) return false;
    said.set(key, t);
    if (said.size > 64) for (const [k, at] of said) if (t - at >= windowMs) said.delete(k);
    return true;
  };
}

// Applied from a stranger only while the receiver's Spells from strangers switch is on.
export const STRANGER_CAST_TYPES = Object.freeze(new Set([3, 8, 9, 10, 18, 20, 27, 30, 35]));
export const strangerEffect = (e) => allyEffect(e) && STRANGER_CAST_TYPES.has(e.type);
export function strangerCastable(spell) {
  const fx = Array.isArray(spell?.effects) ? spell.effects.filter((e) => e && Number.isInteger(e.type) && e.type >= 0) : [];
  return fx.length > 0 && fx.every(strangerEffect);
}

// The gift always lands as a self-cast (rangeType 0), because DFU save-scales every external bundle, and the
// receiver, not the sender, decides that.
export function allyCastSpell(d, { stranger = false, companion = false } = {}) {
  if (!d || !Array.isArray(d.effects)) return null;
  const effects = d.effects.filter(stranger ? strangerEffect : companion ? companionEffect : allyEffect).slice(0, MAX_EFFECTS_PER_SPELL);
  if (!effects.length) return null;
  const icon = Number.isInteger(d.icon) && d.icon >= 0 && d.icon < SPELL_ICON_TOTAL ? d.icon : 0;
  return { name: typeof d.name === 'string' ? d.name : '', element: d.element ?? 4, rangeType: 0, effects, icon, index: -1, custom: true };
}

export function allyReachFor(rangeType) {
  if (rangeType === 0 || rangeType === 1) return ALLY_TOUCH_REACH;
  if (rangeType === 2) return ALLY_RANGE_REACH;
  return null;
}

// The level is clamped to CAST_LEVEL_MAX, because every door refuses a frame above it, including the relay.
export function allyCastFrame(spell, level, to) {
  return {
    to,
    level: Math.min(CAST_LEVEL_MAX, Math.max(1, Math.trunc(Number(level) || 1))),
    spell: {
      name: String(spell?.name ?? ''),
      element: spell?.element ?? 4,
      rangeType: spell?.rangeType === 2 ? 2 : 1,
      icon: Number.isInteger(spell?.icon) && spell.icon >= 0 && spell.icon < SPELL_ICON_TOTAL ? spell.icon : 0,
      effects: (Array.isArray(spell?.effects) ? spell.effects : []).filter((e) => e && Number.isInteger(e.type) && e.type >= 0).slice(0, MAX_EFFECTS_PER_SPELL),
    },
  };
}

export const allyCastCasterLine = (spellName, who) => `You cast ${spellName || 'a spell'} on ${who}.`;
export function allyCastCasterLineMany(spellName, names) {
  const list = [...new Set((names ?? []).filter(Boolean))];
  if (!list.length) return null;
  const who = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
  return allyCastCasterLine(spellName, who);
}
export const allyCastTargetLine = (who, spellName) => `${who} casts ${spellName || 'a spell'} on you.`;
export const allyCastPlaqueLine = (spellName, who) => `Cast ${spellName || 'the spell'} on ${who}`;
