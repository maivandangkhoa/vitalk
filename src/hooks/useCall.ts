import { useCallback, useEffect, useRef, useState } from 'react';
import {
  endCallRoom,
  ensureCallRoom,
  isPresent,
  publishAnswer,
  publishOffer,
  setPresence,
  watchCall,
  watchRemoteCandidates,
  type CallRole,
} from '@/lib/webrtc';
import { usePeerConnection } from './usePeerConnection';
import {
  ICE_RECOVERY_GRACE_MS,
  PRESENCE_HEARTBEAT_MS,
  RING_TIMEOUT_MS,
} from '@/types/call';
import type { Call, CallStatus, ConnectionRoute } from '@/types/call';
import type { Booking } from '@/types';

interface UseCallInput {
  booking: Booking | null;
  uid: string | undefined;
  role: CallRole | null;
  localStream: MediaStream | null;
  /** Additive screen share. Teacher only — sending it needs a fresh offer. */
  screenStream?: MediaStream | null;
}

export interface CallSession {
  call: Call | null;
  status: CallStatus;
  remoteStream: MediaStream | null;
  /** The other side's screen, when they are sharing it as a second video. */
  remoteScreenStream: MediaStream | null;
  /** The other side is in the lobby right now (fresh heartbeat). */
  peerPresent: boolean;
  /** This browser has a seat in the lobby. */
  joined: boolean;
  /** The teacher is being asked to start the lesson. */
  incoming: boolean;
  /** Media is flowing. False covers both "not yet" and "it broke". */
  connected: boolean;
  route: ConnectionRoute;
  connecting: boolean;
  /** The connection dropped and is being repaired in place. */
  reconnecting: boolean;
  error: string | null;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  /** Teacher only: throw away this attempt and dial a fresh one. */
  redial: () => Promise<void>;
}

/**
 * One lesson's WebRTC session, negotiated over the `calls/{bookingId}` document.
 *
 * Roles are fixed: the teacher always offers, the student always answers. That
 * single rule removes SDP glare — the failure where both ends offer at once and
 * neither connection survives — without any of the perfect-negotiation
 * bookkeeping it would otherwise take. `usePeerConnection` owns the browser API;
 * what is left here is who says what to whom, and when.
 */
