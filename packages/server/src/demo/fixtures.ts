/**
 * Sample data for demo mode, modelled on real OCISDEV tickets and owncloud/ocis
 * PRs from autumn 2026. Assignee names are made up.
 */
import type {
  Board,
  GitHubIssue,
  PrState,
  PullRequest,
  Sprint,
  Ticket,
  Version,
} from '@ocis-dashboard/core';

export const DEMO_BOARDS: Board[] = [
  { id: 1, name: 'oCIS Scrum' },
  { id: 2, name: 'oCIS QA' },
];

/** Jira's order: oldest first. Ghez ships from master, so it has no number. */
export const DEMO_VERSIONS: Version[] = [
  { id: '10301', name: 'Curie - 8.0.0', released: true, releaseDate: '2025-05-12' },
  { id: '10302', name: 'Deledda - 8.1.0', released: true, releaseDate: '2026-05-28' },
  { id: '10303', name: 'Curie S9 - 8.0.10', released: false, releaseDate: '2026-11-12' },
  { id: '10304', name: 'Frances - 9.0.0', released: false, releaseDate: '2026-11-19' },
  { id: '10305', name: 'Ghez', released: false },
];

export const DEMO_SPRINTS: Record<number, Sprint[]> = {
  1: [
    { id: 28, name: 'Sprint 28', state: 'future', startDate: '2026-11-03', endDate: '2026-11-16' },
    { id: 27, name: 'Sprint 27', state: 'active', startDate: '2026-10-20', endDate: '2026-11-02' },
    { id: 26, name: 'Sprint 26', state: 'closed', startDate: '2026-10-06', endDate: '2026-10-19' },
    { id: 12, name: 'Sprint 12', state: 'closed', startDate: '2025-06-09', endDate: '2025-06-22' },
  ],
  2: [
    {
      id: 91,
      name: 'QA Sprint 9',
      state: 'active',
      startDate: '2026-10-20',
      endDate: '2026-11-02',
    },
  ],
};

const people = {
  me: { id: 'demo', name: 'Demo user' },
  alex: { id: 'u-alex', name: 'Alex Berger' },
  sam: { id: 'u-sam', name: 'Sam Okafor' },
  jordan: { id: 'u-jordan', name: 'Jordan Weiss' },
  robin: { id: 'u-robin', name: 'Robin Keller' },
};

const FRANCES = 'Frances - 9.0.0';
const CURIE = 'Curie S9 - 8.0.10';
const GHEZ = 'Ghez';

export interface DemoTicket extends Ticket {
  sprintId: number;
}

/** A created date that differs per ticket, so sorting by it shows something in the demo. */
const createdFor = (key: string) =>
  `2026-10-${String((Number(key.split('-')[1]) % 20) + 1).padStart(2, '0')}`;

function ticket(
  key: string,
  summary: string,
  details: Partial<Omit<DemoTicket, 'key' | 'summary'>>,
): DemoTicket {
  const status = details.status ?? 'Done';
  return {
    key,
    summary,
    status,
    statusCategory: status === 'Done' ? 'done' : status === 'To Do' ? 'todo' : 'progress',
    issueType: 'Bug',
    url: `https://example.atlassian.net/browse/${key}`,
    assignee: null,
    fixVersions: [],
    remoteLinkUrls: [],
    sprintId: 27,
    created: createdFor(key),
    // `YYYY-MM-DD` is enough here; the date-range selection compares these.
    updated: '2026-10-28',
    ...details,
  };
}

const ocisPr = (n: number) => `https://github.com/owncloud/ocis/pull/${n}`;

