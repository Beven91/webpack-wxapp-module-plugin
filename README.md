## webpack-wxapp-module-plugin

[![NPM version][npm-image]][npm-url]

### 一、简介

微信小程序webapck插件

###### 支持哪些特性?

- 仅需要配置`entry` 指向`app.js`即可 例如 `entry:'./app.js'`
- 支持`node_modules` 模块引用
- `node_modules`平行移植 打包后的`require`会自动修改引用路径 例如: require('lodash') 那么当打包后在dist下的引用变为 require('./node_modules/lodash/inde.jx)
- 自动分析需要编译的文件，产出wxapp需要的目录结构 例如pages以及components,.wxml引用的图片，以及app.json引用的图片以及页面与分包加载页面等
- 产出的目标文件均为commonjs模块类型，无webpack_require自带的模块规范与引用，方便调试识别
- 可以搭配`loaders`与其他`plugin`使支持`es6-es7`以及文件图片压缩
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
    filename:  '[name]',
    chunkFilename:'[name]',
    libraryTarget: 'commonjs2'
  },
  plugins:[
    new WxappModulePlugin(appjsRoot,'指定node_modules模块打包后的存放目录名称，例如:vendor')
  ]
}
```

### 四、完整脚手架配置案例

- 支持`es6` 与 `es7` 等语法
- 支持图片压缩 (开发模式不进行压缩)
- 支持node_modules模块
- 支持热更新
- 支持自行扩展webpack的`loader` 例如使`.wxss`支持sass语法
- 支持wxml母版页
- 支持小程序[`分包加载`](https://mp.weixin.qq.com/debug/wxadoc/dev/framework/subpackages.html)

```js
//进度条插件
const ProgressBarPlugin = require('progress-bar-webpack-plugin')
//微信小程序插件
const WxappModulePlugin = require('webpack-wxapp-module-plugin/index');
//清除插件
var CleanWebpackPlugin = require('clean-webpack-plugin')

const isProduction = process.env.NODE_ENV === 'production';
const config = {
  src:path.resolve('app'),
  dist:path.resolve('dist')
}

module.exports = {
  devtool: isProduction ? '' : 'source-map',
  name: 'demo',
  context: config.src,
  stats: 'normal',
  target: "node",
  entry: {
    'app': [
      './app.js'
    ]
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
    new WxappModulePlugin(config.src, 'third_modules', ['.scss']),
    new CleanWebpackPlugin('*', { root: config.dist }),
    new webpack.DefinePlugin({ 'process.env': { NODE_ENV: process.env.NODE_ENV } }),
    new webpack.NoEmitOnErrorsPlugin(),
  ].concat(isProduction ? productionPlugins : devPlugins),
  module: {
    loaders: [
      {
        // 使用babel编译js
        test: /\.js$/,
        exclude: [
          /webpack/,
          /webpack-/,
          /babel/,
          /babel-/,
          /babel-runtime/,
          /core-js/
        ],
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: ["env"],
              plugins: [
                "transform-object-rest-spread",
                "transform-runtime" 
              ]
            }
          }
        ]
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
      //使用.scss 代替.wxss 编译后命名为.wxss
      {
        test: /\.scss$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[path][name].wxss',
            },
          },
          {
            loader: 'sass-loader',
            options: {
              includePaths: [
                path.join(config.src, 'styles')
              ],
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
          (
            !isProduction ?
              undefined
              :
              {
                loader: 'image-webpack-loader',
                options: {
                },
              }
          ),
        ].filter(function (loader) { return !!loader }),
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
              publicPath: '/',
              root: config.src,
            },
          },
          //母版页支持
          {
            loader: 'wxml-layout-loader',
            options: {
              app: path.resolve('app/app.json'),
              layout: path.resolve('app/app.wxml')
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
