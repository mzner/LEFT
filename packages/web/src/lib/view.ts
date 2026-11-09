import type { FlagCode, MatchSource, RepoName, TicketReport } from '@ocis-dashboard/core';
import { matchesAssignee, type AssigneeFilter } from './assignee-filter';

export interface FlagMeta {
  /** Short name for chips and filters. */
  label: string;
  /** What to do about it, shown in the ticket details. */
  hint: string;
}

export const FLAGS: Record<FlagCode, FlagMeta> = {
  NO_PR: {
    label: 'No PR',
    hint: 'No pull request mentions this ticket and Jira links to none. Put the key in the PR title, or link the PR in Jira.',
  },
  MISSING_BACKPORT: {
    label: 'Backport missing',
    hint: 'A fix version needs this branch, but no pull request targets it.',
  },
  BACKPORT_STALE: {
    label: 'Backport stale',
    hint: 'The backport has been open longer than the limit. Check its CI and review below, and ask a reviewer or fix what blocks it.',
  },
  NOT_LINKED_IN_JIRA: {
    label: 'Not linked in Jira',
    hint: "Add the pull request to the ticket's links in Jira.",
  },
  KEY_MISSING_IN_PR: {
    label: 'No key in PR',
    hint: 'Put the ticket key in the pull request title, for example [OCISDEV-1234].',
  },
  ISSUE_NOT_LINKED: {
    label: 'Issue not linked to PR',
    hint: 'A GitHub issue mentions the ticket, but no PR is linked to it. Add "Fixes owner/repo#N" to the PR description, or link the issue in the PR\'s Development sidebar.',
  },
  PR_OPEN: {
    label: 'PR open',
    hint: 'The pull request is not merged yet.',
  },
  BACKPORT_OPEN: {
    label: 'Backport open',
    hint: 'The backport is not merged yet.',
  },
};

/** Problems that clear up by themselves once a PR is merged; shown in the waiting colour. */
export const isWait = (code: FlagCode) => code === 'PR_OPEN' || code === 'BACKPORT_OPEN';

/** Display order: things to fix first, things to wait for last. */
export const FLAG_ORDER = Object.keys(FLAGS) as FlagCode[];

/** `'all'`, `'attention'` (any flag), `'marked'` (marked fixed by hand) or one flag code. */
export type ProblemFilter = 'all' | 'attention' | 'marked' | FlagCode;

/** Tickets that need or have `branch`, optionally only those where it is missing or open. */
export interface BranchFilter {
  repo: RepoName;
  branch: string;
  which: 'any' | 'missing' | 'open';
}

export interface ReportFilters {
  problem: ProblemFilter;
  assignee: AssigneeFilter;
  myAccountId?: string;
  search: string;
  branch?: BranchFilter | null;
}

export function filterReports<T extends TicketReport & { mark?: { state: string } }>(
  reports: T[],
  filters: ReportFilters,
): T[] {
  const search = filters.search.trim().toLowerCase();
  return reports.filter(
    (report) =>
      matchesProblem(report, filters.problem) &&
      matchesAssignee(filters.assignee, report.ticket.assignee, filters.myAccountId) &&
      matchesBranch(report, filters.branch) &&
      (!search ||
        report.ticket.key.toLowerCase().includes(search) ||
        report.ticket.summary.toLowerCase().includes(search)),
  );
}

function matchesBranch({ coverage }: TicketReport, filter?: BranchFilter | null): boolean {
  if (!filter) return true;
  const entry = coverage.find((c) => c.repo === filter.repo && c.branch === filter.branch);
  if (!entry) return false;
  // Like the flags: missing/open only matter where a fix version asks for the branch.
  return filter.which === 'any' || (entry.required && entry.status === filter.which);
}

export interface BranchOption {
  repo: RepoName;
  branch: string;
  /** Tickets that need or have the branch. */
  total: number;
  missing: number;
  open: number;
}

/** Every stable branch any ticket touches, newest first, with how many tickets are missing it. */
export function branchOptions(reports: TicketReport[]): BranchOption[] {
  const options = new Map<string, BranchOption>();
  for (const { coverage } of reports) {
    for (const c of coverage) {
      const id = `${c.repo}|${c.branch}`;
      const option = options.get(id) ?? {
        repo: c.repo,
        branch: c.branch,
        total: 0,
        missing: 0,
        open: 0,
      };
      option.total++;
      if (c.required && c.status === 'missing') option.missing++;
      if (c.required && c.status === 'open') option.open++;
      options.set(id, option);
    }
  }
  return [...options.values()].sort(
    (a, b) =>
      a.repo.localeCompare(b.repo) ||
      b.branch.localeCompare(a.branch, undefined, { numeric: true }),
  );
}

