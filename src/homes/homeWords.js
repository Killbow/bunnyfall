// @ts-check

export const goldSum = (n) => Number(n).toLocaleString('en-US');
export const EMPIRE_ACCOUNT_WORDS = 'your account at the Bank of the Empire';
export const REGION_ACCOUNT_WORDS = "this region's bank account";
export const accountWords = (empire) => (empire ? EMPIRE_ACCOUNT_WORDS : REGION_ACCOUNT_WORDS);
