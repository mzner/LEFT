import { describe, expect, it } from 'vitest';
import { blockerCounts, computeReadiness, releaseTargets, type ReleaseTarget } from './readiness';
import { buildReports } from './report';
import type { PullRequest, RepoInfo, Ticket } from './types';

const OCIS = 'owncloud/ocis';
const REVA = 'owncloud/reva';
const V9 = 'Frances - 9.0.0';

const ocis: RepoInfo = { name: OCIS, defaultBranch: 'master', branches: ['stable-9.0'] };
const reva: RepoInfo = { name: REVA, defaultBranch: 'main', branches: [] };

let next = 1;
function pr(overrides: Partial<PullRequest>): PullRequest {
  const number = overrides.number ?? next++;
  return {
    repo: OCIS,
    number,
    title: '[OCISDEV-1] fix',
    body: '',
    headRef: `fix-${number}`,
    baseRef: 'master',
    state: 'merged',
    createdAt: '2026-10-19T10:00:00Z',
    mergedAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    url: `https://github.com/${overrides.repo ?? OCIS}/pull/${number}`,
    author: 'dev',
    isDraft: false,
    checks: 'none',
    review: 'none',
    closingIssues: [],
    ...overrides,
  };
}

function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    key: 'OCISDEV-1',
    summary: 'Fix the thing',
    status: 'Done',
    statusCategory: 'done',
    issueType: 'Bug',
    url: 'https://example.atlassian.net/browse/OCISDEV-1',
    assignee: null,
    fixVersions: [V9],
    remoteLinkUrls: [],
    created: '2026-10-01T09:00:00Z',
    updated: '2026-10-20T09:00:00Z',
    ...overrides,
  };
}

function readiness(
  tickets: Ticket[],
  prs: PullRequest[],
  repos: RepoInfo[] = [ocis],
  version = V9,
  isMarkedFixed?: (key: string) => boolean,
) {
  // Link every PR in Jira, so link hygiene doesn't add notes unless a test wants it.
  const linked = tickets.map((t) => ({
    ...t,
    remoteLinkUrls: t.remoteLinkUrls.length > 0 ? t.remoteLinkUrls : prs.map((p) => p.url),
  }));
  const reports = buildReports({
    projectKey: 'OCISDEV',
    tickets: linked,
    pullRequests: prs,
    repos,
  });
  return computeReadiness(reports, releaseTargets(version, repos), { isMarkedFixed });
}

const merged = (base = 'master') => pr({ baseRef: base });
const open = (base = 'master') => pr({ baseRef: base, state: 'open', mergedAt: null });

describe('releaseTargets', () => {
  it('ships from the release branch when it exists, else from the default branch', () => {
    expect(releaseTargets(V9, [ocis, reva])).toEqual<ReleaseTarget[]>([
      { repo: OCIS, branch: 'stable-9.0', isDefault: false },
      { repo: REVA, branch: 'main', isDefault: true, notCutYet: 'stable-9.0' },
    ]);
  });

  it('ships a version without a number from the default branch', () => {
    expect(releaseTargets('Ghez', [ocis])).toEqual([
      { repo: OCIS, branch: 'master', isDefault: true },
    ]);
  });

  it('follows per-repo branch templates', () => {
    const web: RepoInfo = {
      name: 'owncloud/web',
      defaultBranch: 'master',
      branches: ['release-9.0'],
    };
    expect(releaseTargets(V9, [web], { 'owncloud/web': 'release-{major}.{minor}' })).toEqual([
      { repo: 'owncloud/web', branch: 'release-9.0', isDefault: false },
    ]);
  });
});

