// @ts-check
import { parallelCompile, startPrograms } from './glProgram.js';
import { GATE_PASS_PROGRAMS } from './gatePass.js';
import { telegraphPrograms } from './gateTelegraph.js';
import { GATE_FX_PROGRAMS } from './gateFx.js';
import { CRYSTAL_PROGRAMS } from './courtCrystals.js';
import { NODE_GLINT_PROGRAMS } from './nodeGlint.js';
import { AURA_PROGRAMS } from './auraRing.js';

export const playPrograms = () => [...GATE_PASS_PROGRAMS, ...telegraphPrograms(false), ...telegraphPrograms(true), ...GATE_FX_PROGRAMS, ...CRYSTAL_PROGRAMS, ...NODE_GLINT_PROGRAMS, ...AURA_PROGRAMS];

// Starts only where the driver compiles in parallel: elsewhere an early compile would stall the frames after it,
// so each pass builds the first time it is asked for.
export function startPlayPrograms(gl) {
  if (!gl || !parallelCompile(gl)) return false;
  startPrograms(gl, playPrograms());
  return true;
}
