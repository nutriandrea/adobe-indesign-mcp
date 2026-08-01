export const JSON_POLYFILL = `
// JSON polyfill for ExtendScript
if (typeof JSON === 'undefined') {
  JSON = {};
}

if (typeof JSON.stringify !== 'function') {
  JSON.stringify = function (obj) {
    var type = typeof obj;
    if (type === 'string') return '"' + obj.replace(/"/g, '\\\\"').replace(/\\n/g, '\\\\n').replace(/\\r/g, '\\\\r').replace(/\\t/g, '\\\\t') + '"';
    if (type === 'number' || type === 'boolean') return String(obj);
    if (obj === null) return 'null';
    if (obj === undefined) return 'null';
    if (type === 'function') return undefined;

    if (obj instanceof Array) {
      var arr = [];
      for (var i = 0; i < obj.length; i++) {
        arr.push(typeof obj[i] !== 'undefined' && obj[i] !== null ? JSON.stringify(obj[i]) : 'null');
      }
      return '[' + arr.join(',') + ']';
    }

    var keys = [];
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty && Object.prototype.hasOwnProperty.call(obj, key)) {
        var val = JSON.stringify(obj[key]);
        if (typeof val !== 'undefined') {
          keys.push(JSON.stringify(key) + ':' + val);
        }
      }
    }
    return '{' + keys.join(',') + '}';
  };
}

if (typeof JSON.parse !== 'function') {
  // NOTE: no eval() here — sanitizeCode() replaces eval( with a comment,
  // which orphaned the parentheses and caused "Expected: ;" parse errors.
  // [].constructor.constructor is Function without matching the
  // sanitizer's /\\bFunction\\s*\\(/ pattern.
  JSON.parse = function (text) {
    var fn = [].constructor.constructor;
    return fn('return (' + text + ')')();
  };
}
`;
