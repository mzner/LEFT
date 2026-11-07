import { PassThrough } from 'node:stream';
import type {
  BoardsResponse,
  JiraLinkRequest,
  JiraLinkResponse,
  MeResponse,
  ReportResponse,
  ReportStreamEvent,
  SprintsResponse,
} from '@ocis-dashboard/core';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Config } from '../config';
import { AppError, UpstreamError } from '../errors';
import { planJiraLink } from '../report/jira-link';
import { ReportService } from '../report/service';
import type { Session } from '../session';
import { codeHostFor, jiraFor } from './clients';
import { toApiError } from './error-handler';
import { parseRepos, parseSelection, type ReportQuery } from './selection';

const DEMO_USER = { connected: true, id: 'demo', name: 'Demo user' };

export function registerApiRoutes(app: FastifyInstance, config: Config): void {
  /** What browsers send as `Origin` for the dashboard's page (no path, no default port). */
  const appOrigin = new URL(config.publicUrl).origin;

  app.get('/api/me', async (request): Promise<MeResponse> => {
    const canLinkInJira = config.atlassian.canLink;
    if (config.demo) return { atlassian: DEMO_USER, github: DEMO_USER, demo: true, canLinkInJira };
    const { atlassian, github } = request.session;
    return {
      atlassian: atlassian
        ? { connected: true, id: atlassian.accountId, name: atlassian.name }
        : { connected: false },
      github: github
        ? { connected: true, id: github.login, name: github.name }
        : { connected: false },
      demo: false,
      canLinkInJira,
    };
  });

  app.get('/api/boards', async (request): Promise<BoardsResponse> => {
    const jira = await jiraFor(config, request.session);
    const boards = await request.session.cache.getOrLoad('boards', () => jira.listBoards());
    return { boards };
  });

  app.get<{ Querystring: { boardId?: string } }>(
    '/api/sprints',
    async (request): Promise<SprintsResponse> => {
      const boardId = Number(request.query.boardId);
      if (!Number.isInteger(boardId) || boardId <= 0) {
        throw new AppError(400, 'bad_request', 'Pass a numeric boardId.');
      }
      const jira = await jiraFor(config, request.session);
      const sprints = await request.session.cache.getOrLoad(`sprints:${boardId}`, () =>
        jira.listSprints(boardId),
      );
      return { sprints };
    },
  );

  /** Plain JSON, handy for scripts. */
  app.get<{ Querystring: ReportQuery }>(
    '/api/report',
    async (request, reply): Promise<ReportResponse> => {
      const { service, selection, repos } = await prepareReport(request.query, request.session);
      return service.build(selection, repos, { signal: abortOnDisconnect(reply) });
    },
  );

  /** NDJSON: progress events while the report is built, then the result (or an error). */
  app.get<{ Querystring: ReportQuery }>('/api/report/stream', async (request, reply) => {
    const { service, selection, repos } = await prepareReport(request.query, request.session);
    const signal = abortOnDisconnect(reply);
    const stream = new PassThrough();
    const emit = (event: ReportStreamEvent) => {
      if (!signal.aborted) stream.write(`${JSON.stringify(event)}\n`);
    };

    service
      .build(selection, repos, {
        signal,
        onProgress: (progress) => emit({ type: 'progress', progress }),
        onTickets: (tickets) => emit({ type: 'tickets', tickets }),
      })
      .then((report) => emit({ type: 'result', report }))
      .catch((error: unknown) => {
        if (!signal.aborted) emit({ type: 'error', error: toApiError(error, request.log).body });
      })
      .finally(() => stream.end());

    return reply
      .type('application/x-ndjson; charset=utf-8')
      .header('Cache-Control', 'no-cache')
      .send(stream);
  });

  /**
   * Adds a PR to a ticket as a Jira web link. The query is the report's
   * selection: the report is rebuilt (from the cache, normally) to check that
   * the PR really is the ticket's and still missing from its links.
   */
  app.post<{ Querystring: ReportQuery; Body: JiraLinkRequest }>(
    '/api/report/jira-link',
    async (request): Promise<JiraLinkResponse> => {
      if (!config.atlassian.canLink) {
        throw new AppError(
          403,
          'jira_write_disabled',
          'Linking in Jira is off: ATLASSIAN_SCOPES has no write:jira-work.',
        );
      }
      // The session cookie is SameSite=Lax already; this also stops same-site pages.
      if (request.headers.origin !== appOrigin) {
        throw new AppError(403, 'bad_origin', 'Link from the dashboard itself.');
      }
      const { key, prUrl } = request.body ?? {};
      if (typeof key !== 'string' || typeof prUrl !== 'string') {
        throw new AppError(400, 'bad_request', 'Pass the ticket key and the PR URL.');
      }

      const { service, jira, selection, repos } = await prepareReport(
        request.query,
        request.session,
      );
      // Read this ticket's links fresh: one pasted into Jira by hand a minute ago has no
      // globalId of ours, so writing on the strength of cached links would duplicate it.
      service.forgetRemoteLinks(key);
      const plan = planJiraLink(await service.build(selection, repos), key, prUrl);
      if (plan.kind === 'already-linked') return { created: false };

      try {
        await jira.addRemoteLink(key, plan.link);
      } catch (error) {
        if (error instanceof UpstreamError && error.status === 403) {
          request.log.warn({ url: error.url, body: error.body }, error.message);
          throw new AppError(
            403,
            'jira_link_forbidden',
            `Jira didn't allow the link. You may not be allowed to edit ${key}, or you signed in ` +
              'before linking was turned on: sign out and sign in again.',
          );
        }
        throw error;
      }
      service.forgetRemoteLinks(key);
      return { created: true };
    },
  );

  /** Aborts when the client goes away before the response is complete (e.g. a newer selection). */
  function abortOnDisconnect(reply: FastifyReply): AbortSignal {
    const controller = new AbortController();
    reply.raw.on('close', () => {
      if (!reply.raw.writableFinished) controller.abort();
    });
    return controller.signal;
  }

  async function prepareReport(query: ReportQuery, session: Session) {
    const selection = parseSelection(query);
    const repos = parseRepos(query.repos);
    if (query.refresh === '1') session.cache.clear();

    const jira = await jiraFor(config, session);
    const service = new ReportService({
      tickets: jira,
      code: codeHostFor(config, session),
      projectKey: config.projectKey,
      branchTemplates: config.branchTemplates,
      staleBackportDays: config.staleBackportDays,
      cache: session.cache,
    });
    return { service, jira, selection, repos };
  }
}
