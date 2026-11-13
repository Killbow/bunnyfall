// @ts-check
// SIFRIT (2026-11-13): her boss bar's model - the gate's bar (ui/gate/gateBossBar.js drawGateBossBar) in necromancer's purple
// (its `necro` theme). Pure: the reading of scenes' sifritBarOf in, the gate bar's model out. Not a DFU member.
/** @param {{ name: string, frac: number }} b */
export function sifritBarModel(b) {
  const frac = Math.max(0, Math.min(1, b.frac));
  return {
    theme: 'necro', ringCss: '#b45cff', name: b.name, title: 'Necromancer', epithet: '', epithetColor: null, marksView: null, trials: '',
    frac, marks: [0.5], phase: frac < 0.5 ? 2 : 1, spent: [frac < 0.5],
    warded: false, fallen: false, callout: null, wrath: null, wrathNear: false, fighters: 0, fightersLine: '', host: null, reckonIn: null,
    alpha: 1, now: Date.now(), low: frac > 0 && frac < 0.2,
  };
}
