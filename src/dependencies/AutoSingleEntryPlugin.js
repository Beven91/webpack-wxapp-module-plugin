/*
  MIT License http://www.opensource.org/licenses/mit-license.php
  Author Tobias Koppers @sokra
*/

"use strict";

const EntryDependency = require("webpack/lib/dependencies/EntryDependency");

/** @typedef {import("./Compiler")} Compiler */
/** @typedef {import("./Entrypoint").EntryOptions} EntryOptions */

class AutoSingleEntryPlugin {
  /**
   * An entry plugin which will handle
   * creation of the EntryDependency
   *
   * @param {string} context context path
   * @param {string} entry entry path
   * @param {EntryOptions | string} options entry options (passing a string is deprecated)
   */
  constructor(context, entry, options, needRemovedEntries) {
    this.context = context;
    this.entry = entry;
    this.options = options || "";
    this.needRemovedEntries = needRemovedEntries || {};
  }

  /**
   * Apply the plugin
   * @param {Compiler} compiler the compiler instance
   * @returns {void}
   */
  apply(compiler) {
    compiler.hooks.compilation.tap(
      "AutoSingleEntryPlugin",
      (compilation, { normalModuleFactory }) => {
        compilation.dependencyFactories.set(
          EntryDependency,
          normalModuleFactory
        );
      }
    );

    compiler.hooks.make.tapAsync("AutoSingleEntryPlugin", (compilation, callback) => {
      const { entry, options, context } = this;
      if (this.needRemovedEntries[options]) {
        callback();
        return;
      }

      const dep = AutoSingleEntryPlugin.createDependency(entry, options);
      compilation.addEntry(context, dep, options, err => {
        callback(err);
      });
    });
  }

  /**
   * @param {string} entry entry request
   * @param {EntryOptions | string} options entry options (passing string is deprecated)
   * @returns {EntryDependency} the dependency
   */
  static createDependency(entry, options) {
    const dep = new EntryDependency(entry);
    // TODO webpack 6 remove string option
    dep.loc = { name: typeof options === "object" ? options.name : options };
    return dep;
  }
}

module.exports = AutoSingleEntryPlugin;
