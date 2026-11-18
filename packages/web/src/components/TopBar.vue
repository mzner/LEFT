<script setup lang="ts">
import type { MeResponse } from '@ocis-dashboard/core';
import { computed } from 'vue';
import { useTheme } from '../composables/useTheme';

const props = defineProps<{ me?: MeResponse }>();
defineEmits<{ signOut: [] }>();

const theme = useTheme();

const signedIn = computed(
  () => !!props.me && !props.me.demo && (props.me.atlassian.connected || props.me.github.connected),
);
</script>

<template>
  <header class="top-bar">
    <span class="wordmark" title="Look, Every Fix Tracked"
      >LEFT <span class="wordmark-light">No ticket behind</span></span
    >
    <div class="top-bar-end">
      <a
        class="quiet-button"
        href="https://github.com/owncloud/ai-skills/blob/ff9d887e51567e9eb321d6d6bc21efb14f6db9d4/plugins/ocis-dev/skills/backport/SKILL.md"
        target="_blank"
        rel="noreferrer"
        title="Opens the /backport skill's docs in a new tab"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
          <path d="M4 2.5h8a.5.5 0 0 1 .5.5v10.5l-4.5-3-4.5 3V3a.5.5 0 0 1 .5-.5z" stroke-linejoin="round" />
        </svg>
        Backport skill
      </a>
      <select v-model="theme" aria-label="Theme" title="Colour theme">
        <option value="system">System theme</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <span v-if="me?.demo" class="demo-badge" title="DEMO_MODE is on: sample data, no sign-in">
        Sample data
      </span>
      <template v-if="signedIn && me">
        <span
          v-if="me.atlassian.connected"
          class="account"
          :title="`Atlassian account ${me.atlassian.id}`"
        >
          {{ me.atlassian.name }}
        </span>
        <span v-if="me.github.connected" class="account identifier" title="GitHub account">
          @{{ me.github.id }}
        </span>
        <button class="quiet-button" @click="$emit('signOut')">Sign out</button>
      </template>
    </div>
  </header>
</template>
