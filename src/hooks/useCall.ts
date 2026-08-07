import { useCallback, useEffect, useRef, useState } from 'react';
import {
  endCallRoom,
  ensureCallRoom,
  isPresent,
  requestRedial as publishRedialRequest,
  setPresence,
  watchCall,
  watchRemoteCandidates,
  type CallRole,
} from '@/lib/webrtc';
import { usePeerConnection } from './usePeerConnection';
import { useCallNegotiation } from './useCallNegotiation';
import { PRESENCE_HEARTBEAT_MS, RING_TIMEOUT_MS } from '@/types/call';
import type { Call, CallStatus, ConnectionRoute } from '@/types/call';
import type { Booking } from '@/types';

interface UseCallInput {
  booking: Booking | null;
  uid: string | undefined;
  role: CallRole | null;
  /** The lesson's window is open. Once it closes, the room hangs itself up. */
  open?: boolean;
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
  /** Student only: ask the teacher's side to dial again. */
  requestRedial: () => Promise<void>;
}

/**
 * One lesson's WebRTC session, negotiated over the `calls/{bookingId}` document.
 *
 * What is left here is the room: who is in the lobby, when the teacher is rung,
 * and how a seat is given up. `usePeerConnection` owns the browser API and
 * `useCallNegotiation` owns the offer/answer exchange that runs on top of it.
 */
