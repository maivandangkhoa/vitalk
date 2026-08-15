import { useEffect } from 'react';
import { router } from '@/router';
import { trackPageView } from '@/lib/analytics';

/**
 * Sends a GA4 page_view for every route.
 *
 * GA only auto-sends one on a full document load, so without this the whole
 * site reports as a single visit to whatever page the user landed on.
 *
 * We subscribe to the router rather than call useLocation(), because
 * <RouterProvider> owns the location and App sits above it — there is no
 * router context up here to read.
 */
export function usePageViews() {
  useEffect(() => {
    let lastPath = '';

    const send = (path: string) => {
      // subscribe() fires on every state change (loading, then idle), and
      // StrictMode re-runs this effect in dev; both would repeat a page_view
      // for a URL we just sent.
      if (path === lastPath) return;
      lastPath = path;
      trackPageView(path);
    };

    send(window.location.pathname + window.location.search);

    return router.subscribe((state) => {
      if (state.navigation.state !== 'idle') return;
      send(state.location.pathname + state.location.search);
    });
  }, []);
}
