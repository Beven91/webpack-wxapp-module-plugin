/**
 * 名称：webpack 依赖模块引用require模板
 * 日期:2017-06-01
 * 描述：用于替换RequireHeaderDependency.Template 
 *      从而实现 在打包后的文件 不是使用_webpack_require 还是使用require引用模块
 */
var RequireHeaderDependency = require('webpack/lib/dependencies/RequireHeaderDependency.js')

function NodeRequireHeaderDependencyTemplate () {
}

NodeRequireHeaderDependencyTemplate.prototype.apply = function (dep, source) {
  source.replace(dep.range[0], dep.range[1] - 1, 'require')
}

NodeRequireHeaderDependencyTemplate.prototype.applyAsTemplateArgument = function (name, dep, source) {
  source.replace(dep.range[0], dep.range[1] - 1, 'require')
}

RequireHeaderDependency.Template = NodeRequireHeaderDependencyTemplate