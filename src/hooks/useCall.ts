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
import { PRESENCE_HEARTBEAT_MS } from '@/types/call';
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
  /**
   * The teacher is being asked to start the lesson.
   *
   * Only ever for a student who arrived *after* the teacher did — walking in on
   * one already waiting starts the lesson from `join` instead of asking twice.
   *
   * It has no timeout of its own: it stays true for exactly as long as that
   * student is really waiting, and goes false once their heartbeat lapses.
   * Putting the prompt aside is the page's business, not the room's.
   */
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

  const joinedRef = useRef(false);
  /**
   * Whether the other side was already waiting at the moment this browser
   * joined. Read inside `join`, which runs long after the render that computed
   * it, so a ref rather than the value itself.
   */
  const peerPresentRef = useRef(false);
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
  const { startCall, renegotiate, reset } = negotiation;

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

    // Walking into a classroom that already says someone is waiting *is* the
    // decision the prompt asks for, one screen earlier. Asking again is a
    // second confirmation of a click that was never ambiguous, so this starts
    // the lesson outright.
    //
    // What is left for the prompt is the case it was always really for: a
    // student who arrives *after* the teacher settled in. That trigger is
    // remote, the teacher may not be looking at it, and consent for it has not
    // been given yet.
    //
    // Safe before React has flushed `joined`: `startCall` gates on the role and
    // the room id, never on the seat.
    if (role === 'teacher' && peerPresentRef.current) {
      await startCall().catch((err) =>
        console.error('useCall: starting on arrival failed', err)
      );
    }
  }, [booking, role, warmIceServers, startCall]);

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

  // Kept for `join`, which decides on the click whether there is anybody to
  // start with and so cannot wait for the next render to tell it.
  useEffect(() => {
    peerPresentRef.current = peerPresent;
  }, [peerPresent]);

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

  // There is deliberately no timer on the prompt.
  //
  // It used to auto-decline after thirty seconds, which hung up on a teacher
  // who had merely looked away — and it did so *silently*, since nothing here
  // ever made a sound. Worse, the hang-up cleared the teacher's seat, so the
  // student's lobby then claimed they had never arrived.
  //
  // Nothing is lost by dropping it. A student who really leaves stops
  // heartbeating and `peerPresent` goes false on its own within
  // `PRESENCE_STALE_MS`, which closes the prompt for the honest reason; and the
  // lesson's own window is the upper bound on the whole room, hanging it up
  // through the `open` effect above.

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
    redial: startCall,
    requestRedial,
  };
}
