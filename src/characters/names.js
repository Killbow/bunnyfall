// @ts-check

export const LIKE_REACTION = 10;

export const STRANGER_TITLES = Object.freeze({
  male: Object.freeze(['Sir', 'Master']),
  female: Object.freeze(['Lady', 'Mistress']),
});

export const NAME_PART_MAX = 20;

export const cleanNamePart = (s) => String(s ?? '').replace(/[<>%{}"\\$]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_PART_MAX);

export const fullName = (first, last) => [cleanNamePart(first), cleanNamePart(last)].filter(Boolean).join(' ');

export function splitName(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? '', last: parts.slice(1).join(' ') };
}

export const needsNames = (entity) => !!entity && entity.chargenDone === true && !cleanNamePart(entity.firstName);

export function setNames(entity, first, last) {
  const f = cleanNamePart(first), l = cleanNamePart(last);
  if (!entity || !f) return false;
  entity.firstName = f;
  entity.lastName = l;
  entity.name = fullName(f, l);
  return true;
}

export const firstNameOf = (entity) => cleanNamePart(entity?.firstName) || splitName(entity?.name).first;
export const lastNameOf = (entity) => (cleanNamePart(entity?.firstName) ? cleanNamePart(entity?.lastName) : splitName(entity?.name).last);

export function strangerTitle(entity, roll = Math.random) {
  const list = STRANGER_TITLES[entity?.gender === 'male' ? 'male' : 'female'];
  return list[Math.min(list.length - 1, Math.floor(roll() * list.length))];
}

export function spokenName(entity, reaction, roll = Math.random) {
  if (Number(reaction) >= LIKE_REACTION) return firstNameOf(entity);
  const last = lastNameOf(entity);
  const title = strangerTitle(entity, roll);
  return last ? `${title} ${last}` : title;
}
