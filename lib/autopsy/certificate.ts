/**
 * Death Certificate assembly. `assembleCertificate` is pure: it takes the
 * results of the four source clients and never invents a value. A failed
 * source becomes an `unknown` field with its reason.
 * `buildCertificate` calls the clients and then assembles.
 */
import { fetchWeeklyDownloads } from './downloads';
import { fetchRepoInfo, type GithubClientOptions, type RepoInfo, type RepoLookup } from './github';
import { known, unknownField, type Field, type HttpResult } from './http';
import { fetchNpmInfo, type NpmInfo } from './npm';
import { fetchVulnerabilities, type Vulnerability } from './osv';

export const MONOREPO_NOTE = 'source repo is the lodash monorepo';
export const INACTIVE_MONTHS = 24;

export interface DeathCertificate {
  package: string;
  version: string;
  fetchedAt: string;
  source: 'live' | 'snapshot';
  lastPublish: Field<string>;
  inactive: Field<boolean>;
  deprecation: Field<string | null>;
  vulnerabilities: Field<Vulnerability[]>;
  weeklyDownloads: Field<number>;
  repo: Field<RepoInfo> & { note?: string };
  license: Field<string>;
}

export interface CertificateInputs {
  name: string;
  version: string;
  monorepo?: boolean;
  /** Result of the npm registry call. */
  npm: HttpResult<NpmInfo>;
  downloads: HttpResult<number>;
  vulnerabilities: Field<Vulnerability[]>;
  /** Result of the GitHub lookup. */
  repo: RepoLookup;
  now: Date;
  source?: 'live' | 'snapshot';
}

/** Add calendar months in UTC, clamping the day to the end of a shorter month. */
export function addMonthsUtc(date: Date, months: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const targetFirst = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      targetFirst.getUTCFullYear(),
      targetFirst.getUTCMonth(),
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/** True iff more than 24 calendar months have passed between `lastPublish` and `now`. */
export function isInactive(lastPublish: Date, now: Date): boolean {
  return now.getTime() > addMonthsUtc(lastPublish, INACTIVE_MONTHS).getTime();
}

function fromHttp<T>(result: HttpResult<T>, label: string): Field<T> {
  return result.ok ? known(result.value) : unknownField(`${label}: ${result.reason}`);
}

export function assembleCertificate(input: CertificateInputs): DeathCertificate {
  const { npm } = input;
  const npmFail = (): { unknown: true; reason: string } =>
    unknownField(`npm registry: ${npm.ok ? '' : npm.reason}`) as { unknown: true; reason: string };

  const lastPublish: Field<string> = npm.ok ? npm.value.lastPublish : npmFail();
  const deprecation: Field<string | null> = npm.ok ? npm.value.deprecation : npmFail();
  const license: Field<string> = npm.ok ? npm.value.license : npmFail();

  let inactive: Field<boolean>;
  if ('value' in lastPublish) {
    const ms = Date.parse(lastPublish.value);
    inactive = Number.isNaN(ms)
      ? unknownField('last publish date is not a valid timestamp')
      : known(isInactive(new Date(ms), input.now));
  } else {
    inactive = unknownField(`last publish unknown: ${lastPublish.reason}`);
  }

  const repo: DeathCertificate['repo'] = { ...input.repo.repo };
  if (input.monorepo === true) repo.note = MONOREPO_NOTE;

  return {
    package: input.name,
    version: input.version,
    fetchedAt: input.now.toISOString(),
    source: input.source ?? 'live',
    lastPublish,
    inactive,
    deprecation,
    vulnerabilities: input.vulnerabilities,
    weeklyDownloads: fromHttp(input.downloads, 'npm downloads'),
    repo,
    license,
  };
}

export interface BuildCertificateOptions {
  monorepo?: boolean;
  now?: () => Date;
  github?: GithubClientOptions;
  timeoutMs?: number;
}

/** Query all four sources in parallel and assemble the certificate. Never throws on source failure. */
export async function buildCertificate(
  name: string,
  version: string,
  options: BuildCertificateOptions = {},
): Promise<DeathCertificate> {
  const npm = await fetchNpmInfo(name, version);
  const repositoryUrl = npm.ok && 'value' in npm.value.repositoryUrl ? npm.value.repositoryUrl.value : undefined;
  const [downloads, vulnerabilities, repo] = await Promise.all([
    fetchWeeklyDownloads(name),
    fetchVulnerabilities(name, version, { timeoutMs: options.timeoutMs }),
    fetchRepoInfo(repositoryUrl, { timeoutMs: options.timeoutMs, ...options.github }),
  ]);
  const now = (options.now ?? (() => new Date()))();
  return assembleCertificate({
    name,
    version,
    monorepo: options.monorepo,
    npm,
    downloads,
    vulnerabilities,
    repo,
    now,
    source: 'live',
  });
}
