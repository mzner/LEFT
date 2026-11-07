import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildReports } from './report';
import type { GitHubIssue, PullRequest, RepoInfo, Ticket } from './types';

const OCIS = 'owncloud/ocis';
const repos: RepoInfo[] = [
  { name: OCIS, defaultBranch: 'master', branches: ['master', 'stable-9.0', 'stable-8.0'] },
];

function pr(overrides: Partial<PullRequest> & Pick<PullRequest, 'number'>): PullRequest {
  return {
    repo: OCIS,
    title: '',
    body: '',
    headRef: `branch-${overrides.number}`,
    baseRef: 'master',
    state: 'merged',
    createdAt: '2026-10-19T10:00:00Z',
    mergedAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-30T10:00:00Z',
    url: `https://github.com/${OCIS}/pull/${overrides.number}`,
    author: 'dev',
    isDraft: false,
    checks: 'none',
    review: 'none',
    closingIssues: [],
    ...overrides,
  };
}

function ticket(overrides: Partial<Ticket> & Pick<Ticket, 'key'>): Ticket {
  return {
    summary: '',
    status: 'Done',
    statusCategory: 'done',
    issueType: 'Bug',
    url: `https://example.atlassian.net/browse/${overrides.key}`,
    assignee: null,
    fixVersions: [],
    remoteLinkUrls: [],
    created: '2026-10-01T09:00:00.000+0200',
    updated: '2026-10-20T09:00:00.000+0200',
    ...overrides,
  };
}

const link = (number: number) => `https://github.com/${OCIS}/pull/${number}`;

// Ages are measured against the clock, so the tests run at a fixed moment.
beforeEach(() => vi.useFakeTimers({ now: new Date('2026-10-22T00:00:00Z') }));
afterEach(() => vi.useRealTimers());

// Real data for OCISDEV-1464 as of 2026-10-30: #13255 is not linked in Jira.
const ocisdev1464 = ticket({
  key: 'OCISDEV-1464',
  fixVersions: ['Frances - 9.0.0'],
  remoteLinkUrls: [link(13250), link(13231), link(13247)],
});
const ocisdev1464Prs = [
  pr({ number: 13231, title: 'feat: [OCISDEV-1464] Assign multi-instance guests a role' }),
  pr({ number: 13250, title: 'fix(proxy): [OCISDEV-1464] fix the role assignment' }),
  pr({
    number: 13247,
    baseRef: 'stable-9.0',
    title: 'feat: [backport][OCISDEV-1464] show previews for files in shared folders',
    body: 'Backport of #13231 to stable-9.0.',
  }),
  pr({
    number: 13255,
    baseRef: 'stable-9.0',
    title: 'fix(web): [backport][OCISDEV-1464] load previews lazily',
    body: 'This pull request is a backport of #13250 to `stable-9.0`.',
  }),
];

function reportFor(tickets: Ticket[], pullRequests: PullRequest[]) {
  return buildReports({ projectKey: 'OCISDEV', tickets, pullRequests, repos });
}

