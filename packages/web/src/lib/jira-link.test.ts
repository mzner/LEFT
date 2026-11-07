import { describe, expect, it } from 'vitest';
import { reconcileLinks, type LinkResult } from './jira-link';

const PR = 'https://github.com/owncloud/ocis/pull/13255';
const just: LinkResult = { created: true, settled: false };

describe('reconcileLinks', () => {
  it('keeps the note while the report still lists the problem it was just linked for', () => {
    expect(reconcileLinks({ [PR]: just }, new Set([PR]))).toEqual({ [PR]: just });
  });

  it('settles the note once a report comes back without the problem', () => {
    const settled = reconcileLinks({ [PR]: just }, new Set());
    expect(settled).toEqual({ [PR]: { created: true, settled: true } });
    // Further reports without the problem change nothing.
    expect(reconcileLinks(settled, new Set())).toEqual(settled);
  });

  it('drops a settled note when the problem is back, e.g. the link was deleted in Jira', () => {
    const settled = reconcileLinks({ [PR]: just }, new Set());
    expect(reconcileLinks(settled, new Set([PR]))).toEqual({});
  });

  it('only touches the PR that came back', () => {
    const other = 'https://github.com/owncloud/ocis/pull/1';
    const both = reconcileLinks({ [PR]: just, [other]: just }, new Set());
    expect(reconcileLinks(both, new Set([PR]))).toEqual({
      [other]: { created: true, settled: true },
    });
  });
});
