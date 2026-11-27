// The Eye of the Beholder camera, ported from the mod behavior.
import { MOD_SETTINGS, modSettingsGeneration } from '../mods/modSettings.js';
import { AUTO_TOGGLE_ROWS, AUTO_TOGGLE, autoToggleRows } from './eotbBillboard.js';
import { seaZoomStep } from './seaZoom.js';

export const EYE_RADIUS = 0.25;
export const BOUNDS_INITIAL = 2.0;

export const MAX_Z = -10;

export const OVERRIDE_ORDER = Object.freeze(['Boat', 'Mount', 'Weapon']);

export const AUTO_TOGGLE_MESSAGES = Object.freeze({ armed: 'Auto-toggle POV enabled!', disarmed: 'Auto-toggle POV disabled!' });

const setting = (name) => MOD_SETTINGS['eye-of-the-beholder'].keys[name];

const TOGGLE_SECTIONS = Object.freeze(['Camera', 'Graphics', 'Animation', 'Compatibility']);
function sectionValues(get) {
  const out = {};
  for (const key of Object.keys(MOD_SETTINGS['eye-of-the-beholder'].keys)) {
    (out[key.split('.')[0]] ??= []).push(get?.('eye-of-the-beholder', key) ?? null);
  }
  for (const section of Object.keys(out)) out[section] = JSON.stringify(out[section]);
  return out;
}

export function readCameraSettings(get) {
  const g = (key) => {
    const v = get?.('eye-of-the-beholder', key);
    return v === undefined || v === null ? setting(key)?.default : v;
  };
  const frontal = (section) => {
    const t = g(`${section}.FrontalPlaneOffset`) ?? [0, 0];
    return [t[0] ?? 0, t[1] ?? 0];
  };
  const override = (section) => {
    const [x, y] = frontal(section);
    return {
      enabled: !!g(`${section}.Enable`),
      x, y,
      z: -(g(`${section}.LongitudinalDistance`) ?? 0),
    };
  };
  const [x, y] = frontal('Camera');
  const auto = Object.freeze(Object.fromEntries([...AUTO_TOGGLE_ROWS, 'OnTransitionInterior', 'OnTransitionExterior']
    .map((row) => [row, g(`AutoTogglePerspective.${row}`) ?? AUTO_TOGGLE.DontChange])));
  return {
    startInThird: !!g('Camera.StartInThirdPerson'),
    x,
    y,
    z: -(g('Camera.LongitudinalDistance') ?? 0),
    minZ: g('Camera.MinimumDistance') ?? 0,
    riding: g('Camera.RidingOffset') ?? 0,
    speed: g('Camera.Speed') ?? 0,
    dampen: g('Camera.Dampen') ?? 0,
    mirrorAuto: !!g('Camera.Auto-Switch'),
    mirrorTime: g('Camera.SwitchResetTime') ?? 0,
    scrollable: !!g('CameraScrolling.ScrollableZOffset'),
    increment: g('CameraScrolling.ScrollIncrement') ?? 0,
    boatTarget: g('CameraOverrideBoat.Target') ?? 0,
    auto,
    autoPOVSwitch: Object.values(auto).reduce((a, b) => a + (b | 0), 0) > 0,
    billboard: g('Graphics.Enable') !== false,
    firstPersonBillboard: g('Graphics.FirstPersonBillboard') ?? 0,
    hideWeapon: g('Compatibility.Don\'tHideWeapon') === true,
    hideHorse: g('Compatibility.Don\'tHideHorse') === true,
    offsetAttacks: g('Compatibility.Don\'tOffsetAttacks') === true,
    debugMessages: g('Debug.ShowMessages') !== false,
    overrides: Object.freeze({
      Boat: override('CameraOverrideBoat'),
      Mount: override('CameraOverrideMount'),
      Weapon: override('CameraOverrideWeapon'),
    }),
  };
}

const rotY = (v, yaw) => {
  const s = Math.sin(yaw), c = Math.cos(yaw);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};

export const bodyVector = (v, yaw) => rotY(v, yaw);

