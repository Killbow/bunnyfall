#!/usr/bin/env node
// Mints a new recovery code for a player who lost both password and code; only its hash goes on the account.
// Run: node tools/reissueRecoveryCode.mjs <handle>, or --sql <handle> <hash> for the statement the workflow runs.
// The code itself never goes into the workflow; only its hash does.
// Spending the code replaces the stored hash and signs out every other session, so the operator's copy works once.

import { isMain } from './lib/isMain.mjs';
import { mintRecoveryCode, codeForHashing, hashPassword, parseStored } from '../server-account/src/password.js';
import { isHandleShaped } from '../src/net/handleShape.js';

// The stored hash is standard base64, so no character in it can end an SQL string.
export const HASH_RE = /^pbkdf2-sha256\$\d+\$[A-Za-z0-9+/]+={0,2}\$[A-Za-z0-9+/]+={0,2}$/;

export async function mintReissue({ subtle, rand }) {
  const code = mintRecoveryCode(rand);
  return { code, hash: await hashPassword(codeForHashing(code), { subtle, rand }) };
}

// The statement folds the handle as the service does (handle_lc) and changes only recovery_hash on a registered
// account. RETURNING lets the workflow refuse a run that changed no row.
/**
 * @param {string} handle
 * @param {string} hash
 */
export function reissueSql(handle, hash) {
  if (!isHandleShaped(handle)) throw new Error(`not a username: ${JSON.stringify(handle)}`);
  if (typeof hash !== 'string' || !HASH_RE.test(hash) || !parseStored(hash)) throw new Error('not a recovery-code hash from this tool');
  const lc = handle.toLowerCase().replaceAll("'", "''");
  return `UPDATE players SET recovery_hash = '${hash}' WHERE handle_lc = '${lc}' AND handle IS NOT NULL RETURNING handle;`;
}

async function main(argv) {
  const rand = (b) => globalThis.crypto.getRandomValues(b);
  if (argv[0] === '--sql') {
    process.stdout.write(`${reissueSql(argv[1], argv[2])}\n`);
    return;
  }
  const handle = argv[0];
  if (!isHandleShaped(handle)) throw new Error('usage: node tools/reissueRecoveryCode.mjs <handle>');
  const { code, hash } = await mintReissue({ subtle: globalThis.crypto.subtle, rand });
  reissueSql(handle, hash);
  console.log(`Recovery code for ${handle} - give it to the player privately; it works once:\n\n  ${code}\n`);
  console.log(`Its hash - the workflow's \`hash\` input (not a secret):\n\n  ${hash}\n`);
  console.log(`Then: Actions > "Account recovery" > Run workflow, with handle ${handle} and that hash. The player uses`);
  console.log('"Forgot password" in the game with the code, picks a new password, and is shown new recovery codes to keep.');
}

if (isMain(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
