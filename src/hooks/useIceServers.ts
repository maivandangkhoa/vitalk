import { useCallback, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import type { IceServersResponse } from '@/types/call';

/** Re-fetch a little before the credentials actually lapse. */
const REFRESH_MARGIN_MS = 5 * 60_000;

const STUN_ONLY: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

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

  return useCallback(async (): Promise<RTCIceServer[]> => {
    if (!bookingId) return STUN_ONLY;

    const cached = cache.current;
    if (cached && cached.expiresAt - REFRESH_MARGIN_MS > Date.now()) {
      return cached.servers;
    }

    try {
      const call = httpsCallable<{ bookingId: string }, IceServersResponse>(
        functions,
        'getIceServers'
      );
      const { data } = await call({ bookingId });
      cache.current = { servers: data.iceServers, expiresAt: data.expiresAt };
      return data.iceServers;
    } catch (err) {
      // A call over STUN alone still works for most pairs, so a failure here
      // degrades the connection rather than blocking the lesson outright.
      console.error('useIceServers: falling back to STUN only', err);
      return STUN_ONLY;
    }
  }, [bookingId]);
}
