import { parseBackportOf } from './backports';
import { evaluateFlags, type FlagOptions, type FlagRule } from './flags';
import { normalizeRepo, parseGitHubUrl, prId } from './github-url';
import { extractKeys } from './keys';
import type {
  BranchCoverage,
  BranchStatus,
  GitHubIssue,
  GitHubIssueRef,
  LinkedPr,
  MatchSource,
  PullRequest,
  RepoInfo,
  RepoName,
  Ticket,
  TicketReport,
} from './types';
import { backportBranchesFor, isReleaseBranch } from './versions';

export interface BuildReportsInput {
  projectKey: string;
  tickets: Ticket[];
  /** PRs from the selected repos; PRs from other repos are ignored. */
  pullRequests: PullRequest[];
  /** Issues from the key search; those mentioning a ticket's key belong to it. */
  issues?: GitHubIssue[];
  repos: RepoInfo[];
  /** Per-repo override of the fixVersion → branch template. */
  branchTemplates?: Record<RepoName, string>;
  rules?: FlagRule[];
  /** Age limits and the clock for the flag rules; see `FlagOptions` for the defaults. */
  flagOptions?: Partial<FlagOptions>;
}

/** A PR with everything the linking needs pre-computed once. */
interface AnalysedPr {
  pr: PullRequest;
  id: string;
  titleKeys: Set<string>;
  branchKeys: Set<string>;
  bodyKeys: Set<string>;
  backportOf: number[];
}

const SOURCE_ORDER: MatchSource[] = ['title', 'branch', 'jira-link', 'backport-of'];

export function buildReports(input: BuildReportsInput): TicketReport[] {
  const repos = new Map(input.repos.map((repo) => [normalizeRepo(repo.name), repo]));
  const analysed = uniqueByRef(input.pullRequests)
    .filter((pr) => repos.has(pr.repo))
    .map((pr) => analysePr(pr, input.projectKey));

  const issuesByKey = indexByKey(
    uniqueByRef(input.issues ?? []).filter((issue) => repos.has(issue.repo)),
    input.projectKey,
  );

  const templates = input.branchTemplates ?? {};
  return input.tickets.map((ticket) => {
    const prs = linkPrs(ticket, analysed, repos, templates);
    const linkedIds = new Set(prs.map((linked) => prId(linked.pr.repo, linked.pr.number)));
    const mentions = analysed
      .filter((a) => a.bodyKeys.has(ticket.key) && !linkedIds.has(a.id))
      .map((a) => a.pr);
    const report = {
      ticket,
      prs,
      mentions,
      issues: closingIssues(prs),
      coverage: branchCoverage(ticket, prs, repos, templates),
      otherRepoLinks: otherRepoLinks(ticket, repos),
      unlinkedIssues: unlinkedIssues(issuesByKey.get(ticket.key) ?? [], prs),
    };
    return { ...report, flags: evaluateFlags(report, input.rules, input.flagOptions) };
  });
}

/** Drops repeats of the same `repo#number`, with repo names normalized; the last copy wins. */
function uniqueByRef<T extends { repo: RepoName; number: number }>(items: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of items) {
    const normalized = { ...item, repo: normalizeRepo(item.repo) };
    byId.set(prId(normalized.repo, normalized.number), normalized);
  }
  return [...byId.values()];
}

function analysePr(pr: PullRequest, projectKey: string): AnalysedPr {
  return {
    pr,
    id: prId(pr.repo, pr.number),
    titleKeys: new Set(extractKeys(pr.title, projectKey)),
    branchKeys: new Set(extractKeys(pr.headRef, projectKey)),
    bodyKeys: new Set(extractKeys(pr.body, projectKey)),
    backportOf: parseBackportOf(pr.body, pr.repo),
  };
}

function linkPrs(
  ticket: Ticket,
  analysed: AnalysedPr[],
  repos: Map<RepoName, RepoInfo>,
  templates: Record<RepoName, string>,
): LinkedPr[] {
  const jiraLinked = new Set(
    ticket.remoteLinkUrls
      .map(parseGitHubUrl)
      .filter((ref) => ref?.kind === 'pull')
      .map((ref) => prId(ref!.repo, ref!.number)),
  );

  const matches = new Map<string, { pr: AnalysedPr; sources: Set<MatchSource> }>();
  const addMatch = (pr: AnalysedPr, source: MatchSource) => {
    const match = matches.get(pr.id) ?? { pr, sources: new Set<MatchSource>() };
    match.sources.add(source);
    matches.set(pr.id, match);
  };

  for (const pr of analysed) {
    if (pr.titleKeys.has(ticket.key)) addMatch(pr, 'title');
    if (pr.branchKeys.has(ticket.key)) addMatch(pr, 'branch');
    if (jiraLinked.has(pr.id)) addMatch(pr, 'jira-link');
  }

  // Pull in backports of linked PRs, repeating until nothing changes so
  // backports of backports are covered too.
  let changed = true;
  while (changed) {
    changed = false;
    for (const pr of analysed) {
      if (matches.get(pr.id)?.sources.has('backport-of')) continue;
      if (pr.backportOf.some((number) => matches.has(prId(pr.pr.repo, number)))) {
        addMatch(pr, 'backport-of');
        changed = true;
      }
    }
  }

  return [...matches.values()].map(({ pr, sources }) => {
    const ordered = SOURCE_ORDER.filter((source) => sources.has(source));
    return {
      pr: pr.pr,
      sources: ordered,
      isBackport: isBackport(pr, repos.get(pr.pr.repo), templates[pr.pr.repo]),
      intoDefault: pr.pr.baseRef === repos.get(pr.pr.repo)?.defaultBranch,
      backportOf: pr.backportOf,
      linkedInJira: sources.has('jira-link'),
      keyInPr: sources.has('title') || sources.has('branch'),
    };
  });
}

