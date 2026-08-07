import { useCallback, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import type { IceServersResponse } from '@/types/call';

/** Re-fetch a little before the credentials actually lapse. */
const REFRESH_MARGIN_MS = 5 * 60_000;

/**
 * How long a dial may wait for TURN credentials before going ahead without
 * them.
 *
 * The function is idle between lessons, so the first request of the day pays a
 * Cloud Run cold start — and it sits in front of building the connection, on
 * both sides in turn, which is how "join" came to take ten seconds before any
 * picture appeared. Most pairs never need the relay, so waiting past a few
 * seconds costs every call to save the few that would have been relayed.
 */
const FETCH_TIMEOUT_MS = 3_000;

const STUN_ONLY: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export interface IceServersResult {
  iceServers: RTCIceServer[];
  /**
   * The request failed or timed out and this is the local STUN-only fallback —
   * not what the server would have answered.
   *
   * Worth telling apart from a real answer that happens to be STUN-only: a
   * degraded set is stale the moment the credentials land, and a connection
   * built on one can be upgraded in place rather than left without a relay for
   * the rest of the lesson.
   */
  degraded: boolean;
}

/**
 * TURN credentials for one lesson, minted server-side and cached for as long as
 * they are valid.
 *
 * Fetched per call rather than at app start: the credentials are short-lived
 * and scoped to a booking, so there is nothing useful to hold onto between
 * lessons.
 */
export function useIceServers(bookingId: string | undefined) {
  const cache = useRef<{ servers: RTCIceServer[]; expiresAt: number } | null>(null);
  /**
   * The request already in flight. Warming the cache from the lobby and dialling
   * a moment later must be one round trip, not two — and the second caller gets
   * whatever the first is already waiting on.
   */
  const inFlight = useRef<Promise<IceServersResponse> | null>(null);

  return useCallback(async (): Promise<IceServersResult> => {
    if (!bookingId) return { iceServers: STUN_ONLY, degraded: true };

    const cached = cache.current;
    if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
      return { iceServers: cached.servers, degraded: false };
    }

    try {
      if (!inFlight.current) {
        const call = httpsCallable<{ bookingId: string }, IceServersResponse>(
          functions,
          'getIceServers'
        );
        // The cache is filled by the request itself, not by whoever happens to
        // be awaiting it: a slow answer that arrives after the timeout still
        // belongs to the next dial, and to the ICE restart after that.
        const pending = call({ bookingId })
          .then((result) => {
            cache.current = {
              servers: result.data.iceServers,
              expiresAt: result.data.expiresAt,
            };
            return result.data;
          })
          .finally(() => {
            inFlight.current = null;
          });
        // Kept from going unhandled when the race below has already given up.
        pending.catch(() => undefined);
        inFlight.current = pending;
      }

      const data = await Promise.race([
        inFlight.current,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ice-timeout')), FETCH_TIMEOUT_MS)
        ),
      ]);
      return { iceServers: data.iceServers, degraded: false };
    } catch (err) {
      // A call over STUN alone still works for most pairs, so a failure here
      // degrades the connection rather than blocking the lesson outright. The
      // flag is what lets the connection be repaired once the credentials do
      // arrive, instead of spending the whole lesson without a relay.
      console.error('useIceServers: falling back to STUN only', err);
      return { iceServers: STUN_ONLY, degraded: true };
    }
  }, [bookingId]);
}