describe('computeReadiness', () => {
  it('is go when every ticket is done and on the release branch', () => {
    const result = readiness([ticket()], [merged(), merged('stable-9.0')]);
    expect(result).toEqual({ verdict: 'go', total: 1, blocking: [], tidy: [] });
  });

  it('is empty without tickets', () => {
    expect(readiness([], []).verdict).toBe('empty');
  });

  it('blocks on a ticket that is not done in Jira', () => {
    const result = readiness(
      [ticket({ status: 'In Review', statusCategory: 'progress' })],
      [merged(), merged('stable-9.0')],
    );
    expect(result.verdict).toBe('no-go');
    expect(result.blocking[0]!.blockers).toEqual([
      { reason: 'not-done', kind: 'status', text: 'In Review in Jira' },
    ]);
  });

  it('blocks on a missing or open backport to the release branch', () => {
    expect(readiness([ticket()], [merged()]).blocking[0]!.blockers).toEqual([
      { reason: 'not-on-branch', kind: 'code', text: 'Not on stable-9.0' },
    ]);
    expect(readiness([ticket()], [merged(), open('stable-9.0')]).blocking[0]!.blockers).toEqual([
      { reason: 'not-merged', kind: 'code', text: 'Backport to stable-9.0 not merged yet' },
    ]);
  });

  it('accepts a fix the release branch already contains from before it was cut', () => {
    const cutLater = { ...ocis, branchPoints: { 'stable-9.0': '2026-11-01T00:00:00Z' } };
    expect(readiness([ticket()], [merged()], [cutLater]).verdict).toBe('go');
  });

  it('blocks on a ticket without a PR, and ignores PRs closed without merging', () => {
    const result = readiness([ticket()], [pr({ state: 'closed', mergedAt: null })]);
    expect(result.blocking[0]!.blockers).toEqual([
      { reason: 'no-pr', kind: 'code', text: 'No PR' },
    ]);
  });

  it('checks the default branch for a version that ships from it', () => {
    expect(readiness([ticket({ fixVersions: ['Ghez'] })], [merged()], [ocis], 'Ghez').verdict).toBe(
      'go',
    );
    const followUp = readiness(
      [ticket({ fixVersions: ['Ghez'] })],
      [merged(), open()],
      [ocis],
      'Ghez',
    );
    expect(followUp.blocking[0]!.blockers).toEqual([
      { reason: 'not-merged', kind: 'code', text: 'PR into master not merged yet' },
    ]);
  });

  it('only checks repos the ticket has PRs in, and names the repo when there are several', () => {
    const repos = [ocis, reva];
    expect(readiness([ticket()], [merged(), merged('stable-9.0')], repos).verdict).toBe('go');
    const revaOpen = pr({ repo: REVA, baseRef: 'main', state: 'open', mergedAt: null });
    const result = readiness([ticket()], [merged(), merged('stable-9.0'), revaOpen], repos);
    expect(result.blocking[0]!.blockers).toEqual([
      { reason: 'not-merged', kind: 'code', text: `PR into main (${REVA}) not merged yet` },
    ]);
  });

  it("doesn't block on another version's backport, or on link and key hygiene", () => {
    const both = ticket({ fixVersions: [V9, 'Curie S9 - 8.0.10'], remoteLinkUrls: ['x'] });
    const repo = { ...ocis, branches: ['stable-9.0', 'stable-8.0'] };
    const result = readiness([both], [merged(), merged('stable-9.0')], [repo]);
    expect(result.verdict).toBe('go');
    // Not linked in Jira, twice: a note, not a blocker. The missing stable-8.0 backport is neither.
    expect(result.tidy[0]!.notes).toHaveLength(2);
    expect(result.tidy[0]!.notes[0]).toContain('not linked in Jira');
  });

  it('trusts a ticket marked fixed for its code, but not for its Jira status', () => {
    const marked = () => true;
    expect(readiness([ticket()], [merged()], [ocis], V9, marked).verdict).toBe('go');
    const notDone = ticket({ status: 'In Progress', statusCategory: 'progress' });
    const result = readiness([notDone], [merged()], [ocis], V9, marked);
    expect(result.blocking[0]!.blockers).toEqual([
      { reason: 'not-done', kind: 'status', text: 'In Progress in Jira' },
    ]);
  });
});

describe('blockerCounts', () => {
  it('counts tickets per reason, in display order, leaving out zeros', () => {
    const tickets = [
      ticket({ key: 'OCISDEV-1', status: 'In Review', statusCategory: 'progress' }),
      ticket({ key: 'OCISDEV-2', status: 'To Do', statusCategory: 'todo' }),
      ticket({ key: 'OCISDEV-3' }),
    ];
    // Each PR mentions all three keys, so every ticket has the same PRs: merged into master only.
    const prs = [pr({ title: '[OCISDEV-1] [OCISDEV-2] [OCISDEV-3] fix' })];
    const result = readiness(tickets, prs);
    expect(blockerCounts(result)).toEqual([
      { reason: 'not-done', count: 2 },
      { reason: 'not-on-branch', count: 3 },
    ]);
  });

  it('is empty for a go', () => {
    expect(blockerCounts(readiness([ticket()], [merged(), merged('stable-9.0')]))).toEqual([]);
  });
});
