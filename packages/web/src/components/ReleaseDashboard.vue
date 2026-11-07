<script setup lang="ts">
import type {
  BoardsResponse,
  MeResponse,
  ReportSelection,
  Sprint,
  SprintsResponse,
} from '@ocis-dashboard/core';
import { computed, provide, ref, watch } from 'vue';
import { api } from '../api';
import { dataOr, useAsync } from '../composables/useAsync';
import { useLocalStorage } from '../composables/useLocalStorage';
import { useReport, type ReportRequest } from '../composables/useReport';
import { JIRA_LINKER } from '../lib/jira-link';
import { readUrlState, writeUrlState } from '../lib/url-state';
import { daysAgo, formatRange } from '../lib/format';
import { applyMarks, markFor, type FixedMarks } from '../lib/marks';
import {
  assignees,
  branchOptions,
  decodeBranchFilter,
  FLAG_ORDER,
  filterReports,
  sortReports,
  type AssigneeFilter,
  type ProblemFilter,
  type SortKey,
} from '../lib/view';
import ErrorBanner from './ErrorBanner.vue';
import TicketFilters from './TicketFilters.vue';
import ReportHeadline from './ReportHeadline.vue';
import LoadStatus from './LoadStatus.vue';
import RepoPicker, { DEFAULT_REPOS, withRepo, type RepoEntry } from './RepoPicker.vue';
import SelectionControls, { type SelectionMode } from './SelectionControls.vue';
import PendingTable from './PendingTable.vue';
import SkeletonTable from './SkeletonTable.vue';
import TicketTable from './TicketTable.vue';

const props = defineProps<{ me: MeResponse }>();

const SPRINT_STATE_TEXT: Record<Sprint['state'], string> = {
  active: 'current sprint',
  future: 'upcoming sprint',
  closed: 'past sprint',
};

// What to load (persisted where it is a preference, not a one-off choice).
const mode = useLocalStorage<SelectionMode>('mode', 'sprint');
const repos = useLocalStorage<RepoEntry[]>('repos', DEFAULT_REPOS);
const storedBoardId = useLocalStorage<number | null>('boardId', null);
/** Tickets marked fixed by hand, by key. Kept across sprints and reloads. */
const fixedMarks = useLocalStorage<FixedMarks>('fixedMarks', {});
const chosenSprintId = ref<number | null>(null);
const dates = ref({ from: daysAgo(13), to: daysAgo(0) });

// How to filter what was loaded.
const problem = ref<ProblemFilter>('all');
const assignee = ref<AssigneeFilter>('all');
const search = ref('');
/** A preference, so it survives reloads and sprint changes. */
const sort = useLocalStorage<SortKey>('sort', 'jira');
const branch = ref('');

// A shared or bookmarked link opens the same view: it overrides what the browser remembered.
const fromUrl = readUrlState(window.location.search, ['all', 'attention', 'marked', ...FLAG_ORDER]);
if (fromUrl.mode) mode.value = fromUrl.mode;
if (fromUrl.boardId !== undefined) storedBoardId.value = fromUrl.boardId;
if (fromUrl.sprintId !== undefined) chosenSprintId.value = fromUrl.sprintId;
if (fromUrl.from) dates.value = { from: fromUrl.from, to: fromUrl.to ?? fromUrl.from };
if (fromUrl.problem) problem.value = fromUrl.problem as ProblemFilter;
if (fromUrl.assignee) assignee.value = fromUrl.assignee;
if (fromUrl.search) search.value = fromUrl.search;
if (fromUrl.branch) branch.value = fromUrl.branch;

// Boards and sprints.
const { state: boardsState, reload: reloadBoards } = useAsync<BoardsResponse>('boards', (signal) =>
  api.boards(signal),
);
const boardList = computed(() => dataOr(boardsState.value, { boards: [] }).boards);
const boardId = computed({
  get: () =>
    boardList.value.some((b) => b.id === storedBoardId.value)
      ? storedBoardId.value
      : (boardList.value[0]?.id ?? null),
  set: (id) => {
    storedBoardId.value = id;
    chosenSprintId.value = null;
  },
});

