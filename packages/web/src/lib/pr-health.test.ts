import type { PullRequest } from '@ocis-dashboard/core';
import { describe, expect, it } from 'vitest';
import { healthSummary, openFor, prHealth } from './pr-health';

const NOW = new Date('2026-10-22T12:00:00Z');

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    repo: 'owncloud/ocis',
    number: 1,
    title: '',
    body: '',
    headRef: '',
    baseRef: 'master',
    state: 'open',
    createdAt: '2026-10-10T12:00:00Z',
    mergedAt: null,
    updatedAt: '2026-10-21T12:00:00Z',
    url: '',
    author: null,
    isDraft: false,
    checks: 'none',
    review: 'none',
    closingIssues: [],
    ...overrides,
  };
}

describe('openFor', () => {
  it('counts whole days', () => {
    expect(openFor('2026-10-22T01:00:00Z', NOW)).toBe('Opened today');
    expect(openFor('2026-10-21T12:00:00Z', NOW)).toBe('Open 1 day');
    expect(openFor('2026-10-10T13:00:00Z', NOW)).toBe('Open 11 days');
  });

  it('never goes negative when clocks disagree', () => {
    expect(openFor('2026-10-23T12:00:00Z', NOW)).toBe('Opened today');
  });
});

describe('prHealth', () => {
  it('shows age, CI and review of an open PR', () => {
    expect(prHealth(pr({ checks: 'failing', review: 'changes_requested' }), NOW)).toEqual([
      { text: 'Open 12 days', tone: 'muted' },
      { text: 'CI failing', tone: 'bad' },
      { text: 'Changes requested', tone: 'bad' },
    ]);
  });

  it('marks drafts, and running or passing CI', () => {
    expect(prHealth(pr({ isDraft: true, checks: 'pending', review: 'approved' }), NOW)).toEqual([
      { text: 'Open 12 days', tone: 'muted' },
      { text: 'Draft', tone: 'muted' },
      { text: 'CI running', tone: 'wait' },
      { text: 'Approved', tone: 'good' },
    ]);
    expect(prHealth(pr({ checks: 'passing', review: 'review_required' }), NOW).slice(1)).toEqual([
      { text: 'CI passing', tone: 'good' },
      { text: 'Review required', tone: 'wait' },
    ]);
  });

  it('says nothing about checks or reviews that GitHub has no verdict on', () => {
    expect(prHealth(pr(), NOW)).toEqual([{ text: 'Open 12 days', tone: 'muted' }]);
  });

  it('has nothing for merged or closed PRs', () => {
    expect(prHealth(pr({ state: 'merged', checks: 'passing', review: 'approved' }), NOW)).toEqual(
      [],
    );
    expect(prHealth(pr({ state: 'closed' }), NOW)).toEqual([]);
  });
});

describe('healthSummary', () => {
  it('joins the chips into one line', () => {
    expect(healthSummary(pr({ checks: 'failing', review: 'review_required' }), NOW)).toBe(
      'Open 12 days · CI failing · Review required',
    );
    expect(healthSummary(pr({ state: 'merged' }), NOW)).toBe('');
  });
});
