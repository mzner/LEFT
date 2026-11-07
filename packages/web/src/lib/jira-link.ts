import type { InjectionKey } from 'vue';

/** Lets ticket details add a PR to a ticket as a Jira web link; provided by the dashboard. */
export interface JiraLinker {
  /**
   * Resolves once Jira has the link and the report is reloading: true if it was
   * added, false if Jira already had it. Rejects with the reason it failed.
   */
  link(key: string, prUrl: string): Promise<boolean>;
}

export const JIRA_LINKER: InjectionKey<JiraLinker | undefined> = Symbol('jira-linker');

/** What the details remember about a PR they linked in Jira. */
export interface LinkResult {
  /** True if the link was added, false if Jira already had it. */
  created: boolean;
  /** A report has since come back without the problem, so the PR really is linked. */
  settled: boolean;
}

/**
 * Compares the remembered links with the problems of the latest report
 * (`flagged`: URLs still marked "Not linked in Jira"). Right after linking, the
 * problem is still listed until the report reloads, so the note stays. Once a
 * report has come back without it, the note is settled; if the problem is back
 * after that (the link was deleted in Jira, then Refresh), the report wins and
 * the note goes.
 */
export function reconcileLinks(
  results: Record<string, LinkResult>,
  flagged: ReadonlySet<string>,
): Record<string, LinkResult> {
  const next: Record<string, LinkResult> = {};
  for (const [url, result] of Object.entries(results)) {
    if (!flagged.has(url)) next[url] = { ...result, settled: true };
    else if (!result.settled) next[url] = result;
  }
  return next;
}
