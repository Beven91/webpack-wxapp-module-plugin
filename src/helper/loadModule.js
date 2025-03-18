const path = require('path');
const CommonJsFullRequireDependency = require('webpack/lib/dependencies/CommonJsFullRequireDependency')

module.exports = function (id, ctx) {
  if (!path.isAbsolute(id)) {
    id = path.join(path.dirname(ctx.resourcePath), id)
  }
  const dep = new CommonJsFullRequireDependency(id, [-1, -1]);
  ctx._module.addDependency(dep)
}