import {
  backportBranchesFor,
  buildReports,
  releaseTargets,
  parseGitHubUrl,
  type PullRequest,
  type RepoInfo,
  type RepoName,
  type ReportProgress,
  type ReportResponse,
  type ReportSelection,
  type ReportStep,
  type Ticket,
} from '@ocis-dashboard/core';
import { chunk, mapLimit } from '../util/map-limit';
import type { TtlCache } from '../util/ttl-cache';
import type { CodeHost, SearchHits, TicketSource } from './ports';

/** Parallel Jira remote-link requests per report. */
const REMOTE_LINK_CONCURRENCY = 8;
/** Search queries per GitHub request, and requests in flight. */
const SEARCH_BATCH = 10;
const SEARCH_CONCURRENCY = 2;
/** How far backport chains are followed (backport of a backport of …). */
const MAX_BACKPORT_HOPS = 3;

export type ProgressListener = (progress: ReportProgress) => void;

export interface BuildOptions {
  onProgress?: ProgressListener;
  /** Called once with the Jira tickets, before GitHub is searched. */
  onTickets?: (tickets: Ticket[]) => void;
  /** Stops issuing new Jira/GitHub calls once aborted (e.g. the browser went away). */
  signal?: AbortSignal;
}

export interface ReportServiceDeps {
  tickets: TicketSource;
  code: CodeHost;
  projectKey: string;
  /** Per-repo fixVersion → branch template overrides. */
  branchTemplates: Record<RepoName, string>;
  /** Open backports older than this many days are stale; 0 turns the flag off. */
  staleBackportDays: number;
  /** Per-user cache; see Session.cache. */
  cache: TtlCache;
}

const remoteLinksKey = (issueKey: string) => `links:${issueKey}`;
/** No `is:pr`: one search finds the PRs and the issues that mention the key. */
const keyQuery = (repo: RepoName, key: string) => `repo:${repo} "${key}"`;
const backportQuery = (repo: RepoName, number: number) => `repo:${repo} is:pr in:body "${number}"`;

/**
 * Builds the dashboard report: loads tickets, their Jira remote links and the
 * related PRs, then lets core do the linking. Every upstream call is cached,
 * and progress is reported per step so the UI can show what is happening.
 *
 * Abort checks sit outside cached loads on purpose: a cached promise may be
 * shared with another request of the same user, so it must never fail just
 * because this request was cancelled.
 */
export class ReportService {
  constructor(private readonly deps: ReportServiceDeps) {}

  async build(
    selection: ReportSelection,
    repos: RepoName[],
    { onProgress = () => {}, onTickets = () => {}, signal }: BuildOptions = {},
  ): Promise<ReportResponse> {
    const check = () => signal?.throwIfAborted();

    onProgress({ step: 'tickets', done: 0, total: 0 });
    const loaded = await this.loadTickets(selection);
    onProgress({ step: 'tickets', done: loaded.length, total: loaded.length });
    onTickets(loaded);

    const links = tracker('links', loaded.length, onProgress);
    const tickets = await this.withRemoteLinks(loaded, links.advance, check);
    check();
    // A release's own branch is always asked about, even before it has tickets.
    const versions = selection.kind === 'version' ? [selection.version] : [];
    const repoInfos = await Promise.all(
      repos.map((repo) => this.repoInfo(repo, tickets, versions)),
    );

    // 1. PRs that mention a ticket key, plus PRs only known from Jira links.
    const keyQueries = repoInfos.flatMap((repo) =>
      tickets.map((ticket) => keyQuery(repo.name, ticket.key)),
    );
    const pulls = tracker('pulls', keyQueries.length, onProgress);
    const keyHits = await this.search(keyQueries, pulls.advance, check);
    const byKey = keyHits.flatMap((hits) => hits.pullRequests);
    const issues = keyHits.flatMap((hits) => hits.issues);
    check();
    const fromLinks = (
      await Promise.all(repoInfos.map((repo) => this.linkedOnly(repo, tickets, byKey)))
    ).flat();

    // 2. Backports that reference one of those PRs by number but lack the key.
    const backports = await this.backportChains(
      repoInfos,
      [...byKey, ...fromLinks],
      onProgress,
      check,
    );

    return {
      generatedAt: new Date().toISOString(),
      repos: repoInfos,
      reports: buildReports({
        projectKey: this.deps.projectKey,
        tickets,
        pullRequests: [...byKey, ...fromLinks, ...backports],
        issues,
        repos: repoInfos,
        branchTemplates: this.deps.branchTemplates,
        flagOptions: { staleBackportDays: this.deps.staleBackportDays },
      }),
      ...(selection.kind === 'version' && {
        releaseTargets: releaseTargets(selection.version, repoInfos, this.deps.branchTemplates),
      }),
    };
  }

  private loadTickets(selection: ReportSelection): Promise<Ticket[]> {
    const source = this.deps.tickets;
    switch (selection.kind) {
      case 'sprint':
        return this.cached(`sprint:${selection.sprintId}`, () =>
          source.sprintTickets(selection.sprintId),
        );
      case 'dates':
        return this.cached(`dates:${selection.from}:${selection.to}`, () =>
          source.ticketsUpdatedBetween(selection.from, selection.to),
        );
      case 'version':
        return this.cached(`version:${selection.version}`, () =>
          source.ticketsInVersion(selection.version),
        );
    }
  }

