const fs = require("fs");
const path = require("path");
const { sha256 } = require("@noble/hashes/sha2.js");

const distDir = path.resolve(__dirname, "./dist");
const htmlFile = path.join(distDir, "index.html");
const hexFile = path.join(distDir, "index.html.hex");

async function main() {
  if (!fs.existsSync(htmlFile)) {
    console.error("dist/index.html not found — run build + inline first");
    process.exit(2);
  }
  const html = fs.readFileSync(htmlFile);
  const hashBytes = sha256(html);
  const hashHex = Buffer.from(hashBytes).toString("hex");

  fs.writeFileSync(hexFile, hashHex, "utf8");

  console.log("\nHashed successfully");
  console.log("Hash:", hashHex);
}

main().catch(console.error);
