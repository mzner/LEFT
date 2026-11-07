<script setup lang="ts">
import type { FlagAction, GitHubIssueRef, TicketReport } from '@ocis-dashboard/core';
import { computed, inject, ref, watch } from 'vue';
import { JIRA_LINKER, reconcileLinks, type LinkResult } from '../lib/jira-link';
import { FLAGS, SOURCE_TEXT } from '../lib/view';

/** Explains the row: what to fix, what each PR is and why it belongs to the ticket. */
const props = defineProps<{ report: TicketReport }>();

/** The URL just copied, so its button can say so for a moment. */
const copied = ref<string>();

async function copy(action: FlagAction) {
  await navigator.clipboard.writeText(action.url);
  copied.value = action.url;
  setTimeout(() => {
    if (copied.value === action.url) copied.value = undefined;
  }, 2000);
}

const linker = inject(JIRA_LINKER, undefined);

/** The PR being linked in Jira, why the last attempt failed, and what was linked (per PR URL). */
const linking = ref<string>();
const linkErrors = ref<Record<string, string>>({});
/** What was linked, kept while the details are open; see `reconcileLinks`. */
const linkResults = ref<Record<string, LinkResult>>({});

/** E.g. `owncloud/ocis#13255`, for the confirmation once the problem itself is gone. */
function prName(url: string): string {
  const pr = props.report.prs.find((l) => l.pr.url === url)?.pr;
  return pr ? `${pr.repo}#${pr.number}` : url;
}

/** PRs the latest report still lists as "Not linked in Jira". */
const unlinked = computed(
  () =>
    new Set(
      props.report.flags
        .flatMap((f) => f.actions ?? [])
        .filter((a) => a.jiraLink)
        .map((a) => a.url),
    ),
);

// Each report that comes in wins over what we remember: if the link is deleted
// in Jira and the report refreshed, the button must come back.
watch(unlinked, (urls) => {
  linkResults.value = reconcileLinks(linkResults.value, urls);
});

/** Confirmations for links whose problem is gone (after the report reloaded). */
const confirmations = computed(() =>
  Object.entries(linkResults.value)
    .filter(([url]) => !unlinked.value.has(url))
    .map(([url, { created }]) => ({
      url,
      text: `${prName(url)} ${created ? 'is now' : 'was already'} linked in Jira.`,
    })),
);

async function linkInJira(action: FlagAction) {
  if (!linker || linking.value) return;
  linking.value = action.url;
  const others = { ...linkErrors.value };
  delete others[action.url];
  linkErrors.value = others;
  try {
    // On success the report reloads and this problem goes away; `confirmations` takes over.
    const created = await linker.link(props.report.ticket.key, action.url);
    linkResults.value = { ...linkResults.value, [action.url]: { created, settled: false } };
  } catch (error) {
    linkErrors.value = {
      ...linkErrors.value,
      [action.url]: error instanceof Error ? error.message : String(error),
    };
  } finally {
    linking.value = undefined;
  }
}

/** Without Jira write access, the Link in Jira action isn't offered. */
const usable = (actions: FlagAction[]) => actions.filter((a) => !a.jiraLink || linker);

/** Linked and unlinked issues in one list, each issue once. */
const issues = computed(() => {
  const byUrl = new Map<string, { issue: GitHubIssueRef; linked: boolean }>();
  for (const issue of props.report.unlinkedIssues) byUrl.set(issue.url, { issue, linked: false });
  for (const issue of props.report.issues) byUrl.set(issue.url, { issue, linked: true });
  return [...byUrl.values()];
});
</script>

<template>
  <div class="details">
    <section>
      <h3>What to do</h3>
      <ul v-if="confirmations.length > 0" class="fix-list">
        <li v-for="c in confirmations" :key="c.url" data-tone="done" role="status">
          <strong>✓ {{ c.text }}</strong>
          <span class="flag-actions">
            <a :href="report.ticket.url" target="_blank" rel="noreferrer">Open in Jira</a>
          </span>
        </li>
      </ul>
      <p v-if="report.flags.length === 0" class="hint">
        Nothing. Every PR is linked both ways and the fix is on every branch its fix versions need.
      </p>
      <ul v-else class="fix-list">
        <li
          v-for="(flag, i) in report.flags"
          :key="i"
          :data-tone="flag.severity === 'error' ? 'fix' : 'wait'"
        >
          <strong>{{ flag.message }}.</strong> {{ FLAGS[flag.code].hint }}
          <span v-if="flag.actions" class="flag-actions">
            <template v-for="action in usable(flag.actions)" :key="action.label">
              <span
                v-if="action.jiraLink && action.url in linkResults"
                class="linked-note"
                role="status"
              >
                ✓ Linked in Jira
              </span>
              <button
                v-else-if="action.jiraLink"
                class="primary-button"
                :disabled="linking !== undefined"
                @click="linkInJira(action)"
              >
                {{ linking === action.url ? 'Linking…' : action.label }}
              </button>
              <button v-else-if="action.copy" class="inline-button" @click="copy(action)">
                {{ copied === action.url ? 'Copied' : action.label }}
              </button>
              <a v-else :href="action.url" target="_blank" rel="noreferrer">{{ action.label }}</a>
            </template>
          </span>
          <template v-for="action in flag.actions ?? []" :key="action.label">
            <p v-if="action.jiraLink && linkErrors[action.url]" class="link-error" role="alert">
              {{ linkErrors[action.url] }}
            </p>
          </template>
        </li>
      </ul>
    </section>

    <section>
      <h3>Pull requests ({{ report.prs.length }})</h3>
      <p v-if="report.prs.length === 0" class="hint">None found in the selected repositories.</p>
      <ul v-else class="pr-list">
        <li v-for="{ pr, sources } in report.prs" :key="pr.url">
          <span class="pr-state" :data-state="pr.state">{{ pr.state }}</span>
          <a class="identifier" :href="pr.url" target="_blank" rel="noreferrer">
            {{ pr.repo }}#{{ pr.number }}
          </a>
          {{ pr.title }}
          <p class="hint">
            Into <span class="identifier">{{ pr.baseRef }}</span>
            <template v-if="pr.author"> by {{ pr.author }}</template
            >. Found by {{ sources.map((s) => SOURCE_TEXT[s]).join(', ') }}.
          </p>
        </li>
      </ul>

      <template v-if="report.mentions.length > 0">
        <h4>Only mentioned in</h4>
        <ul class="pr-list">
          <li v-for="pr in report.mentions" :key="pr.url">
            <a class="identifier" :href="pr.url" target="_blank" rel="noreferrer">
              {{ pr.repo }}#{{ pr.number }}
            </a>
            {{ pr.title }}
            <p class="hint">
              The key appears only in the description, so it does not count as this ticket's PR.
            </p>
          </li>
        </ul>
      </template>
    </section>

    <section v-if="issues.length > 0">
      <h3>GitHub issues</h3>
      <ul class="pr-list">
        <li v-for="{ issue, linked } in issues" :key="issue.url">
          <a class="identifier" :href="issue.url" target="_blank" rel="noreferrer">
            {{ issue.repo }}#{{ issue.number }}
          </a>
          {{ issue.title }}
          <p class="hint">
            {{
              linked
                ? 'Linked to a PR of this ticket.'
                : 'Mentions the key, but no PR of this ticket is linked to it.'
            }}
          </p>
        </li>
      </ul>
    </section>
  </div>
</template>
