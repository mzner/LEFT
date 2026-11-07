import type { GitHubIssue, PullRequest, Ticket } from '@ocis-dashboard/core';
import { describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../util/ttl-cache';
import type { CodeHost, SearchHits, TicketSource } from './ports';
import { ReportService } from './service';

const OCIS = 'owncloud/ocis';

const ticket: Ticket = {
  key: 'OCISDEV-1464',
  summary: 'Multi-instance guest roles',
  status: 'Done',
  statusCategory: 'done',
  issueType: 'Bug',
  url: 'https://example.atlassian.net/browse/OCISDEV-1464',
  assignee: null,
  fixVersions: ['Frances - 9.0.0'],
  remoteLinkUrls: [],
  created: '2026-10-01T09:00:00.000+0200',
  updated: '2026-10-20T09:00:00.000+0200',
};

const hits = (pullRequests: PullRequest[]): SearchHits => ({ pullRequests, issues: [] });

function issue(number: number, body: string): GitHubIssue {
  return {
    repo: OCIS,
    number,
    title: 'Guests get no role',
    body,
    url: `https://github.com/${OCIS}/issues/${number}`,
    state: 'open',
  };
}

function pr(number: number, overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    repo: OCIS,
    number,
    title: `[OCISDEV-1464] change ${number}`,
    body: '',
    headRef: `branch-${number}`,
    baseRef: 'master',
    state: 'merged',
    createdAt: '2026-10-19T10:00:00Z',
    mergedAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-30T10:00:00Z',
    url: `https://github.com/${OCIS}/pull/${number}`,
    author: 'dev',
    isDraft: false,
    checks: 'none',
    review: 'none',
    closingIssues: [],
    ...overrides,
  };
}

function setup() {
  const tickets: TicketSource = {
    sprintTickets: vi.fn(async () => [ticket]),
    ticketsUpdatedBetween: vi.fn(async () => [ticket]),
    ticketsInVersion: vi.fn(async () => [ticket]),
    remoteLinkUrls: vi.fn(async () => [
      `https://github.com/${OCIS}/pull/13231`,
      `https://github.com/${OCIS}/pull/99`,
    ]),
  };
  const code: CodeHost = {
    repoInfo: vi.fn(async (name: string, branches: string[]) => ({
      name,
      defaultBranch: 'master',
      branches: branches.filter((branch) => branch === 'stable-9.0'),
    })),
    search: vi.fn(async (queries: string[]) =>
      queries.map((query) => {
        // The key search finds PRs and issues; the issue mentions the key in its description.
        if (query.includes('"OCISDEV-1464"')) {
          return { pullRequests: [pr(13231)], issues: [issue(13200, '## [OCISDEV-1464]')] };
        }
        // Keyless backport of #13231, found through the body search.
        if (query.includes('in:body "13231"')) {
          return hits([
            pr(13247, { title: 'backport', baseRef: 'stable-9.0', body: 'Backport of #13231' }),
          ]);
        }
        return hits([]);
      }),
    ),
    // #99 is only known from the Jira remote link.
    pullRequests: vi.fn(async () => [pr(99, { title: 'docs', baseRef: 'master' })]),
  };
  const service = new ReportService({
    tickets,
    code,
    projectKey: 'OCISDEV',
    branchTemplates: {},
    staleBackportDays: 7,
    cache: new TtlCache(60_000),
  });
  return { service, tickets, code };
}

