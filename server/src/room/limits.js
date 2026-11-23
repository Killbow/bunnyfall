// Caps and small checks the relay's rooms share. They cover the account and cooldown caches, raid
// caches and receipts still good, unlisted accounts, a shard's owed event weight, and its retry.
import { INVITE_TTL_MS } from '../relay.js';

export const RECS_MAX = 4096;
export const RAID_CACHE_MAX = 64;
export const raidRcLive = (v, now) => (Array.isArray(v) ? v.filter((e) => e && typeof e === 'object' && typeof e.r === 'string' && Number.isFinite(e.until) && now < e.until) : []);
export const COOL_MAX = 4096;
export const unlisted = (r, now) => !!r && !(r.friends?.length) && !(r.in?.length) && !(r.out?.length) && !(r.invites ?? []).some((i) => now - i.at < INVITE_TTL_MS);
export const upBytesOf = (ev) => (typeof ev[2] === 'string' ? ev[2].length : 512);
export const HUB_RETRY_MS = 1000;
