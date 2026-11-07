import type { LinkedPr, PullRequest, RepoInfo, TicketReport } from '@ocis-dashboard/core';
import { describe, expect, it } from 'vitest';
import { branchRows, includedNote, visiblePrs } from './branches';

const OCIS = 'owncloud/ocis';
const repos: RepoInfo[] = [
  { name: OCIS, defaultBranch: 'master', branches: [] },
  { name: 'owncloud/reva', defaultBranch: 'main', branches: [] },
];

function linked(
  number: number,
  baseRef = 'master',
  state: PullRequest['state'] = 'merged',
): LinkedPr {
  return {
    pr: {
      repo: OCIS,
      number,
      title: '',
      body: '',
      headRef: '',
      baseRef,
      state,
      createdAt: '2025-07-20T10:00:00Z',
      mergedAt: state === 'merged' ? '2025-07-24T06:30:16Z' : null,
      updatedAt: '2026-10-30T10:00:00Z',
      url: `https://github.com/${OCIS}/pull/${number}`,
      author: null,
      isDraft: false,
      checks: 'none' as const,
      review: 'none' as const,
      closingIssues: [],
    },
    sources: ['title'],
    isBackport: baseRef.startsWith('stable-'),
    intoDefault: baseRef === 'master',
    backportOf: [],
    linkedInJira: true,
    keyInPr: true,
  };
}

function report(partial: Partial<TicketReport>): TicketReport {
  return {
    ticket: {
      key: 'OCISDEV-1',
      summary: '',
      status: '',
      statusCategory: 'todo',
      issueType: '',
      url: '',
      assignee: null,
      fixVersions: [],
      remoteLinkUrls: [],
      created: '2026-10-01T09:00:00.000+0200',
      updated: '2026-10-20T09:00:00.000+0200',
    },
    prs: [],
    mentions: [],
    issues: [],
    coverage: [],
    otherRepoLinks: [],
    unlinkedIssues: [],
    flags: [],
    ...partial,
  };
}

describe('branchRows', () => {
  it("lists only this ticket's branches: default first, then stable newest first", () => {
    const rows = branchRows(
      report({
        prs: [linked(11152), linked(11050, 'stable-7.3')],
        coverage: [
          {
            repo: OCIS,
            branch: 'stable-7.3',
            required: true,
            status: 'merged',
            prNumbers: [11050],
          },
          {
            repo: OCIS,
            branch: 'stable-8.1',
            required: true,
            status: 'included',
            prNumbers: [11152],
            branchPoint: '2026-05-22T20:29:46Z',
          },
        ],
      }),
      repos,
    );
    expect(rows.map((r) => [r.branch, r.status, r.prs.map((l) => l.pr.number)])).toEqual([
      ['master', 'merged', [11152]],
      ['stable-8.1', 'included', [11152]],
      ['stable-7.3', 'merged', [11050]],
    ]);
  });

  it('shows the default branch as missing when the ticket has no PR at all', () => {
    expect(branchRows(report({}), repos)).toMatchObject([{ branch: 'master', status: 'missing' }]);
  });

  it('marks a default branch with only closed PRs as closed', () => {
    const [row] = branchRows(report({ prs: [linked(1, 'master', 'closed')] }), repos);
    expect(row!.status).toBe('closed');
  });

  it('lists a PR into a feature branch on its own line, not as merged into master', () => {
    const rows = branchRows(report({ prs: [linked(5, 'feature/new-ui')] }), repos);
    expect(rows).toMatchObject([
      { branch: 'feature/new-ui', status: 'merged', isDefault: false, isFeature: true },
    ]);
  });
});

describe('visiblePrs', () => {
  it('shows merged before closed and counts the rest', () => {
    const { shown, hidden } = visiblePrs([linked(1, 'master', 'closed'), linked(2), linked(3)]);
    expect(shown.map((l) => l.pr.number)).toEqual([2, 3]);
    expect(hidden).toBe(1);
  });
});

describe('includedNote', () => {
  it('shows when the fix was merged and when the branch was cut', () => {
    const row = {
      repo: OCIS,
      branch: 'stable-9.0',
      defaultBranch: 'master',
      isDefault: false,
      status: 'included' as const,
      prs: [linked(13024)],
      required: true,
      branchPoint: '2026-10-12T09:51:14Z',
    };
    expect(includedNote(row)).toBe(
      'already in stable-9.0: merged to master 24 Jul 2025, before the branch was cut 12 Oct 2026',
    );
  });
});
