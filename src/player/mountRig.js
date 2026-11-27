// Mount rig: the transport picker, the horse and cart sprite, riding sounds, and the enhanced riding terrain ring.
// The ship is a teleport only the streaming world host can wire; other hosts pass a null ship hook.

import { TRANSPORT_MODES, isRiding, hasHorse, hasCart } from '../travel/transport.js';
import { RidingAnimator, loadRidingArt, ridingRect, ridingLook, RIDING_VOLUME_SCALE } from '../travel/riding.js';
import { riddenHorseLook } from '../travel/horseCoats.js';
import { TransportWindow, transportArtLoaded } from '../ui/transportWindow.js';
import { enhancedWindow } from '../ui/enhancedPorts.js';
import { ownsShip } from '../trade/banking.js';
import { horseOffsetHeight, dockedLargeHudHeight } from '../ui/hudLarge.js';
import { mwViewHides, mwViewDrawSaddle } from './mwView.js';
import { SOUND } from '../audio/soundClips.js';
import { horseVolume } from '../audio/animalVolume.js';
import { isShipAvailable } from '../systems/naval/ship.js';
import { NATIVE_SCREEN_HEIGHT } from '../travel/riding.js';
import { RR_RIDING, rrTerrainAngle, rrTerrainFollow, rrRidingYAdj, rrRidingNeckBand } from '../mods/rrRealism.js';
import { setPitchFloorProvider } from './lookFilter.js';
import { uiCanvas, onUiScreen } from '../ui/uiScreen.js';
import { noteFirstUse } from '../ui/tutorials.js';
import { fpLightingOn } from '../combat/fpsWeapon.js';
import { enhancedSoundsOn } from '../audio/enhancedSounds.js';
import { createHorseVoice, hoofClipFor, installHorseSounds } from '../travel/horseVoice.js';

