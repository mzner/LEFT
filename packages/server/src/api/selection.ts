import {
  isRepoName,
  normalizeRepo,
  type RepoName,
  type ReportSelection,
} from '@ocis-dashboard/core';
import { AppError } from '../errors';

export interface ReportQuery {
  sprintId?: string;
  from?: string;
  to?: string;
  /** A fixVersion name. */
  version?: string;
  /** Comma-separated `owner/name` list. */
  repos?: string;
  refresh?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REPOS = 10;

const badRequest = (message: string) => new AppError(400, 'bad_request', message);

const MAX_VERSION_LENGTH = 255;

export function parseSelection(query: ReportQuery): ReportSelection {
  const version = query.version?.trim();
  if (version) {
    if (version.length > MAX_VERSION_LENGTH) throw badRequest('That version name is too long.');
    return { kind: 'version', version };
  }
  if (query.sprintId) {
    const sprintId = Number(query.sprintId);
    if (!Number.isInteger(sprintId) || sprintId <= 0) throw badRequest('Invalid sprintId.');
    return { kind: 'sprint', sprintId };
  }
  const { from, to = from } = query;
  if (!from || !to || !DATE.test(from) || !DATE.test(to)) {
    throw badRequest('Pass a version, a sprintId, or from (and optionally to) as YYYY-MM-DD.');
  }
  if (from > to) throw badRequest('"from" must not be after "to".');
  return { kind: 'dates', from, to };
}

export function parseRepos(value: string | undefined): RepoName[] {
  const repos = [...new Set((value ?? '').split(',').map(normalizeRepo).filter(Boolean))];
  if (repos.length === 0) throw badRequest('Select at least one repository.');
  if (repos.length > MAX_REPOS) throw badRequest(`Select at most ${MAX_REPOS} repositories.`);
  const invalid = repos.filter((repo) => !isRepoName(repo));
  if (invalid.length > 0) throw badRequest(`Invalid repository: ${invalid.join(', ')}.`);
  return repos;
}
