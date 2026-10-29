// One key per user intent. Retrying the same intent (double click, network timeout)
// reuses the key; changing the intent (another quantity) produces a new one.
export function useIdempotencyKey() {
  let key: string | null = null;
  let intent: string | null = null;

  function forIntent(nextIntent: string) {
    if (key === null || intent !== nextIntent) {
      key = crypto.randomUUID();
      intent = nextIntent;
    }
    return key;
  }

  function reset() {
    key = null;
    intent = null;
  }

  return { forIntent, reset };
}
