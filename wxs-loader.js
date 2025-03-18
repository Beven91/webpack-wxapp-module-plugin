/**
 * @module WXSLoader
 * @description 用于加载wxs
 */
const babel = require('@babel/core');
const loadModule = require('./src/helper/loadModule');

module.exports = function (source, sourceMap) {
  // 异步处理
  const done = this.async();
  try {
    // 搜寻所有依赖
    const dependencies = resolveDependencies(source);
    // 将所有依赖加载
    Promise
      .all(dependencies.map((id) => loadModule(id, this)))
      .then(() => done(null, source))
      .catch((ex) => done(ex.stack));
  } catch (ex) {
    console.error(ex);
    done(ex);
  }
}

function resolveDependencies(source) {
  const dependencies = {};
  babel.transform(source, {
    babelrc: false,
    configFile: false,
    plugins: [
      ({ types: t }) => {
        return {
          name: 'wxs-loader',
          visitor: {
            CallExpression(path) {
              if (path.node.callee.name === 'require') {
                dependencies[path.node.arguments[0].value] = true;
              }
            }
          }
        }
      },
    ],
  });
  return Object.keys(dependencies);
}