/** Into a release branch, or explicitly says it backports something. */
function isBackport(pr: AnalysedPr, repo: RepoInfo | undefined, template?: string): boolean {
  const base = pr.pr.baseRef;
  if (base === repo?.defaultBranch) return false;
  return isReleaseBranch(base, template) || pr.backportOf.length > 0;
}

function otherRepoLinks(ticket: Ticket, repos: Map<RepoName, RepoInfo>): RepoName[] {
  const linkedRepos = ticket.remoteLinkUrls
    .map(parseGitHubUrl)
    .filter((ref) => ref?.kind === 'pull' && !repos.has(ref.repo))
    .map((ref) => ref!.repo);
  return [...new Set(linkedRepos)];
}

/** Issues per ticket key found in their title or description. */
function indexByKey(issues: GitHubIssue[], projectKey: string): Map<string, GitHubIssue[]> {
  const byKey = new Map<string, GitHubIssue[]>();
  for (const issue of issues) {
    for (const key of extractKeys(`${issue.title}\n${issue.body}`, projectKey)) {
      byKey.set(key, [...(byKey.get(key) ?? []), issue]);
    }
  }
  return byKey;
}

/** PRs that still matter for links: closed-unmerged ones were abandoned. */
const livePrs = (prs: LinkedPr[]) => prs.filter(({ pr }) => pr.state !== 'closed');
/**
 * The ticket's open issues that none of its live PRs is linked to ("Fixes #N"
 * or the PR's Development sidebar). A linked issue is closed when its PR is
 * merged, so a forgotten link leaves the issue open; closed issues are skipped.
 */
function unlinkedIssues(issues: GitHubIssue[], prs: LinkedPr[]): GitHubIssue[] {
  const linked = new Set(closingIssues(prs).map((ref) => prId(ref.repo, ref.number)));
  return issues.filter(
    (issue) => issue.state === 'open' && !linked.has(prId(issue.repo, issue.number)),
  );
}

/** Issues the ticket's live PRs are linked to; links from abandoned PRs don't count. */
function closingIssues(prs: LinkedPr[]): GitHubIssueRef[] {
  const byId = new Map<string, GitHubIssueRef>();
  for (const { pr } of livePrs(prs)) {
    for (const issue of pr.closingIssues) byId.set(prId(issue.repo, issue.number), issue);
  }
  return [...byId.values()];
}

/**
 * For every repo the ticket has PRs in: which stable branches its fixVersions
 * require, plus any other branch it was backported to, and their state.
 */
function branchCoverage(
  ticket: Ticket,
  prs: LinkedPr[],
  repos: Map<RepoName, RepoInfo>,
  templates: Record<RepoName, string>,
): BranchCoverage[] {
  const repoNames = [...new Set(prs.map((linked) => linked.pr.repo))];

  return repoNames.flatMap((repoName) => {
    const repo = repos.get(repoName);
    if (!repo) return [];
    const repoPrs = prs.filter((linked) => linked.pr.repo === repoName);
    const required = backportBranchesFor(ticket.fixVersions, templates[repoName]).filter((branch) =>
      repo.branches.includes(branch),
    );
    const backportedTo = repoPrs
      .filter((linked) => linked.isBackport)
      .map((linked) => linked.pr.baseRef);

    return [...new Set([...required, ...backportedTo])].map((branch): BranchCoverage => {
      const onBranch = repoPrs.filter((linked) => linked.pr.baseRef === branch);
      const branchPoint = repo.branchPoints?.[branch];
      const base = { repo: repoName, branch, required: required.includes(branch), branchPoint };

      const status = branchStatus(onBranch);
      if (status !== 'merged' && branchPoint) {
        const contained = mergedBefore(repoPrs, repo.defaultBranch, branchPoint);
        if (contained.length > 0) {
          return { ...base, status: 'included', prNumbers: contained.map((l) => l.pr.number) };
        }
      }
      return { ...base, status, prNumbers: onBranch.map((linked) => linked.pr.number) };
    });
  });
}

/**
 * The default-branch PRs the branch already contains, if that is the whole
 * fix: every default-branch PR not closed unmerged was merged before
 * `branchPoint`. A follow-up merged after the cut, or still open, means the
 * branch lacks part of the fix, so this returns none and a backport is asked for.
 */
function mergedBefore(prs: LinkedPr[], defaultBranch: string, branchPoint: string): LinkedPr[] {
  const cut = Date.parse(branchPoint);
  const live = prs.filter(({ pr }) => pr.baseRef === defaultBranch && pr.state !== 'closed');
  const contained = live.filter(
    ({ pr }) => pr.state === 'merged' && pr.mergedAt !== null && Date.parse(pr.mergedAt) <= cut,
  );
  return contained.length === live.length ? contained : [];
}

function branchStatus(prs: LinkedPr[]): BranchStatus {
  if (prs.some((linked) => linked.pr.state === 'merged')) return 'merged';
  if (prs.some((linked) => linked.pr.state === 'open')) return 'open';
  return 'missing';
}
