const vm = require('vm');

module.exports = function (content) {
  const script = new vm.Script(content, { displayErrors: true });
  const sandbox = {
    __webpack_public_path__: '',
    module: {},
  };
  script.runInNewContext(sandbox);
  return sandbox.module.exports.toString();
}