export const DEMO_TICKETS: DemoTicket[] = [
  ticket('OCISDEV-1464', 'Show file previews in shared folders', {
    issueType: 'Story',
    assignee: people.alex,
    fixVersions: [FRANCES],
    remoteLinkUrls: [ocisPr(13250), ocisPr(13231), ocisPr(13247)],
  }),
  ticket('OCISDEV-1601', 'Shared links open the wrong folder after login', {
    status: 'In Merge Request',
    assignee: people.me,
    fixVersions: [FRANCES],
    remoteLinkUrls: [ocisPr(13273)],
    updated: '2026-10-30',
  }),
  ticket('OCISDEV-1548', 'Theme settings are not saved on first load', {
    issueType: 'Security Issue',
    status: 'In Merge Request',
    assignee: people.sam,
    fixVersions: [FRANCES, CURIE],
    remoteLinkUrls: [ocisPr(13261)],
  }),
  ticket('OCISDEV-1183', 'Remove noisy debug output from the web client', {
    assignee: people.jordan,
    fixVersions: [FRANCES],
    remoteLinkUrls: [ocisPr(13233)],
    updated: '2026-10-24',
  }),
  ticket('OCISDEV-1581', 'Copy link fails in the file details panel', {
    status: 'In QA',
    assignee: people.me,
    fixVersions: [FRANCES],
    remoteLinkUrls: [ocisPr(13239), ocisPr(13270)],
  }),
  ticket('OCISDEV-1583', 'Restore deleted files with the same name without conflicts', {
    assignee: people.robin,
    fixVersions: [FRANCES],
    remoteLinkUrls: [ocisPr(13238), ocisPr(13269)],
  }),
  ticket('OCISDEV-1589', 'Help menu link points to a page that moved', {
    status: 'In Progress',
    assignee: people.robin,
    fixVersions: [GHEZ],
  }),
  ticket('OCISDEV-1594', 'Simplify the release pipeline', {
    issueType: 'Task',
    status: 'In Merge Request',
    assignee: people.alex,
    fixVersions: [FRANCES],
    remoteLinkUrls: [ocisPr(13262)],
  }),
  ticket('OCISDEV-1392', 'Retry uploads that fail on a busy storage node', {
    assignee: people.sam,
    fixVersions: [GHEZ],
    remoteLinkUrls: [ocisPr(13272), 'https://github.com/owncloud/reva/pull/789'],
  }),
  ticket('OCISDEV-1560', 'Old upload sessions are not cleaned up', {
    status: 'To Do',
    assignee: null,
  }),
  ticket('OCISDEV-1602', 'CLI command rejects space IDs copied from the web UI', {
    status: 'To Do',
    assignee: people.jordan,
    fixVersions: [GHEZ],
  }),
  // Sprint 26
  ticket('OCISDEV-1506', 'User search ignores the filter parameter', {
    sprintId: 26,
    assignee: people.alex,
    fixVersions: [FRANCES],
    remoteLinkUrls: [ocisPr(13154), ocisPr(13172)],
    updated: '2026-10-15',
  }),
  ticket('OCISDEV-1517', 'Add missing API routes for activities and invitations', {
    sprintId: 26,
    assignee: people.sam,
    fixVersions: [FRANCES],
    remoteLinkUrls: [ocisPr(13109), ocisPr(13174)],
    updated: '2026-10-14',
  }),
  ticket('OCISDEV-1518', 'Show the correct message when access is denied', {
    sprintId: 26,
    assignee: people.me,
    fixVersions: [FRANCES, CURIE],
    remoteLinkUrls: [ocisPr(13111), ocisPr(13173)],
    updated: '2026-10-13',
  }),
  // Sprint 12 (June 2025)
  ticket('OCISDEV-33', '[QA] Run acceptance tests in the container pipeline', {
    sprintId: 12,
    issueType: 'Story',
    assignee: people.jordan,
    fixVersions: ['Deledda - 8.1.0'],
    remoteLinkUrls: [ocisPr(11152), ocisPr(12079)],
    updated: '2025-07-25',
  }),
  ticket('OCISDEV-683', '[QA] Fix failing acceptance test suites', {
    sprintId: 12,
    issueType: 'Story',
    assignee: people.jordan,
    fixVersions: ['Deledda - 8.1.0'],
    remoteLinkUrls: [11668, 11688, 11689, 11805, 11823, 11844, 11851, 11858].map(ocisPr),
    updated: '2025-08-21',
  }),
  ticket('OCISDEV-267', 'Settings page shows the old language until reload', {
    sprintId: 12,
    assignee: people.robin,
    fixVersions: ['Curie - 8.0.0'],
    remoteLinkUrls: ['https://github.com/owncloud/web/pull/12401'],
    updated: '2025-06-19',
  }),
  ticket('OCISDEV-301', 'Share permissions are lost when a folder is moved', {
    sprintId: 12,
    assignee: people.sam,
    fixVersions: ['Curie - 8.0.0', 'Galileo - 7.3.2', '7.1.9'],
    remoteLinkUrls: [ocisPr(10950), ocisPr(11050)],
    updated: '2025-06-20',
  }),
  ticket('OCISDEV-412', 'Search fails for file names with brackets', {
    sprintId: 12,
    assignee: people.alex,
    fixVersions: ['Darwin - 8.2.3'],
    remoteLinkUrls: [ocisPr(10990)],
    updated: '2025-06-18',
  }),
  // Sprint 28
  ticket('OCISDEV-1605', '[QA] Run the end-to-end suite on the nightly pipeline', {
    sprintId: 28,
    issueType: 'Sub-task',
    status: 'To Do',
    assignee: people.jordan,
    updated: '2026-10-29',
  }),
  // QA board
  ticket('OCISDEV-1532', '[QA] Add a CLI test for password reset', {
    sprintId: 91,
    issueType: 'Sub-task',
    status: 'In Progress',
    assignee: people.robin,
    updated: '2026-10-27',
  }),
];

