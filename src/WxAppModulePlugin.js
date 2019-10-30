/**
 * 名称：微信小程序webapck插件
 * 日期:2017-12-19
 * 描述：
 *     使微信程序支持webpack打包
 */

const path = require('path')
const fse = require('fs-extra');
const webpack = require('webpack');
const Entrypoint = require('webpack/lib/Entrypoint')
const AMDPlugin = require('webpack/lib/dependencies/AMDPlugin.js')
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin');
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin');
const HarmonyDetectionParserPlugin = require("webpack/lib/dependencies/HarmonyDetectionParserPlugin")
const ConcatSource = require('webpack-sources').ConcatSource

const NameResolve = require('./dependencies/NameResolve');

//取消AMD模式
AMDPlugin.prototype.apply = function () {

}
HarmonyDetectionParserPlugin.prototype.apply = function () {

}

/**
 * 微信小程序模块打包插件
 * @param {String} nodeModulesName node_modules打包后的目录名
 * @param {Array} extensions 扩展名列表，用于插件查找那些后缀的页面资源需要打包
 *               例如默认会附加以下资源: page.wxml page.json page.wxss 
 *               如果需要附加其他页面资源 例如 page.scss 那么可以配置['.scss']
 * @parma {Object} 全局配置
 */
function WxAppModulePlugin(nodeModulesName, extensions, options) {
  options = options || {};
  this.extraChunks = {}
  this.extraPackage = {};
  this.typedExtensions = ['.wxml', '.wxss', '.json'].concat(extensions || []);
  this.resourceModules = [];
  this.resourceModulesMap = {};
  this.pageModules = [];
  this.jsonAssets = [];
  this.platform = options.platform || '';
  this.globalComponents = options.globalComponents || {};
  NameResolve.nodeModulesName = nodeModulesName || NameResolve.nodeModulesName || 'app_node_modules';
  this.nodeModulesName = NameResolve.nodeModulesName;
  this.registryPages = [];
  this.platformAlias = {};
  this.Resolve = require('./dependencies/ModuleDependencyTemplateAsResolveName.js');
  this.Template = require('./dependencies/NodeRequireHeaderDependencyTemplate.js')
}

WxAppModulePlugin.prototype.apply = function (compiler) {
  const thisContext = this
  this.options = compiler.options;
  this.projectRoot = this.options.context;
  this.Resolve.setOptions({ nodeModulesName: this.nodeModulesName, projectRoot: this.projectRoot });
  const definePlugin = new webpack.DefinePlugin({
    '__webpack_public_path__': JSON.stringify("/"),
  })
  definePlugin.apply(compiler);
  compiler.plugin('this-compilation', function (compilation) {
    try {
      thisContext.initPageModules();
      // 自动根据app.js作为入口，分析哪些文件需要单独产出，以及node_modules使用了哪些模块
      thisContext.registerModuleEntry(compiler)
      //处理页面相关.json
      thisContext.registerAssets(compiler);
      //单文件模块与node_modules模块处理
      thisContext.registerChunks(compilation);
      // 自定义js打包模板渲染 取消webpackrequire机制，改成纯require
      thisContext.registerModuleTemplate(compilation)
      //注册 normal-module-loader
      thisContext.registerNormalModuleLoader(compilation);
    } catch (ex) {
      console.error(ex.stack);
    }
  })
}

/**
 * 初始化小程序引用的页面以及组件与对应的资源文件例如:.json .wxss .wxml,tabBarIcons
 */
