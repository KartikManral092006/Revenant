// Pure, client-safe formatting helpers. No imports from lib/ (client components use these).
// All dates are formatted in UTC so server and browser render the same text.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const DAY_MS = 86_400_000;

function parse(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Aug 2016". Returns the input unchanged when it is not a date. */
export function monthYear(iso: string): string {
  const d = parse(iso);
  return d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : iso;
}

/** "Aug 13, 2016" plus a rounded relative phrase such as "about 10 years ago". */
export function humanDate(iso: string, now: Date): { text: string; relative: string } {
  const d = parse(iso);
  if (!d) return { text: iso, relative: "" };
  const text = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  const days = Math.floor((now.getTime() - d.getTime()) / DAY_MS);
  let relative: string;
  if (days < 0) relative = "in the future";
  else if (days === 0) relative = "today";
  else if (days === 1) relative = "yesterday";
  else if (days < 45) relative = `${days} days ago`;
  else if (days < 365) relative = `about ${Math.max(2, Math.round(days / 30.44))} months ago`;
  else {
    const years = Math.floor(days / 365.25);
    relative = years <= 1 ? "about a year ago" : `about ${years} years ago`;
  }
  return { text, relative };
}

/** "2.0 million", "80 thousand", "950". Used for download counts. */
export function compactCount(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} million`;
  if (n >= 10_000) return `${Math.round(n / 1_000)} thousand`;
  return n.toLocaleString("en-US");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}
