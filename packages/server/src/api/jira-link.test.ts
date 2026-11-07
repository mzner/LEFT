import type { ReportResponse, TicketReport } from '@ocis-dashboard/core';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import { demoJira } from '../demo/sources';

const ORIGIN = 'http://localhost:5173';
const QUERY = 'sprintId=27&repos=owncloud/ocis,owncloud/reva';

const realSetTimeout = globalThis.setTimeout;

beforeEach(() => {
  vi.stubEnv('LOG_LEVEL', 'silent');
  // Demo data waits on purpose so loading shows in the UI; tests don't need to wait.
  vi.stubGlobal('setTimeout', (fn: () => void, _ms?: number) => realSetTimeout(fn, 0));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const report = async (app: FastifyInstance, cookie?: string) =>
  (
    await app.inject({ url: `/api/report?${QUERY}`, headers: cookie ? { cookie } : {} })
  ).json<ReportResponse>();

/** A signed cookie for a stored session, so its cache lives across requests. */
async function sessionCookie(app: FastifyInstance): Promise<string> {
  const response = await app.inject({ url: '/auth/atlassian/login' });
  return [response.headers['set-cookie']].flat()[0]!.split(';')[0]!;
}

const unlinkedPr = (reports: TicketReport[]) => {
  for (const r of reports) {
    const linked = r.prs.find((l) => !l.linkedInJira && l.pr.state !== 'closed');
    if (linked) return { key: r.ticket.key, prUrl: linked.pr.url };
  }
  throw new Error('The demo sprint has no PR missing from Jira');
};

const link = (
  app: FastifyInstance,
  body: unknown,
  origin: string | null = ORIGIN,
  cookie?: string,
) =>
  app.inject({
    method: 'POST',
    url: `/api/report/jira-link?${QUERY}`,
    headers: { ...(origin ? { origin } : {}), ...(cookie ? { cookie } : {}) },
    payload: body as object,
  });

describe('POST /api/report/jira-link', () => {
  it('is off unless ATLASSIAN_SCOPES has write:jira-work', async () => {
    const app = await buildApp(
      loadConfig({
        SESSION_SECRET: 'x'.repeat(32),
        ATLASSIAN_CLIENT_ID: 'id',
        ATLASSIAN_CLIENT_SECRET: 'secret',
        ATLASSIAN_SITE_URL: 'https://example.atlassian.net',
        GITHUB_CLIENT_ID: 'id',
        GITHUB_CLIENT_SECRET: 'secret',
      }),
    );
    expect((await app.inject({ url: '/api/me' })).json().canLinkInJira).toBe(false);
    const response = await link(app, { key: 'OCISDEV-1', prUrl: 'https://github.com/a/b/pull/1' });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe('jira_write_disabled');
    await app.close();
  });

  it('refuses requests that do not come from the dashboard', async () => {
    const app = await buildApp(loadConfig({ DEMO_MODE: 'true' }));
    const target = unlinkedPr((await report(app)).reports);
    for (const origin of [null, 'https://evil.example']) {
      const response = await link(app, target, origin);
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('bad_origin');
    }
    await app.close();
  });

  it("refuses PRs that aren't the ticket's, such as ones that only mention the key", async () => {
    const app = await buildApp(loadConfig({ DEMO_MODE: 'true' }));
    const { reports } = await report(app);
    const ticket = reports.find((r) => r.prs.length > 0)!;
    const otherTicketsPr = reports.flatMap((r) => r.prs).find((l) => !ticket.prs.includes(l));
    const mention = reports.flatMap((r) => r.mentions)[0];
    for (const pr of [otherTicketsPr?.pr, mention].filter(Boolean)) {
      const response = await link(app, { key: ticket.ticket.key, prUrl: pr!.url });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('not_linkable');
    }
    await app.close();
  });

  it("doesn't duplicate a link someone pasted into Jira while the report was cached", async () => {
    const app = await buildApp(loadConfig({ DEMO_MODE: 'true' }));
    const cookie = await sessionCookie(app);
    const target = unlinkedPr((await report(app, cookie)).reports); // caches the ticket's links

    // Pasted by hand: Jira has it, but it carries no globalId of ours.
    await demoJira.addRemoteLink(target.key, { url: target.prUrl, title: 'pasted' });

    const response = await link(app, target, ORIGIN, cookie);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ created: false });
    await app.close();
  });

  it('accepts the dashboard origin when PUBLIC_URL has a path or a default port', async () => {
    for (const [publicUrl, origin] of [
      ['https://dash.example.com:443/app', 'https://dash.example.com'],
      ['http://localhost:5173/', 'http://localhost:5173'],
    ] as const) {
      const app = await buildApp(loadConfig({ DEMO_MODE: 'true', PUBLIC_URL: publicUrl }));
      const target = unlinkedPr((await report(app)).reports);
      expect((await link(app, target, origin)).statusCode).toBe(200);
      expect((await link(app, target, 'https://dash.example.com:8443')).statusCode).toBe(403);
      await app.close();
    }
  });

  it('links the PR, and the next report no longer flags it', async () => {
    const app = await buildApp(loadConfig({ DEMO_MODE: 'true' }));
    expect((await app.inject({ url: '/api/me' })).json().canLinkInJira).toBe(true);
    const before = await report(app);
    const target = unlinkedPr(before.reports);

    const created = await link(app, target);
    expect(created.statusCode).toBe(200);
    expect(created.json()).toEqual({ created: true });

    const after = await report(app);
    const ticket = after.reports.find((r) => r.ticket.key === target.key)!;
    expect(ticket.prs.find((l) => l.pr.url === target.prUrl)!.linkedInJira).toBe(true);

    // Linking again writes nothing.
    expect((await link(app, target)).json()).toEqual({ created: false });
    await app.close();
  });
});
