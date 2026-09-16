const path = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')

const createVirtualEntryPlugin = require('./entry-plugin')
const createDev8Plugin = require('./dev8-plugin')

const rootPath = process.cwd()
const distPath = path.join(rootPath, 'dist')
const srcPath = path.join(rootPath, 'src')
const imageTargetsPath = path.join(rootPath, 'image-targets')

// copy-webpack-plugin resolves a directory `from` into an absolute glob, so
// `ignore` patterns must also be absolute or they silently match nothing.
const toPosix = (p) => p.split(path.sep).join('/')
const absoluteIgnore = (suffix) => toPosix(path.join(imageTargetsPath, '**', suffix))

const makeTsLoader = () => ({
  test: /\.ts$/,
  loader: 'ts-loader',
  exclude: /node_modules/,
})

const makeAssetLoader = () => ({
  test: /\.(png|jpg|jpeg|gif|svg|webp|mp4|webm|mp3|wav|ogg)$/i,
  include: [path.join(srcPath, 'assets')],
  type: 'asset/resource',
})

const config = {
  entry: './entry.js',
  output: {
    filename: 'bundle.js',
    path: distPath,
    publicPath: '/',
    clean: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(srcPath, 'index.html'),
      filename: 'index.html',
      scriptLoading: 'blocking',
      inject: false,
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.join(rootPath, 'node_modules/@8thwall/ecs/dist'),
          to: path.join(distPath, 'external/runtime'),
        },
        {
          from: path.join(srcPath, 'assets'),
          to: path.join(distPath, 'assets'),
          noErrorOnMissing: true,
        },
        {
          from: imageTargetsPath,
          to: path.join(distPath, 'image-targets'),
          noErrorOnMissing: true,
          globOptions: {
            ignore: [
              absoluteIgnore('*_original.png'),
              absoluteIgnore('*_cropped.png'),
              absoluteIgnore('*_thumbnail.png'),
              absoluteIgnore('*_geometry.png'),
            ],
          },
        },
      ],
    }),
    createVirtualEntryPlugin({
      srcDir: srcPath,
    }),
  ],
  resolve: {extensions: ['.ts', '.js']},
  module: {
    rules: [
      makeTsLoader(),
      makeAssetLoader(),
    ],
  },
  mode: 'production',
  context: srcPath,
  externals: {
    '@8thwall/ecs': 'window.ecs',
  },
  devServer: {
    open: false,
    compress: true,
    hot: true,
    liveReload: false,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization',
    },
    client: {
      webSocketURL: 'ws://0.0.0.0/ws',
      overlay: {
        warnings: false,
        errors: true,
      },
    },
  },
}

module.exports = (_, argv) => {
  if (argv.mode === 'development') {
    return {
      ...config,
      plugins: [
        ...config.plugins,
        createDev8Plugin({src: './external/dev8/dev8.js'}),
        new CopyWebpackPlugin({
          patterns: [{
            from: path.join(rootPath, 'node_modules/@8thwall/ecs/dev8'),
            to: path.join(distPath, 'external/dev8'),
            noErrorOnMissing: true,
          }],
        }),
      ],
    }
  }

  return config
}
