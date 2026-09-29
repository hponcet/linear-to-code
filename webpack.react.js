const fs = require("fs")
const path = require("path")

const CSSMinimizerPlugin = require("css-minimizer-webpack-plugin")
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin")
const MiniCssExtractPlugin = require("mini-css-extract-plugin")
const TerserPlugin = require("terser-webpack-plugin")
const TsconfigPathsPlugin = require("tsconfig-paths-webpack-plugin")
const webpack = require("webpack")

const appDirectory = fs.realpathSync(process.cwd())
const resolveApp = (relativePath) => path.resolve(appDirectory, relativePath)
const isProduction = process.env.NODE_ENV === "production"

module.exports = {
  mode: isProduction ? "production" : "development",
  entry: {
    navigation: resolveApp("./src/webviews/entries/navigation.tsx"),
    issue: resolveApp("./src/webviews/entries/issue.tsx"),
    settings: resolveApp("./src/webviews/entries/settings.tsx"),
    startWork: resolveApp("./src/webviews/entries/startWork.tsx"),
    createIssue: resolveApp("./src/webviews/entries/createIssue.tsx"),
  },
  devtool: isProduction ? undefined : "eval-source-map",

  output: {
    clean: {
      keep: /^(?:extension|linearToCodeMcpServer)\.js(?:\.map)?$/,
    },
    publicPath: "auto",
    pathinfo: true,
    path: path.resolve(__dirname, process.env.WEBVIEW_OUTPUT_PATH || "dist"),
    chunkFilename: "[name].chunk.js",
    filename: "[name].js",
    devtoolModuleFilenameTemplate: "file:///[absolute-resource-path]",
  },
  optimization: {
    minimizer: isProduction
      ? [
          new CSSMinimizerPlugin({}),
          new TerserPlugin({
            extractComments: false,
            terserOptions: {
              keep_fnames: true,
              compress: {
                comparisons: false,
              },
              output: {
                comments: false,
                ascii_only: true,
              },
            },
          }),
        ]
      : undefined,
    splitChunks: {
      chunks: "async",
      maxAsyncSize: 500_000,
    },
  },
  externals: ["utf-8-validate", "bufferutil", "vscode"],
  watchOptions: {
    ignored: ["**/node_modules/**", "**/dist/**", "**/.cache/**"],
    // Avoid EMFILE on macOS when fork-ts-checker adds directory watchers on top of webpack.
    poll: isProduction ? undefined : 1000,
  },
  resolve: {
    // Add '.ts' and '.tsx' as resolvable extensions.
    extensions: [".ts", ".tsx", ".js", ".json"],
    plugins: [new TsconfigPathsPlugin({ configFile: resolveApp("./tsconfig.json") })],
    fallback: {
      path: require.resolve("path-browserify"),
      crypto: require.resolve("crypto-browserify"),
      stream: require.resolve("stream-browserify"),
      vm: require.resolve("vm-browserify"),
      buffer: require.resolve("buffer"),
      process: require.resolve("process"),
      "process/browser": require.resolve("process/browser"),
    },
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: "[name].css",
      ignoreOrder: true,
    }),
    // moment's dynamic locale require bundles every locale; the webviews only use English.
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/,
    }),
    new webpack.WatchIgnorePlugin({
      paths: [/\.js$/, /\.d\.ts$/],
    }),
    new webpack.DefinePlugin({
      "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
    }),
    new ForkTsCheckerWebpackPlugin({
      typescript: {
        configFile: resolveApp("tsconfig.json"),
      },
    }),
    new webpack.ProvidePlugin({
      process: "process/browser",
    }),
  ],
  module: {
    rules: [
      {
        // Include ts, tsx, js, and jsx files.
        test: /\.(ts|js)x?$/,
        exclude: [/node_modules/, /\.test\.ts$/, /\.spec\.ts$/],
        use: [
          {
            loader: "ts-loader",
            options: { transpileOnly: true, onlyCompileBundledFiles: true },
          },
        ],
      },
      {
        test: /\.css$/,
        use: [
          isProduction
            ? {
                loader: MiniCssExtractPlugin.loader,
                options: {
                  publicPath: "../",
                },
              }
            : "style-loader",
          {
            loader: require.resolve("css-loader"),
            options: {
              importLoaders: 1,
              sourceMap: true,
            },
          },
        ],
      },
      {
        test: /\.scss$/,
        use: [
          isProduction
            ? {
                loader: MiniCssExtractPlugin.loader,
                options: {
                  publicPath: "../",
                },
              }
            : "style-loader",
          {
            loader: require.resolve("css-loader"),
            options: {
              importLoaders: 1,
              sourceMap: true,
            },
          },
          {
            loader: require.resolve("sass-loader"),
            options: {
              // Use pure JS dart-sass; sass-embedded spawns a subprocess that can fail with EBADF in the extension dev host.
              implementation: require("sass"),
              sourceMap: true,
            },
          },
        ],
      },
      {
        test: /\.js$/,
        use: [{ loader: "source-map-loader" }],
        enforce: "pre",
        include: /node_modules/,
      },
    ],
  },
}
