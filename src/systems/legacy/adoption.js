// @ts-check
// BUNNYFALL (2026-11-05, Phase 5: "allow characters to adopt children as heirs ... a selection of heirs with different
// genders, races and classes, alongside a custom heir"): ADOPTION. An adopted child is a member of the house as a born
// child is (family.js addChild): a minor of the played one, never played until the mantle passes to them (the Succession's
// own `succeed` comes of age whoever it names), found among the line's successors at a final death. What differs is the
// choosing: the person is made to the player's word - gender, race, class, name and face - and not rolled.
// PURE: no DOM, no storage, no clock. Every roll takes an injected `rng`.
import { addChild, personOf, isAlive, touch, nameChild, lineSurnameOf, fullNameOf } from './family.js';
import { CLASS_CAREERS } from '../chargen.js';
import { RACES, FACES_PER_RACE } from '../races.js';
import { startAgeOf } from './age.js';

/** Adopted children waiting at once, for one parent (a house's children are marriage.js CHILDREN_MAX besides). */
export const ADOPT_MAX = 3;
/** How many ready-made heirs are offered at once. */
export const ADOPT_OFFERS = 6;
export const RACE_KEYS = Object.freeze(Object.keys(RACES));
const NAME_RE = /^[\p{L}][\p{L} '-]{1,19}$/u;

/** The adoption's refusal in words, or null when `parent` may adopt now. */
export function adoptRefusal(family, parent) {
  if (!family || !parent) return 'Nobody is here to adopt.';
  if (family.pending) return 'A Succession is waiting. Answer it first.';
  if (!isAlive(parent) || parent.kind !== 'member' || parent.retired != null) return 'Only a living member of the house may adopt.';
  return waiting(family, parent) >= ADOPT_MAX ? `${ADOPT_MAX} adopted children already wait on ${parent.given}. They must come of age before another is taken in.` : null;
}
/** The adopted children of `parent` still waiting (minors, living). */
export const waiting = (family, parent) => (family?.people ?? []).filter((p) => p.adopted && p.minor && !p.died && (p.parents ?? []).includes(parent?.id)).length;

/** A spec held to its shape: `{ given, gender, race, careerIndex, face }`, or null. */
export function cleanSpec(spec) {
  const given = String(spec?.given ?? '').trim().replace(/\s+/g, ' ');
  if (!NAME_RE.test(given)) return null;
  const gender = spec?.gender === 'female' ? 'female' : spec?.gender === 'male' ? 'male' : null;
  const race = RACE_KEYS.includes(spec?.race) ? spec.race : null;
  const careerIndex = Number.isInteger(spec?.careerIndex) && spec.careerIndex >= 0 && spec.careerIndex < CLASS_CAREERS.length ? spec.careerIndex : null;
  const face = Number.isInteger(spec?.face) && spec.face >= 0 && spec.face < FACES_PER_RACE ? spec.face : 0;
  return gender && race && careerIndex != null ? { given, gender, race, careerIndex, face } : null;
}

/** THE SELECTION: `n` ready-made heirs for `parent`'s house, each a different race and class, the genders alternating
 *  from a coin's toss; each named off its race's own name bank. */
export function adoptionOffers(family, parent, rng = Math.random, n = ADOPT_OFFERS) {
  const shuffled = (/** @type {readonly any[]} */ a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const races = shuffled(RACE_KEYS), classes = shuffled(CLASS_CAREERS.map((_, i) => i));
  const flip = rng() < 0.5;
  const out = [];
  for (let i = 0; i < Math.min(n, races.length, classes.length); i++) {
    const gender = (i % 2 === 0) === flip ? 'male' : 'female';
    const race = races[i];
    const { given } = nameChild(family, race, gender, rng, parent);
    out.push({ given, gender, race, careerIndex: classes[i], face: Math.floor(rng() * FACES_PER_RACE) });
  }
  return out;
}

/** TAKE A CHILD IN: `spec` (cleanSpec's) made a minor of `parentId`'s, in the house's name. Answers `{ ok, person }` or
 *  `{ ok: false, why }`. */
export function adoptChild(family, parentId, spec, { rng = Math.random, at = 0, settings = {} } = {}) {
  const parent = personOf(family, parentId);
  const why = adoptRefusal(family, parent);
  if (why) return { ok: false, why };
  const s = cleanSpec(spec);
  if (!s) return { ok: false, why: 'That child could not be made out. A name of two to twenty letters, a sex, a race and a class.' };
  const { person } = addChild(family, parentId, { rng, at, settings });
  person.gender = s.gender;
  person.race = s.race; person.raceId = RACES[s.race]; person.startAge = startAgeOf(s.race);
  person.face = s.face;
  person.careerIndex = s.careerIndex; person.className = CLASS_CAREERS[s.careerIndex]; person.career = null;
  person.given = s.given;
  person.surname = lineSurnameOf(family, parent);
  person.minor = true;
  person.adopted = true;
  touch(family);
  return { ok: true, person, name: fullNameOf(person.given, person.surname) };
}
