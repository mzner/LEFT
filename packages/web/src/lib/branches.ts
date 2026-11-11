import { versionNumber, type LinkedPr, type RepoInfo, type RepoName, type TicketReport } from '@ocis-dashboard/core';
import { formatRange } from './format';

export type BranchRowStatus = 'merged' | 'included' | 'open' | 'missing' | 'closed';

/** One line of a ticket's branch list: where its fix is (or isn't) on one branch. */
export interface BranchRow {
  repo: RepoName;
  branch: string;
  /** The repo's default branch (`master`, `main`). */
  defaultBranch: string;
  isDefault: boolean;
  status: BranchRowStatus;
  /** For `included`: the default-branch PRs the branch already contains; otherwise PRs into this branch. */
  prs: LinkedPr[];
  /** False for backports that no fix version asked for. */
  required: boolean;
  /** When the branch was cut, for `included`. */
  branchPoint?: string;
  /** A feature branch (neither the default nor a release branch) the ticket's PRs target. */
  isFeature?: boolean;
  /** Set when `status` is `missing` but a dependency's fix is already covered by this repo's go.mod pin. */
  pinnedVia?: { repo: RepoName; version: string };
  /** Set when `status` is `missing` and this repo's dependency already has the fix here. */
  crossRepoGap?: RepoName;
}

/**
 * The branches that matter for one ticket, per repo: the default branch (if it
 * has PRs, or if the ticket has no PR at all), then the stable branches its fix
 * versions need or that it was backported to, newest first.
 */
export function branchRows(report: TicketReport, repos: RepoInfo[]): BranchRow[] {
  const used = new Set([
    ...report.prs.map((linked) => linked.pr.repo),
    ...report.coverage.map((c) => c.repo),
  ]);
  const shown = repos.filter((repo) => used.has(repo.name));
  const primary = repos[0];
  if (shown.length === 0 && primary) {
    return [
      {
        repo: primary.name,
        branch: primary.defaultBranch,
        defaultBranch: primary.defaultBranch,
        isDefault: true,
        status: 'missing',
        prs: [],
        required: true,
      },
    ];
  }

  return shown.flatMap((repo) => {
    const mainPrs = report.prs.filter((l) => l.pr.repo === repo.name && l.intoDefault);
    const rows: BranchRow[] = [];
    if (mainPrs.length > 0) {
      rows.push({
        repo: repo.name,
        branch: repo.defaultBranch,
        defaultBranch: repo.defaultBranch,
        isDefault: true,
        status: mainStatus(mainPrs),
        prs: mainPrs,
        required: true,
      });
    }

    // PRs into feature branches: shown on their own line, so they never pass for merged into master.
    const featurePrs = report.prs.filter(
      (l) => l.pr.repo === repo.name && !l.intoDefault && !l.isBackport,
    );
    for (const branch of [...new Set(featurePrs.map((l) => l.pr.baseRef))].sort()) {
      const prs = featurePrs.filter((l) => l.pr.baseRef === branch);
      rows.push({
        repo: repo.name,
        branch,
        defaultBranch: repo.defaultBranch,
        isDefault: false,
        status: mainStatus(prs),
        prs,
        required: false,
        isFeature: true,
      });
    }

    const coverage = report.coverage
      .filter((c) => c.repo === repo.name)
      .sort((a, b) => b.branch.localeCompare(a.branch, undefined, { numeric: true }));
    for (const c of coverage) {
      const prs =
        c.status === 'included'
          ? mainPrs.filter((l) => c.prNumbers.includes(l.pr.number))
          : report.prs.filter((l) => l.pr.repo === repo.name && l.pr.baseRef === c.branch);
      rows.push({
        repo: repo.name,
        branch: c.branch,
        defaultBranch: repo.defaultBranch,
        isDefault: false,
        status: c.status,
        prs,
        required: c.required,
        branchPoint: c.branchPoint,
        pinnedVia: c.pinnedVia,
        crossRepoGap: c.crossRepoGap,
      });
    }
    return rows;
  });
}

