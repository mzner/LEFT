<script lang="ts">
export type SelectionMode = 'sprint' | 'dates' | 'release';
</script>

<script setup lang="ts">
import type { Board, Sprint, Version } from '@ocis-dashboard/core';
import { computed } from 'vue';
import { formatRange } from '../lib/format';
import { groupVersions } from '../lib/release';

const props = defineProps<{
  boards: Board[];
  sprints: Sprint[];
  sprintsLoading: boolean;
  versions: Version[];
  versionsLoading: boolean;
}>();
const mode = defineModel<SelectionMode>('mode', { required: true });
const boardId = defineModel<number | null>('boardId', { required: true });
const sprintId = defineModel<number | null>('sprintId', { required: true });
const dates = defineModel<{ from: string; to: string }>('dates', { required: true });
/** A fixVersion name, in release mode. */
const version = defineModel<string | null>('version', { required: true });

const versionGroups = computed(() => groupVersions(props.versions));

const sprintGroups = computed(() =>
  (
    [
      ['Current', props.sprints.filter((s) => s.state === 'active')],
      ['Upcoming', props.sprints.filter((s) => s.state === 'future')],
      ['Past', props.sprints.filter((s) => s.state === 'closed')],
    ] as const
  ).filter(([, group]) => group.length > 0),
);
</script>

<template>
  <div class="control-group">
    <div class="segmented" role="group" aria-label="Choose tickets by">
      <button :aria-pressed="mode === 'sprint'" @click="mode = 'sprint'">Sprint</button>
      <button :aria-pressed="mode === 'dates'" @click="mode = 'dates'">Dates</button>
      <button
        :aria-pressed="mode === 'release'"
        title="Every ticket of one fix version, with a go/no-go verdict"
        @click="mode = 'release'"
      >
        Release
      </button>
    </div>

    <template v-if="mode === 'sprint'">
      <select
        v-if="boards.length > 1"
        aria-label="Board"
        :value="boardId ?? ''"
        @change="boardId = Number(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="board in boards" :key="board.id" :value="board.id">{{ board.name }}</option>
      </select>
      <select
        aria-label="Sprint"
        :value="sprintId ?? ''"
        :disabled="sprintsLoading || sprints.length === 0"
        @change="sprintId = Number(($event.target as HTMLSelectElement).value)"
      >
        <option v-if="sprintsLoading" value="">Loading sprints…</option>
        <option v-else-if="sprints.length === 0" value="">No sprints on this board</option>
        <optgroup v-for="[label, group] in sprintGroups" :key="label" :label="label">
          <option v-for="sprint in group" :key="sprint.id" :value="sprint.id">
            {{ sprint.name }}, {{ formatRange(sprint.startDate, sprint.endDate) }}
          </option>
        </optgroup>
      </select>
    </template>

    <select
      v-else-if="mode === 'release'"
      aria-label="Fix version"
      :value="version ?? ''"
      :disabled="versionsLoading || versions.length === 0"
      @change="version = ($event.target as HTMLSelectElement).value"
    >
      <option v-if="versionsLoading" value="">Loading versions…</option>
      <option v-else-if="versions.length === 0" value="">No versions in this project</option>
      <optgroup v-for="[label, group] in versionGroups" :key="label" :label="label">
        <option v-for="v in group" :key="v.id" :value="v.name">
          {{ v.name }}<template v-if="v.releaseDate">, {{ formatRange(v.releaseDate) }}</template>
        </option>
      </optgroup>
    </select>

    <span v-else class="date-range">
      <label>
        <span class="visually-hidden">Updated from</span>
        <input v-model="dates.from" type="date" :max="dates.to || undefined" />
      </label>
      <span aria-hidden="true">to</span>
      <label>
        <span class="visually-hidden">Updated until</span>
        <input v-model="dates.to" type="date" :min="dates.from || undefined" />
      </label>
      <button
        class="quiet-button"
        title="Only this one day"
        @click="dates = { from: dates.from, to: dates.from }"
      >
        Single day
      </button>
    </span>
  </div>
</template>
