import {
  BLOCK_REASONS,
  type BlockReason,
  type Readiness,
  type ReleaseTarget,
  type Version,
} from '@ocis-dashboard/core';
import { formatRange, isoDay, plural } from './format';

/** Unreleased first (the next one at the top), then released, newest first. */
export function groupVersions(versions: Version[]): [label: string, versions: Version[]][] {
  const upcoming = versions
    .filter((v) => !v.released)
    // Dated ones by date; undated ones (e.g. "Ghez") after them, in Jira's order.
    .sort((a, b) => (a.releaseDate ?? '9999').localeCompare(b.releaseDate ?? '9999'));
  const released = versions.filter((v) => v.released).reverse();
  return (
    [
      ['Unreleased', upcoming],
      ['Released', released],
    ] as [string, Version[]][]
  ).filter(([, group]) => group.length > 0);
}

/** The version to open when none is chosen: the next one to ship, else the latest released. */
export function defaultVersion(versions: Version[]): Version | undefined {
  return groupVersions(versions)[0]?.[1][0];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Release date 19 Nov 2026, in 12 days", "… 3 days overdue", "Released 28 May 2026". */
export function releaseDateNote(version: Version, now: Date = new Date()): string {
  if (!version.releaseDate) return version.released ? 'Released' : 'No release date in Jira';
  const date = formatRange(version.releaseDate);
  if (version.released) return `Released ${date}`;
  const days = Math.round(
    (Date.parse(`${version.releaseDate}T00:00:00Z`) - Date.parse(`${isoDay(now)}T00:00:00Z`)) /
      DAY_MS,
  );
  if (days === 0) return `Release date ${date}, today`;
  return days > 0
    ? `Release date ${date}, in ${plural(days, 'day')}`
    : `Release date ${date}, ${plural(-days, 'day')} overdue`;
}

/** Which blocking tickets the table shows: none chosen (''), all of them, or one reason. */
export type BlockFilter = '' | 'all' | BlockReason;

export const BLOCK_FILTERS: readonly string[] = ['all', ...BLOCK_REASONS];

/** "Not on stable-9.0" when every repo ships from that branch, else a general label. */
export function reasonLabel(reason: BlockReason, targets: ReleaseTarget[]): string {
  const branches = new Set(targets.map((t) => t.branch));
  switch (reason) {
    case 'not-done':
      return 'Not done in Jira';
    case 'no-pr':
      return 'No PR';
    case 'not-on-branch':
      return branches.size === 1 ? `Not on ${[...branches][0]}` : 'Not on the release branch';
    case 'not-merged':
      return 'PR not merged yet';
  }
}

/** The keys a blocker filter keeps; undefined when no filter is on. */
export function blockFilterKeys(
  readiness: Readiness,
  filter: BlockFilter,
): Set<string> | undefined {
  if (!filter) return undefined;
  return new Set(
    readiness.blocking
      .filter((t) => filter === 'all' || t.blockers.some((b) => b.reason === filter))
      .map((t) => t.key),
  );
}
