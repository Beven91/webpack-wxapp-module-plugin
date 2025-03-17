const path = require('path');

module.exports = function (id, ctx) {
  return new Promise((resolve, reject) => {
    let filePath = id;
    if (!path.isAbsolute(id)) {
      filePath = path.join(path.dirname(ctx.resourcePath), id)
    }
    ctx.addDependency(filePath);
    ctx.loadModule(id, (err, src) => {
      return err ? reject(err) : resolve(src)
    });
  });
}