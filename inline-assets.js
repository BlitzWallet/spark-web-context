const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const nonce = crypto.randomBytes(16).toString("base64url");

const SECURE_NONCE = nonce;

const distDir = path.resolve(__dirname, "dist");
const htmlFile = path.join(distDir, "index.html");

// Read the HTML file
let html = fs.readFileSync(htmlFile, "utf8");

// Extract script tags in order from the HTML
const scriptTagRegex = /<script[^>]*src=["']([^"']*\.js)["'][^>]*><\/script>/g;
const scriptTags = [];
let match;

while ((match = scriptTagRegex.exec(html)) !== null) {
  scriptTags.push({
    fullTag: match[0],
    src: match[1],
  });
}

console.log(`Found ${scriptTags.length} script tags in HTML`);

// Replace each script tag with inlined content
scriptTags.forEach(({ fullTag, src }) => {
  const fileName = path.basename(src);
  const jsFilePath = path.join(distDir, fileName);

  if (fs.existsSync(jsFilePath)) {
    const jsContent = fs.readFileSync(jsFilePath, "utf8");
    console.log(
      `Inlining: ${fileName} (${(jsContent.length / 1024).toFixed(2)} KB)`
    );

    // Inline JS content with nonce placeholder
    html = html.replace(
      fullTag,
      `<script nonce="${SECURE_NONCE}">\n// Inlined from ${fileName}\n${jsContent}\n</script>`
    );

    // Delete the JS file
    fs.unlinkSync(jsFilePath);
    console.log(`Deleted: ${fileName}`);
  } else {
    console.log(`Warning: ${fileName} not found, skipping`);
  }
});

// Handle any remaining JS files not referenced in HTML
const remainingJsFiles = fs
  .readdirSync(distDir)
  .filter((file) => file.endsWith(".js"));

if (remainingJsFiles.length > 0) {
  console.log(
    `\nFound ${remainingJsFiles.length} additional JS files not in HTML:`
  );
  let additionalScripts = "";

  remainingJsFiles.forEach((fileName) => {
    const jsFilePath = path.join(distDir, fileName);
    const jsContent = fs.readFileSync(jsFilePath, "utf8");
    console.log(
      `Inlining: ${fileName} (${(jsContent.length / 1024).toFixed(2)} KB)`
    );

    additionalScripts += `<script nonce="${SECURE_NONCE}">\n// Inlined from ${fileName}\n${jsContent}\n</script>\n`;

    fs.unlinkSync(jsFilePath);
    console.log(`Deleted: ${fileName}`);
  });

  // Append at the end of body or html
  if (html.includes("</body>")) {
    html = html.replace("</body>", `${additionalScripts}</body>`);
  } else if (html.includes("</html>")) {
    html = html.replace("</html>", `${additionalScripts}</html>`);
  } else {
    html += additionalScripts;
  }
}

// Add nonce to any existing inline <script> tags without one
html = html.replace(
  /<script(?![^>]*nonce=)([^>]*)>/g,
  `<script nonce="${SECURE_NONCE}"$1>`
);

// Add CSP meta tag with placeholder nonce
const cspTag = `<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${SECURE_NONCE}';">`;

// Inject into <head> if not already present
if (!html.includes("Content-Security-Policy")) {
  html = html.replace(/<head>/i, `<head>\n  ${cspTag}`);
  console.log("Added CSP meta tag with nonce placeholder");
} else {
  console.log("ℹCSP meta tag already exists");
}

// Write the updated HTML
fs.writeFileSync(htmlFile, html, "utf8");

console.log("\nInlining complete!");
console.log(
  `Final HTML size: ${(fs.statSync(htmlFile).size / 1024 / 1024).toFixed(2)} MB`
);
console.log(`Nonce placeholder: ${SECURE_NONCE}`);
console.log(
  "\nRemember: The nonce will be injected at runtime by React Native"
);
