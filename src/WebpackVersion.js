/**
 * @module WebpackVersion
 * @description webpack 版本兼容工具
 */
const NormalModule = require('webpack/lib/NormalModule');

class WebpackVersion {

  /**
   * 判断是否存在指定模块
   */
  hasFeature(id) {
    try {
      require.resolve(id);
      return true;
    } catch{
      return false;
    }
  }

  /**
   * 兼容方式，设置相关依赖模板，
   * 主要用于解决，将__webpack_require转换成require,
   * 以及将require输出依赖路径进行转换。
   * @param {*} compilation 
   */
  initializeWebpackDependencies(compilation) {
    const NodeRequireHeaderDependencyTemplate = require('./dependencies/NodeRequireHeaderDependencyTemplate');
    const NodeModuleDependencyResolveAsName = require('./dependencies/ModuleDependencyTemplateAsResolveName');
    const RequireHeaderDependency = require('webpack/lib/dependencies/RequireHeaderDependency.js');
    const CommonJsRequireDependency = require('webpack/lib/dependencies/CommonJsRequireDependency.js');
    const HarmonyImportDependency = require('webpack/lib/dependencies/HarmonyImportDependency.js');
    // 重新设置RequireHeaderDependency 依赖的模板，用于将webpack_require转换成 require
    compilation.dependencyTemplates.set(RequireHeaderDependency, new NodeRequireHeaderDependencyTemplate());
    // 重新设置CommonJsRequireDependency依赖模板，用于进行require中的路径转换
    compilation.dependencyTemplates.set(CommonJsRequireDependency, new NodeModuleDependencyResolveAsName());
    // 重新设置HarmonyImportDependency依赖模板，用于进行require中的路径转换
    compilation.dependencyTemplates.set(HarmonyImportDependency, new NodeModuleDependencyResolveAsName());

    if (this.hasFeature('webpack/lib/dependencies/CommonJsFullRequireDependency')) {
      // 目前为webpack5
      const HarmonyExportExpressionDependency = require('webpack/lib/dependencies/HarmonyExportExpressionDependency');
      const CommonJsFullRequireDependency = require('webpack/lib/dependencies/CommonJsFullRequireDependency');
      const HarmonyExportDependencyTemplate = require('./dependencies/HarmonyExportDependencyTemplate');
      const NodeCommonJsFullRequireDependencyTemplate = require('./dependencies/NodeCommonJsFullRequireDependencyTemplate');
      // 兼容harmony模块导出兼容
      compilation.dependencyTemplates.set(HarmonyExportExpressionDependency, new HarmonyExportDependencyTemplate());
      // 重新设置 CommonJsFullRequireDependency 用于将webpack_require转换成 require
      compilation.dependencyTemplates.set(CommonJsFullRequireDependency, new NodeCommonJsFullRequireDependencyTemplate());
    }
  }

  /**
   * 获取ChunkGraph
   */
  getChunkGraph() {
    try {
      return require('webpack/lib/ChunkGraph');
    } catch{
      return null;
    }
  }

  /**
   * 清空compilation chunks entrypoints namedChunks
   * @param {*} compilation 
   */
  clearChunks(compilation) {
    this.compilationDataClean(compilation.chunks);
    this.compilationDataClean(compilation.entrypoints);
    this.compilationDataClean(compilation.namedChunks);
  }

  /**
   * 兼容方式，清空 compilation.chunks compilation.entrypoints 之类的数据
   */
  compilationDataClean(data) {
    if (data.clear) {
      data.clear();
    } else {
      data.length = 0;
    }
  }

  /**
   * 克隆chunks
   */
  cloneChunks(chunks) {
    if (chunks instanceof Array) return [].concat(chunks);
    const chunks2 = [];
    chunks.forEach((chunk) => chunks2.push(chunk))
    return chunks2;
  }

  /**
   * 兼容方式获取 mainTemplate
   */
  getJavascriptModule(compilation) {
    try {
      const JavascriptModulesPlugin = require('webpack/lib/javascript/JavascriptModulesPlugin');
      return JavascriptModulesPlugin.getCompilationHooks(compilation);
    } catch{
      return compilation.mainTemplate.hooks;
    }
  }

  /**
   * 兼容方式，获取chunk下的模块迭代器
   */
  getModulesIterable(compilation, chunk) {
    const chunkGraph = compilation.chunkGraph;
    if (chunkGraph) {
      return chunkGraph.getChunkModulesIterable(chunk.chunk || chunk);
    } else {
      return chunk.modulesIterable;
    }
  }

  /**
   * 兼容方式获取 normalModuleLoader
   */
  getNormalModuleLoader(compilation) {
    try {
      return NormalModule.getCompilationHooks(compilation).loader;
    } catch (ex) {
      return compilation.hooks.normalModuleLoader;
    }
  }

  /**
   * 兼容方式操作webpack5 addChunk
   */
  connectChunkAndModule(compilation, chunk, mod) {
    const chunkGraph = compilation.chunkGraph;
    if (chunkGraph) {
      if (!chunkGraph.isModuleInChunk(mod, chunk)) {
        chunkGraph.connectChunkAndModule(chunk, mod);
      };
    } else {
      chunk.addModule(mod);
      mod.addChunk(chunk);
    }
  }

  /**
   * 兼容webpck5 的removeChunk 
   */
  disconnectChunkAndModule(compilation, chunk, mod) {
    const chunkGraph = compilation.chunkGraph;
    if (chunkGraph) {
      chunkGraph.disconnectChunkAndModule(chunk, mod);
    } else {
      mod.removeChunk(chunk);
    }
  }
}

module.exports = new WebpackVersion();