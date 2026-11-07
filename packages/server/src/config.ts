import type { RepoName } from '@ocis-dashboard/core';
import { normalizeRepo } from '@ocis-dashboard/core';

export interface Config {
  port: number;
  /** Origin the browser uses; OAuth callbacks are built from it. */
  publicUrl: string;
  sessionSecret: string;
  projectKey: string;
  /** Serve sample data instead of Jira/GitHub; no OAuth apps needed. */
  demo: boolean;
  /** Per-repo fixVersion → branch template, e.g. `release-{major}.{minor}`. */
  branchTemplates: Record<RepoName, string>;
  atlassian: {
    clientId: string;
    clientSecret: string;
    scopes: string;
    siteUrl: string;
    /** `scopes` includes Jira write access, so PRs can be linked from the dashboard. */
    canLink: boolean;
  };
  github: {
    clientId: string;
    clientSecret: string;
  };
}

const DEFAULT_ATLASSIAN_SCOPES = [
  'read:jira-work',
  'read:jira-user',
  'read:board-scope:jira-software',
  'read:sprint:jira-software',
  'read:project:jira',
  'read:issue-details:jira',
  'read:jql:jira',
  'offline_access',
].join(' ');

/** Lets the dashboard add PRs to tickets as web links. Off unless listed in ATLASSIAN_SCOPES. */
export const JIRA_WRITE_SCOPE = 'write:jira-work';

const DEMO_SESSION_SECRET = 'demo-mode-session-secret-not-for-real-use';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const demo = ['1', 'true', 'yes'].includes((env.DEMO_MODE ?? '').trim().toLowerCase());
  const missing: string[] = [];
  const optional = (name: string, fallback: string): string => env[name]?.trim() || fallback;
  // In demo mode nothing talks to Jira or GitHub, so credentials are not needed.
  const required = (name: string, demoFallback = ''): string => {
    const value = env[name]?.trim();
    if (value) return value;
    if (!demo) missing.push(name);
    return demoFallback;
  };
  const trimSlash = (url: string) => url.replace(/\/+$/, '');

  const scopes = optional('ATLASSIAN_SCOPES', DEFAULT_ATLASSIAN_SCOPES);

  const config: Config = {
    port: Number(optional('SERVER_PORT', '3000')),
    publicUrl: trimSlash(optional('PUBLIC_URL', 'http://localhost:5173')),
    sessionSecret: required('SESSION_SECRET', DEMO_SESSION_SECRET),
    projectKey: optional('JIRA_PROJECT_KEY', 'OCISDEV'),
    demo,
    branchTemplates: parseBranchTemplates(optional('BRANCH_TEMPLATES', '')),
    atlassian: {
      clientId: required('ATLASSIAN_CLIENT_ID'),
      clientSecret: required('ATLASSIAN_CLIENT_SECRET'),
      scopes,
      // No default: the site is yours. Demo mode only builds links, so a placeholder will do.
      siteUrl: trimSlash(required('ATLASSIAN_SITE_URL', 'https://example.atlassian.net')),
      // Demo mode pretends to link, so the button can be tried.
      canLink: demo || scopes.split(/\s+/).includes(JIRA_WRITE_SCOPE),
    },
    github: {
      clientId: required('GITHUB_CLIENT_ID'),
      clientSecret: required('GITHUB_CLIENT_SECRET'),
    },
  };

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(', ')}. ` +
        'Fill them in .env (see .env.example), or set DEMO_MODE=true to try the dashboard with sample data.',
    );
  }
  return config;
}

/** Shorter session secrets only get a warning at startup, so existing setups keep working. */
export const MIN_SECRET_LENGTH = 32;

/** Parses `owner/repo=template,owner/other=template`. */
export function parseBranchTemplates(value: string): Record<RepoName, string> {
  const templates: Record<RepoName, string> = {};
  for (const entry of value.split(',')) {
    const [repo, template] = entry.split('=').map((part) => part.trim());
    if (!repo || !template) continue;
    if (!template.includes('{major}')) {
      throw new Error(`BRANCH_TEMPLATES: template for ${repo} must contain {major}.`);
    }
    templates[normalizeRepo(repo)] = template;
  }
  return templates;
}
