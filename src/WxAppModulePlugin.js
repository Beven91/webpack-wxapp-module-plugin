

/**
 * 名称：微信小程序webapck插件
 * 日期:2017-12-19
 * 描述：
 *     使微信程序支持webpack打包
 */
const vm = require('vm');
const path = require('path');
const fse = require('fs-extra');
const webpack = require('webpack');
const Entrypoint = require('webpack/lib/Entrypoint');
const AMDPlugin = require('webpack/lib/dependencies/AMDPlugin.js');
const SingleEntryPlugin = require('./dependencies/AutoSingleEntryPlugin');
const HarmonyDetectionParserPlugin = require('webpack/lib/dependencies/HarmonyDetectionParserPlugin');
const ConcatSource = require('webpack').sources.ConcatSource;
const WebpackVersion = require('./WebpackVersion');
const Runtime = require('./runtime');
const WxWorkerDependency = require('./dependencies/WxWorkerDependency')

const MPEXT = ['.js', '.wxss', '.wxml', '.json', '.js.map'];

const NameResolve = require('./dependencies/NameResolve');

const subPackRegexp = /subPack:/;

const PROJECT_CONFIG = 'project.config.json';

const PLGUIN_CONFIG = 'plugin.json';

const PLUGIN_CHUNK = 'plugin:';

const PLUGIN_MP = 'miniprogram';

const SCRIPT_REGEXP = /\.(js|ts)$/i;

const isUrlExportRegexp = /module.exports(\s+|)=(\s+|)__webpack_public_path__/;

const REG_WXS_EFFECT = /\.wxs\.(js|json|js\.map)$/i

// 取消AMD模式
AMDPlugin.prototype.apply = function () {

};