export function decodeBranchFilter(value: string): BranchFilter | null {
  const [repo, branch, which] = value.split('|');
  if (!repo || !branch || (which !== 'any' && which !== 'missing' && which !== 'open')) return null;
  return { repo, branch, which };
}

function matchesProblem(
  { flags, mark }: TicketReport & { mark?: { state: string } },
  problem: ProblemFilter,
): boolean {
  if (problem === 'all') return true;
  if (problem === 'marked') return mark?.state === 'active';
  if (problem === 'attention') return flags.length > 0;
  return flags.some((flag) => flag.code === problem);
}

export function assignees(reports: TicketReport[]): { id: string; name: string }[] {
  const byId = new Map(
    reports.flatMap(({ ticket }) =>
      ticket.assignee ? [[ticket.assignee.id, ticket.assignee] as const] : [],
    ),
  );
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Number of tickets per flag (a ticket with two missing backports counts once). */
export function flagCounts(reports: TicketReport[]): Map<FlagCode, number> {
  const counts = new Map<FlagCode, number>();
  for (const { flags } of reports) {
    for (const code of new Set(flags.map((flag) => flag.code))) {
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return counts;
}

export function uniqueFlagCodes(report: Pick<TicketReport, 'flags'>): FlagCode[] {
  const codes = new Set(report.flags.map((flag) => flag.code));
  return FLAG_ORDER.filter((code) => codes.has(code));
}

/** How to order the ticket list: Jira's own order, or a date from Jira or GitHub, newest first. */
export type SortKey = 'jira' | 'updated' | 'created' | 'activity' | 'merged';

export const SORT_LABELS: Record<SortKey, string> = {
  jira: 'Jira order',
  updated: 'Updated in Jira',
  created: 'Created in Jira',
  activity: 'Last PR activity',
  merged: 'Last PR merged',
};

/** The date a report is sorted by; undefined for Jira order or when there is none (nothing merged). */
export function sortDate(report: TicketReport, sort: SortKey): string | undefined {
  if (sort === 'updated') return report.ticket.updated || undefined;
  if (sort === 'created') return report.ticket.created || undefined;
  // GitHub's "updated" time moves with pushes, reviews, comments, edits and the merge.
  if (sort === 'activity') return newest(report.prs.map(({ pr }) => pr.updatedAt));
  if (sort === 'merged') return newest(report.prs.map(({ pr }) => pr.mergedAt));
  return undefined;
}

/** Newest first; reports without a date keep their order at the end. Jira order is left as is. */
export function sortReports<T extends TicketReport>(reports: T[], sort: SortKey): T[] {
  if (sort === 'jira') return reports;
  const time = (report: T) => {
    const date = sortDate(report, sort);
    return date ? toTime(date) : -Infinity;
  };
  return reports
    .map((report, index) => ({ report, index, time: time(report) }))
    .sort((x, y) => y.time - x.time || x.index - y.index)
    .map(({ report }) => report);
}

function newest(dates: (string | null)[]): string | undefined {
  return dates.filter((at): at is string => at !== null).sort((x, y) => toTime(y) - toTime(x))[0];
}

/** Jira writes offsets as `+0200`; add the colon so every engine parses it. */
function toTime(iso: string): number {
  return Date.parse(iso.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
}

/** Why a PR belongs to a ticket, in words. */
export const SOURCE_TEXT: Record<MatchSource, string> = {
  title: 'key in the title',
  branch: 'key in the branch name',
  'jira-link': 'linked from Jira',
  'backport-of': 'says it backports a PR of this ticket',
};

/**
 * "1 problem" for a ticket Jira calls done but that still has something to fix;
 * undefined otherwise. Waiting problems (an open PR) don't count: done means merged.
 */
export function doneButUnfinished(report: TicketReport): string | undefined {
  if (report.ticket.statusCategory !== 'done') return undefined;
  const open = report.flags.filter((flag) => flag.severity === 'error').length;
  return open > 0 ? (open === 1 ? '1 problem' : `${open} problems`) : undefined;
}