export function useCall({
  booking,
  uid,
  role,
  localStream,
  screenStream = null,
}: UseCallInput): CallSession {
  const callId = booking?.id;

  const ringTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinedRef = useRef(false);
  /** An offer is out and its answer has not come back yet. */
  const negotiatingRef = useRef(false);
  /** A track change arrived mid-negotiation and still needs an offer. */
  const pendingNegotiationRef = useRef(false);
  // Breaks the cycle: the peer connection needs to ask for a renegotiation,
  // but the function that performs one is defined further down, from pieces
  // this hook returns.
  const renegotiateRef = useRef<() => void>(() => {});

  const [call, setCall] = useState<Call | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const onFatalError = useCallback((code: string) => setError(code), []);
  const onNegotiationNeeded = useCallback(() => renegotiateRef.current(), []);
  const peer = usePeerConnection({
    callId,
    uid,
    role,
    localStream,
    screenStream,
    onNegotiationNeeded,
    onFatalError,
  });
  const {
    pcRef,
    sessionRef,
    remoteDescSetRef,
    create,
    teardown,
    adopt,
    acceptCandidate,
    drainCandidates,
    setConnecting,
    setReconnecting,
  } = peer;

  // ── Room subscription ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!callId) return;
    const unsub = watchCall(
      callId,
      (next) => {
        setCall(next);
        // The other side hung up. Tearing down here rather than in a follow-up
        // effect keeps the reaction in the subscription that observed it.
        if (next && (next.status === 'ended' || next.status === 'rejected')) {
          if (pcRef.current) teardown();
          negotiatingRef.current = false;
          pendingNegotiationRef.current = false;
        }
      },
      (err) => {
        console.error('useCall: room snapshot failed', err);
        setError('room-unavailable');
      }
    );
    return unsub;
  }, [callId, teardown, pcRef]);

  // Remote candidates, scoped to the generation this browser is on. Re-subscribes
  // on every re-dial, which is exactly what keeps old attempts out.
  const activeSession = call?.session ?? -1;
  const currentSession = call?.session ?? 0;
  useEffect(() => {
    if (!callId || !uid || activeSession < 0) return;
    const unsub = watchRemoteCandidates(callId, activeSession, uid, (candidate) => {
      acceptCandidate(candidate).catch(() => undefined);
    });
    return unsub;
  }, [callId, uid, activeSession, acceptCandidate]);

  // ── Presence ───────────────────────────────────────────────────────────────

  const join = useCallback(async () => {
    if (!booking || !role) return;
    await ensureCallRoom(booking);
    await setPresence(booking.id, role, true);
    joinedRef.current = true;
    setJoined(true);
  }, [booking, role]);

  useEffect(() => {
    if (!callId || !role) return;
    const timer = setInterval(() => {
      if (!joinedRef.current) return;
      setPresence(callId, role, true).catch(() => undefined);
    }, PRESENCE_HEARTBEAT_MS);
    return () => clearInterval(timer);
  }, [callId, role]);

  const leave = useCallback(async () => {
    joinedRef.current = false;
    setJoined(false);
    negotiatingRef.current = false;
    pendingNegotiationRef.current = false;
    teardown();
    if (!callId || !role) return;
    await endCallRoom(callId, role, 'ended').catch(() => undefined);
  }, [callId, role, teardown]);

  // ── Negotiation ────────────────────────────────────────────────────────────

  /**
   * Opens a brand-new generation and offers on it — the teacher answering the
   * prompt, and the teacher re-dialling a connection that died.
   *
   * Both are the same act, so they are the same code. The existing connection
   * is torn down first: a re-dial that left it open would leak a peer
   * connection and keep its dead candidates arriving.
   */
  const startCall = useCallback(async () => {
    if (!callId || role !== 'teacher') return;
    if (ringTimeout.current) {
      clearTimeout(ringTimeout.current);
      ringTimeout.current = null;
    }
    if (pcRef.current) teardown();
    pendingNegotiationRef.current = false;
    setConnecting(true);
    negotiatingRef.current = true;
    try {
      // Ahead of both what the document says and what this browser last used:
      // a re-dial after a reload must not reuse a generation whose candidates
      // are still in the collection.
      const session = Math.max(currentSession, sessionRef.current) + 1;
      const pc = await create(session);
      if (!pc) return;
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await publishOffer(callId, session, { type: 'offer', sdp: offer.sdp ?? '' });
    } catch (err) {
      console.error('useCall: offer failed', err);
      setError('offer-failed');
      setConnecting(false);
      negotiatingRef.current = false;
    }
  }, [callId, role, currentSession, create, teardown, setConnecting, pcRef, sessionRef]);

  const decline = useCallback(async () => {
    if (ringTimeout.current) {
      clearTimeout(ringTimeout.current);
      ringTimeout.current = null;
    }
    joinedRef.current = false;
    setJoined(false);
    if (!callId || !role) return;
    await endCallRoom(callId, role, 'rejected').catch(() => undefined);
  }, [callId, role]);

  /**
   * Re-negotiates ICE on the live connection after the network moved — Wi-Fi to
   * mobile data, a NAT rebinding, a brief outage.
   *
   * The teacher drives it for the same reason the teacher offers: one fixed
   * side, no glare. A new generation is opened so the fresh candidates stay
   * apart from the ones that just stopped working.
   */
  const restartIce = useCallback(async () => {
    if (!callId || role !== 'teacher') return;
    const session = currentSession + 1;
    const pc = adopt(session);
    if (!pc) return;
    // Repairing the network outranks a pending track change, so this one does
    // not wait its turn — but it still claims the slot so nothing overlaps it.
    negotiatingRef.current = true;
    setReconnecting(true);
    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      await publishOffer(callId, session, { type: 'offer', sdp: offer.sdp ?? '' });
    } catch (err) {
      console.error('useCall: ICE restart failed', err);
      setError('connection-failed');
      setReconnecting(false);
      negotiatingRef.current = false;
    }
  }, [callId, role, currentSession, adopt, setReconnecting]);

  /**
   * Re-offer on the live connection after the set of outgoing tracks changed —
   * the teacher starting or stopping a screen share.
   *
   * Only the teacher runs this, which is the whole reason it is safe: the rules
   * let only the teacher write `offer`, so there is still exactly one offerer
   * and no glare to resolve. A change that lands while an offer is already out
   * waits rather than racing it.
   */
  const renegotiate = useCallback(async () => {
    if (!callId || role !== 'teacher') return;
    if (!pcRef.current) return;
    if (negotiatingRef.current) {
      pendingNegotiationRef.current = true;
      return;
    }

    // The live connection's generation is the truthful one; the document may
    // not have caught up with the offer that was just published.
    const session = Math.max(currentSession, sessionRef.current) + 1;
    const pc = adopt(session);
    if (!pc) return;

    negotiatingRef.current = true;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await publishOffer(callId, session, { type: 'offer', sdp: offer.sdp ?? '' });
    } catch (err) {
      console.error('useCall: renegotiation failed', err);
      negotiatingRef.current = false;
      setError('offer-failed');
    }
  }, [callId, role, currentSession, adopt, pcRef, sessionRef]);

  useEffect(() => {
    renegotiateRef.current = () => void renegotiate();
  }, [renegotiate]);

  // A `disconnected` ICE state very often heals on its own within a couple of
  // seconds, so wait before spending a renegotiation on it. `failed` never
  // heals, and is worth restarting immediately.
  useEffect(() => {
    if (role !== 'teacher' || !peer.iceTrouble) return;
    const delay = peer.iceTrouble === 'failed' ? 0 : ICE_RECOVERY_GRACE_MS;
    const timer = setTimeout(() => {
      const state = pcRef.current?.iceConnectionState;
      if (state === 'disconnected' || state === 'failed') {
        restartIce().catch(() => undefined);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [peer.iceTrouble, role, restartIce, pcRef]);

  // The teacher is prompted once both people are actually in the lobby. Ringing
  // on presence rather than on an explicit "call" button matches how a
  // scheduled lesson works: both show up, and the teacher opens the door.
  const peerReadyAt = role === 'teacher' ? call?.studentReadyAt : call?.teacherReadyAt;
  const peerPresent = isPresent(peerReadyAt ?? null);
  // Deliberately *not* gated on the room's status. Nothing resets that status
  // when a tab dies without hanging up — a killed browser or a locked phone
  // leaves it on `connecting` forever — and gating on it meant the teacher
  // came back to a room that could never be rung again. What this browser
  // holds is the honest answer: no connection of our own means no lesson in
  // progress, whatever the document still claims.
  const incoming = role === 'teacher' && joined && peerPresent && !peer.negotiating;

  // Auto-decline once the prompt has rung long enough. The timer lives here so
  // it starts and stops with the prompt itself.
  useEffect(() => {
    if (!incoming) return;
    ringTimeout.current = setTimeout(() => {
      decline().catch(() => undefined);
    }, RING_TIMEOUT_MS);
    return () => {
      if (ringTimeout.current) {
        clearTimeout(ringTimeout.current);
        ringTimeout.current = null;
      }
    };
  }, [incoming, decline]);

  // Student side: an offer on a generation we have not handled means the
  // teacher just started the lesson — or is repairing a dropped one.
  useEffect(() => {
    if (role !== 'student' || !callId) return;
    const offer = call?.offer;
    const session = call?.session ?? -1;
    if (!offer || session < 0 || session === sessionRef.current) return;
    if (!joinedRef.current) return;

    let cancelled = false;
    (async () => {
      setConnecting(true);
      try {
        // An ICE restart arrives as a fresh offer on a live connection. Keeping
        // that connection is the whole point of a restart — tearing it down
        // would drop the tracks and turn a two-second blip into a re-dial.
        // A connection that already failed cannot be repaired by pointing a
        // new description at it — that attempt is over. Only a live one is
        // worth keeping.
        let pc = pcRef.current?.connectionState === 'failed' ? null : adopt(session);
        if (!pc) {
          teardown();
          pc = await create(session);
        }
        if (!pc || cancelled) return;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        remoteDescSetRef.current = true;
        await drainCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await publishAnswer(callId, { type: 'answer', sdp: answer.sdp ?? '' });
      } catch (err) {
        console.error('useCall: answering failed', err);
        if (!cancelled) {
          setError('answer-failed');
          setConnecting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    role,
    callId,
    call?.offer,
    call?.session,
    adopt,
    create,
    teardown,
    drainCandidates,
    setConnecting,
    sessionRef,
    remoteDescSetRef,
    pcRef,
  ]);

  // Teacher side: the answer completes the handshake.
  useEffect(() => {
    if (role !== 'teacher') return;
    const answer = call?.answer;
    const pc = pcRef.current;
    if (!answer || !pc || remoteDescSetRef.current) return;
    if ((call?.session ?? -1) !== sessionRef.current) return;

    (async () => {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        remoteDescSetRef.current = true;
        await drainCandidates();
        negotiatingRef.current = false;
        // A share that was toggled while this offer was in flight gets its own
        // offer now, in order rather than on top.
        if (pendingNegotiationRef.current) {
          pendingNegotiationRef.current = false;
          renegotiateRef.current();
        }
      } catch (err) {
        console.error('useCall: applying answer failed', err);
        setError('answer-failed');
        negotiatingRef.current = false;
      }
    })();
  }, [
    role,
    call?.answer,
    call?.session,
    drainCandidates,
    pcRef,
    sessionRef,
    remoteDescSetRef,
  ]);

  // Releasing the seat on unmount is what stops a closed tab from ringing the
  // other side forever.
  useEffect(() => {
    return () => {
      if (joinedRef.current && callId && role) {
        setPresence(callId, role, false).catch(() => undefined);
      }
      joinedRef.current = false;
    };
  }, [callId, role]);

  return {
    call,
    status: call?.status ?? 'idle',
    remoteStream: peer.remoteStream,
    remoteScreenStream: peer.remoteScreenStream,
    peerPresent,
    joined,
    incoming,
    connected: peer.connected,
    route: peer.route,
    connecting: peer.connecting,
    reconnecting: peer.reconnecting,
    error,
    join,
    leave,
    accept: startCall,
    decline,
    redial: startCall,
  };
}
