/**
 * Google Analytics 4, loaded as gtag.js.
 *
 * The measurement ID is the GA4 property Firebase already created for
 * `vietalky`, so nothing new has to be provisioned. We load the tag ourselves
 * instead of using firebase/analytics because only gtag.js gets the enhanced
 * measurement events — scroll depth, outbound clicks, file downloads, site
 * search — and those are most of what makes the reports worth reading.
 */

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

// Local dev would otherwise land in the same property as real traffic. Set
// VITE_GA_DEBUG=1 in .env.local to send from dev and watch GA's DebugView.
const DEBUG = import.meta.env.VITE_GA_DEBUG === '1';

const ENABLED = !!MEASUREMENT_ID && (import.meta.env.PROD || DEBUG);

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

function gtag(..._args: unknown[]) {
  // gtag.js reads the raw `arguments` object back off dataLayer, so this has
  // to stay a function declaration pushing `arguments` — a rest array is not
  // the same shape and the tag ignores it.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer?.push(arguments);
}

/** Injects the tag. Safe to call more than once; only the first call runs. */
export function initAnalytics() {
  if (!ENABLED || window.dataLayer) return;

  window.dataLayer = [];

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);

  gtag('js', new Date());
  gtag('config', MEASUREMENT_ID, {
    // We send our own page_view on every route change, first paint included.
    // Leaving the automatic one on would double-count every landing.
    send_page_view: false,
    ...(DEBUG ? { debug_mode: true } : {}),
  });
}

/** One screen in the SPA. `path` includes the query string. */
export function trackPageView(path: string) {
  if (!ENABLED) return;
  gtag('event', 'page_view', {
    page_location: window.location.origin + path,
    page_title: document.title,
  });
}

/**
 * A GA4 event. Prefer the recommended names (`login`, `sign_up`,
 * `begin_checkout`, `purchase`) — they are what GA's built-in reports and
 * conversion settings already understand.
 */
export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (!ENABLED) return;
  gtag('event', name, params ?? {});
}

/**
 * Ties events to the signed-in account and tags the session with its role.
 * The role matters: without it, teachers and admins working in /admin are
 * indistinguishable from students, and every funnel is skewed by staff
 * traffic. Only the uid goes out — never an email or a name.
 */
export function setAnalyticsUser(uid: string | null, role: string | null) {
  if (!ENABLED) return;
  gtag('set', { user_id: uid });
  gtag('set', 'user_properties', { app_role: role });
}
