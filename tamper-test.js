// Usage:
//   node tamper-test.js --html dist/index.html --expected-hash <hash> --hash-algo md5
//
// This script:
//  - reads the original HTML
//  - extracts CSP script hashes from the meta tag
//  - flips one byte inside the first inline <script>
//  - writes tampered file to a temp path
//  - recomputes inline script SHA-256 hashes and compares to original CSP hashes
//  - recomputes file hash (md5 or sha256) and compares to expectedHash
//
// Exit codes:
//  0 -> tamper detected (good)
//  1 -> tamper NOT detected (fail)

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function usageAndExit() {
  console.error(
    "Usage: node tamper-test.js --html <path> --expected-hash <hex> --hash-algo <md5|sha256>"
  );
  process.exit(2);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--html") out.html = args[++i];
    else if (a === "--expected-hash") out.expectedHash = args[++i];
    else if (a === "--hash-algo") out.hashAlgo = args[++i];
    else usageAndExit();
  }
  if (!out.html || !out.expectedHash || !out.hashAlgo) usageAndExit();
  if (!["md5", "sha256"].includes(out.hashAlgo)) {
    console.error("hash-algo must be md5 or sha256");
    process.exit(2);
  }
  return out;
}

function computeFileHash(filePath, algo) {
  const hash = crypto.createHash(algo);
  const stream = fs.createReadStream(filePath);
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

function computeScriptSha256Base64(scriptContent) {
  const h = crypto
    .createHash("sha256")
    .update(Buffer.from(scriptContent, "utf8"))
    .digest("base64");
  return `sha256-${h}`;
}

function extractCspScriptHashes(html) {
  // find meta http-equiv Content-Security-Policy and parse script-src 'sha256-...' entries
  const metaMatch = html.match(
    /<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*content=["']([^"']*)["'][^>]*>/i
  );

  if (!metaMatch) return [];
  const content = metaMatch[0];
  // find all sha256-... tokens inside script-src (or anywhere in the meta)
  const matches = [...content.matchAll(/'sha256-[A-Za-z0-9+/=]+'/g)];
  return matches.map((m) => m[0].slice(1, -1)); // remove surrounding single quotes
}

function extractInlineScripts(html) {
  const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const scripts = [];
  let m;
  while ((m = regex.exec(html)) !== null) {
    const body = m[1];
    // skip empty script bodies (whitespace only)
    if (!body || !body.trim()) continue;
    scripts.push({ start: m.index, length: m[0].length, body });
  }
  return scripts;
}

function flipByteInStringAtUtf8ByteIndex(str, byteIndex) {
  // convert to Buffer, flip a byte, and return string
  const buf = Buffer.from(str, "utf8");
  if (byteIndex < 0 || byteIndex >= buf.length)
    throw new Error("byteIndex out of range");
  buf[byteIndex] = (buf[byteIndex] + 1) & 0xff; // simple 1-byte flip
  return buf.toString("utf8");
}

async function run() {
  const { html: htmlPath, expectedHash, hashAlgo } = parseArgs();
  const absHtml = path.resolve(htmlPath);
  if (!fs.existsSync(absHtml)) {
    console.error("HTML file not found:", absHtml);
    process.exit(2);
  }

  const origHtml = fs.readFileSync(absHtml, "utf8");
  console.log("Loaded original HTML:", absHtml);

  // 1) Extract original CSP script hashes
  const origCspHashes = extractCspScriptHashes(origHtml);
  console.log("Found CSP script hashes count:", origCspHashes.length);

  // 2) Extract inline scripts from original HTML
  const inlineScripts = extractInlineScripts(origHtml);
  if (inlineScripts.length === 0) {
    console.error("No inline scripts found to tamper with.");
    process.exit(2);
  }
  console.log("Found inline scripts count:", inlineScripts.length);

  // 3) We'll flip a byte in the first inline script body.
  // Find position in original HTML and produce new tampered HTML
  const firstScript = inlineScripts[0];
  // compute byte index inside the script body buffer roughly in middle
  const bodyBuf = Buffer.from(firstScript.body, "utf8");
  const flipByte = Math.floor(bodyBuf.length / 3); // not at very start, to avoid changing markup
  const tamperedBodyBuf = Buffer.from(bodyBuf); // copy
  tamperedBodyBuf[flipByte] = (tamperedBodyBuf[flipByte] + 1) & 0xff;

  // Reconstruct tampered HTML: replace the first script body region
  // To be robust, replace only the first <script>body</script> occurrence
  let tamperedHtml = origHtml.replace(
    /<script\b[^>]*>[\s\S]*?<\/script>/i,
    (match) => {
      // extract leading <script ...> tag
      const openTagMatch = match.match(/^<script\b[^>]*>/i);
      const closeTagMatch = match.match(/<\/script>$/i);
      if (!openTagMatch || !closeTagMatch) return match; // shouldn't happen
      const openTag = openTagMatch[0];
      const closeTag = "</script>";
      // use tamperedBodyBuf as new body
      return openTag + tamperedBodyBuf.toString("utf8") + closeTag;
    }
  );

  // Write tampered file
  const tmpDir = path.join(require("os").tmpdir(), "webview-tamper-test");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tamperedPath = path.join(tmpDir, "index.tampered.html");
  fs.writeFileSync(tamperedPath, tamperedHtml, "utf8");
  console.log("Wrote tampered HTML to", tamperedPath);

  // 4) Recompute inline script hashes on tampered HTML and compare with original CSP hashes
  const tamperedInlineScripts = extractInlineScripts(tamperedHtml);
  const tamperedHashes = tamperedInlineScripts.map((s) =>
    computeScriptSha256Base64(s.body)
  );

  // Compare sets: find any original hash that no longer appears in tampered list
  const origSet = new Set(origCspHashes);
  const tamperedSet = new Set(tamperedHashes);

  let hashesMismatch = false;
  for (const h of origSet) {
    if (!tamperedSet.has(h)) {
      console.log("CSP hash no longer present after tamper:", h);
      hashesMismatch = true;
      break;
    }
  }

  // 5) Compute file-level hash (md5 or sha256) for tampered file and compare with expectedHash
  const tamperedFileHash = await computeFileHash(tamperedPath, hashAlgo);
  console.log(`Tampered file ${hashAlgo}:`, tamperedFileHash);
  const fileHashMismatch = tamperedFileHash !== expectedHash;
  if (fileHashMismatch) {
    console.log("File-level hash no longer matches expected hash (good).");
  } else {
    console.warn("File-level hash still matches expected hash (bad).");
  }

  // Final decision
  if (hashesMismatch || fileHashMismatch) {
    console.log("Tamper detected (either CSP hashes or file hash mismatch).");
    process.exit(0);
  } else {
    console.error("Tamper NOT detected — test failed.");
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Error during tamper test:", err);
  process.exit(1);
});
