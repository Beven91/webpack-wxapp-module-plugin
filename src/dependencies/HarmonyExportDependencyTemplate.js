const ConcatenationScope = require("webpack/lib/ConcatenationScope");
const RuntimeGlobals = require("webpack/lib/RuntimeGlobals");
const HarmonyExportInitFragment = require("./NodeHarmonyExportInitFragment");
const NullDependency = require("webpack/lib/dependencies/NullDependency");
const ModuleDependencyTemplateAsResolveName = require('./ModuleDependencyTemplateAsResolveName');

class HarmonyExportDependencyTemplate extends NullDependency.Template {
	/**
	 * @param {Dependency} dependency the dependency for which the template should be applied
	 * @param {ReplaceSource} source the current replace source which can be modified
	 * @param {DependencyTemplateContext} templateContext the context object
	 * @returns {void}
	 */
	apply(
		dependency,
    source,
    options,
	) {
    const module = options.module;
    const moduleGraph = options.moduleGraph;
    const runtimeTemplate = options.runtimeTemplate;
    const runtimeRequirements = options.runtimeRequirements;
    const initFragments = options.initFragments;
    const runtime = options.runtime;
    const concatenationScope = options.concatenationScope;
		const dep = /** @type {HarmonyExportExpressionDependency} */ (dependency);
		const { declarationId } = dep;
		const exportsName = module.exportsArgument;
		if (declarationId) {
			let name;
			if (typeof declarationId === "string") {
				name = declarationId;
			} else {
				name = ConcatenationScope.DEFAULT_EXPORT;
				source.replace(
					declarationId.range[0],
					declarationId.range[1] - 1,
					`${declarationId.prefix}${name}${declarationId.suffix}`
				);
			}

			if (concatenationScope) {
				concatenationScope.registerExport("default", name);
			} else {
				const used = moduleGraph
					.getExportsInfo(module)
					.getUsedName("default", runtime);
				if (used) {
					const map = new Map();
					map.set(used, `/* export default binding */ ${name}`);
					initFragments.push(new HarmonyExportInitFragment(exportsName, map));
				}
			}

			source.replace(
				dep.rangeStatement[0],
				dep.range[0] - 1,
				`/* harmony default export */ ${dep.prefix}`
			);
		} else {
			let content;
			const name = ConcatenationScope.DEFAULT_EXPORT;
			if (runtimeTemplate.supportsConst()) {
				content = `/* harmony default export */ const ${name} = `;
				if (concatenationScope) {
					concatenationScope.registerExport("default", name);
				} else {
					const used = moduleGraph
						.getExportsInfo(module)
						.getUsedName("default", runtime);
					if (used) {
						runtimeRequirements.add(RuntimeGlobals.exports);
						const map = new Map();
						map.set(used, name);
						initFragments.push(new HarmonyExportInitFragment(exportsName, map));
					} else {
						content = `/* unused harmony default export */ var ${name} = `;
					}
				}
			} else if (concatenationScope) {
				content = `/* harmony default export */ var ${name} = `;
				concatenationScope.registerExport("default", name);
			} else {
				const used = moduleGraph
					.getExportsInfo(module)
					.getUsedName("default", runtime);
				if (used) {
					runtimeRequirements.add(RuntimeGlobals.exports);
					// This is a little bit incorrect as TDZ is not correct, but we can't use const.
					content = `/* harmony default export */ ${exportsName}[${JSON.stringify(
						used
					)}] = `;
				} else {
					content = `/* unused harmony default export */ var ${name} = `;
				}
			}
      (new ModuleDependencyTemplateAsResolveName()).apply(dep, source, options)
			if (dep.range) {
				source.replace(
					dep.rangeStatement[0],
					dep.range[0] - 1,
					content + "(" + dep.prefix
				);
				source.replace(dep.range[1], dep.rangeStatement[1] - 0.5, ");");
				return;
			}

      source.replace(dep.rangeStatement[0], dep.rangeStatement[1] - 1, content);
     
		}
	}
};

module.exports = HarmonyExportDependencyTemplate;