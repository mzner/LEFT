import { describe, expect, it } from 'vitest';
import { moveCurrent, navAction, type KeyContext } from './row-nav';

const idle: KeyContext = { typing: false, interactive: false, modified: false };

describe('navAction', () => {
  it('maps j and k to moving down and up', () => {
    expect(navAction('j', idle)).toEqual({ type: 'move', delta: 1 });
    expect(navAction('k', idle)).toEqual({ type: 'move', delta: -1 });
  });

  it('expands with l and collapses with h, even on a focused button', () => {
    expect(navAction('l', idle)).toEqual({ type: 'expand' });
    expect(navAction('h', idle)).toEqual({ type: 'collapse' });
    expect(navAction('l', { ...idle, interactive: true })).toEqual({ type: 'expand' });
  });

  it('flips details with o or Enter', () => {
    expect(navAction('o', idle)).toEqual({ type: 'toggle' });
    expect(navAction('Enter', idle)).toEqual({ type: 'toggle' });
  });

  it('leaves Enter to a focused link or button, but not o', () => {
    const onButton = { ...idle, interactive: true };
    expect(navAction('Enter', onButton)).toBeUndefined();
    expect(navAction('o', onButton)).toEqual({ type: 'toggle' });
  });

  it('does nothing while typing or with a modifier held', () => {
    expect(navAction('j', { ...idle, typing: true })).toBeUndefined();
    expect(navAction('j', { ...idle, modified: true })).toBeUndefined();
  });

  it('ignores other keys', () => {
    expect(navAction('x', idle)).toBeUndefined();
    expect(navAction('ArrowDown', idle)).toBeUndefined();
  });
});

describe('moveCurrent', () => {
  const keys = ['A-1', 'A-2', 'A-3'];

  it('moves between rows and stops at the ends', () => {
    expect(moveCurrent(keys, 'A-1', 1)).toBe('A-2');
    expect(moveCurrent(keys, 'A-2', -1)).toBe('A-1');
    expect(moveCurrent(keys, 'A-3', 1)).toBe('A-3');
    expect(moveCurrent(keys, 'A-1', -1)).toBe('A-1');
  });

  it('starts at the first row without a current one, in either direction', () => {
    expect(moveCurrent(keys, undefined, 1)).toBe('A-1');
    expect(moveCurrent(keys, undefined, -1)).toBe('A-1');
  });

  it('starts at the first row when the current one left the list', () => {
    expect(moveCurrent(keys, 'A-9', 1)).toBe('A-1');
  });

  it('has no current row in an empty list', () => {
    expect(moveCurrent([], undefined, 1)).toBeUndefined();
  });
});