describe('buildReports', () => {
  it('links master PRs and backports and flags the backport missing in Jira', () => {
    const [report] = reportFor([ocisdev1464], ocisdev1464Prs);

    expect(report!.prs.map((linked) => linked.pr.number).sort()).toEqual([
      13231, 13247, 13250, 13255,
    ]);
    expect(report!.coverage).toEqual([
      {
        repo: OCIS,
        branch: 'stable-9.0',
        required: true,
        status: 'merged',
        prNumbers: [13247, 13255],
      },
    ]);
    expect(report!.flags).toEqual([
      {
        code: 'NOT_LINKED_IN_JIRA',
        severity: 'error',
        message: 'owncloud/ocis#13255 not linked in Jira',
        // Link it from the dashboard, or copy the PR link and paste it into the ticket's links.
        actions: [
          { label: 'Link in Jira', url: `https://github.com/${OCIS}/pull/13255`, jiraLink: true },
          { label: 'Copy PR link', url: `https://github.com/${OCIS}/pull/13255`, copy: true },
          { label: 'Open in Jira', url: 'https://example.atlassian.net/browse/OCISDEV-1464' },
        ],
      },
    ]);
  });

  it('flags a ticket without PRs', () => {
    const [report] = reportFor([ticket({ key: 'OCISDEV-1560' })], ocisdev1464Prs);
    expect(report!.flags.map((flag) => flag.code)).toEqual(['NO_PR']);
  });

  it('flags a required backport that does not exist', () => {
    const t = ticket({
      key: 'OCISDEV-1548',
      fixVersions: ['Frances - 9.0.0', 'Curie S9 - 8.0.10'],
      remoteLinkUrls: [link(1)],
    });
    const prs = [
      pr({ number: 1, title: '[OCISDEV-1548] fix' }),
      pr({ number: 2, title: '[OCISDEV-1548] fix', baseRef: 'stable-9.0', state: 'open' }),
    ];
    const [report] = reportFor([t], prs);

    expect(report!.coverage.map(({ branch, status }) => [branch, status])).toEqual([
      ['stable-9.0', 'open'],
      ['stable-8.0', 'missing'],
    ]);
    expect(report!.flags.map((flag) => flag.code)).toEqual([
      'MISSING_BACKPORT',
      'BACKPORT_OPEN',
      'NOT_LINKED_IN_JIRA',
    ]);
  });

  it('does not expect backports for fixVersions without a number or missing branches', () => {
    const t = ticket({
      key: 'OCISDEV-1',
      fixVersions: ['Ghez', 'Darwin - 10.0.0'],
      remoteLinkUrls: [link(1)],
    });
    const [report] = reportFor([t], [pr({ number: 1, title: '[OCISDEV-1] x' })]);
    expect(report!.coverage).toEqual([]);
    expect(report!.flags).toEqual([]);
  });

  it('links a keyless backport through its body and flags the missing key', () => {
    const t = ticket({ key: 'OCISDEV-2', remoteLinkUrls: [link(1), link(2)] });
    const prs = [
      pr({ number: 1, title: '[OCISDEV-2] bump go-jose' }),
      pr({
        number: 2,
        title: '[backport] bump go-jose',
        baseRef: 'stable-9.0',
        body: 'backports: #1',
      }),
    ];
    const [report] = reportFor([t], prs);

    const backport = report!.prs.find((linked) => linked.pr.number === 2)!;
    expect(backport.sources).toEqual(['jira-link', 'backport-of']);
    expect(backport.isBackport).toBe(true);
    expect(report!.flags.map((flag) => flag.code)).toEqual(['KEY_MISSING_IN_PR']);
  });

  it('treats a key that only appears in the body as a mention', () => {
    const t = ticket({ key: 'OCISDEV-3' });
    const [report] = reportFor(
      [t],
      [pr({ number: 1, title: 'other', body: 'related to OCISDEV-3' })],
    );
    expect(report!.prs).toEqual([]);
    expect(report!.mentions.map((mention) => mention.number)).toEqual([1]);
  });

  it('ignores PRs from repos that are not selected', () => {
    const t = ticket({ key: 'OCISDEV-4' });
    const [report] = reportFor(
      [t],
      [pr({ number: 1, repo: 'owncloud/reva', title: '[OCISDEV-4] x' })],
    );
    expect(report!.prs).toEqual([]);
  });

  it('does not treat a PR into a feature branch as a backport', () => {
    const t = ticket({ key: 'OCISDEV-5', remoteLinkUrls: [link(1)] });
    const prs = [
      pr({ number: 1, title: '[OCISDEV-5] new UI', baseRef: 'feature/new-ui', state: 'open' }),
    ];
    const [report] = reportFor([t], prs);

    expect(report!.prs[0]!.isBackport).toBe(false);
    expect(report!.coverage).toEqual([]);
    expect(report!.flags.map((flag) => flag.code)).toEqual(['PR_OPEN']);
  });

  it('treats a PR into a non-release branch as a backport when it says so', () => {
    const t = ticket({ key: 'OCISDEV-6', remoteLinkUrls: [link(1), link(2)] });
    const prs = [
      pr({ number: 1, title: '[OCISDEV-6] fix' }),
      pr({ number: 2, title: '[OCISDEV-6] fix', baseRef: 'hotfix-9.0.1', body: 'Backport of #1' }),
    ];
    const [report] = reportFor([t], prs);
    expect(report!.prs.find((l) => l.pr.number === 2)!.isBackport).toBe(true);
  });

  it('does not ask to link or key PRs that were closed without merging', () => {
    const t = ticket({ key: 'OCISDEV-683', remoteLinkUrls: [link(1)] });
    const prs = [
      pr({ number: 1, title: '[OCISDEV-683] fix' }),
      pr({ number: 2, title: '[OCISDEV-683] superseded attempt', state: 'closed', mergedAt: null }),
    ];
    const [report] = reportFor([t], prs);
    expect(report!.prs.map((linked) => linked.pr.number)).toEqual([1, 2]);
    expect(report!.flags).toEqual([]);
  });

  it('names the unselected repos that Jira links to when no PR is found', () => {
    const t = ticket({
      key: 'OCISDEV-267',
      remoteLinkUrls: ['https://github.com/owncloud/web/pull/12000'],
    });
    const [report] = reportFor([t], []);
    expect(report!.otherRepoLinks).toEqual(['owncloud/web']);
    expect(report!.flags[0]!.message).toBe(
      'No PR in the selected repositories; Jira links PRs in owncloud/web',
    );
  });
});

