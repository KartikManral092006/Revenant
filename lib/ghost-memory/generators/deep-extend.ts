// deep-extend(target, ...sources): two object arguments from the manifest. Buffers are not
// serializable in the MVP and are left out; plain objects, arrays and primitives are covered.
// The edge cases include a one-argument call.
import { argsFromSpecs, type PackageGenerator } from './common.js';

export const deepExtendGenerator: PackageGenerator = {
  package: 'deep-extend',
  argsArbitrary: (manifest, _exportName, arity) => argsFromSpecs(manifest.generator.argSpecs, arity),
};