/** @param deps */
export function createMountRig({
  renderer, canvas, fetchBytes, palette, audio,
  player, playerEntity, showOverlay, onShip = null, paused = () => false,
  shipLocation = null,
  lookPitch = null, lookYaw = null, groundHeightAt = null, enhancedRiding = null,
  ridingVolumeScale = () => 1,
  horseCart = null,
  surfaceKind = null, foesNear = null, horseBreath = null, soundsOn = enhancedSoundsOn,
}) {
  const animator = new RidingAnimator();
  const voice = createHorseVoice();
  const _terrainAngles = new Array(RR_RIDING.samples).fill(0);
  let _sampleIdx = 0;
  let _terrainAngle = 0;
  function liftForLook(rect, art, enhanced) {
    const c = canvasOf();
    _terrainAngle = rrTerrainFollow(_terrainAngles, enhanced.softenFollow ?? 0, enhanced.terrainFollowing !== false);
    const pitchDeg = -((lookPitch?.() ?? 0) * 180) / Math.PI;
    const yAdj = rrRidingYAdj(pitchDeg, _terrainAngle);
    const scaleY = c.height / NATIVE_SCREEN_HEIGHT;
    const offset = Math.trunc(dockedLargeHudHeight());
    rect.y = c.height - ((art.height + yAdj) * scaleY) - offset;
    return { yAdj, scaleY, c, offset };
  }
  function drawNeckBand({ yAdj, scaleY, c, offset }, rect, art, r, tint) {
    const drawBottom = rect.y + rect.h - scaleY;
    if (drawBottom >= c.height) return;
    const band = rrRidingNeckBand(yAdj);
    const scaleX = rect.w / art.width;
    renderer.drawScreenQuad(art.frames[r.frame], { x: rect.x, y: drawBottom, w: (art.width - band.widthTrim) * scaleX, h: c.height - drawBottom + scaleY - offset }, { u0: band.u0, v0: band.v0, u1: band.u1, v1: band.v1 }, tint);
  }
  setPitchFloorProvider(() => (enhancedRiding?.() && isRiding(player.transportMode) && !paused() ? _terrainAngle + RR_RIDING.pitchMaxOffset : null));
  let art = null;
  const canvasOf = () => uiCanvas(typeof canvas === 'function' ? canvas() : canvas);

  // Every path that changes the mode goes through here so the art always loads with it.
  function setMode(mode) {
    player.setTransportMode(mode);
    voice.mount(isRiding(mode));
    // Daggerfall Unity stops riding sounds on every mode change; a door gives no further outdoor frame to do it.
    audio.setLoop('riding', null);
    animator.mount(mode);
    art = null;
    loadArt(mode);
  }
  const lookNow = (mode) => ridingLook(mode, riddenHorseLook(playerEntity?.items ?? []));
  let _artFor = null;
  const artKey = (mode) => `${mode}:${lookNow(mode)}`;
  const letGo = (a) => { if (a?.look) for (const rec of a.records ?? []) renderer?.evictTexture?.(`img_${rec}`); };
  let _lastArt = null;
  let _req = 0;
  function loadArt(mode) {
    _artFor = isRiding(mode) ? artKey(mode) : null;
    if (!_artFor) return;
    const id = ++_req;
    loadRidingArt(fetchBytes, palette, renderer, mode, lookNow(mode))
      .then((a) => {
        if (id !== _req) { if (a.look !== art?.look && a.look !== _lastArt?.look && a.look !== lookNow(mode)) letGo(a); return; }
        if (_lastArt && _lastArt.look !== a.look) letGo(_lastArt);
        _lastArt = a;
        if (player.transportMode === mode) art = a;
      })
      .catch((e) => console.warn('[transport] mount art unavailable:', e?.message ?? e));
  }

  return {
    setMode,
    loaded: () => !!art,
    _setArt: (a) => { art = a; },

    open() {
      if (!player.grounded || !transportArtLoaded()) return;
      noteFirstUse('horse');
      const rt = horseCart?.() ?? null;
      showOverlay(enhancedWindow(new TransportWindow({
        hasHorse: rt ? !!rt.canMountHorseFromTransportWindow() : hasHorse(playerEntity.items ?? []),
        hasCart: rt ? !!rt.canUseCartFromTransportWindow() : hasCart(playerEntity.items ?? []),
        shipAvailable: isShipAvailable({ canSail: !!onShip, ownsShip: ownsShip(playerEntity), ...(shipLocation?.() ?? {}) }),
        onMode: (mode) => {
          if (mode === TRANSPORT_MODES.Ship) { onShip?.(); return; }
          if (rt && (mode === TRANSPORT_MODES.Horse || mode === TRANSPORT_MODES.Cart)) { rt.tryUseTransport(mode); return; }
          setMode(mode);
        },
      }), 'transport'));
    },

    frame(dt) {
      const ridePaused = paused();
      const r = animator.update(dt, {
        mode: player.transportMode,
        standingStill: player.standing,
        grounded: player.grounded,
        paused: ridePaused,
        movingLessThanHalfSpeed: player.movingLessThanHalfSpeed,
        running: player.isRunning,
        walking: !!player.rideWalking,
        soundVolume: ridingVolumeScale(),
      });
      const horse = horseVolume();
      const voiced = !!soundsOn() && isRiding(player.transportMode);
      if (voiced) {
        installHorseSounds(audio);
        const shots = voice.update(dt, { neigh: r.neigh, clip: r.clip, moving: r.playing && !player.standing, running: player.isRunning, pitch: r.pitch, paused: ridePaused, breath: horseBreath?.()?.amount ?? null, foesNear });
        for (const s of shots) audio.playOneShot(s.clip, s.volume * RIDING_VOLUME_SCALE * ridingVolumeScale() * horse, s.pitch);
      } else {
        voice.hush();
        if (r.neigh) audio.playOneShot(SOUND.AnimalHorse, RIDING_VOLUME_SCALE * horse);
      }
      if (voiced) audio.setLoop('riding', r.playing ? hoofClipFor(r.clip, surfaceKind?.()) : null, { volume: r.volume * horse, pitch: r.pitch });
      else audio.setLoop('riding', r.playing ? SOUND[r.clip] : null, { volume: r.volume * horse, pitch: r.pitch });
      const enhanced = enhancedRiding?.() ?? null;
      if (enhanced && isRiding(player.transportMode) && !ridePaused && groundHeightAt && player.pos) {
        const yaw = lookYaw?.() ?? 0;
        const here = groundHeightAt(player.pos[0], player.pos[2]);
        const ahead = groundHeightAt(player.pos[0] + Math.sin(yaw), player.pos[2] + Math.cos(yaw));
        if (Number.isFinite(here) && Number.isFinite(ahead)) { _terrainAngles[_sampleIdx++] = rrTerrainAngle(here, ahead); if (_sampleIdx >= RR_RIDING.samples) _sampleIdx = 0; }
      }
      if (_artFor && isRiding(player.transportMode) && _artFor !== artKey(player.transportMode)) loadArt(player.transportMode);
      if (isRiding(player.transportMode) && !ridePaused && !mwViewHides().horse && mwViewDrawSaddle(typeof canvas === 'function' ? canvas() : canvas)) return r;
      if (art && isRiding(player.transportMode) && !ridePaused && !mwViewHides().horse) {
        const ui = canvasOf();
        const rect = ridingRect(ui, art, horseOffsetHeight());
        const lift = enhanced ? liftForLook(rect, art, enhanced) : null;
        const tint = fpLightingOn() ? (renderer?.flatLightAt?.() ?? undefined) : undefined;
        onUiScreen(renderer, ui, () => {
          renderer.drawScreenQuad(art.frames[r.frame], rect, undefined, tint);
          if (lift) drawNeckBand(lift, rect, art, r, tint);
        });
      }
      return r;
    },
    terrainAngle: () => _terrainAngle,
  };
}
