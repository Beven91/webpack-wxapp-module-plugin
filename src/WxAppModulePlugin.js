/**
 * 名称：微信小程序webapck插件
 * 日期:2017-12-19
 * 描述：
 *     使微信程序支持webpack打包
 */

var path = require('path')
var fse = require('fs-extra');
var Entrypoint = require('webpack/lib/Entrypoint')
var NormalModule = require('webpack/lib/NormalModule.js')
var AMDPlugin = require('webpack/lib/dependencies/AMDPlugin.js')
var SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin');
var MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin');
var HarmonyDetectionParserPlugin = require("webpack/lib/dependencies/HarmonyDetectionParserPlugin")
var ConcatSource = require('webpack-sources').ConcatSource

var RESOUR_CHUNK_NAME = "@@RESOURCEENTRY@@";

//取消AMD模式
AMDPlugin.prototype.apply = function () {

}
HarmonyDetectionParserPlugin.prototype.apply = function(){
  
}

/**
 * 微信小程序模块打包插件
 * @param {String} projectRoot 微信小程序app.js所在的目录
 */
function WxAppModulePlugin(projectRoot) {
  this.extraChunks = {}
  this.extraPackage = {};
  this.typedExtensions = ['.wxml', '.wxss', '.json'];
  this.projectRoot = projectRoot;
  this.resourceModules = [];
  this.pageModules = [];
  this.Resolve = require('./dependencies/ModuleDependencyTemplateAsResolveName.js');
  this.Template = require('./dependencies/NodeRequireHeaderDependencyTemplate.js')
  this.initPageModules();
}

WxAppModulePlugin.prototype.apply = function (compiler) {
  var thisContext = this
  this.options = compiler.options;
  compiler.plugin('this-compilation', function (compilation) {
    // 自动根据app.js作为入口，分析哪些文件需要单独产出，以及node_modules使用了哪些模块
    thisContext.registerModuleEntry(compiler)
    //单文件模块与node_modules模块处理
    thisContext.registerChunks(compilation);
    // 自定义js打包模板渲染 取消webpackrequire机制，改成纯require
    thisContext.registerModuleTemplate(compilation)
    //注册 normal-module-loader
    thisContext.registerNormalModuleLoader(compilation);
  })
}

/**
 * 初始化小程序引用的页面以及组件与对应的资源文件例如:.json .wxss .wxml,tabBarIcons
 */
WxAppModulePlugin.prototype.initPageModules = function () {
  var resourceModules = [];
  var pageModules = [];
  var thisContext = this;
  var typedExtensions = this.typedExtensions
  var config = fse.readJsonSync(path.join(this.projectRoot, 'app.json'));
  var pages = ['app'].concat(config.pages || []);
  pages.forEach(function (page) {
    var modulePath = thisContext.getModuleFullPath(page);
    var parts = path.parse(modulePath);
    var namePath = path.join(parts.root, parts.dir, parts.name);
    //附加页面引用的所有组件
    thisContext.pushComponents(pages, modulePath, namePath);
    //搜索当前页面对应的资源文件
    resourceModules = resourceModules.concat(typedExtensions.map(function (ext) { return namePath + ext; }))
    if (page !== 'app') {
      pageModules.push(page + '.js');
    }
  })
  //导出app.json配置的图片
  this.pushTabBarIcons(config, resourceModules);
  //过滤掉不存在文件
  this.resourceModules = resourceModules.filter(fse.existsSync.bind(fse));
  this.pageModules = pageModules;
}

/**
 * 获取指定小程序页面引用的所有组件
 * @param {Array} pages 目前搜索到的页面组件
 * @param {modulePath} 页面完整路径
 * @param {namePath} 页面模块完整路径不带后缀名
 */
WxAppModulePlugin.prototype.pushComponents = function (pages, modulePath, namePath) {
  var components = this.requireJson(namePath + '.json').usingComponents || {};
  var moduleDir = path.dirname(modulePath);
  for (var name in components) {
    var componentPath = path.join(moduleDir, components[i]);
    var componentEntry = path.relative(projectRoot, componentPath).toLowerCase();
    if (pages.indexOf(componentEntry) < 0) {
      pages.push(componentEntry);
    }
  }
}

/**
 * 获取app.json配置的图标
 * @param {Object} config app.json内容
 * @param {Array} resourceModules 小程序非js资源 例如 .wxss .wxml .json jpg...
 */
WxAppModulePlugin.prototype.pushTabBarIcons = function (config, resourceModules) {
  var tabBar = config.tabBar || {};
  var tabBarList = tabBar.list || [];
  var projectRoot = this.projectRoot;
  tabBarList.forEach(function (tabBarItem) {
    if (tabBarItem.iconPath) {
      resourceModules.push(projectRoot, path.join(tabBarItem.iconPath))
    }
    if (tabBarItem.selectedIconPath) {
      resourceModules.push(projectRoot, path.join(tabBarItem.selectedIconPath))
    }
  })
}

/**
 * 添加微信小程序app.json配置的所有入口页面
 */
