const fs = require("fs");
const path = require("path");

const distDir = path.resolve(__dirname, "dist");
const htmlFile = path.join(distDir, "index.html");

console.log("Starting inline process...");

// Read the HTML file
let html = fs.readFileSync(htmlFile, "utf8");

// Find all JS files in dist directory
const jsFiles = fs
  .readdirSync(distDir)
  .filter((file) => file.endsWith(".js"))
  .map((file) => path.join(distDir, file));

console.log(`Found ${jsFiles.length} JS files to inline`);

// Inline each JS file
jsFiles.forEach((jsFile) => {
  const fileName = path.basename(jsFile);
  const jsContent = fs.readFileSync(jsFile, "utf8");

  // Replace script tags that reference this file
  const scriptTagRegex = new RegExp(
    `<script[^>]*src=["']([^"']*${fileName}[^"']*)["'][^>]*></script>`,
    "g"
  );

  html = html.replace(scriptTagRegex, (match) => {
    console.log(`Inlining: ${fileName}`);
    return `<script>${jsContent}</script>`;
  });

  // Also handle script tags with defer/async attributes
  const deferAsyncRegex = new RegExp(
    `<script[^>]*(defer|async)[^>]*src=["']([^"']*${fileName}[^"']*)["'][^>]*></script>`,
    "g"
  );

  html = html.replace(deferAsyncRegex, (match) => {
    console.log(`Inlining (defer/async): ${fileName}`);
    return `<script>${jsContent}</script>`;
  });

  // Delete the JS file after inlining
  fs.unlinkSync(jsFile);
  console.log(`Deleted: ${fileName}`);
});

// Also check for any remaining script tags that might have relative paths
const remainingScripts = html.match(
  /<script[^>]*src=["']\.?\/[^"']*\.js["'][^>]*>/g
);
if (remainingScripts) {
  console.log("\nWarning: Some script tags may not have been inlined:");
  remainingScripts.forEach((tag) => console.log(tag));
}

// Write the updated HTML
fs.writeFileSync(htmlFile, html, "utf8");

console.log("\nInlining complete!");
console.log(
  `Final HTML size: ${(fs.statSync(htmlFile).size / 1024 / 1024).toFixed(2)} MB`
);
