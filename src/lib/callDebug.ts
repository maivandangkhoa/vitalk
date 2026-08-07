/**
 * The two opt-in switches on a live call, both read from the address bar so
 * they can be turned on where the problem actually happens — a student's phone
 * on a Korean mobile network — rather than only in a development build.
 */

/**
 * Force every candidate through TURN: `?ice=relay`.
 *
 * Most pairs connect straight to each other, so a relay that is quietly broken
 * looks perfectly healthy from the outside; forbidding every direct route on
 * both sides is the only way to prove it actually carries a lesson. Read per
 * connection rather than once at module load, so it takes effect on the next
 * dial without a reload.
 */
export function relayOnly(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('ice') === 'relay';
}

/**
 * A timeline of one connection, printed when the address bar says `?debug=call`.
 *
 * "The picture takes ten seconds" has half a dozen possible causes — gathering,
 * the answer coming back, connectivity checks, DTLS, the first keyframe — and
 * they are indistinguishable from the outside. Elapsed milliseconds since the
 * connection was built tell them apart in one glance.
 */
export function timeline(): (label: string) => void {
  if (
    typeof window === 'undefined' ||
    new URLSearchParams(window.location.search).get('debug') !== 'call'
  ) {
    return () => {};
  }
  const startedAt = performance.now();
  return (label: string) =>
    console.log(`[call] +${Math.round(performance.now() - startedAt)}ms ${label}`);
}
