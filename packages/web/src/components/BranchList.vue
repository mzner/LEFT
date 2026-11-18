<script setup lang="ts">
import { computed } from 'vue';
import type { LinkedPr } from '@ocis-dashboard/core';
import {
  backportFixes,
  backportFixForBranch,
  branchGlyph,
  branchMatrix,
  displayStatus,
  includedNote,
  statusHelp,
  visiblePrs,
  type BackportFix,
  type BranchRow,
} from '../lib/branches';
import { healthSummary } from '../lib/pr-health';
import { SOURCE_TEXT } from '../lib/view';
import BackportButton from './BackportButton.vue';

/** Where one ticket's fix is: repo rows, branch columns, so the same branch lines up across repos. */
const props = defineProps<{ rows: BranchRow[] }>();
defineEmits<{ more: [] }>();

const fixes = computed(() => backportFixes(props.rows));
const fixCommand = computed(() =>
  fixes.value.map((f) => `/backport ${f.sha} ${f.versions.join(' ')}`).join('\n'),
);
const fixLabel = computed(
  () =>
    `Copy /backport command${fixes.value.length > 1 ? 's' : ''} for ` +
    fixes.value.map((f) => f.repo).join(', '),
);

/** A matrix cell, with its PR refs already narrowed to the one shown + a hidden count. */
interface Cell {
  row: BranchRow;
  prs: { shown: LinkedPr[]; hidden: number };
  fix: BackportFix | null;
}

const matrix = computed(() => {
  const built = branchMatrix(props.rows);
  return {
    columns: built.columns,
    // At most one PR ref shown per cell, so a dense matrix stays dense; the rest are counted.
    rows: built.rows.map((row) => ({
      repo: row.repo,
      cells: row.cells.map((cell): Cell | undefined =>
        cell
          ? { row: cell, prs: visiblePrs(cell.prs, 1), fix: backportFixForBranch(props.rows, cell) }
          : undefined,
      ),
    })),
  };
});
const gridColumns = computed(() => `max-content repeat(${matrix.value.columns.length}, max-content)`);

/** Tooltip on a PR number: what it is and why it counts for this ticket. */
function prTitle({ pr, sources }: LinkedPr): string {
  const why = sources.map((source) => SOURCE_TEXT[source]).join(', ');
  const health = healthSummary(pr);
  return `${pr.title}\n${pr.state}, into ${pr.baseRef}. Found by ${why}.${health ? `\n${health}` : ''}`;
}

/** What the status glyph means, plus this row's specific detail, as one tooltip. */
function cellTitle(row: BranchRow): string {
  const parts = [statusHelp(row)];
  if (row.status === 'included') parts.push(includedNote(row));
  if (!row.isDefault && !row.required) parts.push('Not required by any fix version.');
  return parts.join(' ');
}
</script>

<template>
  <div class="branch-grid" :style="{ gridTemplateColumns: gridColumns }">
    <BackportButton
      v-if="fixes.length > 0"
      class="grid-corner"
      :command="fixCommand"
      :label="fixLabel"
    />
    <span v-else class="grid-corner" />
    <span v-for="col in matrix.columns" :key="col.key" class="grid-head">{{ col.label }}</span>

    <template v-for="row in matrix.rows" :key="row.repo">
      <span class="grid-repo identifier">{{ row.repo.split('/')[1] }}</span>
      <span
        v-for="(cell, i) in row.cells"
        :key="matrix.columns[i]!.key"
        class="grid-cell"
        :data-status="cell ? displayStatus(cell.row) : undefined"
      >
        <template v-if="cell">
          <BackportButton
            v-if="cell.fix"
            class="cell-glyph is-missing"
            :command="`/backport ${cell.fix.sha} ${cell.fix.versions.join(' ')}`"
            :label="`Copy /backport command for ${cell.row.repo} ${cell.fix.versions[0]}`"
          >
            <template #default="{ copied }">{{ copied ? 'Copied' : branchGlyph(cell.row) }}</template>
          </BackportButton>
          <span v-else class="cell-glyph" :title="cellTitle(cell.row)">{{
            branchGlyph(cell.row)
          }}</span>
          <a
            v-if="cell.prs.shown[0]"
            class="pr-ref identifier"
            :data-state="cell.prs.shown[0].pr.state"
            :href="cell.prs.shown[0].pr.url"
            target="_blank"
            rel="noreferrer"
            :title="prTitle(cell.prs.shown[0])"
            >#{{ cell.prs.shown[0].pr.number }}</a
          >
          <button v-if="cell.prs.hidden > 0" class="more-button" @click="$emit('more')">
            +{{ cell.prs.hidden }}
          </button>
        </template>
        <span v-else class="grid-empty" aria-hidden="true">·</span>
      </span>
    </template>
  </div>
</template>
