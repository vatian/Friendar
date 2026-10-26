import { useCallback, useEffect, useState } from 'react';

type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; data: T };

// Загружает данные один раз при открытии экрана; reload() — загрузить заново
// (например, после изменения). Без фонового опроса сервера.
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  // Функция загрузки меняется только вместе с deps (например, id группы)
  const stableLoad = useCallback(load, deps);

  useEffect(() => {
    let cancelled = false;
    stableLoad().then(
      (data) => !cancelled && setState({ status: 'ready', data }),
      (error) => !cancelled && setState({ status: 'error', error }),
    );
    return () => {
      cancelled = true;
    };
  }, [stableLoad, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return [state, reload] as const;
}
