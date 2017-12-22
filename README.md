## webpack-wxapp-module-plugin
[![NPM version][webpack-wxapp-module-plugin]][npm-url]

### 一、简介

微信小程序webapck插件

###### 支持哪些特性?

- 仅需要配置`entry` 指向`app.js`即可 例如 `entry:'./app.js'`
- 支持`node_modules` 模块引用
- 打包后的`require`会自动设置 例如: require('lodash') 那么当打包后在dist下的引用变为 require('./node_modules/lodash/inde.jx)
- 自动分析需要编译的文件，产出wxapp需要的目录结构 例如pages以及components,.wxml引用的图片，以及app.json引用的图片等
- 产出的目标文件均为commonjs模块类型，无webpack_require自带的模块规范与引用，方便调试识别
- 可以搭配`loaders`与其他`plugin`使支持`es6-es7`以及文件图片压缩
- 开发模式下node_modules平行移植，不会合并，而是保持原始目录结构
- 生产模式打包(NODE_ENV=production)下，node_modules下的模块会合并成单个文件
- 只需要将微信小程序指向`dist`(webpack设定的output目录)目录即可

### 二、安装

    npm install webpack-wxapp-module-plugin --save-dev
    
### 三、使用

Webpack 简单配置

```js
var WxappModulePlugin  =require('webpack-wxapp-module-plugin');

var appjsRoot = path.resolve('');

module.exports = {
  entry: {
    'app': ['./app.js']
  },
  output: {
    filename:  '[name].js',
    libraryTarget: 'commonjs2'
  },
  plugins:[
    new WxappModulePlugin(appjsRoot)
  ]
}
```

### 四、完整脚手架配置案例

```js
module.exports = {
  //devtool: 'source-map',
  name: 'arthur-pendragon',
  context: config.src,
  stats: 'normal',
  target: "node",
  entry: {
    'app': './app.js'
  },
  output: {
    path: config.dist,
    filename: '[name]',
    chunkFilename: '[name]',
    libraryTarget: "commonjs2",
    publicPath: ''
  },
  plugins: [
    new ProgressBarPlugin(),
    new WxappModulePlugin(config.src),
    new CleanWebpackPlugin('**/*.*', { root: config.dist }),
    new webpack.DefinePlugin({ 'process.env': { NODE_ENV: process.env.NODE_ENV } }),
    new webpack.NoEmitOnErrorsPlugin(),
  ],
  module: {
    loaders: [
      {
        //使用babel-loader编译js
        test: /\.js$/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: config.babelRc.presets,
              plugins: config.babelRc.plugins
            },
          }
        ],
      },
      //使用file-loader处理资源文件复制
      {
        test: /\.(json|wxss)$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[path][name].[ext]',
            },
          },
        ],
      },
      {
        // 图片类型模块资源访问
        test: /\.(png|jpg|jpeg|gif|webp|bmp|ico|jpeg)$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[path][name].[ext]'
            }
          },
          {
            loader: 'image-webpack-loader',
            options: config.minOptions,
          },
        ],
      },
      //使用wxml-loader处理.wxml文件，主要用于搜索引用的图片等资源
      {
        test: /\.wxml$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[path][name].wxml',
            },
          },
          {
            loader: 'wxml-loader',
            options: {
              root: config.src,
            },
          },
        ],
      }
    ]
  }
}

```

### 五、开源许可
基于 [MIT License](http://zh.wikipedia.org/wiki/MIT_License) 开源，使用代码只需说明来源，或者引用 [license.txt](https://github.com/sofish/typo.css/blob/master/license.txt) 即可。

[npm-url]: https://www.npmjs.com/package/webpack-wxapp-module-plugin
[npm-image]: https://img.shields.io/npm/v/webpack-wxapp-module-plugin.svg