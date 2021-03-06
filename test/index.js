const fs = require('fs');
const path = require('path');
const wxmlLoader = require('../wxml-loader');

const content = fs.readFileSync(path.join(__dirname, './sources/demo.wxml')).toString('utf-8');

const ctx = {

  dependencies: [],

  async() {
    return (err, content) => {
      console.log('dependencies:',this.dependencies);
      if (err) {
        console.error(err);
      } else {
        console.log(content);
      }
    }
  },

  addDependency(id) {
    this.dependencies.push(id);
  },

  loadModule(request, callback) {
    callback(null, request);
  },
}

wxmlLoader.call(ctx, content);