WxAppModulePlugin.prototype.initPageModules = function () {
  const config = this.getJson(path.join(this.projectRoot, 'app.json'));
  this.platformAlias = {};
  if (config) {
    let resourceModules = [];
    const pageModules = [];
    const thisContext = this;
    const typedExtensions = this.typedExtensions
    const pages = ['app'].concat(this.searchSubPackages(config, config.pages));
    pages.forEach(function (page) {
      const modulePath = thisContext.getModuleFullPath(page);
      const parts = path.parse(modulePath);
      const namePath = path.join(parts.dir, parts.name);
      //附加页面引用的所有组件
      thisContext.pushComponents(pages, modulePath, namePath, true);
      thisContext.registryPages.push(page);
    })
    pages.forEach(function (page) {
      const modulePath = thisContext.getModuleFullPath(page);
      const parts = path.parse(modulePath);
      const namePath = path.join(parts.dir, parts.name);
      //搜索当前页面对应的资源文件
      resourceModules = resourceModules.concat(typedExtensions.map(function (ext) {
        return thisContext.resolvePlatform(namePath, ext);
      }))
      if (page !== 'app') {
        pageModules.push(thisContext.resolvePlatform(page, '.js', thisContext.projectRoot));
      }
    })
    //导出app.json配置的图片
    this.pushTabBarIcons(config, resourceModules);
    //过滤掉不存在文件
    this.resourceModules = resourceModules.filter(fse.existsSync.bind(fse));
    this.jsonAssets = resourceModules.filter((file) => path.extname(file) === '.json');
    //this.resourceModules = resourceModules.filter((file) => path.extname(file) !== '.json');
    this.pageModules = pageModules;
  }
}

/**
 * 消除平台后缀
 */
WxAppModulePlugin.prototype.cleanPlatformAlias = function (mod, chunk) {
  const name = this.platformAlias[mod.resource];
  if (name) {
    return name;
  } else {
    return mod.userRequest;
  }
}

/**
 * 平台文件渲染
 */
