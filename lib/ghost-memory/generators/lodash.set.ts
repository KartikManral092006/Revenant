// lodash.set(object, path, value): serializable domain is enough. The target is an object, array,
// primitive or null; the path is a string, key array or non-string; the value is any serializable value.
import { argsFromSpecs, type PackageGenerator } from './common.js';

export const lodashSetGenerator: PackageGenerator = {
  package: 'lodash.set',
  argsArbitrary: (manifest, _exportName, arity) => argsFromSpecs(manifest.generator.argSpecs, arity),
};
