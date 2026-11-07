import type { ReportResponse, VersionsResponse } from '@ocis-dashboard/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config';

const realSetTimeout = globalThis.setTimeout;

beforeEach(() => {
  vi.stubEnv('LOG_LEVEL', 'silent');
  // Demo data waits on purpose so loading shows in the UI; tests don't need to wait.
  vi.stubGlobal('setTimeout', (fn: () => void) => realSetTimeout(fn, 0));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('release mode (demo)', () => {
  it('lists the versions', async () => {
    const app = await buildApp(loadConfig({ DEMO_MODE: 'true' }));
    const { versions } = (await app.inject({ url: '/api/versions' })).json<VersionsResponse>();
    expect(versions.map((v) => v.name)).toContain('Frances - 9.0.0');
    await app.close();
  });

  it('loads every ticket of a version, with where each repo ships it from', async () => {
    const app = await buildApp(loadConfig({ DEMO_MODE: 'true' }));
    const version = encodeURIComponent('Frances - 9.0.0');
    const response = await app.inject({
      url: `/api/report?version=${version}&repos=owncloud/ocis,owncloud/reva`,
    });
    expect(response.statusCode).toBe(200);
    const report = response.json<ReportResponse>();
    expect(report.reports.length).toBeGreaterThan(0);
    expect(report.reports.every((r) => r.ticket.fixVersions.includes('Frances - 9.0.0'))).toBe(
      true,
    );
    expect(report.releaseTargets).toEqual([
      { repo: 'owncloud/ocis', branch: 'stable-9.0', isDefault: false },
      { repo: 'owncloud/reva', branch: 'stable-9.0', isDefault: false },
    ]);
    await app.close();
  });

  it('has no release targets outside release mode', async () => {
    const app = await buildApp(loadConfig({ DEMO_MODE: 'true' }));
    const report = (
      await app.inject({ url: '/api/report?sprintId=27&repos=owncloud/ocis' })
    ).json<ReportResponse>();
    expect(report.releaseTargets).toBeUndefined();
    await app.close();
  });
});
