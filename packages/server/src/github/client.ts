import type { PullRequest, RepoInfo, RepoName } from '@ocis-dashboard/core';
import { githubHeaders } from '../auth/github';
import { AppError, UpstreamError } from '../errors';
import { requestJson } from '../http';
import type { CodeHost, SearchHits } from '../report/ports';
import { chunk } from '../util/map-limit';
import { toIssue, toPullRequest, type GraphQLIssue, type GraphQLPullRequest } from './mapper';

const REST_URL = 'https://api.github.com';
const GRAPHQL_URL = `${REST_URL}/graphql`;
/** Aliased sub-queries per GraphQL request; keeps each request cheap. */
const BATCH_SIZE = 10;

const PR_FIELDS = `
  fragment PrFields on PullRequest {
    number title body url state createdAt mergedAt updatedAt headRefName baseRefName
    isDraft reviewDecision
    author { login }
    commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
    repository { nameWithOwner }
    closingIssuesReferences(first: 10) {
      nodes { number title url repository { nameWithOwner } }
    }
  }`;

const ISSUE_FIELDS = `
  fragment IssueFields on Issue {
    number title body url state
    repository { nameWithOwner }
  }`;

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string; type?: string; path?: (string | number)[] }[];
}

type SearchNode =
  | (GraphQLPullRequest & { __typename: 'PullRequest' })
  | (GraphQLIssue & { __typename: 'Issue' })
  | { __typename: string };
type SearchResult = Record<string, { nodes: SearchNode[] }>;

/** The part of GitHub's compare API response we use. */
interface CompareResponse {
  merge_base_commit?: { commit: { committer?: { date?: string } } };
}

interface RepoResult {
  repository: {
    defaultBranchRef: { name: string } | null;
    [alias: string]: unknown;
  } | null;
}

/** Read-only GitHub client acting as the signed-in user. */
export class GitHubClient implements CodeHost {
  constructor(private readonly token: string) {}

  async repoInfo(repo: RepoName, candidateBranches: string[]): Promise<RepoInfo> {
    const [owner, name] = repo.split('/');
    const refs = candidateBranches
      .map(
        (branch, i) =>
          `b${i}: ref(qualifiedName: ${JSON.stringify(`refs/heads/${branch}`)}) { name }`,
      )
      .join('\n');
    const data = await this.graphql<RepoResult>(
      `query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) { defaultBranchRef { name } ${refs} }
      }`,
      { owner, name },
    );
    const repository = data.repository;
    if (!repository?.defaultBranchRef) {
      throw new AppError(404, 'repo_not_found', `Repository ${repo} not found or not accessible.`);
    }
    const defaultBranch = repository.defaultBranchRef.name;
    const branches = candidateBranches.filter((_, i) => repository[`b${i}`] != null);
    const points = await Promise.all(
      branches.map(async (branch) => [branch, await this.branchPoint(repo, defaultBranch, branch)]),
    );
    return {
      name: repo,
      defaultBranch,
      branches,
      branchPoints: Object.fromEntries(points.filter(([, date]) => date !== null)),
    };
  }

  /**
   * When `branch` split off `defaultBranch`: the date of their merge-base commit.
   * Null if GitHub can't compare them (e.g. unrelated histories answer 404);
   * that branch then just has no known branch point.
   */
  private async branchPoint(
    repo: RepoName,
    defaultBranch: string,
    branch: string,
  ): Promise<string | null> {
    // per_page=1: we only need the merge base, not the list of differing commits.
    const url = `${REST_URL}/repos/${repo}/compare/${refPath(defaultBranch)}...${refPath(branch)}?per_page=1`;
    try {
      const compare = await requestJson<CompareResponse>('github', url, {
        headers: githubHeaders(this.token),
      });
      return compare.merge_base_commit?.commit.committer?.date ?? null;
    } catch (error) {
      if (error instanceof UpstreamError && (error.status === 404 || error.status === 422)) {
        return null;
      }
      throw error;
    }
  }

  async search(queries: string[]): Promise<SearchHits[]> {
    const results: SearchHits[] = [];
    for (const batch of chunk(queries, BATCH_SIZE)) {
      const variables = Object.fromEntries(batch.map((query, i) => [`q${i}`, query]));
      const declarations = batch.map((_, i) => `$q${i}: String!`).join(', ');
      const fields = batch
        .map(
          (_, i) =>
            `s${i}: search(query: $q${i}, type: ISSUE, first: 50) { nodes { __typename ...PrFields ...IssueFields } }`,
        )
        .join('\n');
      const { data, errors } = await this.graphqlWithErrors<SearchResult>(
        `query(${declarations}) { ${fields} } ${PR_FIELDS} ${ISSUE_FIELDS}`,
        variables,
      );
      // A failed search must not look like "no PRs": that result would be cached.
      const failed = errors.filter((error) => batch.some((_, i) => error.path?.[0] === `s${i}`));
      if (failed.length > 0) {
        const message = failed.map((error) => error.message).join('; ');
        throw new AppError(502, 'github_error', `GitHub search failed: ${message}`, 'github');
      }
      batch.forEach((_, i) => {
        const nodes = data[`s${i}`]?.nodes ?? [];
        results.push({
          pullRequests: nodes.filter(isPullRequest).map(toPullRequest),
          issues: nodes.filter(isIssue).map(toIssue),
        });
      });
    }
    return results;
  }

  async pullRequests(repo: RepoName, numbers: number[]): Promise<PullRequest[]> {
    const [owner, name] = repo.split('/');
    const prs: PullRequest[] = [];
    for (const batch of chunk(numbers, BATCH_SIZE * 2)) {
      const fields = batch
        .map((n) => `p${n}: pullRequest(number: ${n}) { ...PrFields }`)
        .join('\n');
      const data = await this.graphql<RepoResult>(
        `query($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) { ${fields} }
        } ${PR_FIELDS}`,
        { owner, name },
      );
      for (const n of batch) {
        const node = data.repository?.[`p${n}`] as GraphQLPullRequest | null | undefined;
        if (node) prs.push(toPullRequest(node));
      }
    }
    return prs;
  }

  /**
   * Partial results are accepted: a link to a deleted PR yields an error for
   * that field only, and the rest of the data is still usable.
   */
  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    return (await this.graphqlWithErrors<T>(query, variables)).data;
  }

  /** Like `graphql`, but also returns the errors of fields that failed. */
  private async graphqlWithErrors<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<{ data: T; errors: NonNullable<GraphQLResponse<T>['errors']> }> {
    const response = await requestJson<GraphQLResponse<T>>('github', GRAPHQL_URL, {
      headers: githubHeaders(this.token),
      json: { query, variables },
    });
    if (!response.data) {
      const message = response.errors?.map((error) => error.message).join('; ') ?? 'unknown error';
      throw new AppError(502, 'github_error', `GitHub query failed: ${message}`, 'github');
    }
    return { data: response.data, errors: response.errors ?? [] };
  }
}

/** Encodes a branch name for a URL path, keeping `/` (GitHub expects `release/9.0` as is). */
function refPath(branch: string): string {
  return branch.split('/').map(encodeURIComponent).join('/');
}

function isPullRequest(
  node: SearchNode,
): node is GraphQLPullRequest & { __typename: 'PullRequest' } {
  return node.__typename === 'PullRequest';
}

function isIssue(node: SearchNode): node is GraphQLIssue & { __typename: 'Issue' } {
  return node.__typename === 'Issue';
}