// Real case: #11152 was merged into master on 2025-07-24, stable-8.1 was cut on 2026-05-22.
describe('buildReports with branch points', () => {
  const branched: RepoInfo[] = [
    {
      name: OCIS,
      defaultBranch: 'master',
      branches: ['stable-8.1'],
      branchPoints: { 'stable-8.1': '2026-05-22T20:29:46Z' },
    },
  ];
  const ocisdev33 = ticket({
    key: 'OCISDEV-33',
    fixVersions: ['Deledda - 8.1.0'],
    remoteLinkUrls: [`https://github.com/${OCIS}/pull/11152`],
  });
  const build = (mergedAt: string) =>
    buildReports({
      projectKey: 'OCISDEV',
      tickets: [ocisdev33],
      pullRequests: [pr({ number: 11152, title: '[OCISDEV-33] k8s tests', mergedAt })],
      repos: branched,
    })[0]!;

  it('counts a fix merged before the branch was cut as included, not missing', () => {
    const report = build('2025-07-24T06:30:16Z');
    expect(report.coverage).toEqual([
      {
        repo: OCIS,
        branch: 'stable-8.1',
        required: true,
        status: 'included',
        prNumbers: [11152],
        branchPoint: '2026-05-22T20:29:46Z',
      },
    ]);
    expect(report.flags).toEqual([]);
  });

  const withFollowUp = (followUp: Partial<PullRequest>) =>
    buildReports({
      projectKey: 'OCISDEV',
      tickets: [ocisdev33],
      pullRequests: [
        pr({ number: 11152, title: '[OCISDEV-33] k8s tests', mergedAt: '2025-07-24T06:30:16Z' }),
        pr({ number: 11200, title: '[OCISDEV-33] follow-up', ...followUp }),
      ],
      repos: branched,
    })[0]!;

  it('asks for a backport when a follow-up was merged after the branch was cut', () => {
    const report = withFollowUp({ mergedAt: '2026-06-01T00:00:00Z' });
    expect(report.coverage[0]!.status).toBe('missing');
    expect(report.flags.map((flag) => flag.code)).toContain('MISSING_BACKPORT');
  });

  it('is not included while a follow-up is still open on master', () => {
    const report = withFollowUp({ state: 'open', mergedAt: null });
    expect(report.coverage[0]!.status).toBe('missing');
  });

  it('ignores follow-ups closed without merging', () => {
    const report = withFollowUp({ state: 'closed', mergedAt: null });
    expect(report.coverage[0]!.status).toBe('included');
  });

  it('still asks for a backport when the fix was merged after the branch was cut', () => {
    const report = build('2026-06-01T00:00:00Z');
    expect(report.coverage[0]!.status).toBe('missing');
    expect(report.flags.map((flag) => flag.code)).toEqual(['MISSING_BACKPORT']);
  });
});

