const HarmonyImportDependency = require('webpack/lib/dependencies/HarmonyImportDependency');
const Template = require('webpack/lib/Template.js');


const getImportVar = HarmonyImportDependency.prototype.getImportVar;

HarmonyImportDependency.prototype.getImportVar = function (moduleGraph) {
	const module = moduleGraph.getParentModule(this);
	const meta = moduleGraph.getMeta(module);
	let importVarMap = meta.importVarMap;
	if (!importVarMap) meta.importVarMap = importVarMap = new Map();
	let importVar = importVarMap.get(moduleGraph.getModule(this));
	if (importVar) return importVar;
	importVar = `${Template.toIdentifier(
		`_${this.userRequest}`
	)}${importVarMap.size}`;
	importVarMap.set(moduleGraph.getModule(this), importVar);
	return importVar;
}

HarmonyImportDependency.prototype.getImportStatement = function(
	update,
	params
) {
	const { runtimeTemplate, chunkGraph, moduleGraph } = params;
	const importVar = this.getImportVar(moduleGraph);
	const originModule = params.module;
	const module = moduleGraph.getModule(this);

	const moduleId = runtimeTemplate.moduleId({
		module,
		chunkGraph,
		request: this.request,
	});
	const exportsType = module.getExportsType(
		chunkGraph.moduleGraph,
		originModule.buildMeta.strictHarmonyModule
	);
	const optDeclaration = update ? "" : "var ";
	const importContent = `/* harmony import */ ${optDeclaration}${importVar} = require(${moduleId});\n`;

	if (exportsType === "dynamic") {
		return [
			importContent,
			`/* harmony import */ ${optDeclaration}${importVar}_default = (()=>${importVar}.default || ${importVar});\n`
		];
	}
	return [importContent, ""];
}

class NodeImportSideEffectDependencyTemplate extends HarmonyImportDependency.Template {


	apply(dependency, source, templateContext) {
		const { moduleGraph, concatenationScope } = templateContext;
		if (concatenationScope) {
			const module = moduleGraph.getModule(dependency);
			if (concatenationScope.isModuleInScope(module)) {
				return;
			}
		}
		super.apply(dependency, source, templateContext);
	}

}

module.exports = NodeImportSideEffectDependencyTemplate;