import { Suspense } from 'react';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

/**
 * Suspense boundary for the lazily-loaded route elements. It lives here rather
 * than in router/index.tsx so that file exports only the router config.
 */
export function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<LoadingSpinner />}>{children}</Suspense>;
}
