// lodash.pick(object, ...paths): the manifest declares two arguments; rest paths beyond the
// second are not generated, which keeps the argument list equal to the declared arity.
// The serializable domain is enough: neither argument needs a function or a class instance.
import { argsFromSpecs, type PackageGenerator } from './common.js';

export const lodashPickGenerator: PackageGenerator = {
  package: 'lodash.pick',
  argsArbitrary: (manifest, _exportName, arity) => argsFromSpecs(manifest.generator.argSpecs, arity),
};
