const RuntimeTemplate = require('webpack/lib/RuntimeTemplate');
const ModuleDependencyTemplateAsResolveName = require('./ModuleDependencyTemplateAsResolveName');
const { handleDependencyBase } = require("webpack/lib/dependencies/CommonJsDependencyHelpers");
const propertyAccess = require("webpack/lib/util/propertyAccess");

class CommonJsExportRequireDependency extends RuntimeTemplate {

  apply(
    dependency,
    source,
    {
      module,
      moduleGraph,
      runtimeRequirements,
      runtime
    }
  ) {

    const dep = /** @type {CommonJsExportRequireDependency} */ (dependency);
    const used = moduleGraph
      .getExportsInfo(module)
      .getUsedName(dep.names, runtime);

    const [type, base] = handleDependencyBase(
      dep.base,
      module,
      runtimeRequirements
    );

    const importedModule = moduleGraph.getModule(dependency);
    const resolver = new ModuleDependencyTemplateAsResolveName();
    const sourcePath = module.resource;
    const request = dependency.request;
    const content = resolver.resolve(request, sourcePath, importedModule);
    let requireExpr = `require('${content}')`;

    switch (type) {
      case "expression":
        source.replace(
          dep.range[0],
          dep.range[1] - 1,
          used
            ? `${base}${propertyAccess(used)} = ${requireExpr}`
            : `/* unused reexport */ ${requireExpr}`
        );
        return;
      case "Object.defineProperty":
        throw new Error("TODO");
      default:
        throw new Error("Unexpected type");
    }
  }
}

module.exports = CommonJsExportRequireDependency;

