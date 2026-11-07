<script setup lang="ts">
import { computed } from 'vue';
import type { LinkedPr } from '@ocis-dashboard/core';
import {
  includedNote,
  statusHelp,
  visiblePrs,
  type BranchRow,
  type BranchRowStatus,
} from '../lib/branches';
import { healthSummary } from '../lib/pr-health';
import { SOURCE_TEXT } from '../lib/view';

/** Where one ticket's fix is, branch by branch. Only this ticket's branches, so it never grows wide. */
const props = defineProps<{ rows: BranchRow[] }>();
defineEmits<{ more: [] }>();

const multiRepo = computed(() => new Set(props.rows.map((r) => r.repo)).size > 1);

const STATUS_TEXT: Record<BranchRowStatus, string> = {
  merged: 'merged',
  included: 'included',
  open: 'open',
  missing: 'missing',
  closed: 'closed',
};

function statusText(row: BranchRow): string {
  return row.isDefault && row.status === 'missing' ? 'no PR' : STATUS_TEXT[row.status];
}

/** Tooltip on a PR number: what it is and why it counts for this ticket. */
function prTitle({ pr, sources }: LinkedPr): string {
  const why = sources.map((source) => SOURCE_TEXT[source]).join(', ');
  const health = healthSummary(pr);
  return `${pr.title}\n${pr.state}, into ${pr.baseRef}. Found by ${why}.${health ? `\n${health}` : ''}`;
}

function note(row: BranchRow): string | undefined {
  if (row.status === 'included') return includedNote(row);
  if (row.isFeature) return `feature branch, not in ${row.defaultBranch} yet`;
  if (row.status === 'missing' && !row.isDefault) return 'no backport';
  if (row.status === 'closed') return 'closed without merging';
  if (!row.isDefault && !row.required) return 'not asked for by a fix version';
  return undefined;
}
</script>

<template>
  <ul class="branch-list">
    <li
      v-for="row in rows"
      :key="`${row.repo}:${row.branch}`"
      class="branch-row"
      :data-status="row.status"
    >
      <span class="branch-name identifier">
        <span v-if="multiRepo" class="branch-repo">{{ row.repo.split('/')[1] }}/</span
        >{{ row.branch }}
      </span>
      <span class="branch-status" :title="statusHelp(row)">{{ statusText(row) }}</span>
      <span class="branch-detail">
        <template v-if="row.status !== 'included'">
          <a
            v-for="linked in visiblePrs(row.prs).shown"
            :key="linked.pr.url"
            class="pr-ref identifier"
            :data-state="linked.pr.state"
            :href="linked.pr.url"
            target="_blank"
            rel="noreferrer"
            :title="prTitle(linked)"
            >#{{ linked.pr.number }}</a
          >
          <button v-if="visiblePrs(row.prs).hidden > 0" class="more-button" @click="$emit('more')">
            {{ visiblePrs(row.prs).hidden }} more
          </button>
        </template>
        <span v-if="note(row)" class="branch-note">{{ note(row) }}</span>
      </span>
    </li>
  </ul>
</template>
