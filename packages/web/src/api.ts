import type {
  ApiError,
  BoardsResponse,
  JiraLinkRequest,
  JiraLinkResponse,
  MeResponse,
  RepoName,
  ReportProgress,
  ReportResponse,
  ReportSelection,
  ReportStreamEvent,
  Ticket,
  SprintsResponse,
} from '@ocis-dashboard/core';

export type Provider = 'atlassian' | 'github';

export class ApiRequestError extends Error {
  constructor(readonly detail: ApiError) {
    super(detail.message);
  }
}

async function errorFrom(response: Response): Promise<ApiRequestError> {
  const detail = (await response.json().catch(() => null)) as ApiError | null;
  return new ApiRequestError(
    detail ?? {
      error: 'http_error',
      message: `The server answered with status ${response.status}.`,
    },
  );
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal, credentials: 'same-origin' });
  if (!response.ok) throw await errorFrom(response);
  return (await response.json()) as T;
}

function reportParams(selection: ReportSelection, repos: RepoName[], refresh: boolean) {
  const params = new URLSearchParams({ repos: repos.join(',') });
  if (selection.kind === 'sprint') {
    params.set('sprintId', String(selection.sprintId));
  } else {
    params.set('from', selection.from);
    params.set('to', selection.to);
  }
  if (refresh) params.set('refresh', '1');
  return params;
}

export interface ReportOptions {
  refresh?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: ReportProgress) => void;
  /** The Jira tickets, before the report is ready. */
  onTickets?: (tickets: Ticket[]) => void;
}

export const api = {
  me: (signal?: AbortSignal) => getJson<MeResponse>('/api/me', signal),

  boards: (signal?: AbortSignal) => getJson<BoardsResponse>('/api/boards', signal),

  sprints: (boardId: number, signal?: AbortSignal) =>
    getJson<SprintsResponse>(`/api/sprints?boardId=${boardId}`, signal),

  /** Streams progress events while the server builds the report, then resolves with it. */
  async report(
    selection: ReportSelection,
    repos: RepoName[],
    { refresh = false, signal, onProgress, onTickets }: ReportOptions = {},
  ): Promise<ReportResponse> {
    const params = reportParams(selection, repos, refresh);
    const response = await fetch(`/api/report/stream?${params}`, {
      signal,
      credentials: 'same-origin',
    });
    if (!response.ok || !response.body) throw await errorFrom(response);

    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line) as ReportStreamEvent;
        if (event.type === 'progress') onProgress?.(event.progress);
        else if (event.type === 'tickets') onTickets?.(event.tickets);
        else if (event.type === 'result') return event.report;
        else throw new ApiRequestError(event.error);
      }
    }
    throw new Error('The connection to the server closed before the report was ready. Try again.');
  },

  /** Adds the PR to the ticket as a Jira web link; the server checks it against this selection's report. */
  async linkInJira(
    selection: ReportSelection,
    repos: RepoName[],
    link: JiraLinkRequest,
  ): Promise<JiraLinkResponse> {
    const params = reportParams(selection, repos, false);
    const response = await fetch(`/api/report/jira-link?${params}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(link),
    });
    if (!response.ok) throw await errorFrom(response);
    return (await response.json()) as JiraLinkResponse;
  },

  async logout() {
    await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' });
  },
};

export const loginUrl = (provider: Provider) => `/auth/${provider}/login`;
