export const LOAD_GRACE_SECONDS = 1.5;
export const LOCATION_LOAD_STUCK_SECONDS = 12;

let resumeAt = 0;
// Tracked apart from the grace clock, because the teleport inside a save load resets that clock before the load
// finishes.
let loadInProgress = false;
let locationLoads = 0;
let lastLocationLoadAt = 0;
let refreshPending = false;
let terrainUpdating = false;
const transientResetListeners = [];
let postTransitionRefresh = null;

export function loadStarted() { loadInProgress = true; resetTransition(Infinity, false); }
export function loadFinished(realSeconds) { loadInProgress = false; resumeAt = realSeconds + LOAD_GRACE_SECONDS; refreshPending = true; }
export function teleported(realSeconds) { resetTransition(realSeconds + LOAD_GRACE_SECONDS, true); }
export function locationLoadBegan(realSeconds) { locationLoads++; lastLocationLoadAt = realSeconds; }
export function locationLoadEnded() { if (locationLoads > 0) locationLoads--; }
export function terrainUpdateBegan() { terrainUpdating = true; }
export function terrainUpdateEnded() { terrainUpdating = false; }

function resetTransition(at, pending) {
  locationLoads = 0;
  resumeAt = at;
  refreshPending = pending;
  for (const fn of [...transientResetListeners]) fn();
}

export function onTransientReset(fn) {
  transientResetListeners.push(fn);
  return () => { const i = transientResetListeners.indexOf(fn); if (i >= 0) transientResetListeners.splice(i, 1); };
}

export function setPostTransitionRefresh(fn) { postTransitionRefresh = fn ?? null; }

export function canRunLightRuntimeWork(playing) { return !!playing && !loadInProgress; }
export function canRunHeavyRuntimeWork(realSeconds, playing) { return canRunLightRuntimeWork(playing) && realSeconds >= resumeAt; }

function anyLocationLoading(realSeconds) {
  if (locationLoads <= 0) return false;
  if (realSeconds - lastLocationLoadAt > LOCATION_LOAD_STUCK_SECONDS) { locationLoads = 0; return false; }
  return true;
}

export function loadGraceActive(realSeconds, playing = true) {
  if (!canRunHeavyRuntimeWork(realSeconds, playing)) return true;
  return anyLocationLoading(realSeconds);
}

export function canMutateTerrainData(realSeconds, playing) { return !loadGraceActive(realSeconds, playing) && !terrainUpdating; }

export function pumpDeepWaterRuntime(realSeconds, playing) {
  if (!refreshPending || !canMutateTerrainData(realSeconds, playing)) return;
  refreshPending = false;
  postTransitionRefresh?.();
}

export const postTransitionRefreshPending = () => refreshPending;

export function resetDeepWaterRuntime() {
  resumeAt = 0; loadInProgress = false; locationLoads = 0; lastLocationLoadAt = 0; refreshPending = false; terrainUpdating = false;
}
