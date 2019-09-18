var NameResolve = require('./src/dependencies/NameResolve');

module.exports = function (content) {
  return content.replace(/_\//g, '').replace(/node_modules/g, NameResolve.nodeModulesName);
}