export function useCall({
  booking,
  uid,
  role,
  open = true,
  localStream,
  screenStream = null,
}: UseCallInput): CallSession {
  const callId = booking?.id;

  const ringTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinedRef = useRef(false);
  // Breaks the cycle: the peer connection needs to ask for a renegotiation,
  // but the function that performs one is built further down, out of pieces
  // this hook has not created yet.
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
  const { pcRef, sessionRef, teardown, acceptCandidate, warmIceServers } = peer;

  const negotiation = useCallNegotiation({
    callId,
    role,
    call,
    joined,
    peer,
    onError: setError,
  });
  const { negotiatingRef, startCall, renegotiate, reset } = negotiation;

  useEffect(() => {
    renegotiateRef.current = () => void renegotiate();
  }, [renegotiate]);

  // ── Room subscription ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!callId) return;
    const unsub = watchCall(
      callId,
      (next) => {
        setCall(next);
        // The other side hung up. Tearing down here rather than in a follow-up
        // effect keeps the reaction in the subscription that observed it.
        //
        // Only when the hang-up is at least as new as what this browser is
        // dialling. Publishing an offer takes a moment — it waits on the TURN
        // credentials first — and for that whole window the document still
        // carries the *previous* call's `ended`. Acting on it tore down the
        // connection that had just been built, and the offer then went out to
        // a room whose teacher no longer had anything to answer into.
        if (
          next &&
          (next.status === 'ended' || next.status === 'rejected') &&
          (next.session ?? -1) >= sessionRef.current
        ) {
          if (pcRef.current) teardown();
          reset();
        }
      },
      (err) => {
        console.error('useCall: room snapshot failed', err);
        setError('room-unavailable');
      }
    );
    return unsub;
  }, [callId, teardown, reset, pcRef, sessionRef]);

  // Remote candidates, scoped to the generation this browser is on. Re-subscribes
  // on every re-dial, which is exactly what keeps old attempts out.
  const activeSession = call?.session ?? -1;
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
    // Started here, not awaited: the credentials are wanted a few seconds from
    // now, when someone dials, and the lobby is free time to spend on them.
    warmIceServers();
    await ensureCallRoom(booking);
    await setPresence(booking.id, role, true);
    joinedRef.current = true;
    setJoined(true);
  }, [booking, role, warmIceServers]);

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
    reset();
    teardown();
    if (!callId || !role) return;
    // Logged, not swallowed: a hang-up that is refused leaves the room looking
    // occupied to everyone, and silence here is what made that invisible.
    await endCallRoom(callId, role, 'ended').catch((err) =>
      console.error('useCall: ending the room failed', err)
    );
  }, [callId, role, teardown, reset]);

  // The lesson ran out of time. The page swaps the classroom for a notice but
  // keeps this hook mounted, so nothing here would otherwise stop: the peer
  // connection stayed up, media kept flowing, and the heartbeat kept claiming a
  // seat in a room that had closed.
  useEffect(() => {
    if (open || !joinedRef.current) return;
    // Off the render pass: hanging up sets state, and doing that inside the
    // effect body is what makes a render cascade.
    queueMicrotask(() => {
      leave().catch(() => undefined);
    });
  }, [open, leave]);

  const decline = useCallback(async () => {
    if (ringTimeout.current) {
      clearTimeout(ringTimeout.current);
      ringTimeout.current = null;
    }
    joinedRef.current = false;
    setJoined(false);
    if (!callId || !role) return;
    await endCallRoom(callId, role, 'rejected').catch((err) =>
      console.error('useCall: declining failed', err)
    );
  }, [callId, role]);

  /**
   * The student's only repair.
   *
   * Only the teacher may write an offer, so a student left on a dead connection
   * could do nothing but reload the tab. Raising `ringing` puts the prompt back
   * on the teacher's screen; the offer that follows clears it.
   */
  const requestRedial = useCallback(async () => {
    if (!callId || role !== 'student') return;
    setError(null);
    // The dead connection is deliberately left in place. Dropping it here would
    // empty the stage and put this student back on the lobby screen, which
    // reads as having been thrown out of the lesson; the teacher's answer is a
    // new connection with a new DTLS fingerprint, and the offer handler already
    // rebuilds rather than adopts when it sees one.
    await publishRedialRequest(callId).catch((err) =>
      console.error('useCall: requesting a re-dial failed', err)
    );
  }, [callId, role]);

  // ── Ringing ────────────────────────────────────────────────────────────────

  // The teacher is prompted once both people are actually in the lobby. Ringing
  // on presence rather than on an explicit "call" button matches how a
  // scheduled lesson works: both show up, and the teacher opens the door.
  const peerReadyAt = role === 'teacher' ? call?.studentReadyAt : call?.teacherReadyAt;
  const ownReadyAt = role === 'teacher' ? call?.teacherReadyAt : call?.studentReadyAt;
  const peerPresent = isPresent(peerReadyAt ?? null, ownReadyAt ?? null);

  // Deliberately *not* gated on the room's status being idle. Nothing resets
  // that status when a tab dies without hanging up — a killed browser or a
  // locked phone leaves it on `connecting` forever — and gating on it meant the
  // teacher came back to a room that could never be rung again. What this
  // browser holds is the honest answer: no connection of our own means no
  // lesson in progress, whatever the document still claims.
  // `connecting` as well as `negotiating`: a dial spends its first seconds
  // waiting on the TURN credentials, and for that stretch there is no
  // connection yet to say the teacher is busy — so the prompt reappeared on top
  // of the dial it had just started, which on a repair the teacher never asked
  // for is a dialog arriving out of nowhere.
  const incoming =
    role === 'teacher' && joined && peerPresent && !peer.negotiating && !peer.connecting;

  /**
   * The student asked to be dialled again, and this browser already holds a
   * connection — so the lesson is under way and this is a repair.
   *
   * It dials rather than raising the prompt. Routing a repair through the
   * prompt looked tidy and was dangerous: the prompt owns a thirty-second
   * auto-decline, so a request the teacher did not happen to be looking at
   * *hung up a working lesson* and took their lobby seat with it. Dismissing
   * the dialog did the same thing instantly.
   *
   * With no connection of our own the request is indistinguishable from "please
   * begin" — which is the teacher's to accept, not ours to assume — and
   * `incoming` above already covers that case, since a student who is present
   * rings the prompt regardless of what the status says.
   */
  const redialHandledRef = useRef(false);
  useEffect(() => {
    if (role !== 'teacher' || call?.status !== 'ringing') {
      // The episode is over; arm for the next one.
      redialHandledRef.current = false;
      return;
    }
    if (!joined || !peer.negotiating || redialHandledRef.current) return;
    redialHandledRef.current = true;
    void startCall();
  }, [role, call?.status, joined, peer.negotiating, startCall]);

  // Auto-decline once the prompt has rung long enough. The timer lives here so
  // it starts and stops with the prompt itself.
  useEffect(() => {
    if (!incoming) return;
    ringTimeout.current = setTimeout(() => {
      ringTimeout.current = null;
      // A dial that started while the prompt was still up must not be declined
      // out from under itself. `negotiating` only turns on once the connection
      // exists, which is several seconds after the teacher pressed accept.
      if (negotiatingRef.current) return;
      decline().catch(() => undefined);
    }, RING_TIMEOUT_MS);
    return () => {
      if (ringTimeout.current) {
        clearTimeout(ringTimeout.current);
        ringTimeout.current = null;
      }
    };
  }, [incoming, decline, negotiatingRef]);

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
    requestRedial,
  };
}
