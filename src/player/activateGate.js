// State machine for the activate and cast actions: the cast fires on press, the activation on release.
const nowSeconds = () =>
  (typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now()) / 1000;

export function createActivateGate() {
  return { down: false, castPending: false, clickDelay: 0, clickDelayStart: 0, pressCast: false };
}

export function setClickDelay(gate, delay = 0.3, now = nowSeconds()) {
  gate.clickDelay = Math.min(Math.max(delay, 0), 1);
  gate.clickDelayStart = now;
}

export function activateFrame(gate, {
  down = false, hasReadySpell = false, touchSpell = false,
  hudBlocked = false, paused = false, now = nowSeconds(),
} = {}) {
  if (paused) {
    gate.down = false;
    setClickDelay(gate, 0.3, now);
    return { cast: false, activate: false };
  }

  const started = down && !gate.down;
  const complete = !down && gate.down;
  gate.down = down;

  if (gate.clickDelay > 0 && now < gate.clickDelayStart + gate.clickDelay) {
    if (started) gate.pressCast = false;
    return { cast: false, activate: false };
  }
  gate.clickDelay = 0;
  gate.clickDelayStart = 0;

  const cast = started && hasReadySpell;
  if (started) gate.pressCast = cast;

  if (hudBlocked) return { cast, activate: false };

  if (hasReadySpell && !touchSpell) {
    gate.castPending = true;
    return { cast, activate: false };
  }
  if (gate.castPending) {
    gate.castPending = false;
    return { cast, activate: false };
  }
  return { cast, activate: complete, pressCast: complete && !!gate.pressCast };
}
