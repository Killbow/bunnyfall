// @ts-check

export const YEAR_MINUTES = 12 * 30 * 1440;

export const SPANS = Object.freeze({
  Breton: 90, Nord: 90, Redguard: 80, Khajiit: 85, Argonian: 85, WoodElf: 150, DarkElf: 180, HighElf: 200,
});
export const spanOf = (race) => SPANS[race] ?? SPANS.Breton;

export const START_SHARE = 0.25;
export const ELDER_SHARE = 0.75;

export const startAgeOf = (race) => Math.round(spanOf(race) * START_SHARE);

export const tollYears = (race, share) => Math.max(1, Math.round(spanOf(race) * share));

export function ageOf(person, livedMinutes = person?.lived ?? 0) {
  const start = Number.isFinite(person?.startAge) ? person.startAge : startAgeOf(person?.race);
  return start + Math.max(0, person?.toll | 0) + Math.floor(Math.max(0, Number(livedMinutes) || 0) / YEAR_MINUTES);
}

export const isElder = (person, lived) => ageOf(person, lived) >= Math.round(spanOf(person?.race) * ELDER_SHARE);
export const isSpent = (person, lived) => ageOf(person, lived) >= spanOf(person?.race);

export function payToll(person, share, lived, { ageless = false } = {}) {
  if (ageless) return { final: false, years: 0, age: ageOf(person, lived), spent: false, ageless: true };
  if (isSpent(person, lived)) return { final: true, years: 0, age: ageOf(person, lived), spent: true };
  const years = tollYears(person?.race, share);
  person.toll = (person.toll | 0) + years;
  return { final: false, years, age: ageOf(person, lived), spent: isSpent(person, lived) };
}

export function tollLine(name, { years, age, spent, ageless = false }) {
  if (ageless) return `The curse in ${name}'s blood keeps Arkay at bay. No years are taken.`;
  const y = `${years} ${years === 1 ? 'year' : 'years'}`;
  if (spent) return `Arkay takes ${y} for the road back. ${name} is ${age}, and Arkay will not grant another.`;
  return `Arkay takes ${y} for the road back. ${name} is ${age}.`;
}
