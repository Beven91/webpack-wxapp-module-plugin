/**
 * 名称：webpack 模块引用标识符模板
 * 日期:2017-06-01
 * 描述：用于替换CommonJsRequireDependency.Template 
 *      从而实现 require(模块名称)  而不是require(模块id)
 */
var path = require('path')
var NameResolve = require('./NameResolve');

var Nodes_Module_Name = "";
var ProjectRoot = null;
var runtimeAlias = {};
var PLUGIN_ROOT = '';
var symlinks = {};

/**
 * webpack require 使用模块名称作为模块标识
 * 用于替换 ModuleDependencyTemplateAsId 模板
 */
function ModuleDependencyTemplateAsResolveName() {
}

ModuleDependencyTemplateAsResolveName.prototype.getSource = function (source) {
  if (typeof source.source === 'function') {
    return source.source();
  } else {
    return source._source._value || source._source._valueAsString;
  }
}

/**
 * 依赖模块引用替换处理
 */
ModuleDependencyTemplateAsResolveName.prototype.apply = function (dep, source, outputOptions) {
  try {
    var module = outputOptions.moduleGraph ? outputOptions.moduleGraph.getModule(dep) : dep.module;
    if (!dep.range) return;
    if (!module) return;
    var request = dep.userRequest
    var sourcePath = 'module' in outputOptions ? outputOptions.module.resource : source._source._name
    var content = this.resolve(request, sourcePath, module);
    var original = this.getSource(source).substring(dep.range[0], dep.range[1] - 1);
    if (content.indexOf('css-loader') > -1) {
      content = this.absoluteResolve(content, sourcePath);
    } else {
      content = NameResolve.getChunkName(content, Nodes_Module_Name);
    }
    if (dep.type === 'harmony import') {
      var prefix = original.split(' from ')[0];
      source.replace(dep.range[0], dep.range[1] - 1, prefix + ' from  \'' + content + '\'');
    } else {
      source.replace(dep.range[0], dep.range[1] - 1, '\'' + content + '\'');
    }
  } catch (ex) {
    throw new Error(ex.stack);
  }
}

ModuleDependencyTemplateAsResolveName.prototype.isPluginSource = function (id) {
  return PLUGIN_ROOT && (id || '').toString().indexOf(PLUGIN_ROOT) > -1;
}

ModuleDependencyTemplateAsResolveName.prototype.resolve = function (content, sourcePath, depModule) {
  let request = this.internalResolve(content, sourcePath, depModule);
  const root = path.dirname(sourcePath)
  const id = path.join(root, request);
  if (this.isPluginSource(sourcePath) && !this.isPluginSource(id)) {
    request = request.replace('../','');
    // const newId = path.join(root, request);
    // // // 插件引用文件 
    // symlinks[path.dirname(id)] = path.dirname(newId);
  }
  return request;
}

ModuleDependencyTemplateAsResolveName.prototype.internalResolve = function (content, sourcePath, depModule) {
  var resource = runtimeAlias[depModule.resource] || depModule.resource;
  var hasAssets = Object.keys(depModule.assets || {}).length > 0;
  var extName = path.extname(resource || content);
  var cExtName = path.extname(content);
  var isRequirejs = (content.indexOf('./') > -1 || content.indexOf('../') > -1) || content.indexOf('image!') == 0;
  if (path.isAbsolute(content)) {
    return this.absoluteResolve(content, sourcePath);
  } else if (resource && isRequirejs) {
    return this.relativeResolve(sourcePath, resource);
  } else if (hasAssets && extName && extName != '.js') {
    return this.assetsResolve(content, extName);
  } else if (content.indexOf('/') > -1 && cExtName !== extName && cExtName !== '.js') {
    return this.moduleFileResolve(content, resource, extName, sourcePath);
  } else if (extName !== '' && extName !== '.js') {
    var info = path.parse(content)
    return path.join(info.dir, info.name + extName + '.js').replace(/\\/g, '/');
  } else {
    return this.relativeResolve(sourcePath, resource)
  }
}

/**
 * 绝对路径引用处理 require('d:/as/aa.js')
 */
ModuleDependencyTemplateAsResolveName.prototype.absoluteResolve = function (content, sourcePath) {
  var holder = "node_modules/";
  var index = content.indexOf(holder);
  if (index > -1) {
    return content.substring(index + holder.length);
  } else {
    return this.relativeResolve(sourcePath, content)
  }
}

/**
 * 相对require处理 例如: require('./xxx')
 */
ModuleDependencyTemplateAsResolveName.prototype.relativeResolve = function (sourcePath, resource) {
  sourcePath = sourcePath.split('!').pop();
  sourcePath = runtimeAlias[sourcePath] || sourcePath;
  sourcePath = path.dirname(sourcePath);
  var movedSourcePath = NameResolve.moveToProjectRoot(ProjectRoot, sourcePath);
  var movedSource = NameResolve.moveToProjectRoot(ProjectRoot, resource);
  var content = path.relative(movedSourcePath, movedSource)
  var extName = path.extname(resource)
  var info = path.parse(content)
  extName = extName !== '.js' ? extName + '.js' : extName;
  content = path.join(info.dir, info.name + extName)
  content = './' + content.replace(/\\/g, '/')
  return content;
}

/**
 * 静态资源 require require('./a.jpg')
 */
ModuleDependencyTemplateAsResolveName.prototype.assetsResolve = function (request, extName) {
  var info = path.parse(request)
  request = path.join(info.dir, info.name + extName + '.js')
  return request.replace(/\\/g, '/')
}

/**
 * 模块下文件引用处理 require('webpack/lib/NormalModule.js')
 */
ModuleDependencyTemplateAsResolveName.prototype.moduleFileResolve = function (content, resource, extName, sourcePath) {
  var resolve = (extName == '.js' ? resource : require.resolve(content)).replace(/\\/g, '/');
  return this.relativeResolve(sourcePath, resolve);
}

ModuleDependencyTemplateAsResolveName.setOptions = function (options) {
  Nodes_Module_Name = options.nodeModulesName;
  ProjectRoot = options.projectRoot;
}

ModuleDependencyTemplateAsResolveName.setAliasModule = function (mod, alias) {
  runtimeAlias[mod.resource] = alias;
};

ModuleDependencyTemplateAsResolveName.clearAlias = function () {
  runtimeAlias = {};
}

ModuleDependencyTemplateAsResolveName.setPluginRoot = function (dir) {
  PLUGIN_ROOT = dir;
}

ModuleDependencyTemplateAsResolveName.getSymlinks = function(){
  return symlinks;
}

ModuleDependencyTemplateAsResolveName.initSymlinks = function(){
  symlinks = {};
}


module.exports = ModuleDependencyTemplateAsResolveName
