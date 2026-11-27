export const BALLISTA_TEMPLATE = 564;
export const GRAPPLE_TEMPLATE = 565;
export const GRAPPLE_ARCHIVE = 565;
export const BALLISTA_ARCHIVE = 564;

export const isBallistaItem = (item) => item?.templateIndex === BALLISTA_TEMPLATE;
export const isGrappleItem = (item) => item?.templateIndex === GRAPPLE_TEMPLATE;
export const GRAPPLE_HAND_ITEM = Object.freeze({ group: 'Weapons', templateIndex: GRAPPLE_TEMPLATE, material: 0 });

export const BALLISTA_DAMAGE_MULT = 1.4;
export const BALLISTA_SPAN = Object.freeze({ min: Math.round(5 * BALLISTA_DAMAGE_MULT), max: Math.round(19 * BALLISTA_DAMAGE_MULT) });
export const BALLISTA_COOLDOWN_MULT = 3;
export const BALLISTA_EQUIP_DELAY = 6000;
export const BALLISTA_FOOT_MULT = 0.6;

export const BOLT_SPEED = 28;
export const BOLT_GRAVITY = 14;
export const BURST_RADIUS = 3.5;
export const BURST_FLASH_ARCHIVE = 375;
export const BURST_FLASH_SCALE = 2.4;
export const BALLISTA_KICK = 4;
export const BURST_KICK = 2.5;
export const BURST_SHAKE_RANGE = 14;

export const GRAPPLE_RANGE = 32;
export const HOOK_SPEED = 60;
export const PULL_SPEED = 17;
export const GRAPPLE_COOLDOWN_S = 6;
export const GRAPPLE_MISS_COOLDOWN_S = 1.5;
export const PULL_ARRIVE = 0.35;
export const FLOOR_NORMAL_Y = 0.6;
export const LEDGE_REACH = 1.2;
