const HtmlWebpackPlugin = require("html-webpack-plugin");
const HtmlInlineScriptPlugin = require("html-inline-script-webpack-plugin");
const path = require("path");
const webpack = require("webpack");

module.exports = {
  entry: "./index.js",
  mode: "production",
  output: {
    filename: "./index.js",
    path: path.resolve(__dirname, "dist"),
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
    }),
    new HtmlWebpackPlugin(),
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
