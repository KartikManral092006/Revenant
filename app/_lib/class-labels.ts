// Plain-language labels for behavior groups (classIds). Server-side, pure.
// A classId looks like `<package>:<export>:class:<segment>|<segment>|...`, where the segments follow
// the order of the manifest's `classFeatures`. Unknown segments fall back to their raw text, so a new
// package never breaks the page.

const LABELS: Record<string, Record<string, string>> = {
  pathShape: {
    dot: "Dotted path (a.b)",
    "bracket-index": "Bracket path (a[0])",
    mixed: "Mixed path (a[0].b)",
    empty: "Empty path",
    "proto-path": "Prototype-style path (__proto__)",
  },
  targetType: {
    "plain-object": "a plain object",
    array: "an array",
    primitive: "a number or string",
    "null-or-undefined": "null or undefined",
  },
  inputShape: {
    ascii: "Plain text",
    empty: "Empty text",
    long: "Long text",
    symbols: "Text with symbols",
    whitespace: "Text with extra spaces",
  },
  argShape: {
    arrays: "Arrays",
    nested: "Nested objects",
    "null-or-primitive": "null or a primitive value",
    single: "A single object",
    "two-plain": "Two plain objects",
  },
  outcome: {
    returned: "returned a value",
    "returned-false": "returned false",
    "threw:TypeError": "threw a TypeError",
    "threw:other": "threw another error",
    timeout: "timed out",
    "prototype-pollution": "changed Object.prototype",
  },
};

const POLLUTION = "prototype-pollution";

function lookup(feature: string | undefined, segment: string): string {
  return (feature && LABELS[feature]?.[segment]) ?? segment;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

function split(classId: string): { exportName: string | null; tail: string } {
  const marker = ":class:";
  const at = classId.indexOf(marker);
  if (at < 0) return { exportName: null, tail: classId };
  const head = classId.slice(0, at).split(":");
  return { exportName: head.length >= 2 ? head[head.length - 1] : null, tail: classId.slice(at + marker.length) };
}

/**
 * Describes one behavior group in plain words. `features` are the manifest feature names in segment
 * order (for example ["pathShape", "targetType", "outcome"]). Never throws; the label is never empty.
 */
export function describeClass(classId: string, features: readonly string[] = []): { label: string; technicalId: string } {
  const { exportName, tail } = split(classId);
  const prefix = exportName && exportName !== "default" ? `${exportName}() · ` : "";
  if (tail === "unclassified") return { label: `${prefix}Inputs that fit no group`, technicalId: classId };

  const parts = tail.split("|").filter((p) => p.length > 0);
  if (parts.length === 0) return { label: classId.length > 0 ? classId : "Unnamed group", technicalId: classId };

  const outcomeIndex = features.indexOf("outcome");
  const outIdx = outcomeIndex >= 0 && outcomeIndex < parts.length ? outcomeIndex : parts.length - 1;
  const outcomeSeg = parts[outIdx];
  const subjects = parts.flatMap((seg, i) => (i === outIdx ? [] : [lookup(features[i], seg)]));

  // The vulnerable group reads better as a property of the path than as a generic "prototype-style path".
  if (outcomeSeg === POLLUTION && parts[0] === "proto-path" && outIdx !== 0) subjects[0] = "Prototype-polluting path";

  const outcome = lookup(outcomeIndex >= 0 ? features[outIdx] : "outcome", outcomeSeg);
  const subject = subjects.length > 0 ? capitalize(subjects.join(" on ")) : "Any input";
  return { label: `${prefix}${subject}: ${outcome}`, technicalId: classId };
}

export interface BehaviorGroup {
  classId: string;
  label: string;
  count: number;
  polluting: boolean;
}

/** Sums counts per classId, labels each group, and sorts largest first (ties by label). */
export function groupClassCounts(
  rows: readonly { classId: string; count: number }[],
  features: readonly string[] = [],
): BehaviorGroup[] {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.classId, (totals.get(r.classId) ?? 0) + Math.max(0, r.count));
  return [...totals]
    .map(([classId, count]) => ({
      classId,
      label: describeClass(classId, features).label,
      count,
      polluting: classId.endsWith(POLLUTION),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
