/**
 * Who the ticket list is narrowed to: any of the chosen entries. An entry is
 * `'me'`, `'unassigned'` or a Jira account id. Nothing chosen means anyone.
 */
export type AssigneeFilter = string[];

export interface Person {
  id: string;
  name: string;
}

/** Tokens that stand for something other than one account. */
export const ME = 'me';
export const UNASSIGNED = 'unassigned';

/** Whether a ticket with this assignee passes the filter. */
export function matchesAssignee(
  filter: AssigneeFilter,
  assignee: Person | null,
  myAccountId?: string,
): boolean {
  if (filter.length === 0) return true;
  return filter.some((entry) => {
    if (entry === UNASSIGNED) return assignee === null;
    if (assignee === null) return false;
    return entry === ME ? assignee.id === myAccountId : assignee.id === entry;
  });
}

/** Adds the entry if it is missing, removes it if it is there. */
export function toggleAssignee(filter: AssigneeFilter, entry: string): AssigneeFilter {
  return filter.includes(entry) ? filter.filter((e) => e !== entry) : [...filter, entry];
}

/** "a", "a or b", "a, b or c". */
function orList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
}

/** The people a filter names: "me" first, then the others in the order chosen. */
function names(filter: AssigneeFilter, people: Person[], me: string): string[] {
  const others = filter
    .filter((entry) => entry !== UNASSIGNED && entry !== ME)
    .map((entry) => people.find((p) => p.id === entry)?.name ?? 'someone else');
  return filter.includes(ME) ? [me, ...others] : others;
}

/** For the sentence under the title: "assigned to you or Alex Berger, or unassigned". */
export function describeAssignees(filter: AssigneeFilter, people: Person[]): string | undefined {
  if (filter.length === 0) return undefined;
  const who = names(filter, people, 'you');
  const unassigned = filter.includes(UNASSIGNED);
  if (who.length === 0) return 'unassigned';
  return `assigned to ${orList(who)}${unassigned ? ', or unassigned' : ''}`;
}

/** For the button: short, and never wider than two names. */
export function assigneeLabel(filter: AssigneeFilter, people: Person[]): string {
  if (filter.length === 0) return 'Anyone';
  if (filter.length === 1 && filter[0] === ME) return 'Assigned to me';
  if (filter.length === 1 && filter[0] === UNASSIGNED) return 'Unassigned';
  if (filter.length > 2) return `${filter.length} assignees`;
  const parts = filter.map((entry) =>
    entry === UNASSIGNED ? 'Unassigned' : (names([entry], people, 'Me')[0] ?? ''),
  );
  return parts.join(', ');
}

/** `?assignee=me,unassigned,<id>`. Old links said `all` for anyone; that still works. */
export function parseAssignees(value: string | undefined): AssigneeFilter {
  if (!value) return [];
  return [...new Set(value.split(',').map((entry) => entry.trim()))].filter(
    (entry) => entry !== '' && entry !== 'all',
  );
}

export const formatAssignees = (filter: AssigneeFilter): string => filter.join(',');
