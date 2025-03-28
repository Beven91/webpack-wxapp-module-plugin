/**
 * @module WXMLLoader
 * @description wxml 加载器
 */
const fs = require('fs');
const parser = require('html5parser');
const path = require('path');
const loadModule = require('./src/helper/loadModule');
const Runtime = require('./src/runtime');

const SyntaxKind = parser.SyntaxKind;

module.exports = function (content) {
  const done = this.async();
  try {
    const options = this.getOptions();
    // 搜寻所有依赖
    const dependencies = resolveDependencies(content, options, this.resourcePath);
    const needModify = !!dependencies.find((m) => m.useRootRelative);
    const runtime = { offset: 0, elements: null };
    if (needModify) {
      runtime.elements = content.split('');
    }
    // 将所有依赖加载
    Promise
      .all(dependencies.map((dep) => {
        return loadModule(dep.request, this, dep.useRootRelative).then((src) => {
          if (dep.useRootRelative) {
            // 如果需要替换
            const valueAttr = dep.attr.value;
            const value = valueAttr.value;
            const count = valueAttr.end - valueAttr.start;
            const start = valueAttr.start + runtime.offset;
            const prefix = valueAttr.quote ? valueAttr.quote : '';
            const suffix = valueAttr.quote ? valueAttr.quote : value[value.length - 1];
            runtime.elements.splice(start, count, prefix + src + suffix);
            runtime.offset = runtime.offset + (1 - count);
          }
        })
      }))
      .then(() => {
        return done(null, needModify ? runtime.elements.join('') : content)
      })
      .catch((ex) => done(ex.stack));
  } catch (ex) {
    console.error(ex);
    done(ex);
  }
}

function getAttributeSrc(attr, resourcePath) {
  attr = attr || {};
  let url = attr.value ? attr.value.value : ''
  if (!attr || !url || /\{\{/.test(url) || /^(https|http)/.test(url)) {
    // 如果已存在相同依赖，且依赖是一个动态变量值
    return;
  }
  const rootRegexp = /^\//;
  if (rootRegexp.test(url)) {
    const absoluteUrl = path.join(Runtime.appRoot, url.replace(rootRegexp, ''));
    const context = path.dirname(resourcePath);
    url = path.relative(context, absoluteUrl);
  }
  return url;
}

function resolveDependencies(content, options, resourcePath) {
  const dependencies = [];
  const refKeys = ['src'].concat(options.refKeys || []);
  const resolve = options.resolve;
  const ctx = {
    resourcePath: resourcePath,
    resolveAttribute: (attr) => {
      return getAttributeSrc(attr, resourcePath);
    },
    resolvePath: (request) => {
      const id = path.join(path.dirname(resourcePath), request)
      if (fs.existsSync(id)) {
        return id;
      }
      return null;
    },
    addDependency: (attr, node, useRootRelative) => {
      addDependency(dependencies, attr, node, resourcePath, useRootRelative)
    },
    addAsset: (url, node) => {
      if (!ctx.resolvePath(url)) return;
      const attr = { value: { value: url } };
      addDependency(dependencies, attr, node, resourcePath, false)
    }
  }
  // 解析wxml内容
  const ast = parser.parse(content, { setAttributeMap: true });
  // 遍历ast
  parser.walk(ast, {
    enter: (node) => {
      // 过滤非标签
      if (SyntaxKind.Tag !== node.type) return;
      const resolved = typeof resolve == 'function' ? resolve(node, ctx) : false;
      if (resolved) {
        // 如果自定义标签映射
        return;
      }
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
          refKeys.forEach((item) => {
            item = typeof item == 'string' ? { key: item } : item;
            const key = item.key;
            const value = node.attributeMap[key];
            if (!value) return;
            addDependency(dependencies, node.attributeMap[key], node, resourcePath, item.useRootRelative);
          })
          break;
      }
    },
  });
  return dependencies;
}

function addDependency(dependencies, attr, node, resourcePath, useRootRelative) {
  const url = getAttributeSrc(attr, resourcePath);
  if (!url) return;
  dependencies.push({
    request: url,
    attr: attr,
    node: node,
    useRootRelative: useRootRelative
  });
}