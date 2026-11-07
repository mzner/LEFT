import type {
  RepoName,
  ReportProgress,
  ReportResponse,
  ReportSelection,
  Ticket,
} from '@ocis-dashboard/core';
import { computed, ref, shallowRef, watch, type Ref } from 'vue';
import { api } from '../api';
import { toError } from './useAsync';

export interface ReportRequest {
  selection: ReportSelection;
  repos: RepoName[];
}

export interface ReportState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /**
   * The latest successful report for the current request. Kept while it is
   * refreshed or after a failed refresh; cleared when the request changes.
   */
  data?: ReportResponse;
  /** Progress of the running request. */
  progress?: ReportProgress;
  /** The Jira tickets of the running request, shown while GitHub is still being checked. */
  tickets?: Ticket[];
  error?: Error;
}

/**
 * Loads the report for `request()` (null = nothing to load) and tracks the
 * server's progress events. Requests are compared by content, so returning
 * a new object with the same selection does not reload.
 */
export function useReport(request: () => ReportRequest | null): {
  state: Ref<ReportState>;
  /** Fetches fresh data from Jira and GitHub. */
  refresh: () => void;
  /** Loads again from the server's cache, e.g. after the server dropped part of it. */
  reload: () => void;
} {
  const state = shallowRef<ReportState>({ status: 'idle' });
  const run = ref(0);
  const key = computed(() => {
    const current = request();
    return current ? JSON.stringify(current) : null;
  });
  let latest: { key: string; data: ReportResponse } | undefined;
  let bypassCacheOnce = false;

  watch(
    [key, run],
    ([currentKey], _previous, onCleanup) => {
      const current = request();
      if (currentKey === null || current === null) {
        state.value = { status: 'idle' };
        return;
      }
      const controller = new AbortController();
      onCleanup(() => controller.abort());
      const live = () => !controller.signal.aborted;
      const data = latest?.key === currentKey ? latest.data : undefined;
      const refresh = bypassCacheOnce;
      bypassCacheOnce = false;

      let tickets: Ticket[] | undefined;
      state.value = { status: 'loading', data };
      api
        .report(current.selection, current.repos, {
          refresh,
          signal: controller.signal,
          onProgress: (progress) => {
            if (live()) state.value = { status: 'loading', data, progress, tickets };
          },
          onTickets: (loaded) => {
            tickets = loaded;
            if (live()) state.value = { ...state.value, tickets };
          },
        })
        .then(
          (result) => {
            if (!live()) return;
            latest = { key: currentKey, data: result };
            state.value = { status: 'ready', data: result };
          },
          (error: unknown) => {
            if (live()) state.value = { status: 'error', data, error: toError(error) };
          },
        );
    },
    { immediate: true },
  );

  const refresh = () => {
    bypassCacheOnce = true;
    run.value++;
  };
  const reload = () => {
    run.value++;
  };
  return { state, refresh, reload };
}