  private withRemoteLinks(
    tickets: Ticket[],
    advance: Advance,
    check: () => void,
  ): Promise<Ticket[]> {
    return mapLimit(tickets, REMOTE_LINK_CONCURRENCY, async (ticket) => {
      check();
      const remoteLinkUrls = await this.cached(remoteLinksKey(ticket.key), () =>
        this.deps.tickets.remoteLinkUrls(ticket.key),
      );
      advance(1);
      return { ...ticket, remoteLinkUrls };
    });
  }

  private repoInfo(repo: RepoName, tickets: Ticket[], versions: string[]): Promise<RepoInfo> {
    const template = this.deps.branchTemplates[repo];
    const branches = unique(
      [...versions, ...tickets.flatMap((t) => t.fixVersions)].flatMap((v) =>
        backportBranchesFor([v], template),
      ),
    );
    return this.cached(`repo:${repo}:${branches.join(',')}`, () =>
      this.deps.code.repoInfo(repo, branches),
    );
  }

  /** PRs in `repo` that Jira links to but the key search did not return. */
  private linkedOnly(
    repo: RepoInfo,
    tickets: Ticket[],
    found: PullRequest[],
  ): Promise<PullRequest[]> {
    const known = new Set(found.filter((pr) => pr.repo === repo.name).map((pr) => pr.number));
    const numbers = unique(
      tickets
        .flatMap((ticket) => ticket.remoteLinkUrls)
        .map(parseGitHubUrl)
        .filter((ref) => ref?.kind === 'pull' && ref.repo === repo.name && !known.has(ref.number))
        .map((ref) => ref!.number),
    );
    if (numbers.length === 0) return Promise.resolve([]);
    return this.cached(`prs:${repo.name}:${numbers.join(',')}`, () =>
      this.deps.code.pullRequests(repo.name, numbers),
    );
  }

  /**
   * Searches for PRs whose body mentions a known PR's number: first for the
   * default-branch PRs, then for the backports found, so a keyless "backport
   * of #110" where #110 is itself a backport is found too.
   */
  private async backportChains(
    repos: RepoInfo[],
    known: PullRequest[],
    onProgress: ProgressListener,
    check: () => void,
  ): Promise<PullRequest[]> {
    const progress = tracker('backports', 0, onProgress);
    const searched = new Set<string>();
    const found: PullRequest[] = [];
    let sources = known.filter((pr) =>
      repos.some((repo) => repo.name === pr.repo && pr.baseRef === repo.defaultBranch),
    );

    for (let hop = 0; hop < MAX_BACKPORT_HOPS && sources.length > 0; hop++) {
      const queries = unique(sources.map((pr) => backportQuery(pr.repo, pr.number))).filter(
        (query) => !searched.has(query),
      );
      if (queries.length === 0) break;
      queries.forEach((query) => searched.add(query));
      progress.grow(queries.length);

      const results = (await this.search(queries, progress.advance, check)).flatMap(
        (hits) => hits.pullRequests,
      );
      check();
      const seen = new Set([...known, ...found].map((pr) => `${pr.repo}#${pr.number}`));
      sources = results.filter((pr) => !seen.has(`${pr.repo}#${pr.number}`));
      found.push(...sources);
    }
    return found;
  }

  /** Runs searches with per-query caching; only uncached queries go to GitHub, in batches. */
  private async search(
    queries: string[],
    advance: Advance,
    check: () => void,
  ): Promise<SearchHits[]> {
    const cacheKey = (query: string) => `search:${query}`;
    const results = new Map<string, Promise<SearchHits>>();
    const misses: string[] = [];
    for (const query of unique(queries)) {
      const hit = this.deps.cache.peek<SearchHits>(cacheKey(query));
      if (hit) results.set(query, hit);
      else misses.push(query);
    }
    advance(queries.length - misses.length);

    await mapLimit(chunk(misses, SEARCH_BATCH), SEARCH_CONCURRENCY, async (batch) => {
      check();
      const all = this.deps.code.search(batch);
      batch.forEach((query, i) => {
        results.set(
          query,
          this.deps.cache.set(
            cacheKey(query),
            all.then((r) => r[i] ?? { pullRequests: [], issues: [] }),
          ),
        );
      });
      await all;
      advance(batch.length);
    });

    return Promise.all(queries.map((query) => results.get(query)!));
  }

  /** After a link was added in Jira, so the next report reads the ticket's links again. */
  forgetRemoteLinks(issueKey: string): void {
    this.deps.cache.delete(remoteLinksKey(issueKey));
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    return this.deps.cache.getOrLoad(key, load);
  }
}

type Advance = (count: number) => void;

/**
 * Reports the start of `step`; `advance` counts finished units, `grow` adds
 * units discovered along the way (for steps whose size isn't known upfront).
 */
function tracker(step: ReportStep, total: number, onProgress: ProgressListener) {
  let done = 0;
  onProgress({ step, done, total });
  return {
    advance: (count: number) => {
      if (count === 0) return;
      done += count;
      onProgress({ step, done, total });
    },
    grow: (count: number) => {
      total += count;
      onProgress({ step, done, total });
    },
  };
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
