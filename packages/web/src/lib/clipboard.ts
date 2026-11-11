/** Writes `text` to the clipboard as-is. */
export function copyText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}

/** Pretty-prints `value` and writes it to the clipboard. */
export function copyJson(value: unknown): Promise<void> {
  return copyText(JSON.stringify(value, null, 2));
}
