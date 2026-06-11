// lib/use-resource.ts — minimal async-resource hook.
"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

export interface Resource<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  reload: () => Promise<void>;
}

/**
 * Loads an async resource on mount and whenever `deps` change — replacing the
 * hand-rolled `useState(null)` + try/catch + `useEffect` triad repeated across the
 * detail pages. A per-run token discards a stale response after the deps change or
 * the component unmounts, so a fast navigation can't apply an outdated result.
 * `reload()` re-runs the loader imperatively (e.g. after a mutation) and resolves
 * once that run settles, so callers can `await` it to sequence follow-up work.
 *
 * `data` stays `null` until the first load resolves (the app's null-sentinel
 * "loading" idiom). Error handling is left to the caller: read `error` and render it
 * the way the page already does.
 */
export function useResource<T>(loader: () => Promise<T>, deps: DependencyList): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  // Latest loader, read at call time so reload() always runs the current closure.
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  // Monotonic run id; only the most recent run is allowed to commit state.
  const runId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++runId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await loaderRef.current();
      if (runId.current === id) setData(result);
    } catch (err) {
      if (runId.current === id) setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (runId.current === id) setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    // Bump the run id so any in-flight load from this effect is discarded.
    return () => { runId.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload };
}
