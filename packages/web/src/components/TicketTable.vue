<script setup lang="ts">
import type { Blocker, FlagCode, RepoInfo } from '@ocis-dashboard/core';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { branchRows } from '../lib/branches';
import { formatRange } from '../lib/format';
import type { MarkedReport } from '../lib/marks';
import { moveCurrent, navAction } from '../lib/row-nav';
import {
  doneButUnfinished,
  FLAGS,
  isWait,
  SORT_LABELS,
  sortDate,
  uniqueFlagCodes,
  type SortKey,
} from '../lib/view';
import BranchList from './BranchList.vue';
import TicketDetails from './TicketDetails.vue';

const props = defineProps<{
  reports: MarkedReport[];
  repos: RepoInfo[];
  /** The active sort; for a date sort, each row shows that date. */
  sort: SortKey;
  /** Data is being refreshed; dim it. */
  stale: boolean;
  /** Release mode: why each blocking ticket blocks, by key. */
  blockers?: Map<string, Blocker[]>;
}>();
defineEmits<{ addRepo: [repo: string]; markFixed: [key: string]; unmark: [key: string] }>();

const expanded = ref(new Set<string>());

function toggle(key: string) {
  const next = new Set(expanded.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  expanded.value = next;
}

function expand(key: string) {
  if (!expanded.value.has(key)) toggle(key);
}

function collapse(key: string) {
  if (expanded.value.has(key)) toggle(key);
}

/** The row the keyboard acts on (j/k to move; l, h, o or Enter for its details). */
const current = ref<string>();

// A row that left the list (filter, new report) can't stay current.
watch(
  () => props.reports,
  (reports) => {
    if (current.value && !reports.some((r) => r.ticket.key === current.value)) {
      current.value = undefined;
    }
  },
);

async function moveTo(key: string | undefined) {
  current.value = key;
  await nextTick();
  document
    .querySelector(`[data-ticket-key="${key}"]`)
    ?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
}

// Keys act unless you're typing somewhere, where they mean text (Esc included).
function onKey(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  const typing = !!target?.closest('input, select, textarea');
  if (event.key === 'Escape' && !typing && expanded.value.size > 0) expanded.value = new Set();

  const action = navAction(event.key, {
    typing,
    interactive: !!target?.closest('a, button, summary'),
    modified: event.metaKey || event.ctrlKey || event.altKey,
  });
  if (!action) return;
  if (action.type === 'move') {
    event.preventDefault();
    const keys = props.reports.map((r) => r.ticket.key);
    moveTo(moveCurrent(keys, current.value, action.delta));
  } else if (current.value) {
    event.preventDefault();
    if (action.type === 'expand') expand(current.value);
    else if (action.type === 'collapse') collapse(current.value);
    else toggle(current.value);
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

/** Problem chips: the ticket's flags, or for a marked ticket the ones set aside. */
function chipCodes(report: MarkedReport): FlagCode[] {
  return uniqueFlagCodes(report.mark?.state === 'active' ? { flags: report.setAside } : report);
}

function severity(report: MarkedReport): 'fix' | 'wait' | 'ok' {
  if (report.flags.some((f) => f.severity === 'error')) return 'fix';
  return report.flags.length > 0 ? 'wait' : 'ok';
}
</script>

<template>
  <div class="table-scroll" :data-stale="stale">
    <table class="ticket-table">
      <thead>
        <tr>
          <th scope="col" class="ticket-col">Ticket</th>
          <th scope="col" class="branches-col">Where the fix is</th>
          <th scope="col" class="problems-col">Problems</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="report in reports" :key="report.ticket.key">
          <tr
            class="ticket-row"
            :data-ticket-key="report.ticket.key"
            :data-severity="severity(report)"
            :data-expanded="expanded.has(report.ticket.key)"
            :data-current="current === report.ticket.key"
          >
            <td class="ticket-cell">
              <a
                class="ticket-key identifier"
                :href="report.ticket.url"
                target="_blank"
                rel="noreferrer"
                >{{ report.ticket.key }}</a
              >
              <span class="ticket-summary">{{ report.ticket.summary }}</span>
              <span class="ticket-meta">
                <span
                  class="status-chip"
                  :data-category="report.ticket.statusCategory"
                  :data-unfinished="!!doneButUnfinished(report)"
                  :title="
                    doneButUnfinished(report)
                      ? 'Done in Jira, but something is still missing on GitHub or in Jira'
                      : `Jira status`
                  "
                  >{{ report.ticket.status
                  }}<template v-if="doneButUnfinished(report)">
                    · {{ doneButUnfinished(report) }}</template
                  ></span
                >
                <span class="assignee" :data-unassigned="!report.ticket.assignee">{{
                  report.ticket.assignee?.name ?? 'Unassigned'
                }}</span>
                <span v-if="report.ticket.fixVersions.length > 0" class="fix-version">
                  {{ report.ticket.fixVersions.join(', ') }}
                </span>
                <span v-if="sort !== 'jira'" class="sort-date">
                  {{ SORT_LABELS[sort] }}
                  {{ sortDate(report, sort) ? formatRange(sortDate(report, sort)) : '—' }}
                </span>
              </span>
              <p v-if="blockers?.get(report.ticket.key)" class="row-blockers">
                Blocks the release:
                {{
                  blockers
                    .get(report.ticket.key)!
                    .map((b) => b.text)
                    .join(' · ')
                }}
              </p>
            </td>
            <td class="branches-cell">
              <BranchList :rows="branchRows(report, repos)" @more="expand(report.ticket.key)" />
            </td>
            <td class="problems-cell">
              <div class="problems" :data-set-aside="report.mark?.state === 'active'">
                <span
                  v-for="code in chipCodes(report)"
                  :key="code"
                  class="problem-tag"
                  :data-tone="isWait(code) ? 'wait' : 'fix'"
                  >{{ FLAGS[code].label }}</span
                >
              </div>
              <p v-if="report.mark?.state === 'active'" class="fixed-mark">
                <span class="fixed-badge">Marked fixed by you</span>
                {{ formatRange(report.mark.at) }}
                <button class="inline-button" @click="$emit('unmark', report.ticket.key)">
                  Needs attention again
                </button>
              </p>
              <template v-else-if="report.flags.length > 0">
                <p v-if="report.mark?.state === 'outdated'" class="fixed-mark outdated">
                  You marked this fixed on {{ formatRange(report.mark.at) }}, but it has a new
                  problem since.
                </p>
              </template>
              <p v-if="report.otherRepoLinks.length > 0" class="other-repos">
                Jira links PRs in
                <template v-for="(repo, i) in report.otherRepoLinks" :key="repo">
                  <span v-if="i > 0">, </span>
                  <button
                    class="inline-button identifier"
                    :title="`Add ${repo} to the selected repositories`"
                    @click="$emit('addRepo', repo)"
                  >
                    {{ repo }}</button
                  ><span class="visually-hidden"> (add to selection)</span>
                </template>
              </p>
              <div class="row-actions">
                <button
                  class="details-toggle"
                  :aria-expanded="expanded.has(report.ticket.key)"
                  @click="toggle(report.ticket.key)"
                >
                  {{ expanded.has(report.ticket.key) ? 'Hide details' : 'Details' }}
                </button>
                <button
                  v-if="report.flags.length > 0 && report.mark?.state !== 'active'"
                  class="inline-button"
                  @click="$emit('markFixed', report.ticket.key)"
                >
                  Mark fixed
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="expanded.has(report.ticket.key)" class="details-row">
            <td colspan="3">
              <TicketDetails :report="report" />
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
