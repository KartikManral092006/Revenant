// string@3.3.3: the receiver string is the first argument. Strings are bounded (at most 300
// characters) so a ReDoS shows up as a timeout on a single call rather than stalling the run.
// `truncate` takes (receiver, length, chars): its second argument mixes numbers and strings.
import fc from 'fast-check';
import { anyValueArb, argsFromSpecs, stringArb, type PackageGenerator } from './common.js';

const lengthOrStringArb = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: -2, max: 40 }) },
  { weight: 1, arbitrary: stringArb },
  { weight: 1, arbitrary: anyValueArb },
);

export const stringGenerator: PackageGenerator = {
  package: 'string',
  argsArbitrary(manifest, exportName, arity) {
    if (exportName === 'truncate' && arity === 3) {
      return fc.tuple(stringArb, lengthOrStringArb, fc.oneof(stringArb, fc.constant(null), fc.constant(undefined)));
    }
    return argsFromSpecs(manifest.generator.argSpecs, arity);
  },
};
