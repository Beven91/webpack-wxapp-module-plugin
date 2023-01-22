/**
 * @module WXMLLoader
 * @description wxml 加载器
 */
const parser = require('html5parser');
const path = require('path');
const loadModule = require('./src/helper/loadModule');
const Runtime = require('./src/runtime');

const SyntaxKind = parser.SyntaxKind;

module.exports = function (content) {
  // 开启缓存
  // this.cacheable && this.cacheable();
  const done = this.async();
  try {
    const options = this.options || this.query || {};
    // 搜寻所有依赖
    const dependencies = resolveDependencies(content, options, this.resourcePath);
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

function resolveDependencies(content, options, resourcePath) {
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
          addDependency(dependencies, node.attributeMap['src'], node, resourcePath);
          break;
        default:
          addDependency(dependencies, getRefValue(node, refKeys), node, resourcePath);
          break;
      }
    },
  });
  return dependencies;
}

function addDependency(dependencies, attr, node) {
  attr = attr || {};
  const url =  attr.value ? attr.value.value : ''
  if (!attr || !url || /\{\{/.test(url) || /^(https|http)/.test(url)) {
    // 如果已存在相同依赖，且依赖是一个动态变量值
    return;
  }
  if (rootRegexp.test(url)) {
    const absoluteUrl = path.join(Runtime.appRoot, url.replace(rootRegexp, ''));
    const context = path.dirname(resourcePath);
    url = path.relative(context, absoluteUrl);
  }
  dependencies.push({
    request: url,
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
