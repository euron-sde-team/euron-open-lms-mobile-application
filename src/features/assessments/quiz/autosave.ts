/**
 * Debounced autosave for quiz answers. Changes are batched for `delay` ms after the last
 * edit, saves never overlap (they run one after another on a chain, each reading the
 * freshest batch when its turn comes), and `flush()` sends whatever is pending right
 * away (leaving the quiz, the app going to the background). Framework free so the timing
 * rules are unit tested with fake timers.
 */
export interface Autosaver<T> {
  /** Ask for a save after the debounce; `read` is called at save time for the freshest batch (null = nothing to save). */
  schedule(read: () => T | null): void;
  /** Save now if anything is pending, and wait for any save in flight. */
  flush(): Promise<void>;
  /** Stop for good (the attempt was submitted or closed). */
  stop(): void;
}

export function createAutosaver<T>(opts: {
  delay: number;
  save: (batch: T) => Promise<void>;
  onStart?: () => void;
  onSaved?: (batch: T) => void;
  onError?: (e: unknown) => void;
}): Autosaver<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let read: (() => T | null) | null = null;
  let stopped = false;

  const saveOnce = async () => {
    if (stopped || !read) return;
    const batch = read();
    if (batch === null) return;
    opts.onStart?.();
    try {
      await opts.save(batch);
      if (!stopped) opts.onSaved?.(batch);
    } catch (e) {
      if (!stopped) opts.onError?.(e);
    }
  };

  const run = () => {
    timer = null;
    chain = chain.then(saveOnce);
    return chain;
  };

  return {
    schedule(r) {
      read = r;
      if (stopped) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, opts.delay);
    },
    flush() {
      if (timer) {
        clearTimeout(timer);
        return run();
      }
      return chain;
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}
