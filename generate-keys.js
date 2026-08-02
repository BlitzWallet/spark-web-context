const { generateKeyPairSync } = require("crypto");
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
// raw 32-byte seed for the env (strip PKCS8 header 302e020100300506032b657004220420)
const seedHex = privateKey
  .export({ format: "der", type: "pkcs8" })
  .subarray(16)
  .toString("hex");
// raw 32-byte pubkey for pinning (strip SPKI header 302a300506032b6570032100)
const pubHex = publicKey
  .export({ format: "der", type: "spki" })
  .subarray(12)
  .toString("hex");

console.log("Private key:", seedHex);
console.log("Public key:", pubHex);
