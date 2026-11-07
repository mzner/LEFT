import type {
  Board,
  GitHubIssue,
  PullRequest,
  RepoInfo,
  RepoName,
  Sprint,
  Ticket,
} from '@ocis-dashboard/core';

/** What one GitHub search returns: PRs and, unless the query says `is:pr`, issues. */
export interface SearchHits {
  pullRequests: PullRequest[];
  issues: GitHubIssue[];
}

/** Where tickets come from (Jira). */
export interface TicketSource {
  sprintTickets(sprintId: number): Promise<Ticket[]>;
  ticketsUpdatedBetween(from: string, to: string): Promise<Ticket[]>;
  remoteLinkUrls(issueKey: string): Promise<string[]>;
}

/** A web link on a Jira ticket. */
export interface RemoteLink {
  url: string;
  title: string;
}

/** Adds web links to Jira tickets; the only write the dashboard does. */
export interface RemoteLinkWriter {
  /** Idempotent: adding a link the ticket already has updates it instead of duplicating it. */
  addRemoteLink(issueKey: string, link: RemoteLink): Promise<void>;
}

/** Where boards and sprints come from (Jira Software). */
export interface SprintSource {
  listBoards(): Promise<Board[]>;
  listSprints(boardId: number): Promise<Sprint[]>;
}

/** Everything the dashboard does with Jira: reads, and adding web links. */
export type JiraSource = TicketSource & SprintSource & RemoteLinkWriter;

/** Where PRs come from (GitHub). */
export interface CodeHost {
  /** `candidateBranches` are checked for existence; only existing ones are returned. */
  repoInfo(repo: RepoName, candidateBranches: string[]): Promise<RepoInfo>;
  /** Runs each search query; returns one result per query, in order. */
  search(queries: string[]): Promise<SearchHits[]>;
  pullRequests(repo: RepoName, numbers: number[]): Promise<PullRequest[]>;
}
