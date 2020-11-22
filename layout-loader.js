/**
 * @module LayoutLoader
 * @description 模板页支持
 */
const fs = require('fs-extra');
const path = require('path');

const runtime = {
  mtime: null,
  cachedPages: null
}

module.exports = function (content) {
  this.cacheable && this.cacheable();
  const options = this.options || this.query || {};
  const context = this.context;
  const segments = path.parse(this.resourcePath);
  const pageName = (segments.dir + '/' + segments.name).replace(/\\/g, '/');
  const pages = getAppPages(path.join(context, 'app.json'));
  const layout = path.join(context, 'app.wxml');
  const isPage = pages.indexOf(pageName) > -1;
  if (!isPage) {
    // 如果没有母版页
    return content;
  }
  if (options.component) {
    // 组件模式
    const componentName = options.component;
    return '<' + componentName + '>' + content + '</' + componentName + '>'
  } else if (fs.existsSync(layout)) {
    const template = new String(fs.readFileSync(layout));
    // 模板模式
    this.addDependency(layout);
    return template.replace(/<slot\s+\/>/, content);
  } else {
    return content;
  }
}

function getAppPages(configPath) {
  const stat = fs.statSync(configPath);
  if (runtime.mtime != stat.mtime || !module.cachedPages) {
    runtime.mtime = stat.mtime;
    const appRoot = path.dirname(configPath)
    const config = fs.readJsonSync(configPath);
    const subPackages = config.subPackages || {};
    const pages = [].concat(config.pages || []);
    subPackages.forEach((package) => {
      (package.pages || []).forEach((page) => {
        pages.push(package.root + '/' + page);
      })
    });
    runtime.cachedPages = pages.map((file) => {
      return path.join(appRoot, file).replace(/\\/g, '/');
    });
  }
  return runtime.cachedPages;
}