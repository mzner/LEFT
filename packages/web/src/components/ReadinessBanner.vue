<script setup lang="ts">
import { blockerCounts, type Readiness, type ReleaseTarget } from '@ocis-dashboard/core';
import { computed } from 'vue';
import { plural } from '../lib/format';
import { reasonLabel, type BlockFilter } from '../lib/release';

/**
 * Go or no-go for one fix version. It stays small however many tickets block:
 * it counts them by reason, and each count filters the table, which lists them.
 * Always computed from every loaded ticket, so filtering never changes it.
 */
const props = defineProps<{
  readiness: Readiness;
  targets: ReleaseTarget[];
  version: string;
  /** A refresh is running; the verdict may change. */
  stale: boolean;
}>();
const filter = defineModel<BlockFilter>('filter', { required: true });
const emit = defineEmits<{ filtered: [] }>();

const counts = computed(() => blockerCounts(props.readiness));

function choose(value: Exclude<BlockFilter, ''>) {
  // Decide first: the model only reads back the new value after the parent re-renders.
  const next = filter.value === value ? '' : value;
  filter.value = next;
  if (next) emit('filtered');
}

const headline = computed(() => {
  const { verdict, total, blocking } = props.readiness;
  if (verdict === 'empty') return `No tickets have the fix version ${props.version} yet.`;
  if (verdict === 'go') {
    if (total === 1) return 'Its one ticket is done and its fix is where the release ships from.';
    const all = total === 2 ? 'Both' : `All ${total}`;
    return `${all} tickets are done and their fixes are where the release ships from.`;
  }
  return `${blocking.length} of ${plural(total, 'ticket')} ${blocking.length === 1 ? 'blocks' : 'block'} the release.`;
});

/** "Ships from stable-9.0", per repo when they differ. */
const shipsFrom = computed(() => {
  if (props.targets.length === 0) return '';
  const branches = new Set(props.targets.map((t) => t.branch));
  if (branches.size === 1) return `Ships from ${props.targets[0]!.branch}.`;
  return `Ships from ${props.targets.map((t) => `${t.branch} (${t.repo})`).join(', ')}.`;
});
const notCut = computed(() =>
  props.targets
    .filter((t) => t.notCutYet)
    .map(
      (t) => `${t.notCutYet} doesn't exist in ${t.repo} yet, so ${t.branch} is checked instead.`,
    ),
);

const tidyText = computed(() => {
  const count = props.readiness.tidy.length;
  if (count === 0) return undefined;
  const who =
    props.readiness.blocking.length > 0 ? plural(count, 'more ticket') : plural(count, 'ticket');
  return `${who} ${count === 1 ? 'has' : 'have'} only things to tidy (Jira links, keys in PRs, linked issues), which don't block the release.`;
});
</script>

<template>
  <section
    class="readiness"
    :data-verdict="readiness.verdict"
    :data-stale="stale"
    :aria-label="`Release readiness of ${version}`"
  >
    <div class="readiness-head" role="status" aria-live="polite">
      <span class="verdict-badge">{{
        { go: 'Go', 'no-go': 'No-go', empty: 'Nothing yet' }[readiness.verdict]
      }}</span>
      <div>
        <p class="verdict-text">{{ headline }}</p>
        <p class="hint">
          {{ shipsFrom }}
          <template v-for="note in notCut" :key="note"> {{ note }}</template>
          <template v-if="stale"> Checking again…</template>
        </p>
      </div>
    </div>

    <div
      v-if="counts.length > 0"
      class="problem-pills readiness-reasons"
      role="group"
      aria-label="Show blocking tickets in the table"
    >
      <button
        class="problem-pill"
        data-tone="fix"
        :aria-pressed="filter === 'all'"
        @click="choose('all')"
      >
        All blockers <span class="count">{{ readiness.blocking.length }}</span>
      </button>
      <button
        v-for="{ reason, count } in counts"
        :key="reason"
        class="problem-pill"
        :data-tone="reason === 'not-done' ? 'wait' : 'fix'"
        :aria-pressed="filter === reason"
        @click="choose(reason)"
      >
        {{ reasonLabel(reason, targets) }} <span class="count">{{ count }}</span>
      </button>
    </div>
    <p v-if="counts.length > 0" class="hint">
      A ticket can block for more than one reason. Pick one to list those tickets below.
    </p>
    <p v-if="tidyText" class="hint">{{ tidyText }}</p>
  </section>
</template>
