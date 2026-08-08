import { useEffect, useState } from 'react';

/** Tailwind's `md` breakpoint, from below. */
const MOBILE = '(max-width: 767.98px)';

/**
 * Turns a pane into a real full-screen surface on the phone, and reports
 * whether that treatment is on so the caller can pick its classes from the same
 * decision.
 *
 * While active it publishes the *visual* viewport as `--app-vh` and freezes the
 * document behind it. Both halves are needed: iOS never shrinks the layout
 * viewport for the on-screen keyboard — `100vh` and `100dvh` alike keep
 * reporting the whole screen — so a pane sized in those units stays taller than
 * what you can see, and Safari scrolls the document to chase the focused field,
 * dragging the site header off the top and the footer into the middle of the
 * conversation. `visualViewport` is the only thing that knows the keyboard is
 * up.
 */
export function useMobileFullscreen(enabled: boolean): boolean {
  // Read once during the first render, not in an effect: flipping a
  // conversation open must reach the DOM as one paint, or the pane renders
  // inline for a frame and visibly jumps.
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE).matches);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE);
    const sync = () => setIsMobile(mq.matches);
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const active = enabled && isMobile;

  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    const viewport = window.visualViewport;

    const apply = () => {
      if (!viewport) return;
      root.style.setProperty('--app-vh', `${viewport.height}px`);
      // `position: fixed` stays glued to the *layout* viewport, so on the rare
      // occasion iOS scrolls the visual one to reveal the caret the pane would
      // slide off screen unless it follows.
      root.style.setProperty('--app-vv-top', `${viewport.offsetTop}px`);
    };
    apply();
    viewport?.addEventListener('resize', apply);
    viewport?.addEventListener('scroll', apply);

    // Freeze the page underneath. `overflow: hidden` alone does not hold on
    // iOS; pinning the body does, and with nowhere left to scroll Safari stops
    // trying to move the document at all.
    const offset = window.scrollY;
    const body = document.body;
    const previousStyle = body.style.cssText;
    body.style.position = 'fixed';
    body.style.top = `-${offset}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.overflow = 'hidden';

    return () => {
      viewport?.removeEventListener('resize', apply);
      viewport?.removeEventListener('scroll', apply);
      root.style.removeProperty('--app-vh');
      root.style.removeProperty('--app-vv-top');
      body.style.cssText = previousStyle;
      window.scrollTo(0, offset);
    };
  }, [active]);

  return active;
}
