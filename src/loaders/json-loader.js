const fs = require('fs');

module.exports = function (content, b, c) {
  const resource = (this._module.resource);
  if (fs.existsSync(resource)) {
    return fs.readFileSync(resource, 'utf8').toString() || '{}';
  }
  return '{}';
}