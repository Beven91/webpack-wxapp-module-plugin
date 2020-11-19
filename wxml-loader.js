/**
 * @module WXMLLoader
 * @description wxml 加载器
 */
const parser = require('html5parser');
const loadModule = require('./src/helper/loadModule');

const SyntaxKind = parser.SyntaxKind;

module.exports = function (content) {
  // 开启缓存
  this.cacheable && this.cacheable();
  const done = this.async();
  try {
    const options = this.options || this.query || {};
    // 搜寻所有依赖
    const dependencies = resolveDependencies(content, options);
    // 将所有依赖加载
    Promise
      .all(dependencies.map((dep) => loadModule(dep.request, this)))
      .then(() => done(null, content))
      .catch((ex) => done(ex.stack));
  } catch (ex) {
    console.error(ex);
    done(ex);
  }
}

function resolveDependencies(content, options) {
  const dependencies = [];
  const refKeys = ['src'].concat(options.refKeys || []);
  // 解析wxml内容
  const ast = parser.parse(content, { setAttributeMap: true });
  // 遍历ast
  parser.walk(ast, {
    enter: (node) => {
      // 过滤非标签
      if (SyntaxKind.Tag !== node.type) return;
      // 依赖搜索
      switch (node.name.toLowerCase()) {
        case 'image':
        case 'video':
        case 'audio':
        case 'import':
        case 'wxs':
          // <import src="">
          addDependency(dependencies, node.attributeMap['src'], node);
          break;
        default:
          addDependency(dependencies, getRefValue(node, refKeys), node);
          break;
      }
    },
  });
  return dependencies;
}

function addDependency(dependencies, attr, node) {
  if (!attr || !attr.value.value || /\{\{/.test(attr.value.value)) {
    // 如果已存在相同依赖，且依赖是一个动态变量值
    return;
  }
  dependencies.push({
    request: attr.value.value,
    attr: attr,
    node: node,
  });
}

function getRefValue(node, refKeys) {
  for (let i = 0, k = refKeys.length; i < k; i++) {
    const value = node.attributeMap[refKeys[i]];
    if (value) {
      return value;
    }
  }
}