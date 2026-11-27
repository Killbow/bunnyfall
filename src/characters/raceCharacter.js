// Assembles a complete race character (body, head, tail, body detail) into one merged face list with group tags.
import { buildNeutralBody } from './neutralBody.js';
import { buildHair, HAIR_RAMPS } from './pieces/hair.js';
import { buildTail } from './pieces/tail.js';
import { buildBodyScales, buildBodyFur } from './pieces/bodyScales.js';
import { HUMAN_SKINS, ELF_TONES, KHAJIIT_FURS, ARGONIAN_HIDES } from './palettes.js';

const MORPHS = ['Human', 'Elf', 'Khajiit', 'Argonian'];

export function raceOfArchive(archive) {
  return MORPHS[((archive | 0) % MORPHS.length + MORPHS.length) % MORPHS.length];
}

/**
 * @param race
 * @param spriteRamps
 * @param opts
 */
export function buildRaceCharacter(race, spriteRamps, opts = {}) {
  const tone = opts.tone ?? 0;
  let bodyRamp, coat, belly, hairColor, hairStyle = opts.hairStyle ?? 'short';

  if (race === 'Khajiit') {
    const f = KHAJIIT_FURS[tone % KHAJIIT_FURS.length];
    coat = f.coat; belly = f.belly; bodyRamp = coat; hairColor = coat;
  } else if (race === 'Argonian') {
    bodyRamp = ARGONIAN_HIDES[tone % ARGONIAN_HIDES.length].ramp; hairColor = bodyRamp;
  } else if (race === 'Elf') {
    bodyRamp = ELF_TONES[tone % ELF_TONES.length].ramp;
    hairColor = HAIR_RAMPS[['brown', 'black', 'blonde'][(opts.hairTone ?? 0) % 3]];
  } else {
    bodyRamp = HUMAN_SKINS[tone % HUMAN_SKINS.length].ramp;
    hairColor = HAIR_RAMPS[['brown', 'black', 'blonde'][(opts.hairTone ?? 0) % 3]];
  }

  const body = buildNeutralBody({ skin: bodyRamp, boot: spriteRamps.boot });
  const faces = body.slice();
  faces.push(...buildHair(hairColor, race, bodyRamp, hairStyle));

  if (race === 'Khajiit') { faces.push(...buildTail(coat, 'khajiit')); faces.push(...buildBodyFur(body, coat, belly)); }
  else if (race === 'Argonian') { faces.push(...buildTail(bodyRamp, 'argonian')); faces.push(...buildBodyScales(body, bodyRamp)); }

  return faces;
}
