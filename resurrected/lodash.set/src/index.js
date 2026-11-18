// Sloppy mode on purpose: the original is not strict, and assignments to read-only
// properties (e.g. Object.prototype via "constructor.prototype") must fail silently.
/**
 * Resurrected lodash.set (rebuild of lodash.set@4.3.2, the lodash method `_.set`).
 * Behavior follows the recorded Ghost Memory, with one intentional difference:
 * writes that would modify a built-in shared prototype are refused
 * (GHSA-p6mc-m468-83gw / CVE-2020-8203).
 */

var MAX_SAFE_INTEGER = 9007199254740991;

var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/;
var reIsPlainProp = /^\w*$/;
var reLeadingDot = /^\./;
var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
var reEscapeChar = /\\(\\)?/g;
var reIsUint = /^(?:0|[1-9]\d*)$/;

var hasOwn = Object.prototype.hasOwnProperty;
var objToString = Object.prototype.toString;

// Shared prototypes that must never be written to through a path.
var PROTECTED = [Object.prototype, Function.prototype, Array.prototype];

function isObject(value) {
  var type = typeof value;
  return !!value && (type === 'object' || type === 'function');
}

function isSymbol(value) {
  return typeof value === 'symbol' ||
    (!!value && typeof value === 'object' && objToString.call(value) === '[object Symbol]');
}

function eq(a, b) {
  return a === b || (a !== a && b !== b);
}

function toStr(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (isSymbol(value)) return Symbol.prototype.toString.call(value);
  var result = value + '';
  return (result === '0' && 1 / value === -Infinity) ? '-0' : result;
}

function toKey(value) {
  if (typeof value === 'string' || isSymbol(value)) return value;
  var result = value + '';
  return (result === '0' && 1 / value === -Infinity) ? '-0' : result;
}

function isIndex(value) {
  return (typeof value === 'number' || reIsUint.test(value)) &&
    value > -1 && value % 1 === 0 && value < MAX_SAFE_INTEGER;
}

function isKey(value, object) {
  if (Array.isArray(value)) return false;
  var type = typeof value;
  if (type === 'number' || type === 'symbol' || type === 'boolean' || value == null || isSymbol(value)) {
    return true;
  }
  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
    (object != null && value in Object(object));
}

var pathCache = new Map();

function stringToPath(input) {
  var string = toStr(input);
  if (pathCache.has(string)) return pathCache.get(string);
  var result = [];
  if (reLeadingDot.test(string)) result.push('');
  string.replace(rePropName, function (match, number, quote, quoted) {
    result.push(quote ? quoted.replace(reEscapeChar, '$1') : (number || match));
  });
  pathCache.set(string, result);
  return result;
}

function castPath(value) {
  return Array.isArray(value) ? value : stringToPath(value);
}

function isProtected(target) {
  return PROTECTED.indexOf(target) !== -1;
}

function assignValue(object, key, value) {
  var current = object[key];
  if (!(hasOwn.call(object, key) && eq(current, value)) ||
      (value === undefined && !(key in object))) {
    object[key] = value;
  }
}

function baseSet(object, path, value) {
  if (!isObject(object)) return object;

  path = isKey(path, object) ? [path] : castPath(path);

  var index = -1;
  var length = path.length;
  var lastIndex = length - 1;
  var nested = object;

  while (nested != null && ++index < length) {
    var key = toKey(path[index]);

    // Intentional difference: never write onto a shared built-in prototype.
    // Object.prototype's own `__proto__` is allowed through because its prototype is
    // immutable: the write cannot change anything and fails exactly as the original does.
    if (isProtected(nested) && !(nested === Object.prototype && key === '__proto__')) {
      return object;
    }
    var newValue = value;

    if (index !== lastIndex) {
      var current = nested[key];
      newValue = isObject(current)
        ? current
        : (isIndex(path[index + 1]) ? [] : {});
    }
    assignValue(nested, key, newValue);
    nested = nested[key];
  }
  return object;
}

function set(object, path, value) {
  return object == null ? object : baseSet(object, path, value);
}

module.exports = set;
