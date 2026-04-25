import { lazy, type ComponentType } from 'react';

const RELOAD_FLAG = 'havitalk:chunk-reloaded';

function isChunkLoadError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const message = String((err as { message?: string }).message ?? '');
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    /Loading (CSS )?chunk \S+ failed/i.test(message)
  );
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await importer();
      sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (err) {
      if (isChunkLoadError(err) && !sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}
