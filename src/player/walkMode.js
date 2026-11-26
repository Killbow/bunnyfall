// Walk mode: a latched Sneak walk toggled by the WalkMode action's key or pad button; a Run press clears it.

let _on = false;
let _bound = false;

export const WALK_MODE_ACTION = 'WalkMode';
export const walkModeOn = () => _on;
export function setWalkMode(v) { _on = !!v; return _on; }
export function toggleWalkMode() { _on = !_on; return _on; }

export function bindWalkMode(actionsOf, isWindowUp = () => false) {
  if (_bound || typeof addEventListener !== 'function' || !actionsOf) return () => {};
  _bound = true;
  const onKey = (e) => {
    if (e.repeat || isWindowUp()) return;
    const got = actionsOf(e);
    const acts = Array.isArray(got) ? got : got ? [got] : [];
    if (acts.includes(WALK_MODE_ACTION)) toggleWalkMode();
    else if (acts.includes('Run') && _on) _on = false;
  };
  addEventListener('keydown', onKey, true);
  return () => { removeEventListener('keydown', onKey, true); _bound = false; };
}
