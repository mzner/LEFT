import type { LinkedPr, RepoInfo, RepoName, TicketReport } from './types';
import { backportBranchFor } from './versions';

/** The branch a repo ships a release from. */
export interface ReleaseTarget {
  repo: RepoName;
  branch: string;
  /** The repo's default branch: the version has no number, or its branch isn't cut yet. */
  isDefault: boolean;
  /** Set when the version names a release branch that doesn't exist in the repo yet. */
  notCutYet?: string;
}

/**
 * Where each repo ships `version` from: its release branch (`stable-9.0` for
 * "Frances - 9.0.0") if that branch exists, otherwise the default branch.
 */
export function releaseTargets(
  version: string,
  repos: RepoInfo[],
  templates: Record<RepoName, string> = {},
): ReleaseTarget[] {
  return repos.map((repo) => {
    const branch = backportBranchFor(version, templates[repo.name]);
    if (branch && repo.branches.includes(branch)) {
      return { repo: repo.name, branch, isDefault: false };
    }
    const target: ReleaseTarget = { repo: repo.name, branch: repo.defaultBranch, isDefault: true };
    return branch ? { ...target, notCutYet: branch } : target;
  });
}

/** Why a ticket keeps the release from going out, grouped so they can be counted. */
export type BlockReason = 'not-done' | 'no-pr' | 'not-on-branch' | 'not-merged';

/** Display order of the reasons: Jira's workflow first, then the code. */
export const BLOCK_REASONS: BlockReason[] = ['not-done', 'no-pr', 'not-on-branch', 'not-merged'];

export interface Blocker {
  reason: BlockReason;
  /** `status`: Jira says it isn't done. `code`: the fix isn't where the release ships from. */
  kind: 'status' | 'code';
  text: string;
}

export interface TicketReadiness {
  key: string;
  summary: string;
  url: string;
  blockers: Blocker[];
  /** Problems that don't stop the release (links, keys, other versions' backports). */
  notes: string[];
}

export type Verdict = 'go' | 'no-go' | 'empty';

export interface Readiness {
  verdict: Verdict;
  total: number;
  /** Tickets with at least one blocker, in report order. */
  blocking: TicketReadiness[];
  /** Tickets without blockers but with notes. */
  tidy: TicketReadiness[];
}

export interface ReadinessOptions {
  /** A ticket marked fixed by hand: its code checks are trusted; Jira's status still counts. */
  isMarkedFixed?: (key: string) => boolean;
}

/** Hygiene problems: worth fixing, but the release can go out without. */
const NOTE_FLAGS = new Set(['NOT_LINKED_IN_JIRA', 'KEY_MISSING_IN_PR', 'ISSUE_NOT_LINKED']);

const live = (linked: LinkedPr) => linked.pr.state !== 'closed';

/**
 * Go or no-go for a release: every ticket must be done in Jira and have its
 * fix merged where each repo ships the version from. Only repos the ticket has
 * PRs in are checked. Backports to other versions' branches don't count here;
 * the ticket table still shows them.
 */
export function computeReadiness(
  reports: TicketReport[],
  targets: ReleaseTarget[],
  { isMarkedFixed = () => false }: ReadinessOptions = {},
): Readiness {
  const all = reports.map((report): TicketReadiness => {
    const { ticket } = report;
    const blockers: Blocker[] = [];
    if (ticket.statusCategory !== 'done') {
      blockers.push({ reason: 'not-done', kind: 'status', text: `${ticket.status} in Jira` });
    }
    const marked = isMarkedFixed(ticket.key);
    if (!marked) blockers.push(...codeBlockers(report, targets));
    const notes = marked
      ? []
      : report.flags.filter((flag) => NOTE_FLAGS.has(flag.code)).map((flag) => flag.message);
    return { key: ticket.key, summary: ticket.summary, url: ticket.url, blockers, notes };
  });

  const blocking = all.filter((t) => t.blockers.length > 0);
  const tidy = all.filter((t) => t.blockers.length === 0 && t.notes.length > 0);
  const verdict: Verdict = all.length === 0 ? 'empty' : blocking.length > 0 ? 'no-go' : 'go';
  return { verdict, total: all.length, blocking, tidy };
}

function codeBlockers(report: TicketReport, targets: ReleaseTarget[]): Blocker[] {
  const prs = report.prs.filter(live);
  if (prs.length === 0) return [{ reason: 'no-pr', kind: 'code', text: 'No PR' }];

  return targets.flatMap((target): Blocker[] => {
    const repoPrs = prs.filter((linked) => linked.pr.repo === target.repo);
    if (repoPrs.length === 0) return [];
    const where = `${target.branch}${targets.length > 1 ? ` (${target.repo})` : ''}`;

    if (!target.isDefault) {
      const coverage = report.coverage.find(
        (c) => c.repo === target.repo && c.branch === target.branch,
      );
      if (coverage?.status === 'merged' || coverage?.status === 'included') return [];
      return [
        coverage?.status === 'open'
          ? { reason: 'not-merged', kind: 'code', text: `Backport to ${where} not merged yet` }
          : { reason: 'not-on-branch', kind: 'code', text: `Not on ${where}` },
      ];
    }

    // Shipping from the default branch: every live PR into it must be merged.
    const intoDefault = repoPrs.filter((linked) => linked.intoDefault);
    if (intoDefault.length === 0) {
      return [{ reason: 'not-on-branch', kind: 'code', text: `Not on ${where}` }];
    }
    return intoDefault.every((linked) => linked.pr.state === 'merged')
      ? []
      : [{ reason: 'not-merged', kind: 'code', text: `PR into ${where} not merged yet` }];
  });
}

/** How many tickets each reason blocks; a ticket can count under several. Zero counts are left out. */
export function blockerCounts(readiness: Readiness): { reason: BlockReason; count: number }[] {
  return BLOCK_REASONS.map((reason) => ({
    reason,
    count: readiness.blocking.filter((t) => t.blockers.some((b) => b.reason === reason)).length,
  })).filter(({ count }) => count > 0);
}