interface PrDetails {
  base?: string;
  state?: PrState;
  body?: string;
  head?: string;
  author?: string;
  /** Merge date (`YYYY-MM-DD`) for merged PRs. */
  merged?: string;
  /** How long an open PR has been open, counted back from now so the demo never ages out. */
  openDays?: number;
  draft?: boolean;
  checks?: PullRequest['checks'];
  review?: PullRequest['review'];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function pr(
  repo: 'owncloud/ocis' | 'owncloud/reva',
  number: number,
  title: string,
  details: PrDetails = {},
): PullRequest {
  const state = details.state ?? 'merged';
  return {
    repo,
    number,
    title,
    body: details.body ?? '',
    headRef: details.head ?? `fix/${number}`,
    baseRef: details.base ?? (repo === 'owncloud/reva' ? 'main' : 'master'),
    state,
    createdAt:
      state === 'open'
        ? new Date(Date.now() - (details.openDays ?? 2) * DAY_MS).toISOString()
        : `${details.merged ?? '2026-10-22'}T08:00:00Z`,
    mergedAt: state === 'merged' ? `${details.merged ?? '2026-10-22'}T10:00:00Z` : null,
    // Open PRs keep getting pushes and reviews; merged ones last changed when merged.
    updatedAt:
      state === 'open'
        ? `2026-10-${String((number % 9) + 22).padStart(2, '0')}T15:00:00Z`
        : `${details.merged ?? '2026-10-22'}T10:00:00Z`,
    url: `https://github.com/${repo}/pull/${number}`,
    author: details.author ?? 'dev',
    isDraft: details.draft ?? false,
    // Merged PRs went through CI and review; closed ones never got a verdict.
    checks: details.checks ?? (state === 'merged' ? 'passing' : 'none'),
    review: details.review ?? (state === 'merged' ? 'approved' : 'none'),
    closingIssues: [],
  };
}

const OCIS = 'owncloud/ocis';
const REVA = 'owncloud/reva';

export const DEMO_PULL_REQUESTS: PullRequest[] = [
  pr(OCIS, 13231, 'feat: [OCISDEV-1464] show previews for files in shared folders'),
  pr(OCIS, 13250, 'fix(web): [OCISDEV-1464] load previews lazily in shared folders'),
  pr(OCIS, 13247, 'feat: [backport][OCISDEV-1464] show previews for files in shared folders', {
    base: 'stable-9.0',
    body: 'Backport of #13231 to stable-9.0.',
  }),
  pr(OCIS, 13255, 'fix(web): [backport][OCISDEV-1464] load previews lazily', {
    base: 'stable-9.0',
    body: 'This pull request is a backport of #13250 to `stable-9.0`.',
  }),
  pr(OCIS, 13273, 'fix(web): [OCISDEV-1601] open the shared folder after login', {
    state: 'open',
    openDays: 3,
    checks: 'failing',
    review: 'changes_requested',
  }),
  pr(OCIS, 13261, 'fix(web): [OCISDEV-1548] save theme settings on first load'),
  pr(OCIS, 13263, 'fix(web): [backport][OCISDEV-1548] save theme settings on first load', {
    base: 'stable-9.0',
    state: 'open',
    // Waiting for a review for longer than the default limit: "Backport stale".
    openDays: 12,
    checks: 'passing',
    review: 'review_required',
    body: 'backports: https://github.com/owncloud/ocis/pull/13261',
  }),
  {
    ...pr(OCIS, 13233, 'fix(web): [OCISDEV-1183] remove debug output from the web client'),
    closingIssues: [
      {
        repo: OCIS,
        number: 12990,
        title: 'The web client prints debug output on every page',
        url: 'https://github.com/owncloud/ocis/issues/12990',
      },
    ],
  },
  pr(OCIS, 13244, 'fix(web): [backport] remove debug output from the web client', {
    base: 'stable-9.0',
    body: 'backports: https://github.com/owncloud/ocis/pull/13233',
  }),
  pr(OCIS, 13239, 'fix(web): [OCISDEV-1581] fix copy link in the file details panel'),
  pr(OCIS, 13270, 'fix(web): [OCISDEV-1581] fix copy link in the file details panel', {
    base: 'stable-9.0',
    body: 'backports: #13239',
  }),
  pr(OCIS, 13238, 'fix(web): [OCISDEV-1583] restore deleted files with the same name'),
  pr(OCIS, 13269, 'fix(web): [OCISDEV-1583] restore deleted files with the same name', {
    base: 'stable-9.0',
    body: 'backports: #13238',
  }),
  pr(OCIS, 13241, 'fix(web): [OCISDEV-1589] update the help menu link'),
  pr(OCIS, 13262, 'chore(release): [OCISDEV-1594] simplify the release pipeline', {
    base: 'stable-9.0',
    state: 'open',
    openDays: 2,
    draft: true,
    checks: 'pending',
  }),
  pr(OCIS, 13272, 'chore(deps): [OCISDEV-1392] bump reva'),
  pr(REVA, 788, 'fix: [OCISDEV-1392] retry uploads on a busy storage node'),
  pr(REVA, 789, 'fix: [stable-9.0][OCISDEV-1392] retry uploads on a busy storage node', {
    base: 'stable-9.0',
    body: 'Backport of #788.',
  }),
  pr(OCIS, 13154, 'fix(graph): [OCISDEV-1506] apply the filter parameter in user search'),
  pr(OCIS, 13172, 'fix(graph): [backport][OCISDEV-1506] apply the filter parameter', {
    base: 'stable-9.0',
    body: 'backports: https://github.com/owncloud/ocis/pull/13154',
  }),
  pr(OCIS, 13109, 'fix(proxy): [OCISDEV-1517] add missing API routes'),
  pr(OCIS, 13174, 'fix(proxy): [backport][OCISDEV-1517] add missing API routes', {
    base: 'stable-9.0',
    body: 'backports: https://github.com/owncloud/ocis/pull/13109',
  }),
  pr(OCIS, 13111, 'fix(web): [OCISDEV-1518] show correct message when access is denied'),
  pr(OCIS, 13173, 'fix(web): [backport][OCISDEV-1518] show correct message', {
    base: 'stable-9.0',
    body: 'backports: https://github.com/owncloud/ocis/pull/13111',
  }),
  pr(OCIS, 13180, 'fix(web): [OCISDEV-1518] show correct message (8.0)', {
    base: 'stable-8.0',
    body: 'backports: #13111',
    head: 'backport/8.0/ocisdev-1518',
  }),
  pr(OCIS, 13190, 'docs: release notes for 9.0.0', {
    body: 'Mentions OCISDEV-1464 and OCISDEV-1581 in the changelog.',
  }),
  // Sprint 12 (2025): fixes merged long before the stable branches were cut.
  pr(OCIS, 11152, 'test: run acceptance tests on kubernetes', { merged: '2025-07-24' }),
  pr(OCIS, 12079, 'test: run acceptance tests on kubernetes (retry)', { state: 'closed' }),
  ...[11668, 11688, 11689, 11805, 11823, 11844, 11851, 11858, 11861, 11863, 11869].map((n) =>
    pr(OCIS, n, `test: [OCISDEV-683] fix failing k8s suite part ${n - 11600}`, {
      merged: '2025-08-20',
    }),
  ),
  pr(OCIS, 11870, 'test: [OCISDEV-683] fix failing k8s suite (superseded)', { state: 'closed' }),
  pr(OCIS, 10950, 'fix(sharing): [OCISDEV-301] keep share permissions on rename', {
    merged: '2025-06-15',
  }),
  pr(OCIS, 11050, 'fix(sharing): [backport][OCISDEV-301] keep share permissions on rename', {
    base: 'stable-7.3',
    body: 'Backport of #10950.',
    merged: '2025-06-20',
  }),
  pr(OCIS, 10990, 'fix(search): [OCISDEV-412] escape special characters in queries', {
    merged: '2025-06-18',
  }),
];

/** Issues that mention a ticket key in their description, as the team writes them. */
export const DEMO_ISSUES: GitHubIssue[] = [
  // Closed by #13233, so OCISDEV-1183 is fine.
  {
    repo: OCIS,
    number: 12990,
    title: 'The web client prints debug output on every page',
    body: '## [OCISDEV-1183]\n### Description\nDebug messages show up in the console.',
    url: 'https://github.com/owncloud/ocis/issues/12990',
    state: 'closed',
  },
  // #13273 doesn't link it: OCISDEV-1601 shows "Issue not linked to PR".
  {
    repo: OCIS,
    number: 13266,
    title: 'Shared links open the wrong folder after login',
    body: '## [OCISDEV-1601]\n### Description\nThe folder only opens after a second login.',
    url: 'https://github.com/owncloud/ocis/issues/13266',
    state: 'open',
  },
];

/** Branches that exist, and when each was cut from the default branch. */
export const DEMO_REPOS: Record<
  string,
  { defaultBranch: string; branchPoints: Record<string, string> }
> = {
  [OCIS]: {
    defaultBranch: 'master',
    branchPoints: {
      'stable-9.0': '2026-10-12T09:51:14Z',
      'stable-8.2': '2026-07-01T10:00:00Z',
      'stable-8.1': '2026-05-22T20:29:46Z',
      'stable-8.0': '2026-01-15T10:00:00Z',
      'stable-7.3': '2025-05-02T10:00:00Z',
      'stable-7.1': '2025-03-01T10:00:00Z',
    },
  },
  [REVA]: {
    defaultBranch: 'main',
    branchPoints: {
      'stable-9.0': '2026-10-12T09:00:00Z',
      'stable-8.2': '2026-07-01T09:00:00Z',
    },
  },
};
