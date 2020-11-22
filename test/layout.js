const fs = require('fs');
const path = require('path');
const layoutLoader = require('../layout-loader');

const file = path.join(__dirname, './sources/pages/index/index.wxml');
const content = fs.readFileSync(file).toString('utf-8');

const ctx = {

  options:{
    // component:'layout-master'
  },

  dependencies: [],

  context: path.resolve('test/sources'),

  resourcePath:file,

  async() {
    return (err, content) => {
      console.log('dependencies:', this.dependencies);
      if (err) {
        console.error(err);
      } else {
        console.log(content);
      }
    }
  },

  addDependency(id) {
    console.log('add dependencies', id);
    this.dependencies.push(id);
  },

  loadModule(request, callback) {
    callback(null, request);
  },
}

const out = layoutLoader.call(ctx, content);

console.log(out);
