/** What a key press does in the ticket table. */
export type NavAction =
  { type: 'move'; delta: 1 | -1 } | { type: 'toggle' } | { type: 'expand' } | { type: 'collapse' };

export interface KeyContext {
  /** Focus is in a field where keys mean text (input, select, textarea). */
  typing: boolean;
  /** Focus is on a link or button, which uses Enter itself. */
  interactive: boolean;
  /** Ctrl, Cmd or Alt is held. */
  modified: boolean;
}

/** Maps a key to an action: j/k move, l/h open/close the row's details, o (or Enter) flips them. */
export function navAction(key: string, { typing, interactive, modified }: KeyContext) {
  if (typing || modified) return undefined;
  if (key === 'j') return { type: 'move', delta: 1 } satisfies NavAction;
  if (key === 'k') return { type: 'move', delta: -1 } satisfies NavAction;
  if (key === 'l') return { type: 'expand' } satisfies NavAction;
  if (key === 'h') return { type: 'collapse' } satisfies NavAction;
  if (key === 'o' || (key === 'Enter' && !interactive))
    return { type: 'toggle' } satisfies NavAction;
  return undefined;
}

/**
 * The row after moving from `current`. Without a current row (or one that is
 * gone), either direction starts at the first. Stops at the ends.
 */
export function moveCurrent(
  keys: string[],
  current: string | undefined,
  delta: 1 | -1,
): string | undefined {
  const from = current === undefined ? -1 : keys.indexOf(current);
  if (from === -1) return keys[0];
  return keys[Math.min(keys.length - 1, Math.max(0, from + delta))];
}
