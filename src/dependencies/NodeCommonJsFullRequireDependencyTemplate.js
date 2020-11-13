const ModuleDependencyTemplateAsResolveName = require('./ModuleDependencyTemplateAsResolveName');
const propertyAccess = require("webpack/lib/util/propertyAccess");

class CommonJsFullRequireDependency {
  apply(
    dependency,
    source,
    options,
  ) {
    const moduleGraph = options.moduleGraph;
    const runtime = options.runtime;
    const importedModule = moduleGraph.getModule(dependency);
    const resolver = new ModuleDependencyTemplateAsResolveName();
    const sourcePath = options.module.resource;
    const request = dependency.request;
    const content = resolver.resolve(request, sourcePath, importedModule);
    let requireExpr = `require('${content}')`;
    const ids = dependency.names;
    const usedImported = moduleGraph.getExportsInfo(importedModule).getUsedName(ids, runtime);
    if (usedImported) {
      requireExpr += `${propertyAccess(usedImported)}`;
    }
    source.replace(dependency.range[0], dependency.range[1] - 1, requireExpr);
  }
}

module.exports = CommonJsFullRequireDependency;