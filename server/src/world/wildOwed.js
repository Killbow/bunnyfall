// The storage prefix for signed words owed an account that is away from the open zone or the sea.
// Each lives as long as the longer of a fall receipt and a wreck.
import { WILD_RECEIPT_TTL_S, SEA_WRECK_TTL_S } from '../../../src/net/wildReceipt.js';

export const WILD_OWED_PREFIX = 'wildowed:';
export const WILD_OWED_KEEP_MS = Math.max(WILD_RECEIPT_TTL_S, SEA_WRECK_TTL_S) * 1000;
