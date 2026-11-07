import { afterEach, describe, expect, it, vi } from 'vitest';
import { GitHubClient } from './client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('GitHubClient.repoInfo', () => {
  it('keeps a branch without a branch point when GitHub cannot compare it', async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.endsWith('/graphql')) {
          return json(200, {
            data: {
              repository: {
                defaultBranchRef: { name: 'master' },
                b0: { name: 'stable-9.0' },
                b1: { name: 'release/legacy' },
              },
            },
          });
        }
        if (url.includes('stable-9.0')) {
          return json(200, {
            merge_base_commit: { commit: { committer: { date: '2026-10-12T09:51:14Z' } } },
          });
        }
        return json(404, { message: 'No common ancestor' });
      }),
    );

    const info = await new GitHubClient('token').repoInfo('owncloud/ocis', [
      'stable-9.0',
      'release/legacy',
    ]);

    expect(info.branches).toEqual(['stable-9.0', 'release/legacy']);
    expect(info.branchPoints).toEqual({ 'stable-9.0': '2026-10-12T09:51:14Z' });
    // Slashes in branch names stay path separators.
    expect(urls).toContain(
      'https://api.github.com/repos/owncloud/ocis/compare/master...release/legacy?per_page=1',
    );
  });
});

describe('GitHubClient.search', () => {
  it('fails instead of returning no PRs when one search in a batch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(200, {
          data: { s0: { nodes: [] }, s1: null },
          errors: [{ message: 'secondary rate limit', path: ['s1'] }],
        }),
      ),
    );
    await expect(
      new GitHubClient('token').search(['repo:a/b is:pr "X-1"', 'repo:a/b is:pr "X-2"']),
    ).rejects.toThrow(/secondary rate limit/);
  });
});

describe('GitHubClient.search results', () => {
  it('splits PRs and issues', async () => {
    const repository = { nameWithOwner: 'owncloud/ocis' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json(200, {
          data: {
            s0: {
              nodes: [
                {
                  __typename: 'PullRequest',
                  number: 13300,
                  title: '[OCISDEV-1600] fix',
                  body: '',
                  url: 'https://github.com/owncloud/ocis/pull/13300',
                  state: 'OPEN',
                  createdAt: '2026-10-29T10:00:00Z',
                  mergedAt: null,
                  updatedAt: '2026-10-30T10:00:00Z',
                  isDraft: false,
                  reviewDecision: null,
                  commits: { nodes: [] },
                  headRefName: 'fix',
                  baseRefName: 'master',
                  author: null,
                  repository,
                  closingIssuesReferences: { nodes: [] },
                },
                {
                  __typename: 'Issue',
                  number: 13266,
                  title: 'Unclear quota error',
                  body: '## [OCISDEV-1600]',
                  url: 'https://github.com/owncloud/ocis/issues/13266',
                  state: 'CLOSED',
                  repository,
                },
              ],
            },
          },
        }),
      ),
    );

    const [hits] = await new GitHubClient('token').search(['repo:owncloud/ocis "OCISDEV-1600"']);

    expect(hits!.pullRequests.map((pr) => pr.number)).toEqual([13300]);
    expect(hits!.issues).toEqual([
      {
        repo: 'owncloud/ocis',
        number: 13266,
        title: 'Unclear quota error',
        body: '## [OCISDEV-1600]',
        url: 'https://github.com/owncloud/ocis/issues/13266',
        state: 'closed',
      },
    ]);
  });
});
