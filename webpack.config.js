const HtmlWebpackPlugin = require("html-webpack-plugin");
const HtmlInlineScriptPlugin = require("html-inline-script-webpack-plugin");
const path = require("path");
const webpack = require("webpack");

module.exports = {
  entry: "./index.js",
  mode: "production",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
    publicPath: "",
    clean: true,
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
    }),
    new HtmlWebpackPlugin({
      templateContent: `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Spark Web Context</title>
          </head>
          <body>
            <div id="root"></div>
          </body>
        </html>
      `,
      inject: "body",
    }),
    new HtmlInlineScriptPlugin(),
  ],
  optimization: {
    splitChunks: false,
    runtimeChunk: false,
  },
  module: {
    rules: [{ test: /\.ts$/u, use: "ts-loader" }],
  },
  // resolve: {
  //   fallback: {
  //     crypto: require.resolve("crypto-browserify"),
  //     fs: false,
  //     path: require.resolve("path-browserify"),
  //     stream: require.resolve("stream-browserify"),
  //   },
  //   extensions: [".js", ".ts"],
  // },
};
