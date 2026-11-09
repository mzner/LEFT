<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ME, toggleAssignee, type AssigneeFilter } from '../lib/assignee-filter';
import { SORT_LABELS, type BranchOption, type SortKey } from '../lib/view';
import AssigneePicker from './AssigneePicker.vue';

defineProps<{
  people: { id: string; name: string }[];
  branches: BranchOption[];
  /** More than one repo selected: name the repo next to each branch. */
  multiRepo: boolean;
}>();
const search = defineModel<string>('search', { required: true });
const assignee = defineModel<AssigneeFilter>('assignee', { required: true });
/** Encoded `BranchFilter`; empty for any branch. */
const branch = defineModel<string>('branch', { required: true });
const sort = defineModel<SortKey>('sort', { required: true });

// "/" jumps to the search field and "i" switches "Assigned to me" on or off,
// unless you're already typing somewhere.
const searchInput = ref<HTMLInputElement>();
function onKey(event: KeyboardEvent) {
  const typing = (event.target as HTMLElement | null)?.closest('input, select, textarea');
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === '/') {
    event.preventDefault();
    searchInput.value?.focus();
  } else if (event.key === 'i') {
    event.preventDefault();
    assignee.value = toggleAssignee(assignee.value, ME);
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <!-- data-active marks a filter that hides tickets, so it can't go unnoticed. -->
  <div class="control-group filters">
    <input
      ref="searchInput"
      v-model="search"
      type="search"
      aria-label="Find a ticket"
      aria-keyshortcuts="/"
      placeholder="Find by key or summary  /"
      :data-active="search.trim() !== ''"
    />
    <AssigneePicker v-model="assignee" :people="people" />
    <select
      v-model="branch"
      aria-label="Branch"
      :disabled="branches.length === 0"
      :data-active="branch !== ''"
    >
      <option value="">Any branch</option>
      <optgroup
        v-for="option in branches"
        :key="`${option.repo}|${option.branch}`"
        :label="multiRepo ? `${option.branch} (${option.repo})` : option.branch"
      >
        <option :value="`${option.repo}|${option.branch}|any`">
          Needs {{ option.branch }} ({{ option.total }})
        </option>
        <option v-if="option.missing > 0" :value="`${option.repo}|${option.branch}|missing`">
          Missing on {{ option.branch }} ({{ option.missing }})
        </option>
        <option v-if="option.open > 0" :value="`${option.repo}|${option.branch}|open`">
          Open on {{ option.branch }} ({{ option.open }})
        </option>
      </optgroup>
    </select>
    <select v-model="sort" aria-label="Sort by" title="Dates sort newest first">
      <option v-for="(label, key) in SORT_LABELS" :key="key" :value="key">Sort: {{ label }}</option>
    </select>
  </div>
</template>
