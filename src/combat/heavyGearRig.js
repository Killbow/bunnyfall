// BUNNYFALL: THE WEAPON RIG'S HALF OF THE ROYAL BALLISTA AND THE GRAPPLING HOOK - what the rig (combat/weapon/weaponRig.js)
// asks once a frame and once a loose, so the rig itself gains a call and not the features. Every host's rig runs it.
//   - the ballista DRAWN slows every pace on foot (player/motor.js registerFootSpeedMod, BALLISTA_FOOT_MULT);
//   - the ballista AIMED (the button held) shows the bolt's arc and where it bursts (ui/heavyGearOverlay.js, the path
//     combat/ballista/ballistaFlight.js predictArc integrates by the flight's own law);
//   - the ballista LOOSED kicks the camera (Better Ambience's shaker, the Thunderlock's door) and thumps, and says so on
//     the wire (`shot.bl`, net/wire.js validPose `bl`) so peers draw the bolt on its arc;
//   - the HOOK in the hand takes the click (combat/grapple/grapple.js) instead of a swing, plays its own frames, and its
//     rope and rest are drawn.

import { registerFootSpeedMod } from '../player/motor.js';
import { betterAmbience } from '../audio/betterAmbience.js';
import { SOUND } from '../audio/soundClips.js';
import { isBallistaItem, isGrappleItem, BALLISTA_FOOT_MULT, BALLISTA_KICK } from '../characters/heavyGearIds.js';
import { predictArc, bindBallistaFx } from './ballista/ballistaFlight.js';
import { setGrappleHeld, grappleClick, grappleFrame, grappleView, bindGrappleSay } from './grapple/grapple.js';
import { drawHeavyGearOverlay } from '../ui/heavyGearOverlay.js';

let _ballistaDrawn = false;
registerFootSpeedMod('royal-ballista', () => (_ballistaDrawn ? BALLISTA_FOOT_MULT : 1));

let _rig = null;
let _wasHeld = false;

/** The rig's sounds and words, bound to the rig that steps (four hosts, four rigs; the stepping one owns them). */
function bindRig(rig, { audio, say, camera }) {
  if (_rig === rig) return;
  _rig = rig;
  bindBallistaFx({
    play: (at) => { const clip = SOUND.FallHard; if (clip != null) audio?.play3d?.(clip, at, 1, { maxDistance: 40, pitch: 0.7 }); },
    shake: (k) => betterAmbience.weaponKick?.(k),
    eye: () => camera?.()?.pos ?? null,
  });
  bindGrappleSay(say);
}

/**
 * Once a frame. Answers `{ grappling, hookFrame }`: whether the hand holds the hook (the rig then starts no swing and no
 * technique) and the hook's frame to draw.
 */
export function stepHeavyGear(rig, { dt, weapon, sheathed, held, canAttack, paralyzed, camera, collider, canvas, renderer, flip, audio, say }) {
  bindRig(rig, { audio, say, camera });
  const drawn = !sheathed && !paralyzed;
  _ballistaDrawn = drawn && isBallistaItem(weapon);
  const grappling = isGrappleItem(weapon);
  setGrappleHeld(grappling && drawn);
  let hookFrame = 0;
  if (grappling) {
    grappleClick(held && !_wasHeld && canAttack && !paralyzed);
    hookFrame = grappleFrame(dt);
  }
  _wasHeld = !!held;
  let arc = null;
  const cam = camera?.() ?? null;
  if (_ballistaDrawn && held && canAttack && cam?.pos) {
    const look = [Math.sin(cam.yaw ?? 0) * Math.cos(cam.pitch ?? 0), Math.sin(cam.pitch ?? 0), Math.cos(cam.yaw ?? 0) * Math.cos(cam.pitch ?? 0)];
    try { arc = predictArc(cam.pos, look, collider?.() ?? null); } catch { arc = null; }
  }
  if (canvas) {
    try { drawHeavyGearOverlay({ canvas, renderer, arc, grapple: grappling && drawn ? grappleView() : null, flip }); } catch (e) { console.warn('[heavyGear] overlay', e); }
  }
  return { grappling, hookFrame };
}

/** Once a loose (the rig's noteShot - every host's player loose calls it): the ballista's kick and thump, and the
 *  wire's word for the peers. */
export function noteHeavyShot(weapon, shot, { audio } = {}) {
  const bolt = isBallistaItem(weapon);
  if (shot) shot.bl = bolt ? 1 : 0;
  if (!bolt) return;
  try { betterAmbience.weaponKick?.(BALLISTA_KICK); } catch { /* the shake is not the shot's problem */ }
  try { if (SOUND.ArrowShoot != null) audio?.playOneShot?.(SOUND.ArrowShoot, 1, 0.55); } catch { /* nor the sound */ }
}
