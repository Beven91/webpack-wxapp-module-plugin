const path = require('path');

module.exports = function (id, ctx) {
  return new Promise((resolve, reject) => {
    if (!path.isAbsolute(id)) {
      id = path.join(path.dirname(ctx.resourcePath), id)
    }
    // 添加为依赖文件，用于更新检测
    ctx.addDependency(id);
    // 加载模块,将模块的资源添加到当前模块assets中
    ctx.loadModule(id, (err, content, a, dependency) => {
      if (err) {
        return reject(err);
      }
      const depBuildInfo = dependency.buildInfo;
      const module = ctx._module;
      const buildInfo = module.buildInfo;
      if (!buildInfo.assets) {
        buildInfo.assets = Object.create(null);
        buildInfo.assetsInfo = new Map();
      }
      Object.keys(depBuildInfo.assets || {}).forEach((name) => {
        buildInfo.assets[name] = depBuildInfo.assets[name];
      })
      if (depBuildInfo.assetsInfo) {
        depBuildInfo.assetsInfo.forEach((value, key) => {
          buildInfo.assetsInfo.set(key, value);
        })
      }
      resolve()
    })
  })
}