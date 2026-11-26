// @ts-check

export const houseWord = (surname) => String(surname ?? '').trim().replace(/^of\s+/i, '');
