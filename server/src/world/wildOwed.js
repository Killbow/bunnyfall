import { WILD_RECEIPT_TTL_S, SEA_WRECK_TTL_S } from '../../../src/net/wildReceipt.js';

export const WILD_OWED_PREFIX = 'wildowed:';
export const WILD_OWED_KEEP_MS = Math.max(WILD_RECEIPT_TTL_S, SEA_WRECK_TTL_S) * 1000;
