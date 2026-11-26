// @ts-check
// BUNNYFALL: switches for a small friends' server, where the upstream's protections cost CPU and protect nothing. Each is
// read off the Worker's vars (selfhost/accounts.toml) at every request; unset, the upstream behaviour stands.

let judgeOff = false;
/** THE JUDGE IS OFF (`JUDGE_OFF = "on"`): a realm checkpoint is stored as it is, never read through the item law, the
 *  ledger, the wealth budget or the census (verdict.js verdictOff). Nothing is held and no finding is written. */
export const judgeIsOff = () => judgeOff;
/** The switches, read off the env the request runs under. @param {any} env */
export function readSwitches(env) { judgeOff = env?.JUDGE_OFF === 'on'; }
