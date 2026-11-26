import { MAX_TTL_S, ORDER_TTL_S } from '../../../src/net/identityToken.js';

export const SPENT_MAX = 4096;
export const ORDERS_MAX = 1024;
export const SAFE_INTERNAL_LAW = '/internal/safe/law';
export const BANS_MAX = 256;
export const BANS_KEY = 'bans';
// The 60 is twice SKEW_S in src/net/identityToken.js: a held ban must outlive every token
// and order minted before it, skew included.
export const BAN_KEEP_S = MAX_TTL_S + ORDER_TTL_S + 60;
// Must exceed the 1024-character order cap in server/src/worker/asks.js plus its JSON wrapper.
export const LAW_BODY_MAX = 2048;
export const LAW_SEEN_MAX = 256;
export const WDUN_KIN_SILENT_MS = 5_000;
export const GUILD_OUTS_MAX = 1024;
export const GUILD_OUTS_KEY = 'guildouts';
export const GUILD_OUT_KEEP_S = MAX_TTL_S + ORDER_TTL_S + 60;
