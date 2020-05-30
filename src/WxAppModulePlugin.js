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
const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin');
const HarmonyDetectionParserPlugin = require("webpack/lib/dependencies/HarmonyDetectionParserPlugin")
const ConcatSource = require('webpack-sources').ConcatSource

const NameResolve = require('./dependencies/NameResolve');

const subPackRegexp = /subPack:/;

//取消AMD模式
AMDPlugin.prototype.apply = function () {

}

HarmonyDetectionParserPlugin.prototype.apply = function () {

}


class WxAppModulePlugin {
  /**
   * 微信小程序模块打包插件
   * @param {String} nodeModulesName node_modules打包后的目录名
   * @param {Array} extensions 扩展名列表，用于插件查找那些后缀的页面资源需要打包
   *               例如默认会附加以下资源: page.wxml page.json page.wxss 
   *               如果需要附加其他页面资源 例如 page.scss 那么可以配置['.scss']
   * @parma {Object} 全局配置
   */
  constructor(nodeModulesName, extensions, options) {
    options = options || [];
    this.extraChunks = {}
    this.extraPackage = {};
    this.packages = [];
    this.registryPages = [];
    this.resourceModulesMap = {};
    this.mainReferences = {};
    this.pageOrComponents = {};
    this.globalComponents = options.globalComponents || {};
    this.nodeModulesName = nodeModulesName || NameResolve.nodeModulesName || 'app_node_modules';
    this.typedExtensions = ['.wxml', '.wxss', '.json'].concat(extensions || []);
    this.Resolve = require('./dependencies/ModuleDependencyTemplateAsResolveName.js');
    this.Template = require('./dependencies/NodeRequireHeaderDependencyTemplate.js');
    NameResolve.nodeModulesName = this.nodeModulesName;
  }

  apply(compiler) {
    this.options = compiler.options;
    this.projectRoot = this.options.context;
    this.Resolve.setOptions({ nodeModulesName: this.nodeModulesName, projectRoot: this.projectRoot });
    const definePlugin = new webpack.DefinePlugin({
      '__webpack_public_path__': JSON.stringify("/"),
    })
    definePlugin.apply(compiler);
    compiler.hooks.thisCompilation.tap('WxAppModulePlugin', (compilation) => {
      try {
        this.initPackages();
        // 自动根据app.js作为入口，分析哪些文件需要单独产出，以及node_modules使用了哪些模块
        this.registerModuleEntry(compiler)
        //处理页面相关.json
        this.registerAssets(compilation);
        //单文件模块与node_modules模块处理
        this.registerChunks(compilation);
        // 自定义js打包模板渲染 取消webpackrequire机制，改成纯require
        this.registerModuleTemplate(compilation)
        //注册 normal-module-loader
        this.registerNormalModuleLoader(compilation);
      } catch (ex) {
        console.error(ex.stack);
      }
    });
  }

  /**
   * 初始化小程序引用的页面以及组件与对应的资源文件例如:.json .wxss .wxml,tabBarIcons
   * 最终组织成分包形式资源
   */
  initPackages() {
    const config = this.getJson(path.join(this.projectRoot, 'app.json'));
    if (config) {
      this.jsonAssets = [];
      // 主包
      const main = this.createPackage('', ['app'].concat(config.pages), 'main');
      // 当前小程序所有包
      const packages = [
        main,
      ];
      // 分包资源处理
      const subPackages = config.subPackages || [];
      subPackages.forEach((pack) => {
        const subPages = pack.pages || [];
        const root = pack.root;
        packages.push(this.createPackage(root, subPages, 'subPack:' + root, true));
      });
      // 将tab等图标添加到主包资源中去
      this.pushTabBarIcons(config, main.resources);
      // 将包信息添加到this上
      this.packages = packages;
    }
  }

  /**
   * 创建小程序包的资源
   * @param {String} root 包的基础路径
   * @param {Array} pages  包下的所有页面
   */
  createPackage(root, pages, packName, subpack) {
    const pack = {
      name: packName,
      root: root,
      absolute: path.join(this.projectRoot, root),
      pages: [],
      subpack: subpack,
      resources: [],
    }
    const currentPages = (pages || []).map((page) => root + page);
    currentPages.forEach((page) => {
      const modulePath = this.getModuleFullPath(page);
      const parts = path.parse(modulePath);
      const namePath = path.join(parts.dir, parts.name);
      //附加页面引用的所有组件
      this.pushComponents(currentPages, modulePath, namePath, true);
      // 标记页面
      this.registryPages.push(page);
    });
    currentPages.forEach((page) => {
      const modulePath = this.getModuleFullPath(page);
      const parts = path.parse(modulePath);
      const namePath = path.join(parts.dir, parts.name);
      //搜索当前页面对应的资源文件 例如: .wxml .wxss .json
      pack.resources = pack.resources.concat(this.typedExtensions.map((ext) => namePath + ext));
      if (page !== 'app') {
        pack.pages.push(page + '.js');
      }
    });
    // 过滤掉不存在的文件
    pack.resources = pack.resources.filter(fse.existsSync.bind(fse));
    // 获取绝对路径
    return pack;
  }