describe('PRs into feature branches', () => {
  it('does not count a merged feature-branch PR as merged on master', () => {
    const [report] = buildReports({
      projectKey: 'OCISDEV',
      tickets: [ticket({ key: 'OCISDEV-50' })],
      pullRequests: [
        pr({ number: 1, title: '[OCISDEV-50] part 1', baseRef: 'feature/new-ui' }),
        pr({ number: 2, title: '[OCISDEV-50] land it', state: 'open', mergedAt: null }),
      ],
      repos: [{ name: OCIS, defaultBranch: 'master', branches: [] }],
    });
    expect(report!.prs.map((l) => [l.pr.number, l.intoDefault])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(report!.flags.map((flag) => flag.code)).toContain('PR_OPEN');
  });
});

// Real case: owncloud/ocis#13266 says "## [OCISDEV-1600]" in its description; no PR closes it.
describe('GitHub issues that mention the ticket', () => {
  const issue = (overrides: Partial<GitHubIssue> = {}): GitHubIssue => ({
    repo: OCIS,
    number: 13266,
    title: 'Unclear error message when selecting "Keep both" with insufficient space quota',
    url: `https://github.com/${OCIS}/issues/13266`,
    body: '## [OCISDEV-1600]\n### Description',
    state: 'open',
    ...overrides,
  });
  const t = ticket({ key: 'OCISDEV-1600' });
  const fix = (closingIssues: PullRequest['closingIssues'] = []) =>
    pr({ number: 13300, title: '[OCISDEV-1600] clearer quota error', closingIssues });
  const build = (prs: PullRequest[], issues: GitHubIssue[]) =>
    buildReports({ projectKey: 'OCISDEV', tickets: [t], pullRequests: prs, issues, repos })[0]!;

  it('flags an issue no PR of the ticket is linked to', () => {
    const report = build([fix()], [issue()]);
    expect(report.unlinkedIssues.map((i) => i.number)).toEqual([13266]);
    expect(report.flags).toContainEqual({
      code: 'ISSUE_NOT_LINKED',
      severity: 'error',
      message: 'owncloud/ocis#13266 is not linked to any PR',
      actions: [{ label: 'Open issue', url: `https://github.com/${OCIS}/issues/13266` }],
    });
  });

  it('is happy when a PR closes the issue', () => {
    const ref = { repo: OCIS, number: 13266, title: '', url: '' };
    const report = build([fix([ref])], [issue()]);
    expect(report.unlinkedIssues).toEqual([]);
    expect(report.flags.map((f) => f.code)).not.toContain('ISSUE_NOT_LINKED');
  });

  it('does not count a link from a PR closed without merging', () => {
    const ref = { repo: OCIS, number: 13266, title: '', url: '' };
    const abandoned = pr({ ...fix([ref]), number: 13299, state: 'closed', mergedAt: null });
    const report = build([abandoned, fix()], [issue()]);
    expect(report.unlinkedIssues.map((i) => i.number)).toEqual([13266]);
    // Listed once, as not linked: the abandoned PR's link counts nowhere.
    expect(report.issues).toEqual([]);
  });

  // A PR that links an issue closes it on merge, so a forgotten link leaves the issue open.
  it('ignores closed issues, and other tickets’ issues', () => {
    const report = build(
      [fix()],
      [issue({ number: 1, state: 'closed' }), issue({ number: 3, body: 'see OCISDEV-16000' })],
    );
    expect(report.unlinkedIssues).toEqual([]);
  });

  it('leaves a ticket without PRs to the "No PR" flag', () => {
    const report = build([], [issue()]);
    expect(report.unlinkedIssues.map((i) => i.number)).toEqual([13266]);
    expect(report.flags.map((f) => f.code)).toEqual(['NO_PR']);
  });
});

describe('flag links', () => {
  it('links a missing backport to the merged master PR to backport from', () => {
    const [report] = buildReports({
      projectKey: 'OCISDEV',
      tickets: [ticket({ key: 'OCISDEV-9', fixVersions: ['Frances - 9.0.0'] })],
      pullRequests: [pr({ number: 7, title: '[OCISDEV-9] fix' })],
      repos: [{ name: OCIS, defaultBranch: 'master', branches: ['stable-9.0'] }],
    });
    const missing = report!.flags.find((f) => f.code === 'MISSING_BACKPORT');
    expect(missing?.actions).toEqual([
      { label: 'Open master PR', url: `https://github.com/${OCIS}/pull/7` },
    ]);
  });
});

describe('stale backports', () => {
  const t = ticket({
    key: 'OCISDEV-1548',
    fixVersions: ['Frances - 9.0.0'],
    remoteLinkUrls: [link(1), link(2), link(3)],
  });
  const master = pr({ number: 1, title: '[OCISDEV-1548] fix' });
  const backport = (createdAt: string, number = 2) =>
    pr({
      number,
      title: '[OCISDEV-1548] backport',
      baseRef: 'stable-9.0',
      state: 'open',
      mergedAt: null,
      createdAt,
    });
  const flagsFor = (prs: PullRequest[], flagOptions?: { staleBackportDays: number }) =>
    buildReports({ projectKey: 'OCISDEV', tickets: [t], pullRequests: prs, repos, flagOptions })[0]!
      .flags;

  it('flags a backport open for more than 7 days as stale, besides "not merged yet"', () => {
    const flags = flagsFor([master, backport('2026-10-10T00:00:00Z')]);
    expect(flags).toEqual([
      {
        code: 'BACKPORT_STALE',
        severity: 'error',
        message: 'Backport to stable-9.0 open for 12 days (owncloud/ocis)',
        actions: [{ label: 'Open backport', url: link(2) }],
      },
      {
        code: 'BACKPORT_OPEN',
        severity: 'warning',
        message: 'Backport to stable-9.0 not merged yet (owncloud/ocis)',
        actions: [{ label: 'Open backport', url: link(2) }],
      },
    ]);
  });

  it('counts whole days: "not merged yet" through day 7, stale from day 8', () => {
    const codes = (createdAt: string) =>
      flagsFor([master, backport(createdAt)]).map((flag) => flag.code);
    expect(codes('2026-10-15T00:00:00Z')).toEqual(['BACKPORT_OPEN']); // 7 days
    expect(codes('2026-10-14T00:00:01Z')).toEqual(['BACKPORT_OPEN']); // 7 days and 23:59:59
    expect(codes('2026-10-14T00:00:00Z')).toEqual(['BACKPORT_STALE', 'BACKPORT_OPEN']); // 8 days
  });

  it('uses the limit it is given, and 0 turns the flag off', () => {
    const prs = [master, backport('2026-10-19T00:00:00Z')]; // 3 days
    expect(flagsFor(prs, { staleBackportDays: 2 }).map((f) => f.code)).toEqual([
      'BACKPORT_STALE',
      'BACKPORT_OPEN',
    ]);
    expect(flagsFor(prs, { staleBackportDays: 3 }).map((f) => f.code)).toEqual(['BACKPORT_OPEN']);
    const ancient = [master, backport('2025-01-01T00:00:00Z')];
    expect(flagsFor(ancient, { staleBackportDays: 0 }).map((f) => f.code)).toEqual([
      'BACKPORT_OPEN',
    ]);
  });

  it('goes by the oldest open backport when several target the branch', () => {
    const flags = flagsFor([
      master,
      backport('2026-10-21T00:00:00Z', 2),
      backport('2026-10-05T00:00:00Z', 3),
    ]);
    expect(flags.map((flag) => flag.code)).toEqual(['BACKPORT_STALE', 'BACKPORT_OPEN']);
    expect(flags[0]!.message).toContain('open for 17 days');
    for (const flag of flags) {
      expect(flag.actions).toEqual([{ label: 'Open backport', url: link(3) }]);
    }
  });

  it('does not flag a backport that is merged, however old', () => {
    const merged = pr({
      number: 2,
      title: '[OCISDEV-1548] backport',
      baseRef: 'stable-9.0',
      createdAt: '2025-01-01T00:00:00Z',
    });
    expect(flagsFor([master, merged])).toEqual([]);
  });
});
