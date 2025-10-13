const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const distDir = path.resolve(__dirname, "dist");
const htmlFile = path.join(distDir, "index.html");

let html = fs.readFileSync(htmlFile, "utf8");

// === Inline all external JS files ===
const scriptTagRegex = /<script[^>]*src=["']([^"']*\.js)["'][^>]*><\/script>/g;
const scriptTags = [];
let match;

while ((match = scriptTagRegex.exec(html)) !== null) {
  scriptTags.push({ fullTag: match[0], src: match[1] });
}

console.log(`Found ${scriptTags.length} external <script> tags.`);

for (const { fullTag, src } of scriptTags) {
  const fileName = path.basename(src);
  const jsFilePath = path.join(distDir, fileName);

  if (fs.existsSync(jsFilePath)) {
    const jsContent = fs.readFileSync(jsFilePath, "utf8");
    console.log(
      `Inlining: ${fileName} (${(jsContent.length / 1024).toFixed(1)} KB)`
    );

    html = html.replace(
      fullTag,
      `<script>\n// Inlined from ${fileName}\n${jsContent}\n</script>`
    );

    fs.unlinkSync(jsFilePath);
  } else {
    console.warn(`Missing file: ${fileName}`);
  }
}

// Inline any remaining JS files (not referenced)
const remainingJs = fs.readdirSync(distDir).filter((f) => f.endsWith(".js"));
if (remainingJs.length > 0) {
  let inlineScripts = "";
  for (const file of remainingJs) {
    const jsContent = fs.readFileSync(path.join(distDir, file), "utf8");
    inlineScripts += `<script>\n// Inlined from ${file}\n${jsContent}\n</script>\n`;
    fs.unlinkSync(path.join(distDir, file));
  }
  html = html.replace("</body>", `${inlineScripts}</body>`);
}

// === Insert startup nonce snippet (auto-reads its nonce at runtime) ===
const nonceScript = `<script nonce="__INJECT_NONCE__">
(function () {
  const thisScript = document.currentScript;
  const nonceValue = thisScript?.nonce || "__INJECT_NONCE__";

  if (!nonceValue || nonceValue === "__INJECT_NONCE__") {
    console.warn("Startup nonce missing or not injected yet");
  }

  window.__STARTUP_NONCE__ = nonceValue;
})();
</script>\n`;

if (html.includes("<head>")) {
  html = html.replace(/<head>/i, `<head>\n${nonceScript}`);
  console.log("Added startup nonce bootstrap script after <head>");
} else {
  html = nonceScript + html;
  console.log("No <head> found, prepended startup nonce bootstrap script");
}

// === Generate CSP hashes for all inline scripts ===
const inlineScriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
const hashes = [];
while ((match = inlineScriptRegex.exec(html)) !== null) {
  const scriptContent = match[1];
  if (!scriptContent || !scriptContent.trim()) continue;

  const hash = crypto
    .createHash("sha256")
    .update(Buffer.from(scriptContent, "utf8"))
    .digest("base64");
  hashes.push(`'sha256-${hash}'`);
}

console.log(`Generated ${hashes.length} CSP script hashes.`);

// === Inject strict CSP meta with placeholder nonce ===
const csp = [
  `default-src 'none'`,
  `script-src 'self' 'nonce-__INJECT_NONCE__' 'unsafe-eval' 'wasm-unsafe-eval' ${hashes.join(
    " "
  )}`,
  `connect-src 'self' https: wss:`,
  `object-src 'none'`,
  `frame-ancestors 'none'`,
  `block-all-mixed-content`,
].join("; ");

const cspMeta = `<meta http-equiv="Content-Security-Policy" content="${csp}">`;

if (/<meta http-equiv="Content-Security-Policy"/i.test(html)) {
  html = html.replace(
    /<meta http-equiv="Content-Security-Policy"[^>]*>/i,
    cspMeta
  );
} else if (/<head>/i.test(html)) {
  html = html.replace(/<head>/i, `<head>\n${cspMeta}`);
} else {
  html = `${cspMeta}\n${html}`;
}

fs.writeFileSync(htmlFile, html, "utf8");

console.log("CSP meta tag injected and HTML written successfully.");
console.log(
  `Final HTML size: ${(fs.statSync(htmlFile).size / 1024 / 1024).toFixed(2)} MB`
);
