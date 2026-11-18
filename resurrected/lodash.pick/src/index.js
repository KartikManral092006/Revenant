/**
 * Creates an object of the requested own or inherited properties of `object`.
 * Each path is a single property key (no deep paths); arrays of keys in
 * `paths` are flattened one level.
 */
module.exports = function pick(object, ...paths) {
  const result = {};
  if (object == null) {
    return result;
  }
  const source = Object(object);
  const keys = paths.flat(1);
  for (const key of keys) {
    if (key in source) {
      result[key] = source[key];
    }
  }
  return result;
};
