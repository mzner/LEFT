<script setup lang="ts">
import { ref } from 'vue';
import { copyText } from '../lib/clipboard';

/**
 * A text-labelled button (not an icon — GitHub's own "Create Dependabot security
 * update" button is the precedent) that copies a ready-to-paste `/backport` command.
 */
const props = defineProps<{
  command: string;
  label: string;
}>();

const copied = ref(false);

async function copy() {
  await copyText(props.command);
  copied.value = true;
  setTimeout(() => (copied.value = false), 1500);
}
</script>

<template>
  <button
    class="fix-button"
    type="button"
    :aria-label="label"
    :title="copied ? 'Copied' : `${label}: ${command}`"
    @click="copy"
  >
    <slot :copied="copied">{{ copied ? 'Copied' : 'Fix' }}</slot>
  </button>
</template>