/**
 * Why an `included` branch needs no backport, with both dates so it can be
 * checked at a glance: "already in stable-9.0: merged to master 1 Oct 2026,
 * before the branch was cut 12 Oct 2026".
 */
export function includedNote(row: BranchRow): string {
  const merged = row.prs
    .map((l) => l.pr.mergedAt)
    .filter((at): at is string => at !== null)
    .sort()
    .at(-1);
  const mergedText = merged ? ` ${formatRange(merged)}` : '';
  const cutText = row.branchPoint ? ` ${formatRange(row.branchPoint)}` : '';
  return `already in ${row.branch}: merged to ${row.defaultBranch}${mergedText}, before the branch was cut${cutText}`;
}

export interface BranchMatrixColumn {
  key: string;
  label: string;
}

export interface BranchMatrixRow {
  repo: RepoName;
  /** One slot per `BranchMatrix.columns`; `undefined` where this repo has no such branch. */
  cells: (BranchRow | undefined)[];
}

export interface BranchMatrix {
  columns: BranchMatrixColumn[];
  rows: BranchMatrixRow[];
}

/** Column identity: `'default'` for the repo's main branch (named differently per repo), else the branch name. */
const columnKey = (row: BranchRow): string => (row.isDefault ? 'default' : row.branch);

/** The branch name, shortened to just the version for a release branch (`stable-8.2` -> `8.2`). */
function columnLabel(row: BranchRow): string {
  return row.isDefault ? 'default' : versionNumber(row.branch) ?? row.branch;
}

/**
 * Lays `branchRows` out as repo × branch, so the same release branch lines up
 * in the same column across repos instead of each repo listing its own
 * branches independently; newest branch first, `default` always first.
 */
export function branchMatrix(rows: BranchRow[]): BranchMatrix {
  const columns: BranchMatrixColumn[] = [];
  const seenColumns = new Set<string>();
  for (const row of rows) {
    const key = columnKey(row);
    if (!seenColumns.has(key)) {
      seenColumns.add(key);
      columns.push({ key, label: columnLabel(row) });
    }
  }
  columns.sort((a, b) => {
    if (a.key === 'default') return -1;
    if (b.key === 'default') return 1;
    return b.key.localeCompare(a.key, undefined, { numeric: true });
  });
  const columnIndex = new Map(columns.map((c, i) => [c.key, i]));

  const repoRows = new Map<RepoName, BranchMatrixRow>();
  for (const row of rows) {
    let group = repoRows.get(row.repo);
    if (!group) {
      group = { repo: row.repo, cells: columns.map(() => undefined) };
      repoRows.set(row.repo, group);
    }
    group.cells[columnIndex.get(columnKey(row))!] = row;
  }
  return { columns, rows: [...repoRows.values()] };
}

/** `missing` with a `pinnedVia` counts as covered for display, even though no dedicated PR exists. */
export function displayStatus(row: BranchRow): BranchRowStatus {
  return row.pinnedVia ? 'included' : row.status;
}

const GLYPH: Record<BranchRowStatus, string> = {
  merged: '✓',
  included: '✓',
  open: '~',
  // '⚠' renders as a colour emoji on most platforms, ignoring the CSS colour below; a plain
  // glyph is needed so a missing (error-severity) backport actually shows red, not amber.
  missing: '✗',
  closed: '·',
};

export function branchGlyph(row: BranchRow): string {
  return GLYPH[displayStatus(row)];
}

function mainStatus(prs: LinkedPr[]): BranchRowStatus {
  if (prs.some((l) => l.pr.state === 'merged')) return 'merged';
  if (prs.some((l) => l.pr.state === 'open')) return 'open';
  return 'closed';
}

/** At most `limit` PRs to show inline, merged/open before closed; the rest are counted. */
export function visiblePrs(prs: LinkedPr[], limit = 2): { shown: LinkedPr[]; hidden: number } {
  const rank = { merged: 0, open: 1, closed: 2 } as const;
  const sorted = [...prs].sort((a, b) => rank[a.pr.state] - rank[b.pr.state]);
  return { shown: sorted.slice(0, limit), hidden: Math.max(0, sorted.length - limit) };
}

