// Mints the gate receipt Ed25519 pair: GATE_SIGNING_KEY for the relay and GATE_PUBLIC_KEY for the account service.
// Run: node tools/mintGateKeys.mjs [--pipe]. Nothing is written to disk, and one run emits both halves of one pair.
const { subtle } = globalThis.crypto;

const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);

const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64');
const b64url = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64url');

const priv = b64(await subtle.exportKey('pkcs8', kp.privateKey));
const pub = b64url(await subtle.exportKey('raw', kp.publicKey));

// Private key first, public key second, one line each and nothing else: the pipe reads them in this order.
if (process.argv.includes('--pipe')) {
  process.stdout.write(`${priv}\n${pub}\n`);
  process.exit(0);
}

console.log('\n── GATE_SIGNING_KEY (secret - the RELAY: `npx wrangler secret put GATE_SIGNING_KEY` from server/) ──\n');
console.log(priv);
console.log('\n── GATE_PUBLIC_KEY (not secret - the ACCOUNT SERVICE: `npx wrangler secret put GATE_PUBLIC_KEY` from server-account/) ──\n');
console.log(pub);
console.log(`\n(${pub.length}-char base64url public key; the private half is base64 PKCS8.)`);
console.log('Nothing was written to disk. Both halves are this one pair: set the private one on the relay and');
console.log('the public one on the account service, or every receipt is declined as forged.\n');