  /**
   * 安全方式读取json
   */
  getJson(file) {
    try {
      return fse.readJsonSync(file);
    } catch (ex) {
      return null;
    }
  }

  /**
   * 获取指定小程序页面引用的所有组件
   * @param {Array} pages 目前搜索到的页面组件
   * @param {modulePath} 页面完整路径
   * @param {namePath} 页面模块完整路径不带后缀名
   */
  pushComponents(pages, modulePath, namePath, isPage) {
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
  resolveModule(context, usingPath) {
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
  pushTabBarIcons(config, resourceModules) {
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
  registerModuleEntry(compiler) {
    const packages = this.packages;
    // 遍历所有包
    packages.forEach((pack) => {
      const pages = pack.pages.map((f) => this.getModuleFullPath(f));
      const resources = pack.resources.map((f) => this.getModuleFullPath(f));
      const files = pages.concat(resources);
      // 将js,.wxss,wxml等资源添加到打包依赖中
      (new MultiEntryPlugin(this.projectRoot, files, pack.name)).apply(compiler);
      // 添加资源文件清单
      resources.forEach((f) => {
        this.resourceModulesMap[f] = true;
        const regexp = /\.json$/i;
        if (regexp.test(f)) {
          this.pageOrComponents[f.replace(regexp, '.js')] = true;
        }
      });
    })
  }

  /**
   * 自定义webpack entry 
   * 目标：实现打包服务端代码，entry不再合并成一个文件，而是保留原始目录结构到目标目录
   */
  registerChunks(compilation) {
    compilation.hooks.optimizeChunks.tap('WxAppModulePlugin', (chunks) => {
      this.extraChunks = {};
      compilation.chunks = [];
      compilation.entrypoints.clear();
      compilation.namedChunks.clear();
      const packages = this.packages;
      const addChunk = compilation.addChunk.bind(compilation)
      this.mainReferences = {};
      // 收集出非子包的模块依赖信息
      chunks
        .filter((chunk) => chunk.hasRuntime() && chunk.name)
        .forEach((chunk) => {
          if (!subPackRegexp.test(chunk.name)) {
            chunk.modulesIterable.forEach((mod) => this.mainReferences[mod.resource] = true)
          }
        });
      // 开始资源拆包
      chunks
        .filter((chunk) => chunk.hasRuntime() && chunk.name)
        .map((chunk) => {
          const pack = packages.filter((m) => m.name == chunk.name).pop() || {};
          chunk.modulesIterable.forEach((mod) => {
            if (mod.userRequest) {
              this.handleAddChunk(addChunk, mod, chunk, pack, this.mainReferences)
            }
          })
        })
    })
  }

  /**
   * 处理json文件复制
   */
  registerAssets(compilation) {
    // 处理模块输出
    compilation.hooks.beforeModuleAssets.tap('WxAppModulePlugin', () => {
      const mainReferences = this.mainReferences;
      compilation.modules.forEach((mod) => {
        const assets = mod.buildInfo.assets || {};
        // 根据依赖树查找mpPack
        mod.mpPack = this.searchMpPack(mod);
        // 将当前模块的所有输出，根据包来决定是独立输出到子包目录下，还是主目录下
        this.renderAssets(mod, Object.keys(assets), assets, mainReferences);
      });
    });
    // 处理块输出
    compilation.hooks.additionalChunkAssets.tap('WxAppModulePlugin', (chunks) => {
      const mainReferences = this.mainReferences;
      chunks.forEach((chunk) => {
        let mod = null;
        const assets = compilation.assets || {};
        // 获取当前块的一个模块
        chunk.modulesIterable.forEach((m) => mod = m);
        if (mod) {
          mod.mpPack = chunk.mpPack;
          // 根据依赖树查找mpPack
          mod.mpPack = this.searchMpPack(mod);
          // 将当前块的所有文件输出，根据包来决定是独立输出到子包目录下，还是主目录下
          chunk.files = this.renderAssets(mod, chunk.files, assets, mainReferences);
        }
        // 处理页面与组件json输出
        this.renderJsonAssets(compilation);
      });
    });

  }

  /**
   * 处理小程序组件与页面的json配置
   */
  renderJsonAssets(compilation) {
    const packages = this.packages;
    const mainReferences = this.mainReferences;
    const regexp = /\.json$/;
    packages.forEach((pack) => {
      const jsonAssets = pack.resources.filter((f) => regexp.test(f));
      jsonAssets.forEach((file) => {
        const js = file.replace(regexp, '.js');
        const name = this.pageOrComponents[js].replace(/\.js$/, '.json');
        const data = fse.readJsonSync(file);
        let usingComponents = data.usingComponents || {};
        const isPage = this.registryPages.indexOf(name.replace('.json', '')) > -1;
        if (isPage && name !== 'app.json') {
          usingComponents = this.applyGlobalComponents(usingComponents);
        }
        data.usingComponents = usingComponents;
        if (usingComponents) {
          const usingKeys = Object.keys(usingComponents);
          const contextPath = path.dirname(file);
          usingKeys.forEach((using) => {
            const componentPath = usingComponents[using];
            if (/plugin:/.test(componentPath)) {
              return;
            }
            if (NameResolve.isNodeModuleUsing(componentPath)) {
              const mod = {
                resource: this.resolveModule(contextPath, componentPath),
                mpPack: pack
              }
              const newKey = this.renderAssets(mod, [mod.resource], {}, mainReferences)[0];
              const fullUsingPath = newKey === mod.resource ? mod.resource : path.join(this.projectRoot, newKey);
              const relativePath = NameResolve.getTargetRelative(this.projectRoot, contextPath, fullUsingPath);
              usingComponents[using] = NameResolve.getChunkName(relativePath.replace('.js', ''), this.nodeModulesName)
            }
          })
        }
        const content = JSON.stringify(data, null, 4);
        const size = content.length;
        compilation.assets[name] = {
          size: () => size,
          source: () => content,
        };
      })
    });
  }

  /**
   * 处理assets 
   */
  renderAssets(mod, assetKeys, assets, mainReferences) {
    const pack = mod.mpPack;
    const resource = mod.resource
    const moveable = pack && pack.subpack && !mainReferences[resource];
    const nodeModulesName = this.nodeModulesName;
    return assetKeys.map((key) => {
      const relative = moveable ? path.relative(pack.absolute, resource).replace(/\\/g, '/') : '';
      // 如果是子包独立引用
      if (moveable && relative.indexOf('../') > -1) {
        const basename = path.basename(key);
        const rPath = relative.replace(/\.\.\//g, '').replace(/^node_modules\//, '');
        const request = path.dirname(rPath) + '/' + basename;
        const target = (pack.root + '/' + nodeModulesName + '/' + request).replace(/\/\//, '/');
        const name = NameResolve.getChunkName(target, this.nodeModulesName);
        assets[name] = assets[key];
        delete assets[key];
        return name;
      } else if (key.indexOf('node_modules') > -1) {
        let name = NameResolve.getChunkName(key, nodeModulesName);
        name = nodeModulesName + name.split(nodeModulesName).slice(1);
        assets[name] = assets[key];
        delete assets[key];
        return name;
      } else if (key.indexOf('_/') > -1) {
        const name = key.replace(/_\//g, '');
        assets[name] = assets[key];
        delete assets[key];
        return name;
      } else {
        return key;
      }
    });
  }

  /**
   * 搜寻mpPack
   * @param {*} mod 
   */
  searchMpPack(mod) {
    if (!mod) {
      return null;
    }
    if (mod.mpPack) {
      return mod.mpPack;
    }
    const reasons = mod.reasons || [];
    for (let i = 0, k = reasons.length; i < k; i++) {
      const reason = reasons[i];
      const reasonModule = reason.module;
      if (reasonModule && reasonModule.mpPack) {
        return reasonModule.mpPack;
      }
      const r = this.searchMpPack(reasonModule);
      if (r) {
        return r;
      }
    }
  }

  /**
   * 处理文件输出
   */
  handleAddChunk(addChunk, mod, chunk, pack, mainReferences) {
    const info = path.parse(NameResolve.getProjectRelative(this.projectRoot, mod.userRequest));
    let name = path.join(info.dir, info.name);
    const nameWith = name + info.ext;
    let newChunk = this.extraChunks[nameWith]
    if (this.resourceModulesMap[mod.resource]) {
      mod.mpPack = pack;
      chunk.mpPack = pack;
      return;
    }
    if (nameWith.indexOf("node_modules") > -1) {
      // 当前模块资源是否可以移动带子包中
      const moveable = pack.subpack && !mainReferences[mod.resource];
      name = NameResolve.getChunkName(name, this.nodeModulesName);
      name = moveable ? pack.root + name.replace(/^\./g, '') : name;
    }
    name = name + (info.ext === '.js' ? '.js' : info.ext + '.js')
    if (this.pageOrComponents[mod.resource]) {
      this.pageOrComponents[mod.resource] = name;
    }
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
    newChunk.mpPack = pack;
  }

  /**
   * 自定义webpack ModuleTemplate.render 
   * 改成打包目标文件保留原生nodejs风格
   */
  registerModuleTemplate(compilation) {
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
  registerNormalModuleLoader(compilation) {
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
  replacement(moduleSource) {
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
   * 获取模块的完整路径
   */
  getModuleFullPath(entry) {
    return path.isAbsolute(entry) ? entry : path.join(this.projectRoot, entry)
  }

  /**
   * 读取Json文件，如果文件不存在，则返回{}
   */
  requireJson(file) {
    return fse.existsSync(file) ? fse.readJSONSync(file) : {};
  }

  /**
   * 附加globalComponents
   */
  applyGlobalComponents(usingComponents) {
    usingComponents = usingComponents || {};
    const globalComponents = this.globalComponents || {};
    Object.keys(globalComponents).forEach(function (key) {
      if (!usingComponents[key]) {
        usingComponents[key] = globalComponents[key];
      }
    });
    return usingComponents;
  }
}



module.exports = WxAppModulePlugin;
