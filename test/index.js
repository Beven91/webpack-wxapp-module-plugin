const fs = require('fs');
const path = require('path');
const wxmlLoader = require('../wxml-loader');

const content = fs.readFileSync(path.join(__dirname, './demo.wxml')).toString('utf-8');

const ctx = {

  dependencies: {},

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
    this.dependencies[id] = id;
  },

  loadModule(request, callback) {
    callback(null, request);
  },
}

wxmlLoader.call(ctx, content);
