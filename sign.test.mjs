import { generateKeyPairSync, sign, verify, createHash } from 'crypto';
import assert from 'assert';

// Runtime hashes the canonical bytes off-thread (expo-crypto); mirror with node.
const sha256 = b => createHash('sha256').update(b).digest();

// Fixed ASN.1 SPKI header for a raw-32-byte Ed25519 public key (mirrors
// sign.js / bundleVerification.js, which pin/rebuild from the raw 32 bytes).
const ED25519_SPKI_PREFIX = '302a300506032b6570032100';
const rawPub = keyObj =>
  keyObj
    .export({ format: 'der', type: 'spki' })
    .subarray(Buffer.from(ED25519_SPKI_PREFIX, 'hex').length)
    .toString('hex'); // 32 bytes → 64 hex

// --- keygen ---
const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const pubHex = rawPub(publicKey);

// --- a stand-in for the built HTML (placeholder present, like inline-assets output) ---
const built =
  `<head>\n<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-__INJECT_NONCE__'">\n` +
  `<meta name="blitz-webview-sig" content="__SIGNATURE__">\n` +
  `<script nonce="__INJECT_NONCE__">/* 6MB bundle */</script>\n</head>`;

// === BUILD SIDE (sign.js logic) ===
const canonical = Buffer.from(built, 'utf8');
assert(canonical.includes('content="__SIGNATURE__"'), 'placeholder missing pre-sign');
const sigHex = sign(null, sha256(canonical), privateKey).toString('hex'); // Ed25519 over the digest
assert.strictEqual(sigHex.length, 128, 'signature must be 128 hex chars');
const shipped = canonical.toString('utf8').replace('content="__SIGNATURE__"', `content="${sigHex}"`);

// === RUNTIME SIDE (bundleVerification.js logic) ===
function makePub(pubHexArg) {
  return {
    key: Buffer.concat([
      Buffer.from(ED25519_SPKI_PREFIX, 'hex'),
      Buffer.from(pubHexArg, 'hex'),
    ]),
    format: 'der',
    type: 'spki',
  };
}
function verifyBundle(html, pubHexArg) {
  const m = html.match(/<meta name="blitz-webview-sig" content="([0-9a-f]{128})"/);
  if (!m) throw new Error('missing signature meta');
  const canon = html.replace(
    /(<meta name="blitz-webview-sig" content=")[0-9a-f]{128}(")/,
    '$1__SIGNATURE__$2',
  );
  return verify(null, sha256(Buffer.from(canon, 'utf8')), makePub(pubHexArg), Buffer.from(m[1], 'hex'));
}

// 1. happy path: shipped file verifies against the pinned pubkey
assert.strictEqual(verifyBundle(shipped, pubHex), true, 'valid bundle should verify');

// 2. reconstructed canonical bytes must equal the signed bytes
const reconstructed = shipped.replace(
  /(<meta name="blitz-webview-sig" content=")[0-9a-f]{128}(")/,
  '$1__SIGNATURE__$2',
);
assert.strictEqual(reconstructed, built, 'reconstruction must be byte-identical to signed input');

// 3. tampered body -> fails closed
const tampered = shipped.replace('6MB bundle', '6MB EVIL bundle');
assert.strictEqual(verifyBundle(tampered, pubHex), false, 'tampered bundle must fail');

// 4. wrong pinned pubkey -> fails closed
const otherPub = rawPub(generateKeyPairSync('ed25519').publicKey);
assert.strictEqual(verifyBundle(shipped, otherPub), false, 'wrong pubkey must fail');

console.log('ALL PASS — valid=true, tampered=false, wrongkey=false, reconstruction byte-identical');
