import { describe, expect, it } from 'vitest';
import {
  assigneeLabel,
  describeAssignees,
  formatAssignees,
  matchesAssignee,
  parseAssignees,
  toggleAssignee,
  type Person,
} from './assignee-filter';

const alex: Person = { id: 'u-alex', name: 'Alex Berger' };
const sam: Person = { id: 'u-sam', name: 'Sam Okafor' };
const robin: Person = { id: 'u-robin', name: 'Robin Keller' };
const people = [alex, sam, robin];
const ME_ID = 'u-me';

describe('matchesAssignee', () => {
  it('keeps everything when nothing is chosen', () => {
    expect(matchesAssignee([], alex)).toBe(true);
    expect(matchesAssignee([], null)).toBe(true);
  });

  it('keeps a ticket that matches any chosen entry', () => {
    const filter = ['u-alex', 'u-sam'];
    expect(matchesAssignee(filter, alex)).toBe(true);
    expect(matchesAssignee(filter, sam)).toBe(true);
    expect(matchesAssignee(filter, robin)).toBe(false);
    expect(matchesAssignee(filter, null)).toBe(false);
  });

  it('adds unassigned tickets to the people chosen', () => {
    expect(matchesAssignee(['u-alex', 'unassigned'], null)).toBe(true);
    expect(matchesAssignee(['u-alex', 'unassigned'], alex)).toBe(true);
    expect(matchesAssignee(['u-alex', 'unassigned'], sam)).toBe(false);
  });

  it('resolves "me" to the signed-in account, alongside other people', () => {
    const filter = ['me', 'u-sam'];
    expect(matchesAssignee(filter, { id: ME_ID, name: 'Me' }, ME_ID)).toBe(true);
    expect(matchesAssignee(filter, sam, ME_ID)).toBe(true);
    expect(matchesAssignee(filter, alex, ME_ID)).toBe(false);
  });

  it("matches nobody for 'me' when the account is unknown", () => {
    expect(matchesAssignee(['me'], alex, undefined)).toBe(false);
    expect(matchesAssignee(['me'], null, undefined)).toBe(false);
  });
});

describe('toggleAssignee', () => {
  it('adds an entry, keeping the order chosen, and removes it again', () => {
    const one = toggleAssignee([], 'u-sam');
    const two = toggleAssignee(one, 'me');
    expect(two).toEqual(['u-sam', 'me']);
    expect(toggleAssignee(two, 'u-sam')).toEqual(['me']);
  });

  it('does not change the list it was given', () => {
    const filter = ['u-sam'];
    toggleAssignee(filter, 'me');
    expect(filter).toEqual(['u-sam']);
  });
});

describe('describeAssignees', () => {
  it('says nothing when nothing is chosen', () => {
    expect(describeAssignees([], people)).toBeUndefined();
  });

  it('reads naturally for one, two and three people', () => {
    expect(describeAssignees(['me'], people)).toBe('assigned to you');
    expect(describeAssignees(['u-alex'], people)).toBe('assigned to Alex Berger');
    expect(describeAssignees(['me', 'u-alex'], people)).toBe('assigned to you or Alex Berger');
    // "you" leads, whatever order they were ticked in.
    expect(describeAssignees(['u-alex', 'me'], people)).toBe('assigned to you or Alex Berger');
    expect(describeAssignees(['u-alex', 'u-sam', 'u-robin'], people)).toBe(
      'assigned to Alex Berger, Sam Okafor or Robin Keller',
    );
  });

  it('adds unassigned on its own or after people', () => {
    expect(describeAssignees(['unassigned'], people)).toBe('unassigned');
    expect(describeAssignees(['u-alex', 'unassigned'], people)).toBe(
      'assigned to Alex Berger, or unassigned',
    );
    expect(describeAssignees(['u-alex', 'u-sam', 'unassigned', 'me'], people)).toBe(
      'assigned to you, Alex Berger or Sam Okafor, or unassigned',
    );
  });

  it('does not invent a name for someone who is not in this list', () => {
    expect(describeAssignees(['u-gone'], people)).toBe('assigned to someone else');
  });
});

describe('assigneeLabel', () => {
  it('names one or two choices and counts more', () => {
    expect(assigneeLabel([], people)).toBe('Anyone');
    expect(assigneeLabel(['me'], people)).toBe('Assigned to me');
    expect(assigneeLabel(['unassigned'], people)).toBe('Unassigned');
    expect(assigneeLabel(['u-alex'], people)).toBe('Alex Berger');
    expect(assigneeLabel(['me', 'u-alex'], people)).toBe('Me, Alex Berger');
    expect(assigneeLabel(['u-alex', 'unassigned'], people)).toBe('Alex Berger, Unassigned');
    expect(assigneeLabel(['u-alex', 'u-sam', 'u-robin'], people)).toBe('3 assignees');
  });
});

describe('parseAssignees / formatAssignees', () => {
  it('round-trips, in order, without repeats or blanks', () => {
    const filter = ['me', 'unassigned', '712020:abc-123'];
    expect(parseAssignees(formatAssignees(filter))).toEqual(filter);
    expect(parseAssignees('me,,me, u-sam ')).toEqual(['me', 'u-sam']);
  });

  it('reads old single-value links, including "all" for anyone', () => {
    expect(parseAssignees('me')).toEqual(['me']);
    expect(parseAssignees('u-sam')).toEqual(['u-sam']);
    expect(parseAssignees('all')).toEqual([]);
    expect(parseAssignees(undefined)).toEqual([]);
    expect(parseAssignees('')).toEqual([]);
  });
});