WxAppModulePlugin.prototype.registerModuleEntry = function (compiler) {
  var thisContext = this;
  this.pageModules.forEach(function (page) {
    //添加页面js
    thisContext.addSingleEntry(compiler, thisContext.getModuleFullPath(page), page);
  })
  //将wxss 以及json以及wxml等文件添加到一个entry中
  compiler.apply(new MultiEntryPlugin(this.projectRoot, this.resourceModules, RESOUR_CHUNK_NAME))
}

/**
 * 自定义webpack entry 
 * 目标：实现打包服务端代码，entry不再合并成一个文件，而是保留原始目录结构到目标目录
 */
WxAppModulePlugin.prototype.registerChunks = function (compilation) {
  var thisContext = this
  compilation.plugin('optimize-chunks', function (chunks) {
    this.chunks = [];
    this.entrypoints = {};
    this.namedChunks = {};
    var outputOptions = this.outputOptions
    var addChunk = this.addChunk.bind(this)
    chunks.filter(function (chunk) {
      return chunk.hasRuntime() && chunk.name
    }).map(function (chunk) {
      chunk.forEachModule(function (mod) {
        if (mod.userRequest) {
          thisContext.handleAddChunk(addChunk, mod, chunk, compilation)
        }
      })
    })
  })
}

/**
 * 处理文件输出
 */
WxAppModulePlugin.prototype.handleAddChunk = function (addChunk, mod, chunk, compilation) {
  var info = path.parse(path.relative(this.projectRoot, mod.userRequest))
  var name = path.join(info.root, info.dir, info.name).replace(/^\.\.\//, '')
  var nameWith = name + info.ext;
  var newChunk = this.extraChunks[nameWith]
  if (chunk.name === RESOUR_CHUNK_NAME) {
    return;
  }
  name = name + info.ext;
  if (!newChunk) {
    mod.variables = [];
    var entrypoint = new Entrypoint(name)
    newChunk = this.extraChunks[nameWith] = addChunk(name)
    entrypoint.chunks.push(newChunk)
    newChunk.entrypoints = [entrypoint]
  }
  newChunk.addModule(mod)
  mod.addChunk(newChunk)
  mod.removeChunk(chunk)
}

/**
 * 自定义webpack ModuleTemplate.render 
 * 改成打包目标文件保留原生nodejs风格
 */
WxAppModulePlugin.prototype.registerModuleTemplate = function (compilation) {
  var cdnName = this.cdnName;
  var outputOptions = compilation.outputOptions;
  var publicPath = outputOptions.publicPath;
  var replacement = this.replacement.bind(this);
  compilation.mainTemplate.plugin('render', function (bootstrapSource, chunk, hash, moduleTemplate, dependencyTemplates) {
    var source = new ConcatSource()
    chunk.forEachModule(function (module) {
      var ext = path.extname(module.userRequest)
      var assets = Object.keys(module.assets || {});
      var moduleSource = null
      switch (ext) {
        case '.json':
          moduleSource = module._source
          break
        default:
          moduleSource = module.source(dependencyTemplates, moduleTemplate.outputOptions, moduleTemplate.requestShortener)
          break
      }
      replacement(moduleSource);
      source.add(moduleSource)
    })
    return source
  })
}

/**
 * 注册normal module loader
 */
WxAppModulePlugin.prototype.registerNormalModuleLoader = function (compilation) {
  compilation.plugin("normal-module-loader", function (loaderContext, module) {
    var exec = loaderContext.exec.bind(loaderContext)
    loaderContext.exec = function (code, filename) {
      return exec(code, filename.split('!').pop());
    }
  });
}

/**
 * 替换 __webpack_require
 */
WxAppModulePlugin.prototype.replacement = function (moduleSource) {
  var replacements = moduleSource.replacements || [];
  replacements.forEach(function (rep) {
    var v = rep[2] || "";
    var isVar = v.indexOf("WEBPACK VAR INJECTION") > -1;
    v = isVar ? "" : v.replace(/__webpack_require__/g, 'require');
    if (v.indexOf("AMD") > -1) {
      v = "";
    }
    rep[2] = v;
  })
}

/**
 * 添加一个single entry
 * @param {Compiler} compiler webpack编译器
 * @param {*} entry 模块完整路径
 * @param {*} name  entry名称
 */
WxAppModulePlugin.prototype.addSingleEntry = function (compiler, entry, name) {
  var base = this.projectRoot;
  compiler.plugin('make', function (compilation, callback) {
    const dep = SingleEntryPlugin.createDependency(entry, name);
    compilation.addEntry(base, dep, name, callback);
  });
}

/**
 * 获取模块的完整路径
 */
WxAppModulePlugin.prototype.getModuleFullPath = function (entry) {
  return path.join(this.projectRoot, entry)
}

/**
 * 读取Json文件，如果文件不存在，则返回{}
 */
WxAppModulePlugin.prototype.requireJson = function (file) {
  return fse.existsSync(file) ? fse.readJSONSync(file) : {};
}


module.exports = WxAppModulePlugin;