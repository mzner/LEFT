import type { LinkedPr, PullRequest, ReportResponse, TicketReport } from '@ocis-dashboard/core';
import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import { planJiraLink } from './jira-link';

const url = (number: number) => `https://github.com/owncloud/ocis/pull/${number}`;

function linked(
  number: number,
  overrides: Partial<LinkedPr> & Partial<PullRequest> = {},
): LinkedPr {
  const { linkedInJira = false, state = 'merged', isBackport = false } = overrides;
  return {
    pr: {
      repo: 'owncloud/ocis',
      number,
      title: 'Fix roles',
      state,
      url: url(number),
    } as PullRequest,
    sources: ['title'],
    isBackport,
    intoDefault: true,
    backportOf: [],
    linkedInJira,
    keyInPr: true,
  };
}

const response = (prs: LinkedPr[], mentions: PullRequest[] = []): ReportResponse => ({
  generatedAt: '',
  repos: [],
  reports: [{ ticket: { key: 'OCISDEV-1' }, prs, mentions } as unknown as TicketReport],
});

const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof AppError ? error.code : error;
  }
  return 'no error';
};

describe('planJiraLink', () => {
  it('titles the link "backport #N" for a backport and "PR #N" for other PRs', () => {
    const report = response([linked(5, { isBackport: true }), linked(6)]);
    expect(planJiraLink(report, 'OCISDEV-1', url(5))).toEqual({
      kind: 'link',
      link: { url: url(5), title: 'backport #5' },
    });
    expect(planJiraLink(report, 'OCISDEV-1', url(6))).toEqual({
      kind: 'link',
      link: { url: url(6), title: 'PR #6' },
    });
  });

  it('writes nothing when Jira already has the link', () => {
    const plan = planJiraLink(response([linked(5, { linkedInJira: true })]), 'OCISDEV-1', url(5));
    expect(plan).toEqual({ kind: 'already-linked' });
  });

  it('refuses unknown tickets, PRs that only mention the key, and abandoned PRs', () => {
    const report = response([linked(5), linked(6, { state: 'closed' })], [linked(7).pr]);
    expect(refusal(() => planJiraLink(report, 'OCISDEV-2', url(5)))).toBe('not_linkable');
    expect(refusal(() => planJiraLink(report, 'OCISDEV-1', url(7)))).toBe('not_linkable');
    expect(refusal(() => planJiraLink(report, 'OCISDEV-1', url(6)))).toBe('not_linkable');
  });
});
