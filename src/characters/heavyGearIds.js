// BUNNYFALL: THE ROYAL BALLISTA'S AND THE GRAPPLING HOOK'S NUMBERS and nothing else, no imports (a leaf, as crossbowIds.js
// and thunderlockIds.js are): characters/weapons.js, combat/fpsWeapon.js, combat/arrowFlight.js and player/motor.js all ask
// them and cannot import the weapons' home (systems/heavyGear.js) without a cycle.
//
// The owner (2026-11-20): "a royal ballista, an even heavier crossbow that shoots small arrow aoes, in an arch instead of a
// straight line but slows down your movement, with a visible aiming arch and screen shake and the grappling hook, wich can
// be used to fire in a direction and be pulled there with a cooldown".

/** The custom template indices, past the crossbow's 563. Their pictures are archives of the same numbers (the Pistolet's
 *  rule): no TEXTURE.564 or 565 exists in ARENA2, so the art is registered as stand-ins (systems/heavyGear.js). */
export const BALLISTA_TEMPLATE = 564;
export const GRAPPLE_TEMPLATE = 565;
export const BALLISTA_ARCHIVE = 564;
export const GRAPPLE_ARCHIVE = 565;

export const isBallistaItem = (item) => item?.templateIndex === BALLISTA_TEMPLATE;
export const isGrappleItem = (item) => item?.templateIndex === GRAPPLE_TEMPLATE;

// ── THE ROYAL BALLISTA ───────────────────────────────────────────────
// A bow-class weapon on the bow's own machine, as the crossbow is: it spends arrows and is scored on Archery.

/** Damage: the Long Bow's 5-19 times this, per bolt (the crossbow's is 1.6 - the ballista trades a little of the single
 *  hit for the burst, which strikes every hostile thing round where the bolt lands). */
export const BALLISTA_DAMAGE_MULT = 1.4;
export const BALLISTA_SPAN = Object.freeze({ min: Math.round(5 * BALLISTA_DAMAGE_MULT), max: Math.round(19 * BALLISTA_DAMAGE_MULT) });
/** Its rest after a shot: the bow's times this (the crossbow's is 2). */
export const BALLISTA_COOLDOWN_MULT = 3;
/** Swapping to it, in ms (the crossbow's is 5000). */
export const BALLISTA_EQUIP_DELAY = 6000;
/** While it is drawn (not sheathed) every pace on foot is this share of itself. */
export const BALLISTA_FOOT_MULT = 0.6;

/** THE BOLT'S ARC. It leaves at BOLT_SPEED along the look and falls under BOLT_GRAVITY (m/s, m/s^2): about 56 m of reach at
 *  45 degrees, a flat shot dropping a metre over the first 12 m. Both the flight (combat/ballista/ballistaFlight.js
 *  bendBolt) and the aiming arc (predictArc) integrate these, so the arc drawn is the path flown. */
export const BOLT_SPEED = 28;
export const BOLT_GRAVITY = 14;
/** The burst where it lands: every hostile body within this many metres of the spot (to its capsule) is struck. */
export const BURST_RADIUS = 3.5;
/** The burst's flash: the fire missile's impact (archive 375, record 1), drawn this much larger. */
export const BURST_FLASH_ARCHIVE = 375;
export const BURST_FLASH_SCALE = 2.4;
/** The camera's kick on the loose and on a burst close by (Better Ambience's shaker, the Thunderlock's door). */
export const BALLISTA_KICK = 4;
export const BURST_KICK = 2.5;
/** A burst further than this from the player shakes nothing. */
export const BURST_SHAKE_RANGE = 14;

// ── THE GRAPPLING HOOK ───────────────────────────────────────────────

/** How far the hook flies, in metres. */
export const GRAPPLE_RANGE = 32;
/** Its flight speed and the pull's, m/s. */
export const HOOK_SPEED = 60;
export const PULL_SPEED = 17;
/** The rest after a throw that caught, and after one that met nothing. */
export const GRAPPLE_COOLDOWN_S = 6;
export const GRAPPLE_MISS_COOLDOWN_S = 1.5;
/** The pull ends this close to its mark. */
export const PULL_ARRIVE = 0.35;
/** A surface whose normal's y is at least this is a floor or a top: the body is set standing on it. Below, a wall: the
 *  body is pulled to hang under the hook, and onto the top just over it when there is one within reach. */
export const FLOOR_NORMAL_Y = 0.6;
/** From a wall hit, the top looked for: no higher than this over the hook. */
export const LEDGE_REACH = 1.2;
