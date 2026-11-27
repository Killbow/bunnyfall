// Mints the identity Ed25519 pair: IDENTITY_PRIVATE_KEY for the account service, IDENTITY_PUBLIC_KEY for the relay.
// Run: node tools/mintIdentityKeys.mjs [--pipe]. Nothing is written to disk; one run emits both halves of one pair.
const { subtle } = globalThis.crypto;

const kp = await subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);

const b64 = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64');
const b64url = (buf) => Buffer.from(new Uint8Array(buf)).toString('base64url');

const priv = b64(await subtle.exportKey('pkcs8', kp.privateKey));
const pub = b64url(await subtle.exportKey('raw', kp.publicKey));

// Private key first, public key second, one line each and nothing else: the workflow reads them in this order.
if (process.argv.includes('--pipe')) {
  process.stdout.write(`${priv}\n${pub}\n`);
  process.exit(0);
}

console.log('\n── IDENTITY_PRIVATE_KEY (secret - server-account) ──────────────\n');
console.log(priv);
console.log('\n── IDENTITY_PUBLIC_KEY (not secret - served at /v1/pubkey) ─────\n');
console.log(pub);
console.log(`\n(${pub.length}-char base64url public key; the private half is base64 PKCS8.)`);
console.log('Nothing was written to disk. If you lose the private half, mint a new pair');
console.log('and update both ends - every token signed by the old one stops verifying,');
console.log('which costs every player one reconnect and nothing else.\n');
