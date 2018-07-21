var path = require('path');

function NameResolve(nodeModulesName) {
}

NameResolve.prototype.getChunkName = function (name, nodeModulesName) {
  name = name || '';
  if (name.indexOf('..' + path.sep) > -1) {
    name = name.replace(/(\.\.\\)|(\.\.\/)/g, '');
  }
  return (name || '').replace("node_modules", nodeModulesName);
}

module.exports = new NameResolve();