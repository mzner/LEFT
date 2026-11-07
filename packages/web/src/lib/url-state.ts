/** The parts of the view a link carries: what to load and how it is filtered. */
export interface UrlState {
  mode?: 'sprint' | 'dates' | 'release';
  boardId?: number;
  /** A fixVersion name, in release mode. */
  version?: string;
  sprintId?: number;
  from?: string;
  to?: string;
  problem?: string;
  /** Release mode: which blocking tickets the table shows. */
  blocking?: string;
  assignee?: string;
  search?: string;
  branch?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Reads `?mode=…&sprint=…`; anything malformed is ignored rather than trusted. */
export function readUrlState(
  query: string,
  problems: readonly string[],
  blockFilters: readonly string[] = [],
): UrlState {
  const params = new URLSearchParams(query);
  const id = (name: string) => {
    const n = Number(params.get(name));
    return Number.isSafeInteger(n) && n > 0 ? n : undefined;
  };
  const day = (name: string) => {
    const value = params.get(name);
    return value && DAY.test(value) ? value : undefined;
  };
  const text = (name: string) => params.get(name)?.trim() || undefined;
  const mode = params.get('mode');
  const problem = params.get('problem');
  const blocking = params.get('blocking');
  return {
    mode: mode === 'sprint' || mode === 'dates' || mode === 'release' ? mode : undefined,
    version: text('version'),
    boardId: id('board'),
    sprintId: id('sprint'),
    from: day('from'),
    to: day('to'),
    problem: problem && problems.includes(problem) ? problem : undefined,
    blocking: blocking && blockFilters.includes(blocking) ? blocking : undefined,
    assignee: text('assignee'),
    search: text('q'),
    branch: text('branch'),
  };
}

/** `?…` for the state, leaving out defaults so plain views keep a plain URL; '' if nothing is set. */
export function writeUrlState(state: UrlState): string {
  const params = new URLSearchParams();
  const set = (name: string, value: string | number | undefined, skip?: string) => {
    if (value !== undefined && value !== '' && value !== skip) params.set(name, String(value));
  };
  set('mode', state.mode);
  set('board', state.boardId);
  set('sprint', state.sprintId);
  set('version', state.version);
  set('from', state.from);
  set('to', state.to);
  set('problem', state.problem, 'all');
  set('blocking', state.blocking);
  set('assignee', state.assignee, 'all');
  set('q', state.search?.trim());
  set('branch', state.branch);
  const query = params.toString();
  return query ? `?${query}` : '';
}
