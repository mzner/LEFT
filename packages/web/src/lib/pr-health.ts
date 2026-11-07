import { ageInDays, type PullRequest } from '@ocis-dashboard/core';
import { plural } from './format';

export type HealthTone = 'good' | 'bad' | 'wait' | 'muted';

export interface HealthChip {
  text: string;
  tone: HealthTone;
}

const CHECKS: Partial<Record<PullRequest['checks'], HealthChip>> = {
  passing: { text: 'CI passing', tone: 'good' },
  failing: { text: 'CI failing', tone: 'bad' },
  pending: { text: 'CI running', tone: 'wait' },
};

const REVIEW: Partial<Record<PullRequest['review'], HealthChip>> = {
  approved: { text: 'Approved', tone: 'good' },
  changes_requested: { text: 'Changes requested', tone: 'bad' },
  review_required: { text: 'Review required', tone: 'wait' },
};

/** How long a PR has been open: whole days, like the "Backport stale" flag counts them. */
export function openFor(createdAt: string, now: Date = new Date()): string {
  const days = ageInDays(createdAt, now);
  return days === 0 ? 'Opened today' : `Open ${plural(days, 'day')}`;
}

/**
 * What to know about an open PR before chasing it: age, draft, CI and review.
 * Nothing for merged or closed PRs. No chip for "no checks" or "no review rule",
 * since there is nothing to act on.
 */
export function prHealth(pr: PullRequest, now: Date = new Date()): HealthChip[] {
  if (pr.state !== 'open') return [];
  const chips: HealthChip[] = [{ text: openFor(pr.createdAt, now), tone: 'muted' }];
  if (pr.isDraft) chips.push({ text: 'Draft', tone: 'muted' });
  for (const chip of [CHECKS[pr.checks], REVIEW[pr.review]]) if (chip) chips.push(chip);
  return chips;
}

/** The same facts as one line, e.g. for a tooltip. Empty for PRs that aren't open. */
export function healthSummary(pr: PullRequest, now: Date = new Date()): string {
  return prHealth(pr, now)
    .map((chip) => chip.text)
    .join(' · ');
}
