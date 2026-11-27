// Builds the standalone orbit viewer from src/characters/neutralBody.js.
// Usage: ARENA2_PATH=... node tools/neutral/build-viewer.mjs out.html.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ImgFile } from '../../src/formats/imgFile.js';
import { DFPalette } from '../../src/formats/dfPalette.js';
import { CifRciFile } from '../../src/formats/cifRciFile.js';

import { buildPaperdollPayload } from '../../src/characters/paperdollPayload.js';

const A = process.env.ARENA2_PATH;
const pal = new DFPalette(); pal.load(readFileSync(A + '/ART_PAL.COL'), 'ART_PAL.COL');
const img = new ImgFile(); img.load(readFileSync(A + '/BODY00I0.IMG'), 'BODY00I0.IMG', pal);
const cif = new CifRciFile(); cif.load(readFileSync(A + '/FACE00I0.CIF'), 'FACE00I0.CIF', pal);

const payloadObj = buildPaperdollPayload(pal, img, cif);
const payload = JSON.stringify(payloadObj);

const dir = fileURLToPath(new URL('.', import.meta.url));
let clothSrc = readFileSync(dir + '../../src/characters/clothSim.js', 'utf8').replace(/^export /gm, '');
let animsSrc = readFileSync(dir + '../../src/characters/anims.js', 'utf8').replace(/^export /gm, '');
let statesSrc = readFileSync(dir + '../../src/characters/weaponStates.js', 'utf8').replace(/^export /gm, '');
// The template has its own copy of the animation helpers, so the injected names are renamed to avoid redeclaration.
let animateSrc = readFileSync(dir + '../../src/characters/animate.js', 'utf8').replace(/^export /gm, '').replace('function animateTarget(', 'function animateTargetCore(').replace(/\bZERO_ARM\b/g, 'ZERO_ARM_CORE');
const tpl = readFileSync(dir + 'viewer-template.html', 'utf8').replace('/*__CLOTHSIM__*/', clothSrc).replace('/*__ANIMS__*/', animsSrc).replace('/*__WEAPONSTATES__*/', statesSrc).replace('/*__ANIMATE__*/', animateSrc);
writeFileSync(process.argv[2] || 'dagger-viewer.html', tpl.replace('__PAYLOAD__', payload));
console.log('viewer written (', payloadObj.n, 'faces ) ->', process.argv[2] || 'dagger-viewer.html');
