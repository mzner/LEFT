import type { LinkedPr, PullRequest, RepoInfo, RepoName, TicketReport } from '@ocis-dashboard/core';
import { describe, expect, it } from 'vitest';
import {
  backportFixes,
  backportFixForBranch,
  branchRows,
  includedNote,
  visiblePrs,
  type BranchRow,
} from './branches';

const OCIS = 'owncloud/ocis';
const REVA = 'owncloud/reva';
const repos: RepoInfo[] = [
  { name: OCIS, defaultBranch: 'master', branches: [] },
  { name: REVA, defaultBranch: 'main', branches: [] },
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
      mergeCommitSha: state === 'merged' ? `sha-${number}` : null,
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

/** A `LinkedPr` for `repo`, so multi-repo `backportFix` scenarios can be built directly. */
function linkedIn(
  repo: RepoName,
  number: number,
  baseRef: string,
  state: PullRequest['state'] = 'merged',
  mergedAt = '2026-01-01T00:00:00Z',
): LinkedPr {
  const defaultBranch = repo === OCIS ? 'master' : 'main';
  return {
    pr: {
      repo,
      number,
      title: '',
      body: '',
      headRef: '',
      baseRef,
      state,
      createdAt: mergedAt,
      mergedAt: state === 'merged' ? mergedAt : null,
      updatedAt: mergedAt,
      url: `https://github.com/${repo}/pull/${number}`,
      author: null,
      isDraft: false,
      checks: 'none' as const,
      review: 'none' as const,
      closingIssues: [],
      mergeCommitSha: state === 'merged' ? `sha-${number}` : null,
    },
    sources: ['title'],
    isBackport: baseRef !== defaultBranch,
    intoDefault: baseRef === defaultBranch,
    backportOf: [],
    linkedInJira: true,
    keyInPr: true,
  };
}

/** A `BranchRow` with sensible defaults, so each `backportFix` test only states what it varies. */
function row(overrides: Partial<BranchRow> & Pick<BranchRow, 'repo' | 'branch'>): BranchRow {
  return {
    defaultBranch: overrides.repo === OCIS ? 'master' : 'main',
    isDefault: false,
    status: 'missing',
    prs: [],
    required: true,
    ...overrides,
  };
}

describe('backportFixes', () => {
  it('cherry-picks from the default-branch merge when a required branch is missing', () => {
    const rows = [
      row({ repo: OCIS, branch: 'master', isDefault: true, status: 'merged', prs: [linkedIn(OCIS, 1, 'master')] }),
      row({ repo: OCIS, branch: 'stable-9.0', status: 'missing' }),
    ];
    expect(backportFixes(rows)).toEqual([{ repo: OCIS, sha: 'sha-1', versions: ['9.0'] }]);
  });

  it("falls back to the repo's most recently merged PR when there is no default-branch fix (OCISDEV-1620 shape)", () => {
    const rows = [
      row({
        repo: OCIS,
        branch: 'stable-8.0',
        required: false,
        status: 'merged',
        prs: [linkedIn(OCIS, 2, 'stable-8.0', 'merged', '2026-02-08T00:00:00Z')],
      }),
      row({ repo: OCIS, branch: 'stable-9.0', status: 'missing' }),
    ];
    expect(backportFixes(rows)).toEqual([{ repo: OCIS, sha: 'sha-2', versions: ['9.0'] }]);
  });

  it('picks the latest of several merged PRs when there is no default-branch fix', () => {
    const rows = [
      row({
        repo: OCIS,
        branch: 'stable-8.0',
        required: false,
        status: 'merged',
        prs: [linkedIn(OCIS, 3, 'stable-8.0', 'merged', '2026-02-08T00:00:00Z')],
      }),
      row({
        repo: OCIS,
        branch: 'stable-8.1',
        required: false,
        status: 'merged',
        prs: [linkedIn(OCIS, 4, 'stable-8.1', 'merged', '2026-05-20T00:00:00Z')],
      }),
      row({ repo: OCIS, branch: 'stable-9.0', status: 'missing' }),
    ];
    // #4 (stable-8.1) merged later than #3 (stable-8.0), so it's the one to cherry-pick from.
    expect(backportFixes(rows)[0]?.sha).toBe('sha-4');
  });

  it('lists every missing required version, oldest first, regardless of row order', () => {
    const rows = [
      row({ repo: OCIS, branch: 'stable-9.0', status: 'missing' }),
      row({
        repo: OCIS,
        branch: 'master',
        isDefault: true,
        status: 'merged',
        prs: [linkedIn(OCIS, 5, 'master')],
      }),
      row({ repo: OCIS, branch: 'stable-8.1', status: 'missing' }),
    ];
    expect(backportFixes(rows)[0]?.versions).toEqual(['8.1', '9.0']);
  });

  it('ignores a missing branch that is not required by any fix version', () => {
    const rows = [
      row({
        repo: OCIS,
        branch: 'master',
        isDefault: true,
        status: 'merged',
        prs: [linkedIn(OCIS, 6, 'master')],
      }),
      row({ repo: OCIS, branch: 'stable-9.0', status: 'missing', required: true }),
      row({ repo: OCIS, branch: 'stable-8.0', status: 'missing', required: false }),
    ];
    expect(backportFixes(rows)[0]?.versions).toEqual(['9.0']);
  });

  it('leaves out a repo whose every required branch is already covered', () => {
    const rows = [
      row({
        repo: OCIS,
        branch: 'master',
        isDefault: true,
        status: 'merged',
        prs: [linkedIn(OCIS, 7, 'master')],
      }),
      row({ repo: OCIS, branch: 'stable-9.0', status: 'included' }),
    ];
    expect(backportFixes(rows)).toEqual([]);
  });

  it('treats a pinnedVia branch as already covered, not a gap to fix', () => {
    const rows = [
      row({
        repo: OCIS,
        branch: 'master',
        isDefault: true,
        status: 'merged',
        prs: [linkedIn(OCIS, 14, 'master')],
      }),
      row({
        repo: OCIS,
        branch: 'stable-9.0',
        status: 'missing',
        pinnedVia: { repo: REVA, version: 'v2.1.0' },
      }),
    ];
    expect(backportFixes(rows)).toEqual([]);
  });

  it('leaves out a repo whose missing branch has no PR anywhere to cherry-pick from', () => {
    const rows = [row({ repo: OCIS, branch: 'stable-9.0', status: 'missing' })];
    expect(backportFixes(rows)).toEqual([]);
  });

  it('does not fall through to a merged PR in a different repo', () => {
    const rows = [
      row({ repo: OCIS, branch: 'stable-9.0', status: 'missing' }),
      row({
        repo: REVA,
        branch: 'main',
        isDefault: true,
        status: 'merged',
        prs: [linkedIn(REVA, 8, 'main')],
      }),
    ];
    expect(backportFixes(rows)).toEqual([]);
  });

  it('covers every repo with a gap, not just the first', () => {
    const rows = [
      row({
        repo: OCIS,
        branch: 'master',
        isDefault: true,
        status: 'merged',
        prs: [linkedIn(OCIS, 9, 'master')],
      }),
      row({ repo: OCIS, branch: 'stable-9.0', status: 'missing' }),
      row({
        repo: REVA,
        branch: 'main',
        isDefault: true,
        status: 'merged',
        prs: [linkedIn(REVA, 10, 'main')],
      }),
      row({ repo: REVA, branch: 'stable-9.0', status: 'missing' }),
    ];
    expect(backportFixes(rows)).toEqual([
      { repo: OCIS, sha: 'sha-9', versions: ['9.0'] },
      { repo: REVA, sha: 'sha-10', versions: ['9.0'] },
    ]);
  });

  it('skips a fully-covered repo to find the gap in a later one', () => {
    const rows = [
      row({
        repo: OCIS,
        branch: 'master',
        isDefault: true,
        status: 'merged',
        prs: [linkedIn(OCIS, 11, 'master')],
      }),
      row({ repo: OCIS, branch: 'stable-9.0', status: 'merged', prs: [linkedIn(OCIS, 12, 'stable-9.0')] }),
      row({
        repo: REVA,
        branch: 'main',
        isDefault: true,
        status: 'merged',
        prs: [linkedIn(REVA, 13, 'main')],
      }),
      row({ repo: REVA, branch: 'stable-9.0', status: 'missing' }),
    ];
    expect(backportFixes(rows)).toEqual([{ repo: REVA, sha: 'sha-13', versions: ['9.0'] }]);
  });
});

describe('backportFixForBranch', () => {
  it('fixes just the one branch, even when the repo is missing several', () => {
    const rows = [
      row({
        repo: OCIS,
        branch: 'master',
        isDefault: true,
        status: 'merged',
        prs: [linkedIn(OCIS, 15, 'master')],
      }),
      row({ repo: OCIS, branch: 'stable-9.0', status: 'missing' }),
      row({ repo: OCIS, branch: 'stable-8.1', status: 'missing' }),
    ];
    expect(backportFixForBranch(rows, rows[1]!)).toEqual({
      repo: OCIS,
      sha: 'sha-15',
      versions: ['9.0'],
    });
  });

  it('falls back to the most recently merged PR, same as backportFixes', () => {
    const rows = [
      row({
        repo: OCIS,
        branch: 'stable-8.0',
        required: false,
        status: 'merged',
        prs: [linkedIn(OCIS, 16, 'stable-8.0')],
      }),
      row({ repo: OCIS, branch: 'stable-9.0', status: 'missing' }),
    ];
    expect(backportFixForBranch(rows, rows[1]!)).toEqual({
      repo: OCIS,
      sha: 'sha-16',
      versions: ['9.0'],
    });
  });

  it('returns null for a row that is not a gap', () => {
    const rows = [
      row({
        repo: OCIS,
        branch: 'master',
        isDefault: true,
        status: 'merged',
        prs: [linkedIn(OCIS, 17, 'master')],
      }),
      row({ repo: OCIS, branch: 'stable-9.0', status: 'included' }),
      row({ repo: OCIS, branch: 'stable-8.1', status: 'missing', required: false }),
      row({
        repo: OCIS,
        branch: 'stable-8.0',
        status: 'missing',
        pinnedVia: { repo: REVA, version: 'v2.1.0' },
      }),
    ];
    expect(backportFixForBranch(rows, rows[1]!)).toBeNull();
    expect(backportFixForBranch(rows, rows[2]!)).toBeNull();
    expect(backportFixForBranch(rows, rows[3]!)).toBeNull();
  });

  it('returns null when the repo has no resolvable sha for that cell', () => {
    const rows = [row({ repo: OCIS, branch: 'stable-9.0', status: 'missing' })];
    expect(backportFixForBranch(rows, rows[0]!)).toBeNull();
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
