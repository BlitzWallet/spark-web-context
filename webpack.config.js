const HtmlWebpackPlugin = require("html-webpack-plugin");
const HtmlInlineScriptPlugin = require("html-inline-script-webpack-plugin");
const path = require("path");
const webpack = require("webpack");

module.exports = {
  entry: ["webpack-hot-middleware/client?reload=true", "./index.js"],
  mode: "production",
  output: {
    filename: "[name].js", // Remove .bundle
    chunkFilename: "[id].js", // Remove .bundle
    path: path.resolve(__dirname, "dist"),
    publicPath: "/", // required for dev middleware
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
    }),
    new HtmlWebpackPlugin(),
    new webpack.HotModuleReplacementPlugin(),
    new HtmlInlineScriptPlugin(),
  ],
  devServer: {
    static: path.resolve(__dirname, "dist"),
    port: 3000,
    open: true, // automatically open browser
    hot: true, // enable hot reloading
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
