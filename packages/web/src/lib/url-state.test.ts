import { describe, expect, it } from 'vitest';
import { readUrlState, writeUrlState } from './url-state';

const PROBLEMS = ['all', 'attention', 'NO_PR'];

describe('URL state', () => {
  it('round-trips a sprint view with filters', () => {
    const query = writeUrlState({
      mode: 'sprint',
      boardId: 1886,
      sprintId: 14429,
      problem: 'attention',
      assignee: 'me',
      search: 'quota',
      branch: 'owncloud/ocis|stable-9.0|missing',
    });
    expect(readUrlState(query, PROBLEMS)).toEqual({
      mode: 'sprint',
      boardId: 1886,
      sprintId: 14429,
      problem: 'attention',
      assignee: 'me',
      search: 'quota',
      branch: 'owncloud/ocis|stable-9.0|missing',
    });
  });

  it('round-trips a release view, whatever the version is called', () => {
    const version = 'Frances - 9.0.0 & "hotfix"';
    const query = writeUrlState({ mode: 'release', version });
    expect(readUrlState(query, PROBLEMS)).toMatchObject({ mode: 'release', version });
  });

  it('leaves defaults out of the URL', () => {
    expect(
      writeUrlState({
        mode: 'dates',
        from: '2026-10-20',
        to: '2026-11-02',
        problem: 'all',
        assignee: 'all',
        search: ' ',
        branch: '',
      }),
    ).toBe('?mode=dates&from=2026-10-20&to=2026-11-02');
    expect(writeUrlState({})).toBe('');
  });

  it('ignores malformed values instead of trusting them', () => {
    expect(
      readUrlState('?mode=year&sprint=-3&board=abc&from=yesterday&problem=EVERYTHING', PROBLEMS),
    ).toEqual({
      mode: undefined,
      boardId: undefined,
      sprintId: undefined,
      from: undefined,
      to: undefined,
      problem: undefined,
      assignee: undefined,
      search: undefined,
      branch: undefined,
    });
  });
});
