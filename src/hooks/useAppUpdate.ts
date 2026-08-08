import { useEffect } from 'react';

/** One check per minute at most, so flicking between apps costs nothing. */
const MIN_INTERVAL_MS = 60_000;

/** A lesson in progress outranks a new build. Checked again on the next resume. */
const NEVER_INTERRUPT = /^\/call\//;

/**
 * Reads the entry bundle this page is running. The build emits exactly one
 * module script — `<script type="module" crossorigin src="/assets/index-*.js">`
 * — and the hash in that filename changes with the content, so it already is
 * the version number. Nothing has to be generated at build time.
 */
function entryScript(doc: Document): string | null {
  return doc.querySelector('script[type="module"][src]')?.getAttribute('src') ?? null;
}

/**
 * Reloads the app once a newer build is live, the next time it comes back to
 * the foreground.
 *
 * Installed to the home screen, iOS keeps the web view alive and *resumes* the
 * same document when the icon is tapped — there is no navigation, so no fresh
 * HTML, so the bundle loaded days ago keeps running no matter how many times
 * the site is deployed. (Nothing is cached offline here; `firebase-messaging-
 * sw.js` handles push only and has no `fetch` handler.) Becoming visible is the
 * one moment the app can notice, and the one moment a reload costs the user
 * nothing.
 */
export function useAppUpdate(): void {
  useEffect(() => {
    // In dev the entry is `/src/main.tsx` and there is no build to compare to.
    if (!import.meta.env.PROD) return;

    const running = entryScript(document);
    if (!running) return;

    let checkedAt = 0;

    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      if (NEVER_INTERRUPT.test(window.location.pathname)) return;
      const now = performance.now();
      if (now - checkedAt < MIN_INTERVAL_MS) return;
      checkedAt = now;

      try {
        // `no-store`, or the hour-long HTTP cache would answer with the very
        // copy we are trying to look past.
        const response = await fetch('/index.html', { cache: 'no-store' });
        if (!response.ok) return;
        const served = entryScript(
          new DOMParser().parseFromString(await response.text(), 'text/html')
        );
        if (served && served !== running) window.location.reload();
      } catch {
        // Offline, or the request was cut short by the app being backgrounded
        // again. Either way there is nothing to do but try on the next resume.
      }
    };

    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, []);
}
