"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True while a reload is in flight but stale data is still shown. */
  refreshing: boolean;
  reload: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * SWR-lite data hook: fetch on mount + on deps change, keep stale data
 * visible during reloads, and ignore out-of-order responses.
 */
export function useApi<T>(path: string | null, deps: unknown[] = []): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const seq = useRef(0);
  const hasData = useRef(false);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const id = ++seq.current;
    const controller = new AbortController();

    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    setError(null);

    api
      .get<T>(path, { signal: controller.signal })
      .then((result) => {
        if (seq.current !== id) return;
        hasData.current = true;
        setData(result);
      })
      .catch((err: unknown) => {
        if (seq.current !== id) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (seq.current !== id) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, refreshing, reload, setData };
}
