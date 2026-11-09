<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ME,
  UNASSIGNED,
  assigneeLabel,
  toggleAssignee,
  type AssigneeFilter,
  type Person,
} from '../lib/assignee-filter';

/** Choose any number of assignees; the table keeps tickets assigned to any of them. */
const props = defineProps<{ people: Person[] }>();
const selected = defineModel<AssigneeFilter>({ required: true });

const open = ref(false);
const root = ref<HTMLElement>();
const button = ref<HTMLButtonElement>();

const label = computed(() => assigneeLabel(selected.value, props.people));

function toggle(entry: string) {
  selected.value = toggleAssignee(selected.value, entry);
}

async function close(refocus = false) {
  open.value = false;
  if (refocus) {
    await nextTick();
    button.value?.focus();
  }
}

// Closes on a click elsewhere, and when keyboard focus moves out of the picker.
function onPointerDown(event: PointerEvent) {
  if (open.value && !root.value?.contains(event.target as Node)) close();
}
function onFocusOut(event: FocusEvent) {
  const next = event.relatedTarget as Node | null;
  if (open.value && next && !root.value?.contains(next)) close();
}
onMounted(() => document.addEventListener('pointerdown', onPointerDown));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown));
</script>

<template>
  <div ref="root" class="multi-select" @focusout="onFocusOut" @keydown.esc.stop="close(true)">
    <button
      ref="button"
      type="button"
      class="multi-select-button"
      aria-haspopup="true"
      aria-keyshortcuts="i"
      :aria-expanded="open"
      :data-active="selected.length > 0"
      title="Press i to switch “Assigned to me” on or off"
      @click="open = !open"
    >
      <span class="visually-hidden">Assignee: </span>{{ label }}
    </button>

    <div v-if="open" class="multi-select-panel" role="group" aria-label="Choose assignees">
      <label class="multi-option">
        <input type="checkbox" :checked="selected.includes(ME)" @change="toggle(ME)" />
        Assigned to me
      </label>
      <label class="multi-option">
        <input
          type="checkbox"
          :checked="selected.includes(UNASSIGNED)"
          @change="toggle(UNASSIGNED)"
        />
        Unassigned
      </label>
      <div v-if="people.length > 0" class="multi-separator" role="separator" />
      <label v-for="person in people" :key="person.id" class="multi-option">
        <input
          type="checkbox"
          :checked="selected.includes(person.id)"
          @change="toggle(person.id)"
        />
        {{ person.name }}
      </label>
      <div class="multi-foot">
        <!-- aria-disabled, not disabled: a disabled button would drop keyboard focus out of the panel. -->
        <button
          type="button"
          class="inline-button"
          :aria-disabled="selected.length === 0"
          @click="selected = []"
        >
          Clear
        </button>
      </div>
    </div>
  </div>
</template>
