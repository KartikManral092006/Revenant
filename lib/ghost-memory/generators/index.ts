// Registry and entry point for the Graveyard input generators.
import { deepExtendGenerator } from './deep-extend.js';
import { lodashPickGenerator } from './lodash.pick.js';
import { lodashSetGenerator } from './lodash.set.js';
import { stringGenerator } from './string.js';
import {
  generateWith,
  type GenerateOptions,
  type GeneratedInputs,
  type GeneratorManifest,
  type PackageGenerator,
} from './common.js';

export type { GenerateOptions, GeneratedInput, GeneratedInputs, GeneratorManifest, PackageGenerator } from './common.js';

export const GENERATORS: Readonly<Record<string, PackageGenerator>> = {
  'lodash.set': lodashSetGenerator,
  'lodash.pick': lodashPickGenerator,
  'deep-extend': deepExtendGenerator,
  string: stringGenerator,
};

/**
 * Serialized inputs for one export of a Graveyard package. Same manifest, export, seed and n
 * give the same list. `seed` defaults to the manifest seed.
 */
export function generateInputs(
  manifest: GeneratorManifest,
  exportName: string,
  n: number,
  options?: GenerateOptions,
): GeneratedInputs {
  const generator = Object.prototype.hasOwnProperty.call(GENERATORS, manifest.name)
    ? GENERATORS[manifest.name]
    : undefined;
  if (!generator) throw new Error(`No generator for package "${manifest.name}"`);
  return generateWith(generator, manifest, exportName, n, options);
}
