<script setup lang="ts">
import { computed } from 'vue';
import { plural } from '../lib/format';
import type { MarkedReport } from '../lib/marks';
import { FLAG_ORDER, FLAGS, flagCounts, isWait, type ProblemFilter } from '../lib/view';

const props = defineProps<{
  title: string;
  subtitle?: string;
  /** Tickets after the other filters, before the problem filter; undefined until loaded. */
  reports?: MarkedReport[];
  /** All loaded tickets, before any filter. */
  total: number;
  /** What the active filters keep, e.g. "assigned to you"; undefined when none is on. */
  filterNote?: string;
}>();
const problem = defineModel<ProblemFilter>('problem', { required: true });
defineEmits<{ clearFilters: [] }>();

const counts = computed(() => flagCounts(props.reports ?? []));
const attention = computed(() => (props.reports ?? []).filter((r) => r.flags.length > 0).length);
const marked = computed(
  () => (props.reports ?? []).filter((r) => r.mark?.state === 'active').length,
);
const sentence = computed(() => {
  const total = props.reports?.length ?? 0;
  if (total === 0) return 'No tickets.';
  if (attention.value === 0) return `All ${plural(total, 'ticket')} are linked and backported.`;
  return `${attention.value} of ${plural(total, 'ticket')} need attention.`;
});

// Things to fix first, then things to wait for, with a gap between the two groups.
const present = (code: (typeof FLAG_ORDER)[number]) =>
  (counts.value.get(code) ?? 0) > 0 || problem.value === code;
const fixFlags = computed(() => FLAG_ORDER.filter((code) => !isWait(code) && present(code)));
const waitFlags = computed(() => FLAG_ORDER.filter((code) => isWait(code) && present(code)));

function choose(value: ProblemFilter) {
  problem.value = problem.value === value ? 'all' : value;
}
</script>

<template>
  <section class="headline" :aria-live="reports ? 'polite' : undefined">
    <div class="headline-title">
      <h1>{{ title }}</h1>
      <span v-if="subtitle" class="headline-subtitle">{{ subtitle }}</span>
    </div>
    <!-- E.g. a release's go/no-go: it comes first, and the problem count steps back. -->
    <slot name="verdict" />
    <template v-if="reports">
      <p class="headline-sentence" :data-secondary="!!$slots.verdict">{{ sentence }}</p>
      <p v-if="filterNote" class="filter-note">
        Showing {{ reports.length }} of {{ plural(total, 'ticket') }}: {{ filterNote }}.
        <button class="inline-button" @click="$emit('clearFilters')">Clear filters</button>
      </p>
      <p v-if="marked > 0" class="filter-note">{{ marked }} marked fixed by you.</p>
      <div class="problem-pills" role="group" aria-label="Show tickets">
        <span class="pill-group">
          <button class="problem-pill" :aria-pressed="problem === 'all'" @click="problem = 'all'">
            All tickets <span class="count">{{ reports.length }}</span>
          </button>
          <button
            class="problem-pill"
            :aria-pressed="problem === 'attention'"
            :disabled="attention === 0 && problem !== 'attention'"
            @click="choose('attention')"
          >
            Need attention <span class="count">{{ attention }}</span>
          </button>
        </span>
        <span v-if="fixFlags.length > 0" class="pill-group">
          <button
            v-for="code in fixFlags"
            :key="code"
            class="problem-pill"
            data-tone="fix"
            :aria-pressed="problem === code"
            @click="choose(code)"
          >
            {{ FLAGS[code].label }} <span class="count">{{ counts.get(code) ?? 0 }}</span>
          </button>
        </span>
        <span v-if="waitFlags.length > 0" class="pill-group">
          <button
            v-for="code in waitFlags"
            :key="code"
            class="problem-pill"
            data-tone="wait"
            :aria-pressed="problem === code"
            @click="choose(code)"
          >
            {{ FLAGS[code].label }} <span class="count">{{ counts.get(code) ?? 0 }}</span>
          </button>
        </span>
        <span v-if="marked > 0 || problem === 'marked'" class="pill-group">
          <button
            class="problem-pill"
            :aria-pressed="problem === 'marked'"
            @click="choose('marked')"
          >
            Marked fixed <span class="count">{{ marked }}</span>
          </button>
        </span>
      </div>
    </template>
  </section>
</template>
