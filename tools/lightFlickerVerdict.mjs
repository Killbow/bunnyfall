// The flicker probe's summary and verdict as pure functions, so they can run without a browser.

export const LUM_BLACK = 3;
export const SCENE_MODE = Object.freeze({ street: 'exterior', tavern: 'interior', dungeon: 'dungeon' });
export const WALK_MIN = 0.1, TURN_MIN = 0.1;

/**
 * @param {string} scene
 * @param {Array<any>} rows
 * @param {?string} [err]
 */
export function summarize(scene, rows, err = null) {
  const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / Math.max(1, rows.length);
  const max = (f) => rows.reduce((a, r) => Math.max(a, f(r)), 0);
  const c0 = rows[0]?.cam, y0 = rows[0]?.yaw;
  return {
    scene, frames: rows.length,
    msAvg: +avg((r) => r.ms).toFixed(1), msMax: +max((r) => r.ms).toFixed(1),
    c12Avg: +(avg((r) => r.c12) * 100).toFixed(2), c12Max: +(max((r) => r.c12) * 100).toFixed(2),
    c4Avg: +(avg((r) => r.c4) * 100).toFixed(2), c4Max: +(max((r) => r.c4) * 100).toFixed(2),
    flipAvg: +(avg((r) => r.flip) * 100).toFixed(3), flipMax: +(max((r) => r.flip) * 100).toFixed(3),
    lumMax: +max((r) => r.lum ?? 0).toFixed(1),
    drawsAvg: Math.round(avg((r) => r.draws ?? 0)), glAvg: Math.round(avg((r) => r.gl ?? 0)),
    lights: max((r) => r.lights ?? 0),
    churn: rows.reduce((a, r) => a + (r.lIn ?? 0) + (r.lOut ?? 0), 0),
    churnW: +rows.reduce((a, r) => a + (r.lInW ?? 0) + (r.lOutW ?? 0), 0).toFixed(2),
    lFar: max((r) => r.lFar ?? 0),
    moved: +(c0 ? max((r) => (r.cam ? Math.hypot(r.cam[0] - c0[0], r.cam[1] - c0[1], r.cam[2] - c0[2]) : 0)) : 0).toFixed(2),
    turned: +(y0 != null ? max((r) => (r.yaw != null ? Math.abs(r.yaw - y0) : 0)) : 0).toFixed(2),
    modes: [...new Set(rows.map((r) => r.mode))],
    flashMax: max((r) => r.flash ?? 0),
    hpLost: rows.length && rows[0].hp != null ? +Math.max(0, rows[0].hp - Math.min(...rows.map((r) => r.hp ?? rows[0].hp))).toFixed(2) : 0,
    err: err ?? null,
    spikes: rows.filter((r) => r.c12 >= 0.02).map((r) => `${r.k}:${(r.c12 * 100).toFixed(1)}%`),
  };
}

/**
 * @param {{ scenes: string[], all: Array<ReturnType<typeof summarize>>, errors: string[], frames: number, stillMax: number, booted: boolean, streetTavern?: boolean }} run
 */
export function judge({ scenes, all, errors, frames, stillMax, booted, streetTavern = true }) {
  const bad = [];
  if (!booted) bad.push('the world never booted');
  if (scenes.includes('street') && !streetTavern) bad.push('street: no tavern in reach to stand before');
  for (const sc of scenes) if (!all.some((x) => x.scene === `${sc}-still`)) bad.push(`${sc}: never reached`);
  for (const x of all) {
    const kind = x.scene.slice(x.scene.lastIndexOf('-') + 1), sc = x.scene.slice(0, x.scene.lastIndexOf('-'));
    const want = kind === 'still' ? frames - 1 : frames * 2 - 1;
    if (x.frames < want) bad.push(`${x.scene}: ${x.frames} of ${want} frames`);
    if (x.err) bad.push(`${x.scene}: the plan threw - ${x.err}`);
    const mode = SCENE_MODE[sc];
    if (mode && x.modes.some((m) => m !== mode)) bad.push(`${x.scene}: in ${x.modes.join('/')}, not ${mode}`);
    if (x.frames && x.lumMax < LUM_BLACK) bad.push(`${x.scene}: black (brightest frame's mean luma ${x.lumMax})`);
    if (kind === 'still' && x.c12Max > stillMax) bad.push(`${x.scene}: ${x.c12Max}% of the screen moved 12+ levels standing still`);
    if (kind === 'walk' && !(x.moved >= WALK_MIN && x.c4Max > 0)) bad.push(`${x.scene}: the eye did not walk (moved ${x.moved}, the picture ${x.c4Max}%)`);
    if (kind === 'turn' && !(x.turned >= TURN_MIN && x.c4Max > 0)) bad.push(`${x.scene}: the eye did not turn (turned ${x.turned}, the picture ${x.c4Max}%)`);
    if (x.flashMax > 0) bad.push(`${x.scene}: the HUD flashed red (${x.flashMax}) - a blow or a bleed, not the lighting`);
    if (x.hpLost > 0) bad.push(`${x.scene}: the player lost ${x.hpLost} health during the pass`);
  }
  if (errors.length) bad.push(`page errors (${errors.length}): ${errors.slice(0, 3).join(' | ')}`);
  return bad;
}
