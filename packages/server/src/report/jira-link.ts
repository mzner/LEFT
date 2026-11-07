import type { ReportResponse } from '@ocis-dashboard/core';
import { AppError } from '../errors';
import type { RemoteLink } from './ports';

/** What linking `prUrl` to ticket `key` should do, judged from a freshly built report. */
export type JiraLinkPlan = { kind: 'link'; link: RemoteLink } | { kind: 'already-linked' };

/**
 * Only a PR that belongs to the ticket and is missing from its Jira links may
 * be linked. The browser's word isn't enough: a Jira link is itself a reason
 * for a PR to count as the ticket's, so linking a PR that only mentions the
 * key (or belongs to another ticket) would quietly change the report.
 */
export function planJiraLink(report: ReportResponse, key: string, prUrl: string): JiraLinkPlan {
  const ticket = report.reports.find((r) => r.ticket.key === key);
  if (!ticket) {
    throw new AppError(409, 'not_linkable', `${key} is not in this report. Refresh and try again.`);
  }
  const linked = ticket.prs.find((l) => l.pr.url === prUrl);
  if (!linked) {
    throw new AppError(
      409,
      'not_linkable',
      `That PR is not one of ${key}'s PRs, so it can't be linked from here.`,
    );
  }
  if (linked.linkedInJira) return { kind: 'already-linked' };
  if (linked.pr.state === 'closed') {
    throw new AppError(409, 'not_linkable', 'That PR was closed without merging; link it in Jira.');
  }
  // The team's pattern: "backport #13255" for backports, "PR #13255" for the others.
  const { number } = linked.pr;
  const title = linked.isBackport ? `backport #${number}` : `PR #${number}`;
  return { kind: 'link', link: { url: prUrl, title } };
}
