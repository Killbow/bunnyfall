// The weapon rig's half of the Royal Ballista and the Grappling Hook, called once per frame and once per shot. A drawn
// ballista slows the player on foot (registerFootSpeedMod). An aimed one shows the bolt's arc (ui/heavyGearOverlay.js),
// and a loosed one kicks the camera and sets `shot.bl` (net/wire.js) so peers see its arc. The hook, thrown from the
// pack on its own key, runs in combat/grapple/grapple.js. It plays its own frames, and its rope and cooldown are drawn.

import { registerFootSpeedMod } from '../player/motor.js';
import { betterAmbience } from '../audio/betterAmbience.js';
import { SOUND } from '../audio/soundClips.js';
import { t } from '../ui/textManager.js';
import { isBallistaItem, BALLISTA_FOOT_MULT, BALLISTA_KICK } from '../characters/heavyGearIds.js';
import { predictArc, bindBallistaFx } from './ballista/ballistaFlight.js';
import { grappleClick, grappleFrame, grappleView, grappleThrowing, bindGrappleSay, stopGrappleWindup, cancelGrapple } from './grapple/grapple.js';
import { setDeathListener } from '../characters/playerEntity.js';
import { drawHeavyGearOverlay } from '../ui/heavyGearOverlay.js';

let _ballistaDrawn = false;
registerFootSpeedMod('royal-ballista', () => (_ballistaDrawn ? BALLISTA_FOOT_MULT : 1));

let _rig = null;
setDeathListener('grapplingHook', () => cancelGrapple());

/** Only the classic sprite lane has hook frames: none under the Morrowind arms or the third-person body. */
export const hookFramesDraw = (hooking, { arms = false, body = false } = {}) => !!hooking && !arms && !body;
let _hookWas = false;

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

export function stepHeavyGear(rig, { dt, weapon, sheathed, held, canAttack, paralyzed, hookDown, canHook, hasHook, camera, collider, canvas, renderer, flip, audio, say }) {
  bindRig(rig, { audio, say, camera });
  const drawn = !sheathed && !paralyzed;
  _ballistaDrawn = drawn && isBallistaItem(weapon);
  const edge = !!hookDown && !_hookWas && !!canHook && !paralyzed;
  if (edge && !hasHook) say?.(t('grapple.noHook', 'You do not have a grappling hook.'));
  else grappleClick(edge);
  _hookWas = !!hookDown;
  if (paralyzed) stopGrappleWindup();
  const hookFrame = grappleFrame(dt);
  const grappling = grappleThrowing();
  let arc = null;
  const cam = camera?.() ?? null;
  if (_ballistaDrawn && held && canAttack && cam?.pos) {
    const look = [Math.sin(cam.yaw ?? 0) * Math.cos(cam.pitch ?? 0), Math.sin(cam.pitch ?? 0), Math.cos(cam.yaw ?? 0) * Math.cos(cam.pitch ?? 0)];
    try { arc = predictArc(cam.pos, look, collider?.() ?? null); } catch { arc = null; }
  }
  if (canvas) {
    try { drawHeavyGearOverlay({ canvas, renderer, arc, grapple: grappleView(), flip }); } catch (e) { console.warn('[heavyGear] overlay', e); }
  }
  return { grappling, hookFrame };
}

export function noteHeavyShot(weapon, shot, { audio } = {}) {
  const bolt = isBallistaItem(weapon);
  // The pose wire carries bl so peers draw the ballista bolt on its arc.
  if (shot) shot.bl = bolt ? 1 : 0;
  if (!bolt) return;
  try { betterAmbience.weaponKick?.(BALLISTA_KICK); } catch { }
  try { if (SOUND.ArrowShoot != null) audio?.playOneShot?.(SOUND.ArrowShoot, 1, 0.55); } catch { }
}