describe('ReportService', () => {
  it('combines key search, Jira links and keyless backports into one report', async () => {
    const { service, code } = setup();

    const response = await service.build({ kind: 'sprint', sprintId: 27 }, [OCIS]);

    expect(code.repoInfo).toHaveBeenCalledWith(OCIS, ['stable-9.0']);
    expect(code.pullRequests).toHaveBeenCalledWith(OCIS, [99]);
    const [report] = response.reports;
    expect(report!.prs.map((linked) => linked.pr.number).sort((a, b) => a - b)).toEqual([
      99, 13231, 13247,
    ]);
    expect(report!.coverage).toEqual([
      { repo: OCIS, branch: 'stable-9.0', required: true, status: 'merged', prNumbers: [13247] },
    ]);
    expect(report!.flags.map((flag) => flag.code)).toEqual([
      'NOT_LINKED_IN_JIRA', // #13247
      'KEY_MISSING_IN_PR', // #99
      'KEY_MISSING_IN_PR', // #13247
      'ISSUE_NOT_LINKED', // issue #13200 mentions the key, no PR closes it
    ]);
    expect(report!.unlinkedIssues.map((i) => i.number)).toEqual([13200]);
    // One search per ticket finds PRs and issues: no `is:pr`.
    expect(vi.mocked(code.search).mock.calls[0]![0]).toEqual([`repo:${OCIS} "OCISDEV-1464"`]);
  });

  it('serves repeated reports from the cache', async () => {
    const { service, tickets, code } = setup();

    await service.build({ kind: 'sprint', sprintId: 27 }, [OCIS]);
    await service.build({ kind: 'sprint', sprintId: 27 }, [OCIS]);

    expect(tickets.sprintTickets).toHaveBeenCalledTimes(1);
    expect(tickets.remoteLinkUrls).toHaveBeenCalledTimes(1);
    // key search, backports of #13231/#99, backports of the found backport #13247
    expect(code.search).toHaveBeenCalledTimes(3);
  });

  it("reads a ticket's Jira links again after they were forgotten, and nothing else", async () => {
    const { service, tickets, code } = setup();
    const selection = { kind: 'sprint', sprintId: 27 } as const;
    await service.build(selection, [OCIS]);
    const searches = vi.mocked(code.search).mock.calls.length;

    service.forgetRemoteLinks('OCISDEV-1464');
    await service.build(selection, [OCIS]);

    expect(tickets.remoteLinkUrls).toHaveBeenCalledTimes(2);
    expect(tickets.sprintTickets).toHaveBeenCalledTimes(1);
    expect(code.search).toHaveBeenCalledTimes(searches);
  });

  it('reports progress for every step, ending each with done === total', async () => {
    const { service } = setup();
    const events: string[] = [];

    await service.build({ kind: 'sprint', sprintId: 27 }, [OCIS], {
      onProgress: ({ step, done, total }) => events.push(`${step} ${done}/${total}`),
    });

    expect(events).toEqual([
      'tickets 0/0',
      'tickets 1/1',
      'links 0/1',
      'links 1/1',
      'pulls 0/1',
      'pulls 1/1',
      'backports 0/0',
      'backports 0/2', // first hop: backports of #13231 and #99
      'backports 2/2',
      'backports 2/3', // second hop: backports of the backport #13247
      'backports 3/3',
    ]);
  });

  it('follows a keyless backport of a backport', async () => {
    const { service, code } = setup();
    const searchMock = vi.mocked(code.search);
    const original = searchMock.getMockImplementation()!;
    searchMock.mockImplementation(async (queries) => {
      const results = await original(queries);
      return queries.map((query, i) =>
        query.includes('in:body "13247"')
          ? hits([
              pr(13280, { title: 'backport', baseRef: 'stable-8.0', body: 'Backport of #13247' }),
            ])
          : results[i]!,
      );
    });

    const { reports } = await service.build({ kind: 'sprint', sprintId: 27 }, [OCIS]);

    const numbers = reports[0]!.prs.map((linked) => linked.pr.number);
    expect(numbers).toContain(13280);
  });

  it('stops calling Jira and GitHub once aborted', async () => {
    const { service, tickets, code } = setup();
    const controller = new AbortController();
    vi.mocked(tickets.remoteLinkUrls).mockImplementation(async () => {
      controller.abort();
      return [];
    });

    await expect(
      service.build({ kind: 'sprint', sprintId: 27 }, [OCIS], { signal: controller.signal }),
    ).rejects.toThrow();
    expect(code.repoInfo).not.toHaveBeenCalled();
    expect(code.search).not.toHaveBeenCalled();
  });
});
