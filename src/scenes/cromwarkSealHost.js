// @ts-check
// The sealed city of Cromwark as world addon hooks. The barrier check runs before the modal arm and after the motor and
// turns the player back; the seal and reach beacon draw in the translucent pass.
import { CROMWARK_ON } from '../world/wild/cromwark.js';
import { cromwarkSeal, sealCrossed, CROMWARK_CITY } from '../world/wild/cromwarkBarrier.js';
import { CromwarkSealRenderer } from '../render/cromwarkSeal.js';
import { HEIGHTMAP_DIMENSION, sampleKernel } from '../world/terrainSampler.js';
import { setMidScreenText } from '../ui/midScreenText.js';
import { surfacePlayer } from '../characters/playerEntity.js';

export function createCromwarkSealHost(d) {
  const citySeal = cromwarkSeal(d.exteriorData);
  let sealPass = null, sealPending = false, sealSafe = null, sealNoticeAt = -Infinity, sealGround = null;
  const sealShape = citySeal ? { ...citySeal, x: 0, z: 0, y: 0 } : null;
  const previousFeet = [0, 0, 0];
  const eye32 = new Float32Array(3);
  function sealInScene() {
    if (!citySeal) return null;
    const t = d.state.pixelTranslation(CROMWARK_CITY.px, CROMWARK_CITY.py);
    const x = t[0] + citySeal.x, z = t[2] + citySeal.z;
    const ground = d.built.get('823,35')?.locOrigin?.[1];
    if (Number.isFinite(ground)) sealGround = ground;
    if (sealGround == null && d.woods()) {
      // Match the location builder's mean, not an unbuilt pixel's raw centre
      // sample. Keep it when the city streams out and add current compensation.
      const kernel = sampleKernel(d.woods(),823,35,HEIGHTMAP_DIMENSION,true,d.landformsHere());
      let sum = 0;
      for (let ix=0; ix<HEIGHTMAP_DIMENSION; ix++) for(let iz=0; iz<HEIGHTMAP_DIMENSION; iz++) sum += Math.fround(kernel(ix,iz));
      sealGround = sum/(HEIGHTMAP_DIMENSION*HEIGHTMAP_DIMENSION)*d.worldHeight+.05;
    }
    sealShape.x = x; sealShape.z = z; sealShape.y = (sealGround ?? 0) + t[1];
    return sealShape;
  }
  function enforceCitySeal() {
    if (sealPending) return true;
    if (!CROMWARK_ON || !citySeal || !d.walkMode || !d.playerSpawned() || !d.bootLoaded() || d.loading() || d.modes()?.transitioning || d.teleporting()) { sealSafe = null; return false; }
    const seal = sealInScene(), feet = d.player.feetAt();
    const old = sealSafe ? d.state.localFromWorld(sealSafe.x, sealSafe.z) : null;
    let previous = null;
    if (old) { previousFeet[0] = old[0]; previousFeet[1] = feet[1]; previousFeet[2] = old[1]; previous = previousFeet; }
    const indoors = d.mode() !== 'exterior';
    const blocked = indoors ? d.state.current.x === 823 && d.state.current.y === 35 : sealCrossed(seal, previous, feet);
    if (!blocked) { sealSafe = indoors ? null : d.state.worldCoords(feet); return false; }
    if (performance.now() - sealNoticeAt > 4000) {
      sealNoticeAt = performance.now(); setMidScreenText('Cromwark is sealed. A dark force drives you back.');
    }
    if (!indoors && previous && Math.hypot(previous[0]-feet[0], previous[2]-feet[2]) < 80) {
      d.player.spawn(previous[0], previous[1], previous[2]); d.cam.pos = d.player.eyeAt(); return false;
    }
    sealPending = true; sealSafe = null;
    Promise.resolve().then(async () => {
      d.modes()?.forceExitToExterior();
      await d.teleportToPixel(823, 36, null, { grounded: true }); surfacePlayer();
    }).catch(e => console.error('[cromwark] seal relocation failed', e)).finally(() => { sealPending = false; });
    return true;
  }
  function drawShape(shape, proj, view, eye, now) {
    if (Math.hypot(eye[0]-shape.x, eye[2]-shape.z)<shape.radius+6000) {
      sealPass ??= new CromwarkSealRenderer(d.renderer.gl);
      if (sealPass.draw(shape, proj, view, eye32, now/1000)) d.renderer.markForeignPass();
    }
  }
  function drawSeal(proj, view, eye, now) {
    if (CROMWARK_ON && d.mode() === 'exterior') {
      const seal = sealInScene(), beacons = d.beacons();
      eye32[0] = eye[0]; eye32[1] = eye[1]; eye32[2] = eye[2];
      if (seal) drawShape(seal, proj, view, eye, now);
      for (const shape of beacons) drawShape(shape, proj, view, eye, now);
    }
  }
  return {
    preModal: enforceCitySeal,
    postMotor: enforceCitySeal,
    translucentDraw: drawSeal,
    dispose() { sealPass?.dispose(); sealPass = null; },
    sealInScene,
    pending: () => sealPending,
    clearSafe() { sealSafe = null; },
  };
}
