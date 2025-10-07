const path = require("path");
const express = require("express");
const webpack = require("webpack");
const webpackDevMiddleware = require("webpack-dev-middleware");
const webpackHotMiddleware = require("webpack-hot-middleware");
const config = require("./webpack.config.js");

const app = express();
const compiler = webpack(config);
const PORT = 3000;

// Webpack dev middleware (auto rebuild)
app.use(
  webpackDevMiddleware(compiler, {
    publicPath: config.output.publicPath,
  })
);

// Hot reload in browser
app.use(webpackHotMiddleware(compiler));

// Serve index.html for all routes
app.get("/*path", (req, res, next) => {
  const filename = path.join(compiler.outputPath, "index.html");
  compiler.outputFileSystem.readFile(filename, (err, result) => {
    if (err) return next(err);
    res.set("content-type", "text/html");
    res.send(result);
    res.end();
  });
});

app.listen(PORT, () => {
  console.log(
    `🚀 Local WebView dev server running at http://localhost:${PORT}`
  );
});
