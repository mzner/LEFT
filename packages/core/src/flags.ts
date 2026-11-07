import type { Flag, FlagAction, FlagCode, LinkedPr, Severity, TicketReport } from './types';

export type FlagContext = Omit<TicketReport, 'flags'>;

export interface FlagOptions {
  /** The moment ages are measured against. */
  now: Date;
  /** An open backport older than this many days is stale; 0 turns the check off. */
  staleBackportDays: number;
}

export const DEFAULT_STALE_BACKPORT_DAYS = 7;

/** A flag rule inspects one ticket and returns the problems it finds. Add new checks here. */
export type FlagRule = (report: FlagContext, options: FlagOptions) => Flag[];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days since `iso`, never negative. */
export function ageInDays(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
}

function flag(code: FlagCode, severity: Severity, message: string, actions?: FlagAction[]): Flag {
  return actions ? { code, severity, message, actions } : { code, severity, message };
}

const noPr: FlagRule = ({ ticket, prs, otherRepoLinks }) => {
  if (prs.length > 0) return [];
  const message =
    otherRepoLinks.length > 0
      ? `No PR in the selected repositories; Jira links PRs in ${otherRepoLinks.join(', ')}`
      : 'No PR found';
  return [flag('NO_PR', 'error', message, [{ label: 'Open in Jira', url: ticket.url }])];
};

const prOpen: FlagRule = ({ prs }) => {
  // Merged only counts on the default branch; a merged feature-branch PR isn't in master yet.
  const anyMerged = prs.some((linked) => linked.intoDefault && linked.pr.state === 'merged');
  const anyOpen = prs.some((linked) => !linked.isBackport && linked.pr.state === 'open');
  const open = prs.find((linked) => !linked.isBackport && linked.pr.state === 'open');
  return !anyMerged && anyOpen
    ? [flag('PR_OPEN', 'warning', 'PR not merged yet', actionFor(open, 'Open PR'))]
    : [];
};

const missingBackport: FlagRule = ({ prs, coverage }) =>
  coverage
    .filter((branch) => branch.required && branch.status === 'missing')
    .map((branch) =>
      flag(
        'MISSING_BACKPORT',
        'error',
        `No backport to ${branch.branch} (${branch.repo})`,
        // The PR to backport from.
        actionFor(
          prs.find((l) => l.pr.repo === branch.repo && l.intoDefault && l.pr.state === 'merged'),
          'Open master PR',
        ),
      ),
    );

/**
 * An open backport is "not merged yet", and also "stale" once its oldest open
 * PR has waited longer than the limit.
 */
const backportOpen: FlagRule = ({ prs, coverage }, { now, staleBackportDays }) =>
  coverage
    .filter((branch) => branch.required && branch.status === 'open')
    .flatMap((branch) => {
      const open = prs
        .filter(
          (l) =>
            l.pr.repo === branch.repo && l.pr.baseRef === branch.branch && l.pr.state === 'open',
        )
        .sort((a, b) => a.pr.createdAt.localeCompare(b.pr.createdAt))[0];
      const days = open ? ageInDays(open.pr.createdAt, now) : 0;
      const stale = open !== undefined && staleBackportDays > 0 && days > staleBackportDays;
      return [
        ...(stale
          ? [
              flag(
                'BACKPORT_STALE',
                'error',
                `Backport to ${branch.branch} open for ${days} days (${branch.repo})`,
                actionFor(open, 'Open backport'),
              ),
            ]
          : []),
        flag(
          'BACKPORT_OPEN',
          'warning',
          `Backport to ${branch.branch} not merged yet (${branch.repo})`,
          actionFor(open, 'Open backport'),
        ),
      ];
    });

function actionFor(linked: LinkedPr | undefined, label: string): FlagAction[] | undefined {
  return linked ? [{ label, url: linked.pr.url }] : undefined;
}

/** PRs closed without merging were abandoned or superseded; their links don't matter. */
const live = (linked: LinkedPr) => linked.pr.state !== 'closed';

const notLinkedInJira: FlagRule = ({ ticket, prs }) =>
  prs
    .filter((linked) => live(linked) && !linked.linkedInJira)
    .map((linked) =>
      flag(
        'NOT_LINKED_IN_JIRA',
        'error',
        `${linked.pr.repo}#${linked.pr.number} not linked in Jira`,
        [
          { label: 'Link in Jira', url: linked.pr.url, jiraLink: true },
          { label: 'Copy PR link', url: linked.pr.url, copy: true },
          { label: 'Open in Jira', url: ticket.url },
        ],
      ),
    );

const keyMissingInPr: FlagRule = ({ ticket, prs }) =>
  prs
    .filter((linked) => live(linked) && !linked.keyInPr)
    .map((linked) =>
      flag(
        'KEY_MISSING_IN_PR',
        'error',
        `${linked.pr.repo}#${linked.pr.number} has no ${ticket.key} in title or branch`,
        [{ label: 'Open PR', url: linked.pr.url }],
      ),
    );

const issueNotLinked: FlagRule = ({ prs, unlinkedIssues }) =>
  // Without a live PR there's nothing to link it to; "No PR" covers that.
  prs.some(live)
    ? unlinkedIssues.map((issue) =>
        flag('ISSUE_NOT_LINKED', 'error', `${issue.repo}#${issue.number} is not linked to any PR`, [
          { label: 'Open issue', url: issue.url },
        ]),
      )
    : [];

export const defaultFlagRules: FlagRule[] = [
  noPr,
  prOpen,
  missingBackport,
  backportOpen,
  notLinkedInJira,
  keyMissingInPr,
  issueNotLinked,
];

export function evaluateFlags(
  report: FlagContext,
  rules: FlagRule[] = defaultFlagRules,
  options: Partial<FlagOptions> = {},
): Flag[] {
  const resolved: FlagOptions = {
    now: options.now ?? new Date(),
    staleBackportDays: options.staleBackportDays ?? DEFAULT_STALE_BACKPORT_DAYS,
  };
  return rules.flatMap((rule) => rule(report, resolved));
}
