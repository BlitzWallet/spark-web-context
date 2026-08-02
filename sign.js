require("dotenv").config();
const fs = require("fs");
const path = require("path");
const {
  sign,
  createHash,
  createPrivateKey,
  createPublicKey,
} = require("crypto");

// Fixed ASN.1 headers for raw-32-byte Ed25519 keys (carry no secret).
const ED25519_PKCS8_PREFIX = "302e020100300506032b657004220420"; // + 32-byte seed
const ED25519_SPKI_PREFIX = "302a300506032b6570032100"; // + 32-byte pubkey

function main() {
  const htmlFile = path.resolve(__dirname, "./dist/index.html");
  const privHex = process.env.SPARK_WEBVIEW_SIGNING_KEY;
  if (!privHex) {
    // No key (e.g. local `yarn install`): skip signing instead of failing the
    // build. The bundle keeps its __SIGNATURE__ placeholder, which the runtime
    // verifier rejects (fails closed → native fallback). Release builds set the
    // key and sign normally.
    console.warn(
      "SPARK_WEBVIEW_SIGNING_KEY not set — skipping signing (bundle left unsigned).",
    );
    return;
  }

  // Rebuild the Ed25519 private key from the raw 32-byte seed.
  const priv = createPrivateKey({
    key: Buffer.concat([
      Buffer.from(ED25519_PKCS8_PREFIX, "hex"),
      Buffer.from(privHex, "hex"),
    ]),
    format: "der",
    type: "pkcs8",
  });

  // Sign the canonical bytes: the file WITH the __SIGNATURE__ placeholder.
  const canonical = fs.readFileSync(htmlFile);
  if (!canonical.includes('content="__SIGNATURE__"')) {
    console.error(
      "__SIGNATURE__ placeholder missing — run inline-assets first",
    );
    process.exit(2);
  }

  // Sign the sha256 digest, not the full 5.3MB — so the runtime can hash the
  // bundle off the JS thread (expo-crypto) and Ed25519-verify just 32 bytes.
  const msg = createHash("sha256").update(canonical).digest(); // 32 bytes
  const sig = sign(null, msg, priv).toString("hex"); // 64 bytes → 128 hex chars
  if (sig.length !== 128) {
    console.error(`unexpected signature length ${sig.length}, expected 128`);
    process.exit(2);
  }

  // Embed the signature into the placeholder slot.
  const html = canonical
    .toString("utf8")
    .replace('content="__SIGNATURE__"', `content="${sig}"`);
  fs.writeFileSync(htmlFile, html);

  // Print the raw 32-byte pubkey hex to pin in the app env.
  const pubHex = createPublicKey(priv)
    .export({ format: "der", type: "spki" })
    .subarray(Buffer.from(ED25519_SPKI_PREFIX, "hex").length)
    .toString("hex");
  console.log("Signed. pubkey", pubHex);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(2);
}
