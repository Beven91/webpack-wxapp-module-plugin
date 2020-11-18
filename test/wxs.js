const fs = require('fs');
const path = require('path');
const wxsLoader = require('../wxs-loader');

const content = fs.readFileSync(path.join(__dirname, './sources/demo.wxs')).toString('utf-8');

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

wxsLoader.call(ctx, content);
