import type { BranchCoverage, TicketReport } from '@ocis-dashboard/core';
import { describe, expect, it } from 'vitest';
import { branchOptions, doneButUnfinished, filterReports, sortDate, sortReports } from './view';

const OCIS = 'owncloud/ocis';

function report(key: string, coverage: Partial<BranchCoverage>[]): TicketReport {
  return {
    ticket: {
      key,
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
    coverage: coverage.map((c) => ({
      repo: OCIS,
      branch: 'stable-7.0',
      required: true,
      status: 'missing',
      prNumbers: [],
      ...c,
    })),
    otherRepoLinks: [],
    unlinkedIssues: [],
    flags: [],
  };
}

describe('branch filter', () => {
  // OCISDEV-2 once had a backport to stable-7.0 that was closed; no fix version asks for it.
  const reports = [
    report('OCISDEV-1', [{ required: true, status: 'missing' }]),
    report('OCISDEV-2', [{ required: false, status: 'missing' }]),
  ];

  it('counts missing only where a fix version needs the branch', () => {
    expect(branchOptions(reports)).toMatchObject([{ branch: 'stable-7.0', total: 2, missing: 1 }]);
  });

  it('filters "missing on" the same way', () => {
    const shown = filterReports(reports, {
      problem: 'all',
      assignee: 'all',
      search: '',
      branch: { repo: OCIS, branch: 'stable-7.0', which: 'missing' },
    });
    expect(shown.map((r) => r.ticket.key)).toEqual(['OCISDEV-1']);
  });
});

describe('sortReports', () => {
  /** A PR merged at `merged` (or still open), last touched at `activity`. */
  type Pr = { merged: string | null; activity: string };
  const at = (key: string, created: string, updated: string, prs: Pr[]) => {
    const base = report(key, []);
    return {
      ...base,
      ticket: { ...base.ticket, created, updated },
      prs: prs.map(({ merged, activity }, i) => ({
        pr: {
          repo: OCIS,
          number: i + 1,
          title: '',
          body: '',
          headRef: '',
          baseRef: 'master',
          state: merged ? ('merged' as const) : ('open' as const),
          createdAt: '2026-10-01T10:00:00Z',
          mergedAt: merged,
          updatedAt: activity,
          url: `https://github.com/${OCIS}/pull/${key}-${i}`,
          author: null,
          isDraft: false,
          checks: 'none' as const,
          review: 'none' as const,
          closingIssues: [],
        },
        sources: ['title' as const],
        isBackport: false,
        intoDefault: true,
        backportOf: [],
        linkedInJira: true,
        keyInPr: true,
      })),
    };
  };
  const a = at('OCISDEV-1', '2026-10-01T09:00:00.000+0200', '2026-10-30T09:00:00.000+0200', [
    { merged: '2026-10-05T10:00:00Z', activity: '2026-10-05T10:00:00Z' },
  ]);
  const b = at('OCISDEV-2', '2026-10-10T09:00:00.000+0200', '2026-10-12T09:00:00.000+0200', [
    { merged: '2026-10-20T10:00:00Z', activity: '2026-10-20T10:00:00Z' },
    { merged: '2026-10-02T10:00:00Z', activity: '2026-10-02T10:00:00Z' },
  ]);
  // Nothing merged yet, but someone pushed to the open PR last.
  const c = at('OCISDEV-3', '2026-10-05T09:00:00.000+0200', '2026-10-20T09:00:00.000-0800', [
    { merged: null, activity: '2026-11-01T08:00:00Z' },
  ]);
  const keys = (sort: Parameters<typeof sortReports>[1]) =>
    sortReports([a, b, c], sort).map((r) => r.ticket.key);

  it('keeps Jira’s order by default', () => {
    expect(keys('jira')).toEqual(['OCISDEV-1', 'OCISDEV-2', 'OCISDEV-3']);
  });

  it('sorts by Jira dates, newest first, reading Jira’s +HHMM offsets', () => {
    expect(keys('updated')).toEqual(['OCISDEV-1', 'OCISDEV-3', 'OCISDEV-2']);
    expect(keys('created')).toEqual(['OCISDEV-2', 'OCISDEV-3', 'OCISDEV-1']);
  });

  it('sorts by the latest PR merge, tickets with nothing merged last', () => {
    expect(keys('merged')).toEqual(['OCISDEV-2', 'OCISDEV-1', 'OCISDEV-3']);
    expect(sortDate(b, 'merged')).toBe('2026-10-20T10:00:00Z');
    expect(sortDate(c, 'merged')).toBeUndefined();
  });

  it('sorts by the latest PR activity, open PRs included', () => {
    expect(keys('activity')).toEqual(['OCISDEV-3', 'OCISDEV-2', 'OCISDEV-1']);
  });
});

describe('doneButUnfinished', () => {
  const withFlags = (statusCategory: 'done' | 'progress', severities: ('error' | 'warning')[]) => {
    const base = report('OCISDEV-9', []);
    return {
      ...base,
      ticket: { ...base.ticket, statusCategory },
      flags: severities.map((severity) => ({ code: 'NO_PR' as const, severity, message: '' })),
    };
  };

  it('counts what is left to fix on a done ticket', () => {
    expect(doneButUnfinished(withFlags('done', ['error']))).toBe('1 problem');
    expect(doneButUnfinished(withFlags('done', ['error', 'error', 'warning']))).toBe('2 problems');
  });

  it('says nothing for open tickets, clean tickets, or only waiting problems', () => {
    expect(doneButUnfinished(withFlags('progress', ['error']))).toBeUndefined();
    expect(doneButUnfinished(withFlags('done', []))).toBeUndefined();
    expect(doneButUnfinished(withFlags('done', ['warning']))).toBeUndefined();
  });
});
