import type { Board, Sprint, Ticket, Version } from '@ocis-dashboard/core';
import { jiraApiBase } from '../auth/atlassian';
import { requestJson, type RequestOptions } from '../http';
import type { JiraSource } from '../report/ports';
import {
  sortSprints,
  toSprint,
  toTicket,
  toVersions,
  type JiraIssue,
  type JiraSprint,
  type JiraVersion,
} from './mapper';

const ISSUE_FIELDS = [
  'summary',
  'status',
  'issuetype',
  'assignee',
  'fixVersions',
  'created',
  'updated',
];
const PAGE_SIZE = 100;

interface AgilePage<T> {
  values: T[];
  isLast: boolean;
}

interface AgileIssuePage {
  issues: JiraIssue[];
  startAt: number;
  total: number;
}

interface SearchPage {
  issues: JiraIssue[];
  nextPageToken?: string;
}

interface RemoteLink {
  object?: { url?: string };
}

export interface JiraClientOptions {
  accessToken: string;
  cloudId: string;
  siteUrl: string;
  projectKey: string;
}

/**
 * Jira Cloud client acting as the signed-in user. It only reads, except for
 * `addRemoteLink`, which needs the `write:jira-work` scope.
 */
export class JiraClient implements JiraSource {
  private readonly base: string;

  constructor(private readonly options: JiraClientOptions) {
    this.base = jiraApiBase(options.cloudId);
  }

  /** Scrum boards of the project; only those have sprints. */
  async listBoards(): Promise<Board[]> {
    const boards = await this.agilePages<Board>(
      `/rest/agile/1.0/board?projectKeyOrId=${encodeURIComponent(this.options.projectKey)}&type=scrum`,
    );
    return boards.map(({ id, name }) => ({ id, name }));
  }

  async listSprints(boardId: number): Promise<Sprint[]> {
    const sprints = await this.agilePages<JiraSprint>(
      `/rest/agile/1.0/board/${boardId}/sprint?state=active,future,closed`,
    );
    return sortSprints(sprints.map(toSprint));
  }

  async sprintTickets(sprintId: number): Promise<Ticket[]> {
    const issues: JiraIssue[] = [];
    let startAt = 0;
    for (;;) {
      const params = new URLSearchParams({
        jql: `project = "${this.options.projectKey}"`,
        fields: ISSUE_FIELDS.join(','),
        startAt: String(startAt),
        maxResults: String(PAGE_SIZE),
      });
      const page = await this.call<AgileIssuePage>(
        `/rest/agile/1.0/sprint/${sprintId}/issue?${params}`,
      );
      issues.push(...page.issues);
      startAt = page.startAt + page.issues.length;
      if (page.issues.length === 0 || startAt >= page.total) break;
    }
    return issues.map((issue) => toTicket(issue, this.options.siteUrl));
  }

  async listVersions(): Promise<Version[]> {
    const versions = await this.call<JiraVersion[]>(
      `/rest/api/3/project/${encodeURIComponent(this.options.projectKey)}/versions`,
    );
    return toVersions(versions);
  }

  /** Tickets updated between the inclusive `YYYY-MM-DD` dates. */
  ticketsUpdatedBetween(from: string, to: string): Promise<Ticket[]> {
    return this.search(
      `project = "${this.options.projectKey}" AND updated >= "${from}" ` +
        `AND updated < "${nextDay(to)}" ORDER BY updated DESC`,
    );
  }

  ticketsInVersion(version: string): Promise<Ticket[]> {
    return this.search(
      `project = "${this.options.projectKey}" AND fixVersion = ${jqlString(version)} ORDER BY key ASC`,
    );
  }

  private async search(jql: string): Promise<Ticket[]> {
    const issues: JiraIssue[] = [];
    let nextPageToken: string | undefined;
    do {
      const page = await this.call<SearchPage>('/rest/api/3/search/jql', {
        json: { jql, fields: ISSUE_FIELDS, maxResults: PAGE_SIZE, nextPageToken },
      });
      issues.push(...page.issues);
      nextPageToken = page.nextPageToken;
    } while (nextPageToken);
    return issues.map((issue) => toTicket(issue, this.options.siteUrl));
  }

  async remoteLinkUrls(issueKey: string): Promise<string[]> {
    const links = await this.call<RemoteLink[]>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/remotelink`,
    );
    return links.map((link) => link.object?.url).filter((url): url is string => Boolean(url));
  }

  async addRemoteLink(issueKey: string, link: { url: string; title: string }): Promise<void> {
    await this.call(`/rest/api/3/issue/${encodeURIComponent(issueKey)}/remotelink`, {
      // Jira updates the link with the same globalId instead of adding a second one.
      json: { globalId: link.url, object: { url: link.url, title: link.title } },
    });
  }

  private async agilePages<T>(path: string): Promise<T[]> {
    const values: T[] = [];
    const separator = path.includes('?') ? '&' : '?';
    for (let startAt = 0; ;) {
      const page = await this.call<AgilePage<T>>(
        `${path}${separator}startAt=${startAt}&maxResults=50`,
      );
      values.push(...page.values);
      startAt += page.values.length;
      if (page.isLast || page.values.length === 0) return values;
    }
  }

  /** GET by default; POST when `options.json` is set. */
  private call<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return requestJson<T>('atlassian', `${this.base}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${this.options.accessToken}`, ...options.headers },
    });
  }
}

/** A JQL string literal; version names are free text, so quotes and backslashes are escaped. */
export function jqlString(value: string): string {
  return `"${value.replace(/["\\]/g, (char) => `\\${char}`)}"`;
}

function nextDay(date: string): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}
