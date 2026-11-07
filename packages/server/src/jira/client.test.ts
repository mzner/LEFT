import { afterEach, describe, expect, it, vi } from 'vitest';
import { JiraClient, jqlString } from './client';

afterEach(() => vi.unstubAllGlobals());

describe('jqlString', () => {
  it('quotes a version name and escapes quotes and backslashes', () => {
    expect(jqlString('Frances - 9.0.0')).toBe('"Frances - 9.0.0"');
    expect(jqlString('say "hi"')).toBe('"say \\"hi\\""');
    expect(jqlString('a\\b')).toBe('"a\\\\b"');
  });

  it('keeps a hostile name inside the string literal', () => {
    // Without escaping, this would end the string and widen the query.
    expect(jqlString('x" OR project != "X')).toBe('"x\\" OR project != \\"X"');
  });
});

const client = () =>
  new JiraClient({
    accessToken: 't',
    cloudId: 'c',
    siteUrl: 'https://example.atlassian.net',
    projectKey: 'OCISDEV',
  });

function stubFetch(body: unknown) {
  const fetch = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

describe('JiraClient versions', () => {
  it('lists unarchived versions in Jira order', async () => {
    const fetch = stubFetch([
      { id: '1', name: 'Curie - 8.0.0', released: true, releaseDate: '2025-05-12' },
      { id: '2', name: 'Old', archived: true },
      { id: '3', name: 'Ghez', released: false },
    ]);
    expect(await client().listVersions()).toEqual([
      { id: '1', name: 'Curie - 8.0.0', released: true, releaseDate: '2025-05-12' },
      { id: '3', name: 'Ghez', released: false },
    ]);
    expect(fetch.mock.calls[0]![0]).toContain('/rest/api/3/project/OCISDEV/versions');
  });

  it('searches tickets by fixVersion with an escaped name', async () => {
    const fetch = stubFetch({ issues: [] });
    await client().ticketsInVersion('Frances "9"');
    expect(JSON.parse(String(fetch.mock.calls[0]![1]?.body)).jql).toBe(
      'project = "OCISDEV" AND fixVersion = "Frances \\"9\\"" ORDER BY key ASC',
    );
  });
});
