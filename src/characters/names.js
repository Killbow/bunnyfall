// @ts-check
// BUNNYFALL PHASE 3: FIRST AND LAST NAMES, AND HOW PEOPLE ADDRESS YOU.
//
// A character has a first and a last name (`entity.firstName`, `entity.lastName`, saved with them). `entity.name` stays
// the two together, so everything that already reads the name (saves, online identity, letters) keeps working.
//
// Strangers address you by a title from your character's sex and your last name ("Lady Ashford", "Sir Venn"); an NPC who
// likes you uses your first name. "Likes you" is Daggerfall's own threshold, the one its greetings use
// (systems/talk/talkSession.js MIN_LIKE_REACTION).
//
// A character from before Phase 3 has no first and last name yet: ui/namePicker.js asks for them once, at the next load.

/** Daggerfall's "likes you" reaction, the same 10 as talkSession.js MIN_LIKE_REACTION (copied: this file stays a leaf). */
export const LIKE_REACTION = 10;

/** The titles a stranger uses, by the character's sex. One is picked each time an NPC speaks. */
export const STRANGER_TITLES = Object.freeze({
  male: Object.freeze(['Sir', 'Master']),
  female: Object.freeze(['Lady', 'Mistress']),
});

/** The longest a first or last name may be. */
export const NAME_PART_MAX = 20;

/** A name part cleaned for use: trimmed, inner spaces squeezed, no characters that could break text or markup. */
export const cleanNamePart = (s) => String(s ?? '').replace(/[<>%{}"\\$]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_PART_MAX);

/** The full name as everything else reads it: "First Last", or the first alone. */
export const fullName = (first, last) => [cleanNamePart(first), cleanNamePart(last)].filter(Boolean).join(' ');

/** An old single name split the way the picker offers it: the first word, then the rest. */
export function splitName(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

/** Whether a character still has to pick a first and last name. */
export const needsNames = (entity) => !!entity && entity.chargenDone === true && !cleanNamePart(entity.firstName);

/** Set a character's first and last name (and `name`, the two together). Answers whether it took. */
export function setNames(entity, first, last) {
  const f = cleanNamePart(first), l = cleanNamePart(last);
  if (!entity || !f) return false;
  entity.firstName = f;
  entity.lastName = l;
  entity.name = fullName(f, l);
  return true;
}

/** The first name, from the fields or, for a character who has not picked yet, the old name's first word. */
export const firstNameOf = (entity) => cleanNamePart(entity?.firstName) || splitName(entity?.name).first;
/** The last name, likewise. */
export const lastNameOf = (entity) => (cleanNamePart(entity?.firstName) ? cleanNamePart(entity?.lastName) : splitName(entity?.name).last);

/** A stranger's title for this character. `roll` is Math.random-like. */
export function strangerTitle(entity, roll = Math.random) {
  const list = STRANGER_TITLES[entity?.gender === 'male' ? 'male' : 'female'];
  return list[Math.min(list.length - 1, Math.floor(roll() * list.length))];
}

/**
 * What an NPC calls you: your first name if they like you (reaction at or over LIKE_REACTION), otherwise a title and
 * your last name, or the title alone when you have no last name.
 */
export function spokenName(entity, reaction, roll = Math.random) {
  if (Number(reaction) >= LIKE_REACTION) return firstNameOf(entity);
  const last = lastNameOf(entity);
  const title = strangerTitle(entity, roll);
  return last ? `${title} ${last}` : title;
}
