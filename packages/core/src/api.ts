/** Contract between server and web. */
import type { ReleaseTarget } from './readiness';
import type { RepoInfo, Ticket, TicketReport } from './types';

export interface ProviderStatus {
  connected: boolean;
  /** Atlassian account id or GitHub login. */
  id?: string;
  name?: string;
}

export interface MeResponse {
  atlassian: ProviderStatus;
  github: ProviderStatus;
  /** The server runs on sample data; no sign-in needed. */
  demo: boolean;
  /** `ATLASSIAN_SCOPES` includes Jira write access, so PRs can be linked from the dashboard. */
  canLinkInJira: boolean;
}

/** Body of `POST /api/report/jira-link`; the report selection goes in the query, as for `/api/report`. */
export interface JiraLinkRequest {
  key: string;
  prUrl: string;
}

export interface JiraLinkResponse {
  /** False when Jira already had the link, so nothing was written. */
  created: boolean;
}

export interface Board {
  id: number;
  name: string;
}

export interface BoardsResponse {
  boards: Board[];
}

export type SprintState = 'active' | 'future' | 'closed';

export interface Sprint {
  id: number;
  name: string;
  state: SprintState;
  startDate?: string;
  endDate?: string;
}

export interface SprintsResponse {
  sprints: Sprint[];
}

/** A Jira fixVersion of the project, e.g. "Frances - 9.0.0". */
export interface Version {
  id: string;
  name: string;
  released: boolean;
  /** `YYYY-MM-DD`, if Jira has one. */
  releaseDate?: string;
}

export interface VersionsResponse {
  /** Unarchived versions in Jira's order (oldest first). */
  versions: Version[];
}

export type ReportSelection =
  | { kind: 'sprint'; sprintId: number }
  /** Inclusive `YYYY-MM-DD` dates; `from === to` for a single day. */
  | { kind: 'dates'; from: string; to: string }
  /** Every ticket with this fixVersion, by name. */
  | { kind: 'version'; version: string };

export interface ReportResponse {
  generatedAt: string;
  /** The selected repos, in the order they were requested. */
  repos: RepoInfo[];
  reports: TicketReport[];
  /** For a version selection: the branch each repo ships that version from. */
  releaseTargets?: ReleaseTarget[];
}

/** The steps of building a report, in order. */
export const REPORT_STEPS = ['tickets', 'links', 'pulls', 'backports'] as const;
export type ReportStep = (typeof REPORT_STEPS)[number];

export interface ReportProgress {
  step: ReportStep;
  done: number;
  /** 0 while the total is not known yet. */
  total: number;
}

/** One line of the NDJSON stream from `/api/report/stream`. */
export type ReportStreamEvent =
  | { type: 'progress'; progress: ReportProgress }
  /** The Jira tickets, sent as soon as they are loaded so the list shows while GitHub is checked. */
  | { type: 'tickets'; tickets: Ticket[] }
  | { type: 'result'; report: ReportResponse }
  | { type: 'error'; error: ApiError };

export interface ApiError {
  error: string;
  message: string;
  /** Set when the user has to (re)connect a provider. */
  provider?: 'atlassian' | 'github';
}