export function eyeBasis(yaw, pitch) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const forward = [Math.sin(yaw) * cp, sp, Math.cos(yaw) * cp];
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const up = [
    forward[1] * right[2] - forward[2] * right[1],
    forward[2] * right[0] - forward[0] * right[2],
    forward[0] * right[1] - forward[1] * right[0],
  ];
  return { right, up, forward };
}
export function eyeVector(v, yaw, pitch) {
  const { right, up, forward } = eyeBasis(yaw, pitch);
  return [
    right[0] * v[0] + up[0] * v[1] + forward[0] * v[2],
    right[1] * v[0] + up[1] * v[1] + forward[1] * v[2],
    right[2] * v[0] + up[2] * v[1] + forward[2] * v[2],
  ];
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function moveTowards(from, to, step) {
  const d = dist(from, to);
  if (d <= step || d === 0) return [...to];
  const k = step / d;
  return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k];
}

export function createEotbCamera() {
  let offset = false;
  let offsetScroll = 0;
  let mirror = false;
  let mirrorOriginal = false;
  let mirrorTimer = 0;
  let posCurrent = [0, 0, 0];
  let posTarget = [0, 0, 0];
  let boundsX = BOUNDS_INITIAL, boundsY = BOUNDS_INITIAL, boundsZ = BOUNDS_INITIAL;
  let cfg = readCameraSettings(null);
  let pending = 0;
  let lastEye = [0, 0, 0];
  let lastDt = 0;
  let lastState = {};
  let forcedApply = false;
  let prev = null;
  let autoPOVSwitch = cfg.autoPOVSwitch;
  let started = false;
  let billboard = null;
  let popup = null;
  let ComeSailAway = null;
  let isSailing = false;
  let boatMeshObject = null, boatDriveObject = null, boatFlagObject = null;
  let boatMeshObjectCenter = [0, 0, 0], boatMeshObjectExtent = 0;
  let seaReach = 0;
  let log = null;
  let spellHandsEnabled = true;
  let loaded = null;

  function onUpdateSailing(sailing) {
    isSailing = !!sailing;
    if (!isSailing) { log?.('EYE OF THE BEHOLDER - WE HAVE STOPPED SAILING!'); return; }
    log?.('EYE OF THE BEHOLDER - WE ARE NOW SAILING!');
    boatFlagObject = null;
    boatDriveObject = null;
    ComeSailAway.send('GetBoatMeshObject', null, (message, data) => { boatMeshObject = data ?? null; });
    const bounds = ComeSailAway.colliderBounds(boatMeshObject);
    const p = boatMeshObject.position;
    boatMeshObjectCenter = boatMeshObject.inverseTransformVector([bounds.center[0] - p[0], bounds.center[1] - p[1], bounds.center[2] - p[2]]);
    const e = bounds.extents;
    boatMeshObjectExtent = Math.max(Math.max(Math.abs(e[0]), Math.abs(e[1])), Math.abs(e[2]));
    for (let i = 0; i < boatMeshObject.childCount; i++) {
      if (boatFlagObject != null && boatDriveObject != null) break;
      const child = boatMeshObject.getChild(i);
      if (child.name === 'FlagObject') boatFlagObject = child;
      if (child.name === 'DrivePosition') boatDriveObject = child;
    }
    if (boatFlagObject == null) boatFlagObject = boatMeshObject;
  }

  function posOffset(state) {
    const m = mirror ? -1 : 1;
    const o = cfg.overrides;
    if (o.Boat.enabled && isSailing) return [m * o.Boat.x, o.Boat.y, o.Boat.z - offsetScroll];
    if (o.Mount.enabled && state.riding) return [m * o.Mount.x, o.Mount.y, o.Mount.z - offsetScroll];
    if (o.Weapon.enabled && state.weaponReady) return [m * o.Weapon.x, o.Weapon.y, o.Weapon.z - offsetScroll];
    const r = state.riding ? cfg.riding : 0;
    if (mirror) return [-cfg.x, cfg.y, cfg.z + cfg.z * r - offsetScroll];
    return [cfg.x, cfg.y + cfg.y * r, cfg.z + cfg.z * r - offsetScroll];
  }

  function checkBounds(origin, state, yaw, pitch, raycast) {
    const { right, up, forward } = eyeBasis(yaw, pitch);
    const axis = (i, base) => {
      const off = posOffset(state);
      if (off[i] === 0) return null;
      const dir = off[i] < 0 ? [-base[0], -base[1], -base[2]] : base;
      const len = Math.abs(off[i] * 2) + EYE_RADIUS;
      const hit = raycast ? raycast(origin, dir, len) : null;
      return hit != null && hit < len ? hit - EYE_RADIUS * 2 : len;
    };
    const bx = axis(0, right);
    if (bx !== null) boundsX = bx;
    if (bx !== null && cfg.mirrorAuto
        && Math.abs(boundsX) < Math.abs(posOffset(state)[0]) / 2 + EYE_RADIUS) {
      mirror = !mirror;
      if (cfg.mirrorTime > 0) mirrorTimer = 0;
    }
    const by = axis(1, up);
    if (by !== null) boundsY = by;
    const bz = axis(2, forward);
    if (bz !== null) boundsZ = bz;
  }

  function setVectorBounds(v, state) {
    const off = posOffset(state);
    const out = [...v];
    const clamp = (i, bound) => {
      if (off[i] === 0) return;
      if (off[i] < 0) { if (out[i] < -bound) out[i] = -bound; } else if (out[i] > bound) out[i] = bound;
    };
    clamp(0, boundsX); clamp(1, boundsY); clamp(2, boundsZ);
    return out;
  }

  const listeners = new Set();
  function toggleOffset(on) {
    on = !!on;
    if (on) {
      offsetScroll = 0;
      posCurrent = [...lastEye];
      billboard?.toggle(cfg.billboard, false);
      spellHandsEnabled = false;
    } else {
      billboard?.torchDefault?.();
      if (cfg.firstPersonBillboard > 0) billboard?.toggle(cfg.billboard, true);
      else billboard?.toggle(false, false);
      spellHandsEnabled = true;
    }
    offset = on;
    for (const fn of listeners) fn(offset);
    return offset;
  }

  function revertMirror(headLocal, feet, state, yaw, raycast) {
    if (posOffset(state)[0] === 0) return;
    if (mirror === mirrorOriginal || cfg.mirrorTime <= 0) return;
    if (mirrorTimer <= cfg.mirrorTime) { mirrorTimer += lastDt; return; }
    const local = bodyVector([posTarget[0] - feet[0], posTarget[1] - feet[1], posTarget[2] - feet[2]], -yaw);
    local[0] = headLocal[0];
    const origin = add(feet, bodyVector(local, yaw));
    const off = posOffset(state);
    const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
    const dir = off[0] < 0 ? right : [-right[0], -right[1], -right[2]];
    const len = Math.abs(off[0] * 2) + EYE_RADIUS;
    const hit = raycast ? raycast(origin, dir, len) : null;
    if (hit != null && hit < len) {
      if (hit < Math.abs(off[0]) / 2 + EYE_RADIUS) mirrorTimer = 0;
      else mirror = mirrorOriginal;
    } else mirror = mirrorOriginal;
  }

  function loadSettings(get) {
    const was = loaded?.sections;
    const sections = sectionValues(get);
    const changed = (section) => !was || was[section] !== sections[section];
    loaded = { get, generation: modSettingsGeneration(), sections };
    cfg = readCameraSettings(get);
    if (changed('AutoTogglePerspective')) autoPOVSwitch = cfg.autoPOVSwitch;
    if (TOGGLE_SECTIONS.some(changed)) {
      billboard?.reload?.();
      toggleOffset(offset);
    }
    return cfg;
  }

  function applyRow(row) {
    if (row === AUTO_TOGGLE.FirstPerson && offset) toggleOffset(false);
    else if (row === AUTO_TOGGLE.ThirdPerson && !offset) toggleOffset(true);
    return offset;
  }

  function onGameStart(inside) {
    if (autoPOVSwitch) {
      applyRow(cfg.auto[inside ? 'OnTransitionInterior' : 'OnTransitionExterior']);
      return offset;
    }
    return toggleOffset(cfg.startInThird);
  }

  return {
    mode: () => (offset ? 'third' : 'first'),
    thirdPerson: () => offset,
    scroll: () => offsetScroll,
    mirrored: () => mirror,
    bounds: () => [boundsX, boundsY, boundsZ],
    settings: () => cfg,
    pendingClicks: () => pending,
    spellHandsEnabled: () => spellHandsEnabled,

    setBillboard(b) { billboard = b ?? null; },
    setPopup(fn) { popup = typeof fn === 'function' ? fn : null; },
    setLog(fn) { log = typeof fn === 'function' ? fn : null; },
    setComeSailAway(mod) {
      ComeSailAway = mod ?? null;
      isSailing = false;
      boatMeshObject = null; boatDriveObject = null; boatFlagObject = null;
      boatMeshObjectCenter = [0, 0, 0]; boatMeshObjectExtent = 0;
      if (started && ComeSailAway) ComeSailAway.send('OnUpdateSailing', onUpdateSailing, null);
    },
    sailing: () => ({ isSailing, boatMeshObject, boatDriveObject, boatFlagObject, boatMeshObjectCenter: [...boatMeshObjectCenter], boatMeshObjectExtent }),
    setSeaReach(metres) { seaReach = Number.isFinite(metres) && metres > 0 ? metres : 0; },
    onToggleOffset(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    loadSettings,

    start() {
      if (started) return offset;
      started = true;
      if (ComeSailAway) ComeSailAway.send('OnUpdateSailing', onUpdateSailing, null);
      mirror = false; mirrorOriginal = mirror; mirrorTimer = 0; offsetScroll = 0;
      boundsX = BOUNDS_INITIAL; boundsY = BOUNDS_INITIAL; boundsZ = BOUNDS_INITIAL;
      prev = null;
      return toggleOffset(cfg.startInThird);
    },
    onNewGame(inside = false) { return onGameStart(inside); },
    onLoad(inside = false) { return onGameStart(inside); },
    onPositionUpdate(delta) {
      posCurrent = [posCurrent[0] + delta[0], posCurrent[1] + delta[1], posCurrent[2] + delta[2]];
      posTarget = [posTarget[0] + delta[0], posTarget[1] + delta[1], posTarget[2] + delta[2]];
      lastEye = [lastEye[0] + delta[0], lastEye[1] + delta[1], lastEye[2] + delta[2]];
    },

    transition(kind) {
      const row = cfg.auto[`OnTransition${kind}`];
      if (row === undefined || !autoPOVSwitch) return offset;
      return applyRow(row);
    },
    transitionDecides(kind) {
      const row = cfg.auto[`OnTransition${kind}`];
      return autoPOVSwitch && (row === AUTO_TOGGLE.FirstPerson || row === AUTO_TOGGLE.ThirdPerson);
    },
    toggleAuto() {
      autoPOVSwitch = !autoPOVSwitch;
      if (autoPOVSwitch) forcedApply = true;
      if (cfg.debugMessages) popup?.(autoPOVSwitch ? AUTO_TOGGLE_MESSAGES.armed : AUTO_TOGGLE_MESSAGES.disarmed);
      return autoPOVSwitch;
    },
    autoArmed: () => autoPOVSwitch,
    started: () => started,
    previous: () => (prev ? { ...prev } : null),

    toggleOffset,

    switchShoulder() {
      if (posOffset(lastState)[0] === 0) return mirror;
      mirror = !mirror;
      mirrorOriginal = mirror;
      return mirror;
    },

    wheel(clicks) {
      if (!clicks) return false;
      pending += clicks;
      return true;
    },

    tick(state = {}) {
      if (loaded && loaded.generation !== modSettingsGeneration()) loadSettings(loaded.get);
      lastState = state;
      const clicks = pending;
      pending = 0;
      const now = {
        transformed: !!state.transformed, riding: !!state.riding, spellcasting: !!state.spellcasting,
        sheathed: state.sheathed ?? !state.weaponReady, ranged: !!state.usingBow,
      };
      if (autoPOVSwitch) {
        for (const row of autoToggleRows(now, prev, { forced: forcedApply })) applyRow(cfg.auto[row]);
      }
      forcedApply = false;
      prev = now;
      if (!cfg.scrollable) return offset;
      const z = posOffset(state)[2];
      const nearEnd = -cfg.minZ;
      if (!offset) {
        if (clicks < 0) { toggleOffset(true); offsetScroll = 0; }
        return offset;
      }
      const far = seaReach > -MAX_Z && !(cfg.overrides.Boat.enabled && isSailing) ? -seaReach : MAX_Z;
      const baseDist = -(z + offsetScroll);
      if (far < MAX_Z && clicks && (-z > baseDist + 1e-6 || (clicks < 0 && -z >= baseDist - 1e-6))) {
        offsetScroll += z + seaZoomStep(-z, clicks > 0 ? 1 : -1, Math.min(baseDist, -MAX_Z), -far);
        return offset;
      }
      if (clicks > 0) offsetScroll -= cfg.increment;
      else if (clicks < 0) offsetScroll += cfg.increment;
      if (z < far) offsetScroll = -far + (posOffset(state)[2] + offsetScroll);
      else if (z > nearEnd) toggleOffset(false);
      return offset;
    },

    eye({ fpEye, feet, yaw, pitch, dt = 0, raycast = null, pivotFloor = null, ...state }) {
      lastEye = fpEye;
      lastDt = dt;
      if (!offset) return { eye: fpEye, thirdPerson: false, distance: 0, focal: null };
      const headLocal = [0, Math.max(fpEye[1], pivotFloor ?? -Infinity) - feet[1], 0];
      const origin = add(feet, bodyVector(headLocal, yaw));

      revertMirror(headLocal, feet, state, yaw, raycast);
      checkBounds(origin, state, yaw, pitch, raycast);

      if (isSailing && cfg.overrides.Boat.enabled) {
        const off = setVectorBounds(posOffset(state), state);
        const reach = eyeVector([off[0] * boatMeshObjectExtent, off[1] * boatMeshObjectExtent, off[2] * boatMeshObjectExtent], yaw, pitch);
        posTarget = cfg.boatTarget === 1 ? add(boatFlagObject.position, reach) : add(add(boatMeshObject.position, boatMeshObjectCenter), reach);
      } else posTarget = add(origin, eyeVector(setVectorBounds(posOffset(state), state), yaw, pitch));
      let s = cfg.speed;
      if (cfg.dampen !== 0) s = cfg.speed * dist(posCurrent, posTarget) / cfg.dampen;
      posCurrent = moveTowards(posCurrent, posTarget, dt * s);

      const minZ = posOffset(state)[2] * cfg.minZ;
      if (cfg.minZ !== 0 && boundsZ > Math.abs(minZ)) {
        const local = bodyVector([posCurrent[0] - feet[0], posCurrent[1] - feet[1], posCurrent[2] - feet[2]], -yaw);
        if (local[2] > minZ) local[2] = minZ;
        posCurrent = add(feet, bodyVector(local, yaw));
      }
      if (raycast) {
        const d = [posCurrent[0] - origin[0], posCurrent[1] - origin[1], posCurrent[2] - origin[2]];
        const len = Math.hypot(d[0], d[1], d[2]);
        if (len > 1e-6) {
          const dir = [d[0] / len, d[1] / len, d[2] / len];
          const hit = raycast(origin, dir, len + EYE_RADIUS * 2);
          if (hit != null && hit < len + EYE_RADIUS * 2) {
            const keep = Math.max(0, hit - EYE_RADIUS * 2);
            posCurrent = [origin[0] + dir[0] * keep, origin[1] + dir[1] * keep, origin[2] + dir[2] * keep];
          }
        }
      }
      return {
        eye: [...posCurrent],
        thirdPerson: true,
        distance: dist(posCurrent, origin),
        focal: origin,
      };
    },
  };
}
export const eotbCamera = createEotbCamera();