export interface BackportFix {
  repo: RepoName;
  sha: string;
  /** Missing required branches' version numbers, oldest first, e.g. ['8.1', '9.0']. */
  versions: string[];
}

/** A real gap: required, missing, and not already covered by a dependency's go.mod pin. */
const isGap = (row: BranchRow) => row.required && row.status === 'missing' && !row.pinnedVia;

/**
 * One `/backport` command per repo that has a resolvable gap: a missing required branch with a
 * commit to cherry-pick from — that repo's own default-branch fix if it has one, else its most
 * recently merged PR on any branch. A repo with a gap but no such commit is left out, not
 * returned as a null entry (nothing to copy in that case; other repos' gaps don't help either,
 * e.g. a cross-repo go.mod-pin gap needs a dependency bump, not a cherry-pick).
 */
export function backportFixes(rows: BranchRow[]): BackportFix[] {
  const repos = [...new Set(rows.map((r) => r.repo))];
  return repos
    .map((repo) => fixForRepo(rows.filter((r) => r.repo === repo)))
    .filter((fix): fix is BackportFix => fix !== null);
}

/** The fix for one cell: the single version it's missing, same sha-resolution rules as above. */
export function backportFixForBranch(rows: BranchRow[], target: BranchRow): BackportFix | null {
  if (!isGap(target)) return null;
  const version = versionNumber(target.branch);
  if (!version) return null;
  const sha = sourceSha(rows.filter((r) => r.repo === target.repo));
  return sha ? { repo: target.repo, sha, versions: [version] } : null;
}

/** This repo's missing required versions (oldest first) and a commit to cherry-pick them from. */
function fixForRepo(repoRows: BranchRow[]): BackportFix | null {
  const versions = [
    ...new Set(
      repoRows
        .filter(isGap)
        .map((r) => versionNumber(r.branch))
        .filter((v): v is string => v !== null),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (versions.length === 0) return null;

  const sha = sourceSha(repoRows);
  return sha ? { repo: repoRows[0]!.repo, sha, versions } : null;
}

/** That repo's default-branch fix if it has one, else its most recently merged PR on any branch. */
function sourceSha(repoRows: BranchRow[]): string | null {
  const defaultRow = repoRows.find((r) => r.isDefault && r.status === 'merged');
  const prs = defaultRow ? defaultRow.prs : repoRows.flatMap((r) => r.prs);
  const merged = prs
    .filter((l) => l.pr.state === 'merged' && l.pr.mergeCommitSha)
    .sort((a, b) => (a.pr.mergedAt ?? '').localeCompare(b.pr.mergedAt ?? ''));
  return merged.at(-1)?.pr.mergeCommitSha ?? null;
}

/** What each branch state means, for the tooltip on it. */
export function statusHelp(row: BranchRow): string {
  if (row.isFeature) {
    return `A feature branch: the fix is not in ${row.defaultBranch} until it is merged there.`;
  }
  if (row.pinnedVia) {
    return (
      `No dedicated backport, but ${row.pinnedVia.repo}'s fix on ${row.branch} is already pulled ` +
      `in via this repo's go.mod pin of ${row.pinnedVia.repo}@${row.pinnedVia.version}.`
    );
  }
  switch (row.status) {
    case 'merged':
      return `A PR of this ticket into ${row.branch} is merged.`;
    case 'included':
      return `Already on ${row.branch}: the fix was merged to ${row.defaultBranch} before ${row.branch} was cut, so no backport is needed.`;
    case 'open':
      return `A PR of this ticket into ${row.branch} is open, not merged yet.`;
    case 'closed':
      return `The only PRs into ${row.branch} were closed without merging.`;
    case 'missing':
      if (row.crossRepoGap) {
        return (
          `No PR of this ticket targets ${row.branch} yet, but ${row.crossRepoGap} already has ` +
          `this fix there — check whether this repo's go.mod pin of it needs bumping.`
        );
      }
      return row.isDefault
        ? `No PR of this ticket targets ${row.branch}.`
        : `No PR of this ticket targets ${row.branch}, and the fix came after ${row.branch} was cut.`;
  }
}
