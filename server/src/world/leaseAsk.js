// How often a frame from a build that hands on no lease asks the hub's lease door.
// It is ten times the relay settings lifetime.
import { RELAY_CFG_TTL_MS } from '../../../src/net/relayCfg.js';

export const LEASE_OLD_ASK_MS = 10 * RELAY_CFG_TTL_MS;
