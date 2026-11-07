import {
  normalizeRepo,
  type ChecksState,
  type GitHubIssue,
  type PrState,
  type PullRequest,
  type ReviewState,
} from '@ocis-dashboard/core';

/** Shape of the `PrFields` GraphQL fragment. */
export interface GraphQLPullRequest {
  number: number;
  title: string;
  body: string;
  url: string;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  createdAt: string;
  mergedAt: string | null;
  updatedAt: string;
  isDraft: boolean;
  /** Null when the branch doesn't require reviews. */
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  /** The newest commit; its rollup is null when no checks ran. */
  commits: { nodes: { commit: { statusCheckRollup: { state: CheckRollupState } | null } }[] };
  headRefName: string;
  baseRefName: string;
  author: { login: string } | null;
  repository: { nameWithOwner: string };
  closingIssuesReferences: {
    nodes: { number: number; title: string; url: string; repository: { nameWithOwner: string } }[];
  };
}

const STATES: Record<GraphQLPullRequest['state'], PrState> = {
  OPEN: 'open',
  CLOSED: 'closed',
  MERGED: 'merged',
};

/** GitHub's rollup of all checks and statuses on a commit. */
type CheckRollupState = 'SUCCESS' | 'FAILURE' | 'ERROR' | 'PENDING' | 'EXPECTED';

const CHECKS: Partial<Record<CheckRollupState, ChecksState>> = {
  SUCCESS: 'passing',
  FAILURE: 'failing',
  ERROR: 'failing',
  // EXPECTED: a required check that hasn't reported yet.
  PENDING: 'pending',
  EXPECTED: 'pending',
};

const REVIEWS: Partial<Record<NonNullable<GraphQLPullRequest['reviewDecision']>, ReviewState>> = {
  APPROVED: 'approved',
  CHANGES_REQUESTED: 'changes_requested',
  REVIEW_REQUIRED: 'review_required',
};

// A state GitHub adds later reads as "no information" rather than breaking the report.
const checksOf = (node: GraphQLPullRequest): ChecksState => {
  const rollup = node.commits.nodes[0]?.commit.statusCheckRollup;
  return (rollup && CHECKS[rollup.state]) || 'none';
};
const reviewOf = (node: GraphQLPullRequest): ReviewState =>
  (node.reviewDecision && REVIEWS[node.reviewDecision]) || 'none';

export function toPullRequest(node: GraphQLPullRequest): PullRequest {
  return {
    repo: normalizeRepo(node.repository.nameWithOwner),
    number: node.number,
    title: node.title,
    body: node.body,
    headRef: node.headRefName,
    baseRef: node.baseRefName,
    state: STATES[node.state],
    createdAt: node.createdAt,
    mergedAt: node.mergedAt,
    updatedAt: node.updatedAt,
    url: node.url,
    author: node.author?.login ?? null,
    isDraft: node.isDraft,
    checks: checksOf(node),
    review: reviewOf(node),
    closingIssues: node.closingIssuesReferences.nodes.map((issue) => ({
      repo: normalizeRepo(issue.repository.nameWithOwner),
      number: issue.number,
      title: issue.title,
      url: issue.url,
    })),
  };
}

/** Shape of the `IssueFields` GraphQL fragment. */
export interface GraphQLIssue {
  number: number;
  title: string;
  body: string;
  url: string;
  state: 'OPEN' | 'CLOSED';
  repository: { nameWithOwner: string };
}

export function toIssue(node: GraphQLIssue): GitHubIssue {
  return {
    repo: normalizeRepo(node.repository.nameWithOwner),
    number: node.number,
    title: node.title,
    body: node.body,
    url: node.url,
    state: node.state === 'CLOSED' ? 'closed' : 'open',
  };
}
