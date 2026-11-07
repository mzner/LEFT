import { describe, expect, it } from 'vitest';
import { AppError } from '../errors';
import { parseRepos, parseSelection } from './selection';

describe('parseSelection', () => {
  it('takes a version first, trimmed', () => {
    expect(parseSelection({ version: ' Frances - 9.0.0 ', sprintId: '27' })).toEqual({
      kind: 'version',
      version: 'Frances - 9.0.0',
    });
  });

  it('rejects an absurdly long version name', () => {
    expect(() => parseSelection({ version: 'x'.repeat(256) })).toThrow(AppError);
  });

  it('prefers a sprint', () => {
    expect(parseSelection({ sprintId: '27', from: '2026-10-01' })).toEqual({
      kind: 'sprint',
      sprintId: 27,
    });
  });

  it('treats a lone date as a single-day range', () => {
    expect(parseSelection({ from: '2026-10-30' })).toEqual({
      kind: 'dates',
      from: '2026-10-30',
      to: '2026-10-30',
    });
  });

  it.each([
    {},
    { sprintId: 'abc' },
    { from: '30.10.2026' },
    { from: '2026-10-30', to: '2026-10-01' },
  ])('rejects %j', (query) => {
    expect(() => parseSelection(query)).toThrow(AppError);
  });
});

describe('parseRepos', () => {
  it('normalizes and de-duplicates', () => {
    expect(parseRepos('owncloud/ocis, Owncloud/OCIS,owncloud/reva')).toEqual([
      'owncloud/ocis',
      'owncloud/reva',
    ]);
  });

  it('rejects anything that is not owner/name', () => {
    expect(() => parseRepos('owncloud/ocis repo:evil/x')).toThrow(AppError);
    expect(() => parseRepos('')).toThrow(AppError);
  });
});
