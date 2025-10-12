const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const distDir = path.resolve(__dirname, "./dist");
const htmlFile = path.join(distDir, "index.html");
const hexFile = path.join(distDir, "index.html.hex");

async function main() {
  if (!fs.existsSync(htmlFile)) {
    console.error("dist/index.html not found — run build + inline first");
    process.exit(2);
  }

  // Read file as raw binary buffer (not UTF-8 string)
  const html = fs.readFileSync(htmlFile);

  const hashHex = crypto.createHash("sha256").update(html).digest("hex");

  fs.writeFileSync(hexFile, hashHex, "utf8");

  console.log("\nHashed successfully");
  console.log("SHA256 Hash:", hashHex);
}

main().catch(console.error);
