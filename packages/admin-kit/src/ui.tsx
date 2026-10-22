import { useCallback, useEffect, useState } from 'react';
import { clean } from './client';

/** Tải dữ liệu bằng một hàm; trả {data, error, reload, loading} */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    fn().then(setData).catch((e) => setError(clean(e instanceof Error ? e.message : String(e)))).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload };
}

export const Err = ({ e }: { e: string | null }) => (e ? <p className="msg error" role="alert">{e}</p> : null);