const { state: sprintsState, reload: reloadSprints } = useAsync<SprintsResponse>(
  () => (boardId.value === null ? null : `sprints:${boardId.value}`),
  (signal) => api.sprints(boardId.value!, signal),
);
const sprintList = computed(() => dataOr(sprintsState.value, { sprints: [] }).sprints);
const sprint = computed(
  () =>
    sprintList.value.find((s) => s.id === chosenSprintId.value) ??
    sprintList.value.find((s) => s.state === 'active') ??
    sprintList.value[0],
);
const sprintId = computed({
  get: () => sprint.value?.id ?? null,
  set: (id) => (chosenSprintId.value = id),
});
const sprintsLoading = computed(
  () => boardsState.value.status === 'loading' || sprintsState.value.status === 'loading',
);

// The report.
const enabledRepos = computed(() => repos.value.filter((r) => r.enabled).map((r) => r.name));
const request = computed<ReportRequest | null>(() => {
  let selection: ReportSelection | null = null;
  if (mode.value === 'sprint' && sprint.value) {
    selection = { kind: 'sprint', sprintId: sprint.value.id };
  }
  if (mode.value === 'dates' && dates.value.from) {
    selection = { kind: 'dates', from: dates.value.from, to: dates.value.to || dates.value.from };
  }
  return selection && enabledRepos.value.length > 0
    ? { selection, repos: enabledRepos.value }
    : null;
});
const { state: report, refresh, reload } = useReport(() => request.value);

// Only offered when the server may write to Jira (ATLASSIAN_SCOPES has write:jira-work).
provide(
  JIRA_LINKER,
  props.me.canLinkInJira
    ? {
        async link(key, prUrl) {
          const current = request.value;
          if (!current) throw new Error('Nothing is selected.');
          const { created } = await api.linkInJira(current.selection, current.repos, {
            key,
            prUrl,
          });
          // The server dropped the ticket's cached Jira links; everything else comes from its cache.
          reload();
          return created;
        },
      }
    : undefined,
);

// A branch filter only makes sense for the data it was chosen on. The first
// request (null until sprints load) keeps the one a link brought along.
watch(
  () => JSON.stringify(request.value),
  (_now, before) => {
    if (before !== 'null') branch.value = '';
  },
);

