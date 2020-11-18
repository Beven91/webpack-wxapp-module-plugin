
module.exports = function (id, ctx) {
  return new Promise((resolve, reject) => {
    ctx.addDependency(id);
    ctx.loadModule(id, (err, src) => {
      return err ? reject(err) : resolve(src)
    });
  });
}