HarmonyDetectionParserPlugin.prototype.apply = function () {

};


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
    this.extraChunks = {};
    this.extraPackage = {};
    this.packages = [];
    this.packagesMap = {};
    this.registryPages = [];
    this.resourceModulesMap = {};
    this.mainReferences = {};
    this.pageOrComponents = {};
    this.jsonAssets = {};
    this.exclude = options.exclude || /(plugin|plugin-private):/i;
    this.globalComponents = options.globalComponents || {};
    this.nodeModulesName = nodeModulesName || NameResolve.nodeModulesName || 'app_node_modules';
    this.typedExtensions = ['.wxml', '.wxss'].concat(extensions || []);
    this.Resolve = require('./dependencies/ModuleDependencyTemplateAsResolveName.js');
    this.Template = require('./dependencies/NodeRequireHeaderDependencyTemplate.js');
    this.runMode = options.mode == 'plugin' ? 'plugin' : 'miniprogram';
    this.plugin = { pluginAppid: '', root: options.pluginRoot, entry: null, configIndex: null };
    this.projectConfigPath = null;
    this.needGenerateAssets = true;
    this.pluginDependencies = {};
    this.compilation = null;
    this.distRoot = '';
    this.pluginName = path.basename(this.plugin.root || '');
    this.distPluginName = 'plugin/'
    this.appRoot = '';
    this.appDistRoot = '';
    this.pagesDirMap = {};
    this.webpackEntries = {};
    this.previousWebpackEntries = {};
    this.previousPluginWebpackEntries = {};
    this.modifyedEntries = {};
    this.normalizeNameMap = {};
    this.addedEntries = {};
    this.needRemoveEntries = {};
    this.Resolve.setPluginRoot(this.plugin.root);
    NameResolve.nodeModulesName = this.nodeModulesName;
    NameResolve.pluginInstance = this;
  }

  checkOptions(options) {
    const appEntry = options.entry.app || { import: [] };
    const appIndex = appEntry.import.find((name) => /app/.test(name));
    if (!appIndex) {
      throw new Error('请指定webpack: entry.app');
    }
    return appIndex;
  }

  apply(compiler) {
    const app = this.checkOptions(compiler.options);
    this.options = compiler.options;
    this.options.optimization.splitChunks = null;
    this.projectRoot = this.options.context;
    this.appRoot = Runtime.appRoot = path.dirname(path.join(this.projectRoot, app));
    this.distRoot = this.options.output.path;
    this.appConfigPath = path.join(this.appRoot, 'app.json');
    this.appConfig = this.getJson(this.appConfigPath)
    this.Resolve.setOptions({ nodeModulesName: this.nodeModulesName, projectRoot: this.projectRoot });

    const definePlugin = new webpack.DefinePlugin({
      '__webpack_public_path__': JSON.stringify('/'),
    });
    // 设置node = false;
    this.options.node = false;
    definePlugin.apply(compiler);
    // 重新设置webpack相关依赖，用于修改输出模块引用体系
    compiler.hooks.make.tap('WxAppModulePlugin', (compilation) => {
      WebpackVersion.initializeWebpackDependencies(compilation);
    });
    this.registerConfigResourcesEntry(compiler);
    compiler.hooks.invalid.tap('WxAppModulePlugin', (a) => {
      this.needGenerateAssets = /\.json$/.test(a);
      this.modifyedEntries[a] = true;
    });
    compiler.hooks.done.tap('WxAppModulePlugin', () => {
      if (this.runMode !== 'plugin') return;
      const doc = path.join(this.plugin.root, 'doc');
      const dest = path.join(this.options.output.path, 'doc');
      if (fse.existsSync(doc)) {
        fse.copySync(doc, dest)
      }
    })
    compiler.hooks.thisCompilation.tap('WxAppModulePlugin', (compilation, { normalModuleFactory }) => {
      if (compiler.name !== compilation.name) {
        // 如果是一些子编译器任务，则直接略过
        return;
      }
      this.compilation = compilation;
      try {
        compilation.hooks.addEntry.tap('WxAppModulePlugin', (entry, options) => {
          if (this.needRemoveEntries[options.name]) {
            const a = entry;
          }
        });
        this.registerWxWorkerRequire(compiler, normalModuleFactory)
        this.initPackages();
        // 自动根据app.js作为入口，分析哪些文件需要单独产出，以及node_modules使用了哪些模块
        this.registerModuleEntry(compiler);
        // 处理页面相关.json
        this.registerAssets(compilation);
        // loaderContext
        this.registerLoaderContext(compilation);
        // 单文件模块与node_modules模块处理
        this.registerChunks(compilation);
        // 自定义js打包模板渲染 取消webpackrequire机制，改成纯require
        this.registerModuleTemplate(compilation);
        // 注册 normal-module-loader
        this.registerNormalModuleLoader(compilation);
      } catch (ex) {
        if (compilation.errors) {
          compilation.errors.push(ex.stack);
        } else {
          throw new Error(ex.stack);
          // compilation.errors.push(ex);
        }
        // console.error(ex.stack);
      }
    });
  }

  removePluginUnusedEntries(dist, distPluginRoot) {
    const markedEntries = this.previousPluginWebpackEntries;
    Object.keys(markedEntries).forEach((key) => {
      if (markedEntries[key] == false) {
        delete markedEntries[key];
        const name = this.translateDistPath(key, dist).name;
        const dest = path.join(distPluginRoot, name);
        if (fse.existsSync(dest)) {
          this.removeUnusedPageOrComponent(dest, key);
        }
      }
    });
  }

  isDepdencyRemoved(id) {
    return this.previousPluginWebpackEntries[id] == false || this.previousPluginWebpackEntries[id.replace('.json', '.js')] == false;
  }

  removeUnusedPageOrComponent(id, key) {
    MPEXT.forEach((k) => {
      const file = id.replace('.js', '') + k;
      this.modifyedEntries[key.replace('.js', '') + k] = true;
      if (fse.existsSync(file)) {
        fse.unlinkSync(file);
      }
    })
  }

  translateDistPath(item, dist) {
    const name = NameResolve.getProjectRelative(this.projectRoot, NameResolve.getChunkName(item, this.nodeModulesName));
    const finalName = name.replace(/(scss|sass|css)$/, 'wxss').replace(/\.ts$/, '.js')
    return {
      file: path.join(dist, finalName),
      name: finalName
    };
  }

  copyResourceToPlugin(item, dist, distPluginRoot) {
    const data = this.translateDistPath(item, dist);
    const file = data.file;
    const name = data.name;
    const dest = path.join(distPluginRoot, name);
    const jsRegexp = /\.js$/i;
    if (!fse.existsSync(file) || this.modifyedEntries[item] === false) return;
    this.modifyedEntries[item] = false;
    this.overwriteFile(file, dest);
    if (jsRegexp.test(file)) {
      const jsmap = file + '.map';
      this.overwriteFile(jsmap, dest + '.map');
    }
  }

  overwriteFile(file, dest) {
    // 小程序插件的软连接无法无法找到模块，故采用复制方案
    if (fse.existsSync(dest)) {
      fse.unlinkSync(dest);
    }
    fse.ensureDirSync(path.dirname(dest));
    fse.copyFileSync(file, dest);
  }

  /**
   * 注册配置文件输出
   */
  registerConfigResourcesEntry(compiler) {
    const dir = this.runMode == 'plugin' ? this.plugin.root : this.appRoot;
    const id = path.join(dir, PROJECT_CONFIG);
    if (this.runMode == 'plugin') {
      const root = this.plugin.root;
      (new SingleEntryPlugin(this.projectRoot, path.join(root, PLGUIN_CONFIG), PLGUIN_CONFIG)).apply(compiler);
      (new SingleEntryPlugin(this.projectRoot, id, PROJECT_CONFIG)).apply(compiler);
    } else {
      (new SingleEntryPlugin(this.projectRoot, id, PROJECT_CONFIG)).apply(compiler);
    }
    const appConfig = this.appConfig;
    const appRoot = path.dirname(this.appConfigPath)
    const appJsonAssets = [
      appConfig.sitemapLocation,
      appConfig.themeLocation
    ].filter(Boolean);
    appJsonAssets.forEach((m) => {
      const file = path.join(appRoot, m);
      const loader = require.resolve('./loaders/json-loader.js');
      (new SingleEntryPlugin(this.projectRoot, loader + '!' + file, path.basename(file))).apply(compiler);
    })
  }

  /**
   * 初始化小程序引用的页面以及组件与对应的资源文件例如:.json .wxss .wxml,tabBarIcons
   * 最终组织成分包形式资源
   */
  initPackages() {
    const appRoot = this.appRoot;
    const config = this.appConfig;
    if (config) {
      this.jsonAssets = {};
      this.packagesMap = {};
      this.mpJsonAssets = {};
      this.normalizeNameMap = {};
      this.readyMainReferences = {};
      this.mainReferences = {};
      this.Resolve.initSymlinks();
      // 主包
      const main = this.createPackage(appRoot, ['app'].concat(config.pages), 'main');
      // 当前小程序所有包
      const packages = [
        main,
      ];
      main.pages.forEach((f) => {
        this.mainReferences[path.join(appRoot, f)] = true;
      });
      // 分包资源处理
      const subPackages = config.subPackages || [];
      subPackages.forEach((pack) => {
        const subPages = pack.pages || [];
        const name = pack.root;
        const root = path.join(appRoot, name);
        this.pagesDirMap[name.replace(/^\//, '').split('/')[0]] = true;
        packages.push(this.createPackage(root, subPages, 'subPack:' + name, true));
      });
      // 插件
      this.initPluginEntries(packages);
      // 将子包相互共享的组件提升到主包
      packages.forEach((pack) => {
        this.packagesMap[pack.name] = pack;
        if (pack.name === 'main' || pack.name == PLUGIN_CHUNK) {
          return;
        }
        // 过滤掉需要提升到主包中的模块
        pack.pages = pack.pages.filter((fullName) => {
          const info = this.readyMainReferences[fullName] || {};
          const isMain = info.pack === 'main';
          if (isMain) {
            const exists = main.pages.find((p) => p === fullName);
            if (!exists) {
              // 标记到主包中
              this.mainReferences[fullName] = true;
              // 添加到主包中
              main.pages.push(fullName);
            }
          }
          return !isMain;
        });
      });
      packages.forEach((pack) => {
        pack.pages.forEach((modulePath) => {
          const parts = path.parse(modulePath);
          const namePath = path.join(parts.dir, parts.name);
          // 搜索当前页面对应的资源文件 例如: .wxml .wxss .json
          pack.resources = pack.resources.concat(this.typedExtensions.map((ext) => namePath + ext));
        });
        // 过滤掉不存在的文件
        pack.resources = pack.resources.filter(fse.existsSync.bind(fse));
      });
      // 将tab等图标添加到主包资源中去
      this.pushTabBarIcons(config, main.resources);
      // 将包信息添加到this上
      this.packages = packages;
    }
  }

  initPluginEntries(packages) {
    if (this.runMode !== 'plugin') return;
    const pluginRoot = this.plugin.root;
    const configPath = path.join(pluginRoot, PLGUIN_CONFIG);
    const config = this.getJson(configPath);
    const publicComponents = config.publicComponents || {};
    const pages = Object.keys(config.pages || {}).map((key) => config.pages[key]);
    const pack = this.createPackage((pluginRoot + '/').replace(/\/\//, '/'), pages, PLUGIN_CHUNK, true, false, true);
    const mainIndex = path.join(pluginRoot, config.main);
    packages.push(pack);
    Object.keys(publicComponents).forEach((key) => {
      const name = path.join(pluginRoot, publicComponents[key]);
      const file = this.findAbsolutePath(name);
      this.addComponent(file, pack.pages, 'plugin.json', false, true);
    });
    pack.pages.push(this.findAbsolutePath(mainIndex));
    this.plugin.configIndex = configPath;
  }

  /**
   * 创建小程序包的资源
   * @param {String} root 包的基础路径
   * @param {Array} pages  包下的所有页面
   */
  createPackage(root, pages, packName, subpack, applyGlobal, forceAdd) {
    const pack = {
      name: packName,
      root: root,
      absolute: root,
      pages: [],
      subpack: subpack,
      resources: [],
    };
    pages = pages.map((name) => {
      this.pagesDirMap[name.split('/')[0]] = true;
      return path.join(root, name)
    });
    pages.forEach((modulePath) => {
      const parts = path.parse(modulePath);
      const namePath = path.join(parts.dir, parts.name);
      const dependencies = {};
      if (!this.existsComponent(this.findAbsolutePath(modulePath))) {
        return;
      }
      // 附加页面引用的所有组件
      this.pushComponents(pages, modulePath, namePath, true, dependencies, applyGlobal, forceAdd);
      this.addPageOrComponentJsonAsset({ path: namePath, dependencies: dependencies });
      // 标记页面
      this.registryPages.push(namePath.replace(this.appRoot, '').replace(/^(\/|\\)/, ''));
    });
    pages.forEach((file) => {
      // console.log('page',page);
      file = /\.js$/.test(file) ? file : this.findAbsolutePath(file);
      if (!this.existsComponent(file)) {
        this.failToAddEntry('找不到页面: ' + file + '\n     at app.json', file);
        return;
      }
      pack.pages.push(file);
    });
    // 获取绝对路径
    return pack;
  }

  failToAddEntry(message, file) {
    this.compilation.errors.push(new Error(message))
  }

  findAbsolutePath(name) {
    const extensions = ['', '.js', '.ts'];
    const ext = extensions.find((ext) => fse.existsSync(name + ext));
    return name + (ext || '');
  }

  // 添加json配置文件到jsonAsset
  addPageOrComponentJsonAsset(item) {
    if (!this.mpJsonAssets[item.path]) {
      this.mpJsonAssets[item.path] = item;
      this.pageOrComponents[item.path] = true;
    }
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

  existsComponent(id) {
    return fse.existsSync(id) && fse.lstatSync(id).isFile();
  }

  /**
   * 获取指定小程序页面引用的所有组件
   * @param {Array} pages 目前搜索到的页面组件
   * @param {modulePath} 页面完整路径
   * @param {namePath} 页面模块完整路径不带后缀名
   */
  pushComponents(pages, modulePath, namePath, isPage, dependencies, applyGlobal, forceAdd) {
    let components = this.requireJson(namePath + '.json').usingComponents || {};
    const moduleDir = path.dirname(modulePath);
    if (isPage && applyGlobal !== false) {
      // 如果当前为页面，则进行全局组件附加
      components = this.applyGlobalComponents(components);
    }
    const exclude = this.exclude;
    const componentKeys = Object.keys(components);
    componentKeys.forEach((name) => {
      const usingPath = NameResolve.usingComponentNormalize((components[name] || ''));
      if (!exclude.test(usingPath)) {
        const isNodeModules = usingPath.indexOf('node_modules/') === 0;
        let componentEntry = null;
        if (!isNodeModules) {
          componentEntry = path.join(moduleDir, usingPath);
        } else {
          try {
            componentEntry = this.resolveModule(modulePath, usingPath).replace(SCRIPT_REGEXP, '');
          } catch (ex) {
            componentEntry = components[name] || name;
          }
        }
        this.addComponent(componentEntry, pages, modulePath, applyGlobal, forceAdd);
        dependencies[name] = componentEntry;
      }
    });
  }

  addComponent(full, pages, context, applyGlobal, forceAdd) {
    const parts = path.parse(full);
    const namePath = path.join(parts.dir, parts.name);
    const fullName = this.findAbsolutePath(full);
    if (!this.existsComponent(fullName)) {
      this.failToAddEntry('找不到组件: ' + full + '\n     at ' + context + '.json', fullName);
      return;
    }
    if (this.mainReferences[fullName] && forceAdd !== true) {
    } else if (pages.indexOf(fullName) < 0) {
      if (this.readyMainReferences[fullName]) {
        // 如果存在两次引用，则表示是从两个子包依赖了同一个组件，则将组件提升到主包中
        this.readyMainReferences[fullName] = { name: namePath, pack: 'main', namePath: namePath };
      } else {
        this.readyMainReferences[fullName] = {};
      }
      pages.push(fullName);
      const myDepdencies = {};
      this.pushComponents(pages, full, namePath, false, myDepdencies, applyGlobal, forceAdd);
      this.addPageOrComponentJsonAsset({ path: namePath, dependencies: myDepdencies });
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
    const full = this.resolve(request);
    module.paths.splice(0, paths.length);
    return full.replace(/\.json$/, '.js');
  }

  resolve(request) {
    const pkg = this.resolvePackage(request);
    if (pkg) {
      const main = pkg ? pkg.miniprogram : '';
      request = !main ? request : request.replace(new RegExp('^' + pkg.name), pkg.name + '/' + main);
    }
    return require.resolve(request);
  }

  resolvePackage(request) {
    const segments = request.split('/');
    for (let i = 1, k = segments.length; i < k; i++) {
      const id = segments.slice(0, i).join('/') + '/package.json';
      try {
        return require(id);
      } catch {
      }
    }
  }

  /**
   * 获取app.json配置的图标
   * @param {Object} config app.json内容
   * @param {Array} resourceModules 小程序非js资源 例如 .wxss .wxml .json jpg...
   */
  pushTabBarIcons(config, resourceModules) {
    const tabBar = config.tabBar || {};
    const tabBarList = tabBar.list || [];
    const appRoot = this.appRoot;
    tabBarList.forEach(function (tabBarItem) {
      if (tabBarItem.iconPath) {
        resourceModules.push(path.join(appRoot, tabBarItem.iconPath));
      }
      if (tabBarItem.selectedIconPath) {
        resourceModules.push(path.join(appRoot, tabBarItem.selectedIconPath));
      }
    });
  }

  /**
   * 添加微信小程序app.json配置的所有入口页面
   */
  registerModuleEntry(compiler) {
    const packages = this.packages;
    const jsonAssets = Object.keys(this.mpJsonAssets);
    const allEntries = {};
    Object.keys(this.previousPluginWebpackEntries).forEach((k) => this.previousPluginWebpackEntries[k] = false);
    Object.keys(this.previousWebpackEntries).forEach((key) => this.previousWebpackEntries[key] = false);
    // 遍历所有包
    packages.forEach((pack) => {
      const pages = pack.pages;
      const resources = pack.resources.filter((f) => !/\.json$/.test(f));
      const files = [].concat(pages, resources);
      // 将js,.wxss,wxml等资源添加到打包依赖中
      files.forEach((file) => {
        const name = file.split(this.projectRoot).pop();
        const id = pack.name + '@' + file;
        const chunkName = pack.name + '@' + name;
        allEntries[file] = true;
        if (pack.name == PLUGIN_CHUNK) {
          this.previousPluginWebpackEntries[file] = true;
        }
        this.previousWebpackEntries[file] = true;
        if (this.webpackEntries[id]) {
          return;
        }
        this.addedEntries[file] = chunkName;
        this.webpackEntries[id] = true;
        (new SingleEntryPlugin(this.projectRoot, file, chunkName, this.needRemoveEntries)).apply(compiler);
      });
      // (new MultiEntryPlugin(this.projectRoot, files, pack.name)).apply(compiler);
      // 添加资源文件清单
      resources.forEach((f) => {
        this.resourceModulesMap[f] = true;
      });
    });

    jsonAssets.forEach((id) => {
      const file = id + '.json';
      const name = file.split(this.projectRoot).pop();
      const chunkName = '__jsonAssets__' + '@' + name;
      allEntries[file] = true;
      if (this.webpackEntries[file]) {
        return;
      }
      if (!fse.existsSync(file)) {
        // 如果不存在对应的json文件
        return;
      }
      this.addedEntries[file] = chunkName;
      this.webpackEntries[file] = true;
      (new SingleEntryPlugin(this.projectRoot, file, chunkName, this.needRemoveEntries)).apply(compiler);
    });

    Object.keys(this.addedEntries).forEach((k) => {
      const name = this.addedEntries[k];
      this.needRemoveEntries[name] = !allEntries[k]
    })
  }

  /**
   * 注册loaderContext
   * @param {*} compilation
   */
  registerLoaderContext(compilation) {
    const normalModuleLoader = WebpackVersion.getNormalModuleLoader(compilation);
    normalModuleLoader.tap('WxAppModulePlugin', (loaderContext) => {
      let innerLoadModule = null;
      const loadModule = (request, callback) => {
        innerLoadModule.call(loaderContext, request, (err, src) => {
          if (err) {
            return callback(err);
          } else if (!isUrlExportRegexp.test(src)) {
            return callback(err, src);
          }
          const myRequest = this.exec(src).replace(/(^\/|_\/)/g, '');
          const mod = loaderContext._module;
          return callback(err, `module.exports =  "/${this.tranformPackUrl(mod, myRequest).replace(/\.\//g, '')}"`);
        });
      };
      Object.defineProperty(loaderContext, 'loadModule', {
        get() {
          return loadModule;
        },
        set(v) {
          innerLoadModule = v;
        },
      });
    });
  }

  registerWxWorkerRequire(compiler, normalModuleFactory) {
    const compilation = this.compilation;
    const CREATE_WORKER_NAME = 'createWorker';
    compilation.dependencyTemplates.set(WxWorkerDependency, new WxWorkerDependency.Template());
    compilation.dependencyFactories.set(WxWorkerDependency, normalModuleFactory);
    normalModuleFactory.hooks.parser.for('javascript/auto').tap('WxAppModulePlugin', (parser) => {
      // 支持: const { createWorker } = wx; createWorker('aa')
      parser.hooks.statement.tap('WxAppModulePlugin', (expression) => {
        if (expression.type !== 'VariableDeclaration') return;
        const declarations = expression.declarations;
        let isWxCreateWorker = false;
        if(declarations.length > 1) {
          isWxCreateWorker = declarations[0]?.init?.name == 'wx' && declarations[1]?.init?.property?.name == CREATE_WORKER_NAME;
        } else {
          isWxCreateWorker = declarations[0]?.init?.object?.name == 'wx' && declarations[0]?.init?.property?.name == CREATE_WORKER_NAME;
        }
        if (isWxCreateWorker) {
          const variable = parser.getVariableInfo(CREATE_WORKER_NAME);
          if (variable && typeof variable !== 'string') {
            // 标记作用域中变量的来源标识
            parser.tagVariable(CREATE_WORKER_NAME, 'wx.createWorker');
          }
        }
      })
      parser.hooks.statement.tap('WxAppModulePlugin', (expression) => {
        // 这里还需要判定createWorker是否为wx的createWorker
        if (expression.type !== 'ExpressionStatement') {
          return;
        }
        expression = expression.expression;
        if (
          expression.type === 'CallExpression' &&
          expression.callee.name === CREATE_WORKER_NAME &&
          expression.arguments.length === 1 &&
          expression.arguments[0].type === 'Literal'
        ) {
          const variable = parser.getVariableInfo(CREATE_WORKER_NAME);
          if(variable?.tagInfo?.tag === 'wx.createWorker') {
            // 确保当前调用的createWorker是wx.createWorker
            const workerPath = expression.arguments[0].value;
            const context = parser.state.module.context;
            const resolvedPath = path.resolve(context, workerPath);
            const dep = new WxWorkerDependency(resolvedPath, expression.range);
            dep.loc = expression.loc;
            parser.state.current.addDependency(dep);
          }
        }
      })
      // 支持: wx.createWorker('workders/ss')
      parser.hooks.callMemberChain.for('wx').tap('WxAppModulePlugin', (expression) => {
        if (
          expression.callee.property.name === CREATE_WORKER_NAME &&
          expression.arguments.length === 1 &&
          expression.arguments[0].type === 'Literal'
        ) {
          const workerPath = expression.arguments[0].value;
          const context = parser.state.module.context;
          const resolvedPath = path.resolve(context, workerPath);
          const dep = new WxWorkerDependency(resolvedPath, expression.range);
          dep.loc = expression.loc;
          parser.state.current.addDependency(dep);
        }
      });
    });
  }

  /**
   * 自定义webpack entry
   * 目标：entry不再合并成一个文件，而是保留原始目录结构到目标目录
   */
  registerChunks(compilation) {
    this.Resolve.clearAlias();
    compilation.hooks.optimizeChunks.tap('WxAppModulePlugin', (chunks) => {
      this.extraChunks = {};
      const originChunks = WebpackVersion.cloneChunks(chunks);
      const preMainReferences = {};
      WebpackVersion.clearChunks(compilation);
      // 收集出非子包的模块依赖信息
      originChunks
        .forEach((chunk) => {
          const modulesIterable = WebpackVersion.getModulesIterable(compilation, chunk);
          if (chunk.name.indexOf(PLUGIN_CHUNK) > -1) {
            // 收集所有插件资源
            modulesIterable.forEach((mod) => {
              const name = mod.resource.replace(/\.(ts|js)$/, '');
              if (this.pageOrComponents[name] == true) {
                this.pluginDependencies[name + '.json'] = true;
              }
              this.pluginDependencies[mod.resource] = mod;
            })
          }
          if (!subPackRegexp.test(chunk.name)) {
            const name = chunk.name.split('@').shift();
            const pack = this.packagesMap[name] || {};
            modulesIterable.forEach((mod) => {
              mod.mpPack = pack;
              this.mainReferences[mod.resource] = true;
            });
          } else {
            modulesIterable.forEach((mod) => {
              const ticks = preMainReferences[mod.resource] || 0;
              preMainReferences[mod.resource] = ticks + 1;
              // 将同时在2个分包即以上下引用的模块需要提升为主包
              if (ticks > 0) {
                this.mainReferences[mod.resource] = true;
              }
            });
          }
        });
      // 开始资源拆包
      originChunks
        .filter((chunk) => chunk.hasRuntime() && chunk.name)
        .map((chunk) => {
          const name = chunk.name.split('@').shift();
          const pack = this.packagesMap[name] || {};
          const modulesIterable = WebpackVersion.getModulesIterable(compilation, chunk);
          if (/__jsonAssets__@/.test(chunk.name)) {
            return;
          }
          modulesIterable.forEach((mod) => {
            if (mod.userRequest) {
              this.handleAddChunk(compilation, mod, chunk, pack, this.mainReferences);
            }
          });
        });
    });
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
    compilation.hooks.chunkAsset.tap('WxAppModulePlugin', (chunk, name) => {
      const mainReferences = this.mainReferences;
      const modulesIterable = WebpackVersion.getModulesIterable(compilation, chunk);
      modulesIterable.forEach((mod) => {
        // 将当前模块的所有输出，根据包来决定是独立输出到子包目录下，还是主目录下
        chunk.files = this.renderAssets(mod, [name], compilation.assets, mainReferences);
      });
    });
    const name = 'processAssets' in compilation.hooks ? 'processAssets' : 'additionalChunkAssets';
    // 处理块输出
    compilation.hooks[name].tap('WxAppModulePlugin', () => {
      const chunks = compilation.chunks;
      const mainReferences = this.mainReferences;
      chunks.forEach((chunk) => {
        const mod = chunk.mod;
        const assets = compilation.assets || {};
        if (mod) {
          mod.mpPack = chunk.mpPack;
          // 将当前块的所有文件输出，根据包来决定是独立输出到子包目录下，还是主目录下
          chunk.files = this.renderAssets(mod, chunk.files, assets, mainReferences);
        }
      });
    });

    // 处理页面与组件json输出
    this.renderJsonAssets(compilation);
  }

  tryReadJson(id) {
    try {
      return fse.readJsonSync(id);
    } catch (ex) {
      return null;
    }
  }

  /**
   * 处理小程序组件与页面的json配置
   */
  renderJsonAssets(compilation) {
    const exclude = this.exclude;
    //  处理页面与组件json输出
    compilation.hooks.optimizeAssets.tap('WxAppModulePlugin', (assets) => {
      if (this.needGenerateAssets == false) {
        // 热更新处理
        this.makePluginDependencies(assets, true);
        return;
      }
      // 为了支持微信小程序开发者工具热重载，（除了第一次构建外）这里在不是改动json文件下，其他情况下不输出json assets
      this.needGenerateAssets = false;
      const assetKeys = Object.keys(this.mpJsonAssets);
      Object.keys(assets).forEach((k)=>{
        if(REG_WXS_EFFECT.test(k)) {
          delete assets[k];
        }
      })
      delete assets['app.wxml'];
      const registryPages = this.registryPages.map((m) => m.replace(/\\/g, '/'));
      assetKeys.forEach((k) => {
        const item = this.mpJsonAssets[k];
        const request = item.path;// + '.js';
        const data = this.tryReadJson(item.path + '.json') || {};
        if (!this.pageOrComponents[request] || this.pageOrComponents[request] === true) {
          compilation.errors.push(Error('找不到页面或组件:' + item.path));
          return;
        }
        const name = this.pageOrComponents[request].replace(SCRIPT_REGEXP, '.json');
        let usingComponents = data.usingComponents || {};
        const isPage = registryPages.indexOf(name.replace(/\\/g, '/').replace('.json', '')) > -1;
        if (isPage && name !== 'app.json') {
          usingComponents = this.applyGlobalComponents(usingComponents);
        }
        data.usingComponents = usingComponents;
        if (usingComponents) {
          const usingKeys = Object.keys(usingComponents);
          const targetContext = path.dirname(path.join(this.projectRoot, name));
          const dependencies = item.dependencies;
          const pluginRoot = this.plugin.root;
          usingKeys.forEach((using) => {
            const componentPath = usingComponents[using];
            if (exclude.test(componentPath)) {
              return;
            }
            const dependency = dependencies[using];
            const key = this.pageOrComponents[dependency];
            if (key) {
              const isPlugin = request.indexOf(pluginRoot) > -1 && dependency.indexOf(pluginRoot) < 0;
              const fullUsingPath = path.join(this.projectRoot, key);
              const relativePath = NameResolve.getTargetRelative(this.projectRoot, targetContext, fullUsingPath);
              let usePath = NameResolve.getChunkName(relativePath.replace(SCRIPT_REGEXP, ''), this.nodeModulesName)
              if (isPlugin) {
                usePath = usePath.replace('../', '')
              }
              usingComponents[using] = usePath;
            }
          });
        }
        const content = JSON.stringify(data, null, 4);
        const size = content.length;
        assets[this.normalizeOutputName(name)] = {
          size: () => size,
          source: () => {
            return content;
          },
        };
      });

      const app = this.getAppJSON();
      const base = path.relative(this.projectRoot, this.appRoot).replace(/\.\.\//g, '');
      const joinChar = base ? '/' : '';
      const assetKey = base + joinChar + 'app.json';
      const useKey = this.normalizeOutputName(assetKey);
      this.appDistRoot = path.dirname(useKey)
      assets[useKey] = {
        size: () => app.length,
        source: () => app,
      };
      Object.keys(this.jsonAssets).forEach((k) => {
        const item = this.jsonAssets[k];
        const content = this.readAssetFile(item, k);
        assets[this.normalizeOutputName(item.name)] = {
          size: () => content.length,
          source: () => content,
        };
      });
      if (this.runMode == 'plugin') {
        this.makePluginDependencies(assets);
      }
    });
  }

  readAssetFile(item, k) {
    const pluginRoot = path.join(this.plugin.root || "", PLGUIN_CONFIG)
    switch (item.name) {
      case PROJECT_CONFIG:
        return this.readProjectConfigJson(k);
      default:
        if (pluginRoot.indexOf(item.name) == (pluginRoot.length - item.name.length)) {
          return this.readPluginConfigJson(k);
        }
        return fse.readFileSync(k);
    }
  }

  makePluginDependencies(assets, isHotupdate) {
    const dist = this.distRoot;
    // 移除解除引用的组件或者页面
    // this.removeUnusedEntries(dist);
    const distPluginRoot = path.join(dist, this.distPluginName);
    Object.keys(this.pluginDependencies).forEach((item, i) => {
      this.makePluginDependency(item, assets, isHotupdate);
    });
    // 移除解除引用的插件页面或者组件
    this.removePluginUnusedEntries(dist, distPluginRoot);
  }

  makePluginDependency(item, assets, isHotupdate) {
    const dist = this.distRoot;
    const pluginRoot = this.plugin.root;
    const distPluginRoot = path.join(dist, this.distPluginName);
    const wxmlRegexp = /\.wxml$/i;
    // 不复制已经在插件下的文件
    if (item.indexOf(pluginRoot) > -1 || this.isDepdencyRemoved(item)) return;
    if (wxmlRegexp.test(item)) {
      // 复制wxml引用的资源文件
      const mod = this.pluginDependencies[item];
      const snapshot = mod.buildInfo.snapshot || {};
      const fileTimestamps = snapshot.fileTimestamps || [];
      fileTimestamps.forEach((value, key) => {
        if (!wxmlRegexp.test(key)) {
          this.makePluginAsset(key, assets, dist, distPluginRoot);
        }
      })
    }
    this.makePluginAsset(item, assets, dist, distPluginRoot);
  }

  getAssetName(userRequest) {
    const info = path.parse(NameResolve.getProjectRelative(this.projectRoot, userRequest));
    let name = path.join(info.dir, info.name);
    return NameResolve.getChunkName(name, this.nodeModulesName) + info.ext;
  }

  makePluginAsset(item, assets, dist) {
    const data = this.translateDistPath(item, dist);
    const name = this.normalizeOutputName(data.name);
    const asset = assets[name];
    if (asset) {
      const dest = this.distPluginName + data.name;
      const source = new ConcatSource();
      source.add(asset);
      assets[dest] = source;
    }
    if (assets[name + '.js']) {
      // 处理.png.js
      this.makePluginAsset(item + '.js', assets, dist);
    }
  }

  getAppJSON() {
    const appJson = this.getJson(path.join(this.appRoot, 'app.json'));
    const dir = this.plugin.root || this.appRoot;
    const pluginConfig = this.getJson(path.join(dir, PROJECT_CONFIG));
    this.handleDevPlugin(appJson.plugins, pluginConfig);
    (appJson.subPackages || []).forEach((sub) => {
      this.handleDevPlugin(sub.plugins, pluginConfig);
    });
    return JSON.stringify(appJson, null, 2);
  }

  handleDevPlugin(plugins, pluginConfig) {
    if (this.runMode !== 'plugin') return;
    Object.keys(plugins || {}).forEach((name) => {
      const plugin = plugins[name];
      if (plugin.provider == pluginConfig.pluginAppid) {
        plugin.version = 'dev';
      }
    });
  }

  readProjectConfigJson(id) {
    const config = this.getJson(id);
    if (this.runMode == 'plugin') {
      config.miniprogramRoot = this.appDistRoot;
      config.srcMiniprogramRoot = this.appDistRoot;
      config.pluginRoot = this.distPluginName
      config.setting = config.setting || {};
      config.setting.es6 = false;
      config.setting.enhance = false;
    }
    return JSON.stringify(config, null, 2);
  }

  readPluginConfigJson(id) {
    const config = this.getJson(id);
    if (config.main) {
      const ext = path.extname(config.main);
      config.main = ext ? config.main.replace(path.extname(config.main), '.js') : config.main + '.js';
    }
    return JSON.stringify(config, null, 2);
  }

  /**
   * 处理assets
   */
  renderAssets(mod, assetKeys, assets, mainReferences) {
    const pack = mod.mpPack;
    const resource = mod.resource;
    const moveable = pack && pack.subpack && !mainReferences[resource];
    const nodeModulesName = this.nodeModulesName;
    return assetKeys.map((key) => {
      const relative = moveable ? path.relative(pack.absolute, resource).replace(/\\/g, '/') : '';
      // 如果是子包独立引用
      if (moveable && relative.indexOf('../') > -1) {
        const basename = path.basename(key);
        const rPath = relative.replace(/\.\.\//g, '').replace(/^node_modules\//, '');
        const request = path.dirname(rPath) + '/' + basename;
        const target = this.tranformPackUrl(mod, request);
        const name = NameResolve.getChunkName(target, this.nodeModulesName);
        return this.replaceAsset(name, key, mod, assets);
      } else if (key.indexOf('node_modules') > -1) {
        let name = NameResolve.getChunkName(key, nodeModulesName);
        name = nodeModulesName + name.split(nodeModulesName).slice(1);
        return this.replaceAsset(name, key, mod, assets);
      } else if (key.indexOf('_/') > -1) {
        const name = key.replace(/_\//g, '');
        return this.replaceAsset(name, key, mod, assets);
      }
      return this.replaceAsset(key, key, mod, assets);
    });
  }

  replaceAsset(target, key, mod, assets) {
    const id = this.normalizeOutputName(target);
    const asset = assets[key];
    delete assets[key];
    assets[id] = asset;
    if(!/\.wxs/i.test(mod.resource)) {
      this.pageOrComponents[mod.resource] = target;
    }
    return id;
  }

  normalizeOutputName(target) {
    if (this.runMode != 'plugin') {
      return target;
    }
    target = target.replace(/\\/g, '/');
    const miniprogramRoot = PLUGIN_MP + '/';
    const pluginRoot = this.pluginName + '/';
    const pluginDistRoot = this.distPluginName.replace(/\\/g, '/');
    if (target.indexOf(pluginRoot) == 0) {
      return target.replace(pluginRoot, this.distPluginName);
    } else if (target.indexOf(miniprogramRoot) == 0 || target == PROJECT_CONFIG || target.indexOf(pluginDistRoot) == 0) {
      return target;
    } else {
      return PLUGIN_MP + '/' + target.replace(/^\.\//, '');
    }
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
      let pack = null;
      if (reasonModule && reasonModule.mpPack) {
        pack = reasonModule.mpPack;
      } else if (reason.loc || reason.dependency) {
        const chunkName = (reason.loc || reason.dependency.loc).name || '';
        const name = chunkName.split('@').shift();
        pack = this.packagesMap[name];
      }
      pack = pack || this.searchMpPack(reasonModule);
      if (pack) {
        mod.mpPack = pack;
        return pack;
      }
    }
  }

  /**
   * 处理文件输出
   */
  handleAddChunk(compilation, mod, chunk, pack, mainReferences) {
    const addChunk = compilation.addChunk.bind(compilation);
    const info = path.parse(NameResolve.getProjectRelative(this.projectRoot, mod.userRequest.split('!').pop()));
    let name = path.join(info.dir, info.name);
    let nameWith = name + info.ext;
    const resource = mod.resource;
    let newChunk = this.extraChunks[nameWith];
    if (this.resourceModulesMap[resource] || /\.wxs$/.test(resource)) {
      return;
    }
    if (nameWith.indexOf('node_modules') > -1 || !mainReferences[resource]) {
      // 当前模块资源是否可以移动带子包中
      name = this.tranformPackUrl(mod, name);
      nameWith = name + info.ext;
    }
    const idKey = resource.replace(info.ext, '');
    if (info.ext == '.json') {
      name = name + info.ext;
      if (name.indexOf(PROJECT_CONFIG) > -1) {
        name = PROJECT_CONFIG;
      }
      this.jsonAssets[mod.resource] = { name: name, content: '' };
      return;
    }
    name = name + ((info.ext === '.js' || info.ext == '.ts') ? '.js' : info.ext + '.js');
    if (this.pageOrComponents[idKey]) {
      this.pageOrComponents[idKey] = name;
    }
    this.Resolve.setAliasModule(mod, path.join(this.projectRoot, name));
    if (!newChunk) {
      mod.variables = [];
      const entrypoint = new Entrypoint(name);
      newChunk = this.extraChunks[nameWith] = addChunk(name);
      entrypoint.chunks.push(newChunk);
      newChunk.addGroup(entrypoint);
    }
    if (newChunk) {
      WebpackVersion.connectChunkAndModule(compilation, newChunk, mod);
    }
    if (newChunk !== chunk) {
      WebpackVersion.disconnectChunkAndModule(compilation, chunk, mod);
    }
  }

  /**
   * 自定义webpack ModuleTemplate.render
   * 改成打包目标文件保留原生nodejs风格
   */
  registerModuleTemplate(compilation) {
    const replacement = this.replacement.bind(this);
    const hooks = WebpackVersion.getJavascriptModule(compilation);
    hooks.render.tap('WxAppModulePlugin', (bootstrapSource, chunk, hash, moduleTemplate, dependencyTemplates) => {
      const source = new ConcatSource();
      // webpack 5
      const modulesIterable = WebpackVersion.getModulesIterable(compilation, chunk);
      modulesIterable.forEach((module) => {
        const ext = path.extname(module.userRequest);
        let moduleSource = null;
        switch (ext) {
          case '.json':
            moduleSource = module._source;
            break;
          default:
            {
              const source = module._source._value;
              if (isUrlExportRegexp.test(source)) {
                moduleSource = new ConcatSource();
                const name = this.exec(source).replace(/(^\/|_\/)/g, '');
                moduleSource.add(`module.exports = "/${this.tranformPackUrl(module, name).replace(/\.\//g, '')}"`);
              } else if (compilation.codeGenerationResults) {
                moduleSource = compilation.codeGenerationResults.getSource(module, chunk.runtime, 'javascript');
              } else if ('chunk' in chunk) {
                moduleSource = module.source(chunk.dependencyTemplates, chunk.runtimeTemplate)._source;
              } else {
                moduleSource = module.source(dependencyTemplates, moduleTemplate.outputOptions, moduleTemplate.requestShortener);
              }
              replacement(moduleSource);
            }
            break;
        }
        source.add(moduleSource);
      });
      return source;
    });
  }


  /**
   * 注册normal module loader
   */
  registerNormalModuleLoader(compilation) {
    const normalModuleLoader = WebpackVersion.getNormalModuleLoader(compilation);
    normalModuleLoader.tap('WxAppModulePlugin', function (loaderContext) {
      if (loaderContext.exec) {
        const exec = loaderContext.exec.bind(loaderContext);
        loaderContext.exec = function (code, filename) {
          return exec(code, filename.split('!').pop());
        };
      }
    });
  }

  /**
   * 替换 __webpack_require
   */
  replacement(moduleSource) {
    const replacements = moduleSource.replacements || [];
    replacements.forEach(function (rep) {
      let v = rep[2] || '';
      const isVar = v.indexOf('WEBPACK VAR INJECTION') > -1;
      v = isVar ? '' : v.replace(/__webpack_require__/g, 'require');
      if (v.indexOf('AMD') > -1) {
        v = '';
      }
      rep[2] = v;
    });
  }

  /**
   * 迁移子包路径转换
   * @param {*} entry
   */
  tranformPackUrl(mod, request) {
    const pack = this.searchMpPack(mod) || {};
    const npmName = this.nodeModulesName;
    const moveable = pack.subpack && !this.mainReferences[mod.resource];
    const root = pack.root ? pack.root.replace(/\\/g, '/') : undefined;
    request = NameResolve.getChunkName(request, npmName).replace(/\\/g, '/');
    if (request.indexOf(root) < 0) {
      const middle = request.indexOf(npmName + '/') > -1 ? '' : npmName;
      request = moveable ? (root + '/' + middle + '/' + request).replace(/\/\//g, '/') : request;
    }
    return request.replace(/\/\//g, '/');
  }

  /**
   * 读取Json文件，如果文件不存在，则返回{}
   */
  requireJson(file) {
    try {
      return fse.existsSync(file) ? fse.readJSONSync(file) : {};
    } catch (ex) {
      return {}
    }
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

  exec(src) {
    const script = new vm.Script(src, { displayErrors: true });
    const sandbox = {
      __webpack_public_path__: '',
      module: {},
    };
    script.runInNewContext(sandbox);
    return sandbox.module.exports.toString();
  }
}

module.exports = WxAppModulePlugin;