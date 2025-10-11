const fs = require("fs");
const path = require("path");

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
      `<script>\n// Inlined from ${fileName}\n${jsContent}\n</script>`
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

    additionalScripts += `<script>\n// Inlined from ${fileName}\n${jsContent}\n</script>\n`;

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

// Add placeholder nonce for later validation in RN

const nonceScript = `<script>
    // Placeholder for runtime verification nonce (replaced at runtime)
    window.__STARTUP_NONCE__ = "__INJECT_NONCE__";
  </script>\n`;

// Inject immediately after <head> since it always exists
if (html.includes("<head>")) {
  html = html.replace(/<head>/i, `<head>\n${nonceScript}`);
  console.log("Added nonce placeholder after <head>");
} else {
  // fallback — prepend if somehow <head> missing
  html = nonceScript + html;
  console.log("No <head> found, added nonce placeholder at top");
}

// Write the updated HTML
fs.writeFileSync(htmlFile, html, "utf8");

console.log("\nInlining complete!");
console.log(
  `Final HTML size: ${(fs.statSync(htmlFile).size / 1024 / 1024).toFixed(2)} MB`
);
