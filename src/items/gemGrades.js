// @ts-check
// A leaf with no imports and only data at import, so the pure rules on both client and server may read it.

export const GEM_IDS = Object.freeze(['ruby', 'emerald', 'sapphire', 'diamond', 'jade', 'turquoise', 'malachite', 'amber']);
export const GEM_KIND_NAMES = Object.freeze({ ruby: 'Ruby', emerald: 'Emerald', sapphire: 'Sapphire', diamond: 'Diamond', jade: 'Jade', turquoise: 'Turquoise', malachite: 'Malachite', amber: 'Amber' });
export const GEM_GRADES = Object.freeze(['chipped', 'flawed', 'plain', 'flawless', 'perfect']);
export const GEM_GRADE_WORDS = Object.freeze({ chipped: 'Chipped', flawed: 'Flawed', plain: '', flawless: 'Flawless', perfect: 'Perfect' });
export const GEM_ROW_GRADES = Object.freeze(['chipped', 'flawed', 'flawless', 'perfect']);
export const GEM_GRADE_TEMPLATE_BASE = 1900;
export const GEM_GRADE_TEMPLATES = Object.freeze(GEM_ROW_GRADES.flatMap((_, g) => GEM_IDS.map((__, k) => GEM_GRADE_TEMPLATE_BASE + g * GEM_IDS.length + k)));
export const gemId = (kind, grade = 'plain') => (grade === 'plain' ? kind : `${grade}-${kind}`);
export const ALL_GEM_IDS = Object.freeze([...GEM_IDS, ...GEM_ROW_GRADES.flatMap((g) => GEM_IDS.map((k) => gemId(k, g)))]);
export const isGemId = (id) => typeof id === 'string' && ALL_GEM_IDS.includes(id);
export const gemKind = (id) => (isGemId(id) ? id.slice(id.indexOf('-') + 1) : null);
export const gemGrade = (id) => (!isGemId(id) ? null : id.includes('-') ? id.slice(0, id.indexOf('-')) : 'plain');
export const GEM_NAMES = Object.freeze(Object.fromEntries(ALL_GEM_IDS.map((id) => [id, `${GEM_GRADE_WORDS[gemGrade(id)]} ${GEM_KIND_NAMES[gemKind(id)]}`.trim()])));
export const gemTemplateOf = (id) => (!isGemId(id) ? null : id.includes('-') ? GEM_GRADE_TEMPLATES[ALL_GEM_IDS.indexOf(id) - GEM_IDS.length] : GEM_IDS.indexOf(id));

export const GEM_GRADE_PRICE = Object.freeze({ chipped: 0.25, flawed: 0.5, plain: 1, flawless: 2, perfect: 4 });
export const gradedGemPrice = (basePrice, grade) => Math.max(1, Math.round(basePrice * (GEM_GRADE_PRICE[grade] ?? 1)));
