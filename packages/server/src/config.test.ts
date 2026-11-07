import { describe, expect, it } from 'vitest';
import { loadConfig, parseBranchTemplates } from './config';

describe('parseBranchTemplates', () => {
  it('parses repo=template pairs and normalizes repo names', () => {
    expect(
      parseBranchTemplates('Owncloud/Web=release-{major}.{minor}, owncloud/reva=stable-{major}'),
    ).toEqual({
      'owncloud/web': 'release-{major}.{minor}',
      'owncloud/reva': 'stable-{major}',
    });
  });

  it('rejects templates without {major}', () => {
    expect(() => parseBranchTemplates('owncloud/web=release')).toThrow(/\{major\}/);
  });
});

describe('STALE_BACKPORT_DAYS', () => {
  const days = (value?: string) =>
    loadConfig({
      DEMO_MODE: 'true',
      ...(value === undefined ? {} : { STALE_BACKPORT_DAYS: value }),
    }).staleBackportDays;

  it('defaults to 7 days', () => {
    expect(days()).toBe(7);
  });

  it('takes a whole number of days, and 0 turns the flag off', () => {
    expect(days('14')).toBe(14);
    expect(days('0')).toBe(0);
  });

  it('rejects anything else instead of silently using the default', () => {
    for (const bad of ['-1', '1.5', 'a week', '7d']) {
      expect(() => days(bad)).toThrow(/STALE_BACKPORT_DAYS/);
    }
  });
});

describe('loadConfig', () => {
  it('lists every missing credential', () => {
    expect(() => loadConfig({})).toThrow(
      /SESSION_SECRET, ATLASSIAN_CLIENT_ID, ATLASSIAN_CLIENT_SECRET, ATLASSIAN_SITE_URL, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET/,
    );
  });

  it('needs no credentials in demo mode', () => {
    expect(loadConfig({ DEMO_MODE: 'true' }).demo).toBe(true);
  });
});
