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
    return './' + (name || '').replace("node_modules", nodeModulesName);
  } else {
    return (name || '').replace("node_modules", nodeModulesName);
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
 * 将指定目录资源移动指定根目录下
 * @param {*} projectRoot  根目录
 * @param {*} source 资源文件目录
 */
NameResolve.prototype.moveToProjectRoot = function (projectRoot, source) {
  return path.join(projectRoot, path.relative(projectRoot, source).replace(/(\.\.\\)|(\.\.\/)/g, ''));
}

module.exports = new NameResolve();