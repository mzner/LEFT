/** Repository identifier in `owner/name` form, always lower-case. */
export type RepoName = string;

export interface Person {
  id: string;
  name: string;
}

export type StatusCategory = 'todo' | 'progress' | 'done';

export interface Ticket {
  key: string;
  summary: string;
  status: string;
  /** Jira's grouping of the status: To Do, In Progress (incl. review, QA) or Done. */
  statusCategory: StatusCategory;
  issueType: string;
  url: string;
  assignee: Person | null;
  fixVersions: string[];
  /** URLs from the ticket's Jira remote links (GitHub and others). */
  remoteLinkUrls: string[];
  /** ISO timestamps from Jira. */
  created: string;
  updated: string;
}

export type PrState = 'open' | 'closed' | 'merged';

export interface GitHubIssueRef {
  repo: RepoName;
  number: number;
  title: string;
  url: string;
}

/** A GitHub issue found by searching for a ticket key. */
export interface GitHubIssue extends GitHubIssueRef {
  body: string;
  state: 'open' | 'closed';
}

export interface PullRequest {
  repo: RepoName;
  number: number;
  title: string;
  body: string;
  headRef: string;
  baseRef: string;
  state: PrState;
  /** ISO timestamp; null unless merged. */
  mergedAt: string | null;
  /** ISO timestamp of the last activity: pushes, reviews, comments, edits, merge. */
  updatedAt: string;
  url: string;
  author: string | null;
  closingIssues: GitHubIssueRef[];
}

export interface RepoInfo {
  name: RepoName;
  defaultBranch: string;
  /** Branches known to exist in the repo (only those that were asked about). */
  branches: string[];
  /**
   * When each branch split off the default branch (ISO date of the merge-base
   * commit). Anything merged into the default branch before that is already
   * in the branch. Missing entries mean unknown.
   */
  branchPoints?: Record<string, string>;
}

/** How a PR was tied to a ticket. */
export type MatchSource = 'title' | 'branch' | 'jira-link' | 'backport-of';

export interface LinkedPr {
  pr: PullRequest;
  sources: MatchSource[];
  isBackport: boolean;
  /** Targets the repo's default branch. False for backports and for PRs into feature branches. */
  intoDefault: boolean;
  /** Numbers of the PRs (same repo) this one says it backports. */
  backportOf: number[];
  linkedInJira: boolean;
  /** The ticket key is in the PR title or head branch. */
  keyInPr: boolean;
}

/**
 * - merged:   a backport PR to the branch is merged
 * - included: the default-branch PR was merged before the branch was created
 * - open:     a backport PR exists but is not merged
 * - missing:  neither
 */
export type BranchStatus = 'merged' | 'included' | 'open' | 'missing';

export interface BranchCoverage {
  repo: RepoName;
  branch: string;
  /** Required by one of the ticket's fixVersions. */
  required: boolean;
  status: BranchStatus;
  /** Backport PRs to the branch, or for `included` the default-branch PRs it already contains. */
  prNumbers: number[];
  /** When the branch split off the default branch, if known. */
  branchPoint?: string;
}

export type FlagCode =
  | 'NO_PR'
  | 'PR_OPEN'
  | 'MISSING_BACKPORT'
  | 'BACKPORT_OPEN'
  | 'NOT_LINKED_IN_JIRA'
  | 'KEY_MISSING_IN_PR'
  | 'ISSUE_NOT_LINKED';

export type Severity = 'error' | 'warning';

/** A link next to a problem that takes you where to fix it. */
export interface FlagAction {
  label: string;
  url: string;
  /** Copy the URL instead of opening it (e.g. a PR link to paste into Jira). */
  copy?: boolean;
  /**
   * Add the URL (a PR) to the ticket as a Jira web link. The web app shows it
   * only when the server is allowed to write to Jira (`MeResponse.canLinkInJira`).
   */
  jiraLink?: boolean;
}

export interface Flag {
  code: FlagCode;
  severity: Severity;
  message: string;
  actions?: FlagAction[];
}

export interface TicketReport {
  ticket: Ticket;
  prs: LinkedPr[];
  /** PRs that mention the key only in their body; shown, but not counted as the ticket's PRs. */
  mentions: PullRequest[];
  issues: GitHubIssueRef[];
  coverage: BranchCoverage[];
  /** Repos the ticket's Jira links point to that are not selected, so their PRs were not checked. */
  otherRepoLinks: RepoName[];
  /** GitHub issues whose title or description has the key, but that none of the ticket's PRs is linked to. */
  unlinkedIssues: GitHubIssue[];
  flags: Flag[];
}
