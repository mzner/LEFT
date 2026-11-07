import { freshAtlassianAuth } from '../auth/atlassian';
import type { Config } from '../config';
import { demoCodeHost, demoJira } from '../demo/sources';
import { notConnected } from '../errors';
import { GitHubClient } from '../github/client';
import { JiraClient } from '../jira/client';
import type { CodeHost, JiraSource } from '../report/ports';
import type { Session } from '../session';

/** Jira as the signed-in user, or sample data in demo mode. */
export async function jiraFor(config: Config, session: Session): Promise<JiraSource> {
  if (config.demo) return demoJira;
  const auth = await freshAtlassianAuth(config, session);
  return new JiraClient({
    accessToken: auth.accessToken,
    cloudId: auth.cloudId,
    siteUrl: config.atlassian.siteUrl,
    projectKey: config.projectKey,
  });
}

/** GitHub as the signed-in user, or sample data in demo mode. */
export function codeHostFor(config: Config, session: Session): CodeHost {
  if (config.demo) return demoCodeHost;
  if (!session.github) throw notConnected('github');
  return new GitHubClient(session.github.accessToken);
}
