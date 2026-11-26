// @ts-check
// Switches for a small friends' server, read from the Worker vars (selfhost/accounts.toml) on every request.
// JUDGE_OFF = "on" stores a realm checkpoint as sent, without the item, ledger, wealth budget, or census checks.

let judgeOff = false;
export const judgeIsOff = () => judgeOff;
/** @param {any} env */
export function readSwitches(env) { judgeOff = env?.JUDGE_OFF === 'on'; }