WxAppModulePlugin.prototype.resolvePlatform = function (namePath, ext, root) {
  const platformPath = namePath + '.' + this.platform + ext;
  const platformFile = root ? path.join(root, platformPath) : platformPath;
  const applyPlatform = this.platform && fse.existsSync(platformFile);
  if (applyPlatform) {
    if (path.isAbsolute(namePath)) {
      namePath = namePath.split(this.projectRoot).slice(1).join('').replace(/\\/g, '/').replace(/^\//, '');
    }
    const platAlias = namePath + '.' + this.platform + ext;
    this.platformAlias[platAlias] = namePath + ext;
    return platformPath;
  }
  return namePath + ext;
}

/**
 * 安全方式读取json
 */
WxAppModulePlugin.prototype.getJson = function (file) {
  try {
    return fse.readJsonSync(file);
  } catch (ex) {
    return null;
  }
}

/**
 * 搜索subPackages
 * @param {Object} config app.json配置
 * @param {Array<String>} pages 已经搜索到的pages
 */
WxAppModulePlugin.prototype.searchSubPackages = function (config, pages) {
  pages = pages || [];
  const subPackages = config.subPackages || [];
  subPackages.forEach(function (package) {
    const subPages = package.pages || [];
    const root = package.root;
    subPages.forEach(function (page) {
      pages.push(root + page);
    })
  })
  return pages;
}


/**
 * 获取指定小程序页面引用的所有组件
 * @param {Array} pages 目前搜索到的页面组件
 * @param {modulePath} 页面完整路径
 * @param {namePath} 页面模块完整路径不带后缀名
 */
WxAppModulePlugin.prototype.pushComponents = function (pages, modulePath, namePath, isPage) {
  let components = this.requireJson(namePath + '.json').usingComponents || {};
  const moduleDir = path.dirname(modulePath);
  if (isPage) {
    // 如果当前为页面，则进行全局组件附加
    components = this.applyGlobalComponents(components);
  }
  for (const name in components) {
    const usingPath = NameResolve.usingComponentNormalize((components[name] || ''));
    if (!/plugin:/.test(usingPath)) {
      const isNodeModules = usingPath.indexOf('node_modules/') === 0;
      let componentEntry = null;
      if (!isNodeModules) {
        const componentPath = path.join(moduleDir, usingPath);
        componentEntry = path.relative(this.projectRoot, componentPath);
      } else {
        componentEntry = this.resolveModule(modulePath, usingPath).replace('.js', '');
      }
      if (pages.indexOf(componentEntry) < 0) {
        pages.push(componentEntry);
        const full = this.getModuleFullPath(componentEntry);
        const parts = path.parse(full);
        const namePath = path.join(parts.dir, parts.name);
        this.pushComponents(pages, full, namePath)
      }
    }
  }
}

/**
 * 判断当前模块是否能获取到
 */
WxAppModulePlugin.prototype.resolveModule = function (context, usingPath) {
  const segments = context.split(path.sep);
  const paths = [];
  while (segments.length > 0) {
    const m = path.join(segments.join(path.sep), 'node_modules');
    paths.push(m);
    segments.pop();
  }
  const request = usingPath.replace('node_modules/', '');
  module.paths.unshift.apply(module.paths, paths);
  const full = require.resolve(request);
  module.paths.splice(0, paths.length);
  return full;
}

/**
 * 获取app.json配置的图标
 * @param {Object} config app.json内容
 * @param {Array} resourceModules 小程序非js资源 例如 .wxss .wxml .json jpg...
 */
WxAppModulePlugin.prototype.pushTabBarIcons = function (config, resourceModules) {
  const tabBar = config.tabBar || {};
  const tabBarList = tabBar.list || [];
  const projectRoot = this.projectRoot;
  tabBarList.forEach(function (tabBarItem) {
    if (tabBarItem.iconPath) {
      resourceModules.push(path.join(projectRoot, tabBarItem.iconPath))
    }
    if (tabBarItem.selectedIconPath) {
      resourceModules.push(path.join(projectRoot, tabBarItem.selectedIconPath))
    }
  })
}

/**
 * 添加微信小程序app.json配置的所有入口页面
 */
WxAppModulePlugin.prototype.registerModuleEntry = function (compiler) {
  this.pageModules.forEach((page) => {
    //添加页面js
    this.addSingleEntry(compiler, this.getModuleFullPath(page), page);
  })
  //将wxss 以及json以及wxml等文件添加到entry中
  this.resourceModulesMap = {};
  this.resourceModules.forEach((f) => {
    this.resourceModulesMap[f] = true;
    this.addSingleEntry(compiler, this.getModuleFullPath(f), f);
  })
}


/**
 * 自定义webpack entry 
 * 目标：实现打包服务端代码，entry不再合并成一个文件，而是保留原始目录结构到目标目录
 */
WxAppModulePlugin.prototype.registerChunks = function (compilation) {
  const thisContext = this
  compilation.plugin('optimize-chunks', function (chunks) {
    thisContext.extraChunks = {};
    compilation.chunks = [];
    compilation.entrypoints.clear();
    compilation.namedChunks.clear();
    //compilation.namedChunks = {};
    const addChunk = compilation.addChunk.bind(compilation)
    chunks.filter(function (chunk) {
      return chunk.hasRuntime() && chunk.name
    }).map(function (chunk) {
      chunk.modulesIterable.forEach(function (mod) {
        if (mod.userRequest) {
          thisContext.handleAddChunk(addChunk, mod, chunk, compilation)
        }
      })
    })
  })
}

/**
 * 处理json文件复制
 */
WxAppModulePlugin.prototype.registerAssets = function (compiler) {
  const thisContext = this;
  compiler.plugin('emit', function (compilation, cb) {
    try {
      thisContext.jsonAssets.forEach(function (file) {
        let name = NameResolve.getProjectRelative(thisContext.projectRoot, file);
        const data = fse.readJsonSync(file);
        let usingComponents = data.usingComponents || {};
        const isPage = thisContext.registryPages.indexOf(name.replace('.json', '')) > -1;
        if (isPage && name !== 'app.json') {
          usingComponents = thisContext.applyGlobalComponents(usingComponents);
        }
        data.usingComponents = usingComponents;
        if (usingComponents) {
          const usingKeys = Object.keys(usingComponents);
          const contextPath = path.dirname(file);
          usingKeys.forEach(function (using) {
            const componentPath = usingComponents[using];
            if (/plugin:/.test(componentPath)) {
              return;
            }
            if (NameResolve.isNodeModuleUsing(componentPath)) {
              const fullUsingPath = thisContext.resolveModule(contextPath, componentPath);
              const relativePath = NameResolve.getTargetRelative(thisContext.projectRoot, contextPath, fullUsingPath);
              usingComponents[using] = NameResolve.getChunkName(relativePath.replace('.js', ''), thisContext.nodeModulesName)
            }
          })
        }
        const content = JSON.stringify(data, null, 4);
        const size = content.length;
        name = NameResolve.getChunkName(name, thisContext.nodeModulesName)
        compilation.assets[name] = {
          size: function () {
            return size;
          },
          source: function () {
            return content;
          }
        };
      })
    } catch (ex) {
      // 出错时，清空输出
      compilation.assets = {};
      console.error(ex)
    }
    thisContext.renderAssets(compilation);
    cb();
  });
}

/**
 * 处理assets 
 */
WxAppModulePlugin.prototype.renderAssets = function (compilation) {
  const allAssets = compilation.assets;
  const keys = Object.keys(allAssets);
  const nodeModulesName = this.nodeModulesName;
  keys.forEach((name) => {
    const asset = allAssets[name];
    if (name.indexOf('node_modules') > -1) {
      delete allAssets[name];
      name = NameResolve.getChunkName(name, nodeModulesName);
      name = nodeModulesName + name.split(nodeModulesName).slice(1);
      allAssets[name] = asset;
    } else if (name.indexOf('_/') > -1) {
      delete allAssets[name];
      name = name.replace(/_\//g, '');
      allAssets[name] = asset;
    }
    const alias = this.platformAlias[name];
    if (alias) {
      delete allAssets[name];
      allAssets[alias] = asset;
    }
  })
}

/**
 * 处理文件输出
 */
WxAppModulePlugin.prototype.handleAddChunk = function (addChunk, mod, chunk, compilation) {
  const info = path.parse(NameResolve.getProjectRelative(this.projectRoot, mod.userRequest));
  let name = path.join(info.dir, info.name);
  const nameWith = name + info.ext;
  let newChunk = this.extraChunks[nameWith]
  if (this.resourceModulesMap[chunk.name]) {
    return;
  }
  if (nameWith.indexOf("node_modules") > -1) {
    name = NameResolve.getChunkName(name, this.nodeModulesName)
  }
  name = name + (info.ext === '.js' ? '.js' : info.ext + '.js')
  if (!newChunk) {
    mod.variables = [];
    const entrypoint = new Entrypoint(name)
    newChunk = this.extraChunks[nameWith] = addChunk(name)
    entrypoint.chunks.push(newChunk)
    newChunk.addGroup(entrypoint);
  }
  if (newChunk) {
    newChunk.addModule(mod)
    mod.addChunk(newChunk)
  }
  if (newChunk !== chunk) {
    mod.removeChunk(chunk)
  }
}

/**
 * 自定义webpack ModuleTemplate.render 
 * 改成打包目标文件保留原生nodejs风格
 */
WxAppModulePlugin.prototype.registerModuleTemplate = function (compilation) {
  const replacement = this.replacement.bind(this);
  compilation.mainTemplate.plugin('render', function (bootstrapSource, chunk, hash, moduleTemplate, dependencyTemplates) {
    const source = new ConcatSource()
    chunk.modulesIterable.forEach(function (module) {
      const ext = path.extname(module.userRequest)
      let moduleSource = null
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
    const exec = loaderContext.exec.bind(loaderContext)
    loaderContext.exec = function (code, filename) {
      return exec(code, filename.split('!').pop());
    }
  });
}

/**
 * 替换 __webpack_require
 */
WxAppModulePlugin.prototype.replacement = function (moduleSource) {
  const replacements = moduleSource.replacements || [];
  replacements.forEach(function (rep) {
    let v = rep[2] || "";
    const isVar = v.indexOf("WEBPACK VAR INJECTION") > -1;
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
  const base = this.projectRoot;
  compiler.plugin('make', function (compilation, callback) {
    const dep = SingleEntryPlugin.createDependency(entry, name);
    compilation.addEntry(base, dep, name, callback);
  });
}

/**
 * 获取模块的完整路径
 */
WxAppModulePlugin.prototype.getModuleFullPath = function (entry) {
  return path.isAbsolute(entry) ? entry : path.join(this.projectRoot, entry)
}

/**
 * 读取Json文件，如果文件不存在，则返回{}
 */
WxAppModulePlugin.prototype.requireJson = function (file) {
  return fse.existsSync(file) ? fse.readJSONSync(file) : {};
}

/**
 * 附加globalComponents
 */
WxAppModulePlugin.prototype.applyGlobalComponents = function (usingComponents) {
  usingComponents = usingComponents || {};
  const globalComponents = this.globalComponents || {};
  Object.keys(globalComponents).forEach(function (key) {
    if (!usingComponents[key]) {
      usingComponents[key] = globalComponents[key];
    }
  });
  return usingComponents;
}

module.exports = WxAppModulePlugin;
