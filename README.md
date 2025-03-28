## webpack-wxapp-module-plugin

[![NPM version][npm-image]][npm-url]

### 一、简介

微信小程序webapck插件

###### 支持哪些特性?

- 仅需要配置`entry` 指向`app.js`即可 例如 `entry:'./app.js'`
- 支持`node_modules` 模块引用
- 支持`node_modules` 组件引用
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
  context:appjsRoot,
  entry: {
    'app': ['./app.js']
  },
  output: {
    filename:  '[name]',
    chunkFilename:'[name]',
    libraryTarget: 'commonjs2'
  },
  plugins:[
    new WxappModulePlugin({
      // 构建后node_modules下模块存放目录名
      nodeModulesName: 'npm_modules',
      // 当前运行模式： plugin / miniprogram 默认为 miniprogram
      // mode: 'plugin',
      // 插件模式下，插件代码根目录
      // pluginRoot: path.resolve('packages/mp-stjk-plugin'),
      // 全局组件
      globalComponents:{
        // 'layout-master':'my/index'
      }
      // 支持额外的资源扩展名，例如支持index.scss
      resolveExtensions: [
        '.scss',
        // 或者 (id)=>  id + '.scss'
      ],
      
    }),
  ],
  module:{
    rules:[
      // wxs
      {
        test: /\.wxs$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[path][name].wxml',
              esModule: false,
            },
          },
          'webpack-wxapp-module-plugin/wxs-loader',
        ],
      },
      // wxml
       {
        test: /\.wxml$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              name: '[path][name].wxml',
              esModule: false,
            },
          },
          'webpack-wxapp-module-plugin/wxml-loader',
          {
            // 母版页支持， 即：可以定义一个app.wxml 或者定义一个组件包裹在所有页面组件
            loader: 'webpack-wxapp-module-plugin/layout-loader',
            options:{
              // 组件模式支持，
              // component:'master-layout'
            }
          },
        ],
      },
    ]
  }
}
```

### 四、关于组件引用

在部分情况下，我们需要引用小程序`UI`组件库，那么通常依赖是安装在`node_modules`下，
`webpack-wxapp-module-plugin` 提供了`node_modules`下组件引用，例如:

```json
{
  "usingComponents":{
    "i-button":"iview-weapp/dist/button"
  }
}
```

### 五、推荐用例

[`freedom`](https://github.com/Beven91/freedom)

### 六、开源许可

基于 [MIT License](http://zh.wikipedia.org/wiki/MIT_License) 开源，使用代码只需说明来源，或者引用 [license.txt](https://github.com/sofish/typo.css/blob/master/license.txt) 即可。

[npm-url]: https://www.npmjs.com/package/webpack-wxapp-module-plugin
[npm-image]: https://img.shields.io/npm/v/webpack-wxapp-module-plugin.svg
