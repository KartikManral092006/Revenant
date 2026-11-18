// What each Graveyard package does, in one line. Presentation copy only, so it lives in app/
// rather than in the manifest schema (design open question 3, option a).

export interface PackageCopy {
  oneLiner: string;
  example: string;
}

const COPY: Record<string, PackageCopy> = {
  "lodash.set": { oneLiner: "Sets a value deep inside an object by path.", example: 'set(obj, "a.b", 1)' },
  "lodash.pick": { oneLiner: "Copies only the listed keys from an object.", example: 'pick(obj, ["a", "b"])' },
  string: { oneLiner: "Text helpers such as camelize, slugify and truncate.", example: 'S("hello world").camelize()' },
  "deep-extend": { oneLiner: "Merges objects and arrays into one, recursively.", example: "deepExtend(target, source)" },
};

export function packageCopy(name: string): PackageCopy {
  return COPY[name] ?? { oneLiner: "A small utility package from npm.", example: "" };
}

/** The package the home page points first-time visitors to. */
export const START_HERE = "lodash.set";

export const REPO_URL = "https://github.com/KartikManral092006/Revenant";