// Keep the URL in step, so it can be shared or bookmarked.
watch(
  () => ({
    mode: mode.value,
    boardId: mode.value === 'sprint' ? (boardId.value ?? undefined) : undefined,
    sprintId: mode.value === 'sprint' ? (sprint.value?.id ?? undefined) : undefined,
    from: mode.value === 'dates' ? dates.value.from : undefined,
    to: mode.value === 'dates' ? dates.value.to : undefined,
    problem: problem.value,
    assignee: assignee.value,
    search: search.value,
    branch: branch.value,
  }),
  (state) => {
    const query = writeUrlState(state);
    const url = `${window.location.pathname}${query}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, '', url);
    }
  },
  { immediate: true, deep: true },
);

const data = computed(() => report.value.data);
// Sorted first: marking keeps that order and only moves marked tickets to the end.
const allReports = computed(() =>
  applyMarks(sortReports(data.value?.reports ?? [], sort.value), fixedMarks.value),
);

function markFixed(key: string) {
  const report = data.value?.reports.find((r) => r.ticket.key === key);
  if (report) fixedMarks.value = { ...fixedMarks.value, [key]: markFor(report) };
}

function unmark(key: string) {
  const rest = { ...fixedMarks.value };
  delete rest[key];
  fixedMarks.value = rest;
}
const beforeProblem = computed(() =>
  filterReports(allReports.value, {
    problem: 'all',
    assignee: assignee.value,
    myAccountId: props.me.atlassian.id,
    search: search.value,
    branch: decodeBranchFilter(branch.value),
  }),
);
const shown = computed(() =>
  filterReports(beforeProblem.value, { problem: problem.value, assignee: 'all', search: '' }),
);

// What the filters keep, in words, so a filtered list never passes for the whole sprint.
const people = computed(() => assignees(allReports.value));
const filterNote = computed(() => {
  const parts: string[] = [];
  if (assignee.value === 'me') parts.push('assigned to you');
  else if (assignee.value === 'unassigned') parts.push('unassigned');
  else if (assignee.value !== 'all') {
    const name = people.value.find((p) => p.id === assignee.value)?.name ?? 'one person';
    parts.push(`assigned to ${name}`);
  }
  const filter = decodeBranchFilter(branch.value);
  if (filter) {
    const how = { any: 'needing', missing: 'missing on', open: 'open on' }[filter.which];
    parts.push(`${how} ${filter.branch}`);
  }
  if (search.value.trim()) parts.push(`matching "${search.value.trim()}"`);
  return parts.length > 0 ? parts.join(', ') : undefined;
});

function clearFilters() {
  assignee.value = 'all';
  branch.value = '';
  search.value = '';
  problem.value = 'all';
}

const title = computed(() =>
  mode.value === 'sprint'
    ? (sprint.value?.name ?? 'Sprint')
    : `Updated ${formatRange(dates.value.from, dates.value.to || dates.value.from)}`,
);
const subtitle = computed(() =>
  mode.value === 'sprint' && sprint.value
    ? `${formatRange(sprint.value.startDate, sprint.value.endDate)}, ${SPRINT_STATE_TEXT[sprint.value.state]}`
    : undefined,
);

const setupError = computed(() => {
  if (boardsState.value.status === 'error')
    return { error: boardsState.value.error, retry: reloadBoards };
  if (sprintsState.value.status === 'error')
    return { error: sprintsState.value.error, retry: reloadSprints };
  return undefined;
});
const preparingSprints = computed(
  () => mode.value === 'sprint' && !sprint.value && sprintsLoading.value,
);
const emptyText = computed(() => {
  if (allReports.value.length > 0) return 'No ticket matches these filters.';
  return mode.value === 'sprint'
    ? 'This sprint has no tickets yet.'
    : 'No tickets were updated in this period.';
});

function addRepo(name: string) {
  repos.value = withRepo(repos.value, name);
}
</script>

<template>
  <main class="dashboard">
    <section class="controls" aria-label="What to show">
      <SelectionControls
        v-model:mode="mode"
        v-model:board-id="boardId"
        v-model:sprint-id="sprintId"
        v-model:dates="dates"
        :boards="boardList"
        :sprints="sprintList"
        :sprints-loading="sprintsLoading"
      />
      <RepoPicker v-model="repos" />
    </section>

    <ErrorBanner v-if="setupError" :error="setupError.error" :retry="setupError.retry" />
    <p v-if="enabledRepos.length === 0" class="empty">
      Switch on at least one repository above to see its pull requests.
    </p>
    <p
      v-if="mode === 'sprint' && sprintsState.status === 'ready' && sprintList.length === 0"
      class="empty"
    >
      This board has no sprints. Pick another board, or choose by dates.
    </p>

    <template v-if="!request && preparingSprints">
      <div class="load-status loading" role="status">
        <p>Loading boards and sprints from Jira</p>
      </div>
      <SkeletonTable />
    </template>

    <template v-if="request">
      <ReportHeadline
        v-model:problem="problem"
        :title="title"
        :subtitle="subtitle"
        :reports="data && beforeProblem"
        :total="allReports.length"
        :filter-note="filterNote"
        @clear-filters="clearFilters"
      />
      <!-- Filters sit with the table they change; the controls above choose what to load. -->
      <div class="table-toolbar">
        <TicketFilters
          v-model:search="search"
          v-model:assignee="assignee"
          v-model:branch="branch"
          v-model:sort="sort"
          :people="people"
          :branches="branchOptions(allReports)"
          :multi-repo="enabledRepos.length > 1"
        />
        <LoadStatus :state="report" @refresh="refresh" />
      </div>
      <ErrorBanner v-if="report.status === 'error'" :error="report.error" :retry="refresh" />

      <template v-if="data">
        <TicketTable
          v-if="shown.length > 0"
          :reports="shown"
          :repos="data.repos"
          :sort="sort"
          :stale="report.status === 'loading'"
          @add-repo="addRepo"
          @mark-fixed="markFixed"
          @unmark="unmark"
        />
        <p v-else class="empty">{{ emptyText }}</p>
      </template>
      <PendingTable
        v-else-if="report.status === 'loading' && report.tickets"
        :tickets="report.tickets"
      />
      <SkeletonTable v-else-if="report.status === 'loading'" />
    </template>
  </main>
</template>
