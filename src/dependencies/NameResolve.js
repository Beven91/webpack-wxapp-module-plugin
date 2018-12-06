var path = require('path');

function NameResolve(nodeModulesName) {

}

/**
 * 返回输出的chunk名称，这里会渲染node_modules 到指定的名字
 * @param {*} name 
 * @param {*} nodeModulesName 
 */
NameResolve.prototype.getChunkName = function (name, nodeModulesName) {
  name = name || '';
  if (name.indexOf("node_modules") === 0) {
    return '/' + (name || '').replace(/node_modules/g, nodeModulesName);
  } else {
    return (name || '').replace(/node_modules/g, nodeModulesName);
  }
}

/**
 * 返回source相对于projectRoot的目录路径
 * 如果source在projectRoot外，则移动到projectRoot目录下
 * @param {*} projectRoot  根目录
 * @param {*} source 资源文件目录
 */
NameResolve.prototype.getProjectRelative = function (projectRoot, source) {
  return path.relative(projectRoot, this.moveToProjectRoot(projectRoot, source));
}

/**
 * 计算两个模块打包后的相对路径
 * @param {*} projectRoot  根目录
 * @param {*} modulePath 模块完整路径1
 * @param {*} modulePath2 模块完整路径2
 */
NameResolve.prototype.getTargetRelative = function (projectRoot, modulePath, modulePath2) {
  const targetPath1 = path.join(projectRoot, this.getProjectRelative(projectRoot, modulePath));
  const targetPath2 = path.join(projectRoot, this.getProjectRelative(projectRoot, modulePath2));
  return path.relative(targetPath1, targetPath2);
}

/**
 * 将指定目录资源移动指定根目录下
 * @param {*} projectRoot  根目录
 * @param {*} source 资源文件目录
 */
NameResolve.prototype.moveToProjectRoot = function (projectRoot, source) {
  return path.join(projectRoot, path.relative(projectRoot, source).replace(/(\.\.\\)|(\.\.\/)/g, ''));
}

/**
 * 渲染组件引用路径
 */
NameResolve.prototype.usingComponentNormalize = function (usingPath) {
  usingPath = (usingPath || '').trim();
  const isNodeModules = this.isNodeModuleUsing(usingPath);
  return isNodeModules ? 'node_modules/' + usingPath : usingPath;
}

/**
 * 判断 传入路径是否为一个npm模块引用
 */
NameResolve.prototype.isNodeModuleUsing = function (componentPath) {
  return !(componentPath.indexOf('../') === 0 || componentPath.indexOf('./') === 0 || componentPath.indexOf('/') === 0)
}

module.exports = new NameResolve();