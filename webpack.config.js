const HtmlWebpackPlugin = require("html-webpack-plugin");
const InlineChunkHtmlPlugin = require("inline-chunk-html-plugin");
const path = require("path");
const webpack = require("webpack");

module.exports = {
  entry: "./index.js",
  mode: "production",
  output: {
    filename: "index.js",
    path: path.resolve(__dirname, "dist"),
    publicPath: "/",
  },
  resolve: {
    alias: {
      // Dedupe @noble/hashes: the app imports v2-style subpaths (./sha2.js)
      // while the SDK and @scure/* import v1-style (./sha2). v1.8.0 exports
      // both forms, so pin everything to the single v1.8.0 copy the SDK uses.
      "@noble/hashes": path.resolve(
        __dirname,
        "node_modules/@buildonspark/spark-sdk/node_modules/@noble/hashes"
      ),
    },
  },
  optimization: {
    splitChunks: false,
    runtimeChunk: false,
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
    }),
    new HtmlWebpackPlugin(),
    new InlineChunkHtmlPlugin(HtmlWebpackPlugin, [/.*/]), // Inline ALL chunks
  ],
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
        },
      },
    ],
  },
};
