import { describe, expect, it } from 'vitest';
import { toPullRequest, type GraphQLPullRequest } from './mapper';

function node(overrides: Partial<GraphQLPullRequest> = {}): GraphQLPullRequest {
  return {
    number: 13273,
    title: 'fix: [OCISDEV-1601] open the folder',
    body: '',
    url: 'https://github.com/owncloud/ocis/pull/13273',
    state: 'OPEN',
    createdAt: '2026-10-29T10:00:00Z',
    mergedAt: null,
    updatedAt: '2026-10-30T10:00:00Z',
    isDraft: false,
    reviewDecision: null,
    commits: { nodes: [] },
    headRefName: 'fix',
    baseRefName: 'master',
    author: { login: 'dev' },
    repository: { nameWithOwner: 'ownCloud/ocis' },
    closingIssuesReferences: { nodes: [] },
    ...overrides,
  };
}

const withChecks = (state: string) => ({
  commits: { nodes: [{ commit: { statusCheckRollup: { state } } }] },
});

describe('toPullRequest health', () => {
  it('keeps the creation date and the draft flag', () => {
    const pr = toPullRequest(node({ isDraft: true }));
    expect(pr.createdAt).toBe('2026-10-29T10:00:00Z');
    expect(pr.isDraft).toBe(true);
  });

  it.each([
    ['SUCCESS', 'passing'],
    ['FAILURE', 'failing'],
    ['ERROR', 'failing'],
    ['PENDING', 'pending'],
    ['EXPECTED', 'pending'],
  ])('reads checks %s as %s', (state, expected) => {
    expect(toPullRequest(node(withChecks(state) as never)).checks).toBe(expected);
  });

  it('reads a commit without checks, or a state GitHub adds later, as none', () => {
    expect(toPullRequest(node()).checks).toBe('none');
    expect(
      toPullRequest(node({ commits: { nodes: [{ commit: { statusCheckRollup: null } }] } })).checks,
    ).toBe('none');
    expect(toPullRequest(node(withChecks('SOMETHING_NEW') as never)).checks).toBe('none');
  });

  it.each([
    ['APPROVED', 'approved'],
    ['CHANGES_REQUESTED', 'changes_requested'],
    ['REVIEW_REQUIRED', 'review_required'],
    [null, 'none'],
  ] as const)('reads review decision %s as %s', (decision, expected) => {
    expect(toPullRequest(node({ reviewDecision: decision })).review).toBe(expected);
  });
});
