import assert from 'node:assert/strict';
import test from 'node:test';
import { PROF_OPS_MAX, PROF_OPS_WINDOW_S } from '../src/net/professionLaw.js';

// Field report 2026-11-27: heavy crafting plus mining spent the hour's profession writes, and gathering and crafting
// answered `prof-rate` ("account services are slow") until the hour turned. Every harvest, craft, withdrawal and
// delivery counts once, so the hour must hold a long stretch of fast play.
test('an hour of steady play at one profession write every two seconds stays under the limit', () => {
  assert.ok(PROF_OPS_MAX >= PROF_OPS_WINDOW_S / 2, `${PROF_OPS_MAX} writes an hour is below ${PROF_OPS_WINDOW_S / 2}`);
});
