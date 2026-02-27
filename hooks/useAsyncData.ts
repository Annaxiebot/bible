import { useState, useEffect, DependencyList } from 'react';

interface AsyncDataState<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useAsyncData<T>(
  fetchFn: () => Promise<T>,
  initialValue: T,
  deps: DependencyList = [],
): AsyncDataState<T> {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchFn();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { data, loading, error, refetch: () => setTick(t => t + 1) };
}
