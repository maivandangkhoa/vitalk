import { useCallback, useEffect, useRef } from 'react';
import { dtlsFingerprint, publishAnswer, publishOffer, type CallRole } from '@/lib/webrtc';
import { ICE_RECOVERY_GRACE_MS, OFFER_TIMEOUT_MS } from '@/types/call';
import type { Call } from '@/types/call';
import type { PeerConnection } from './usePeerConnection';

interface UseCallNegotiationInput {
  callId: string | undefined;
  role: CallRole | null;
  call: Call | null;
  /** This browser has a seat in the lobby. Nothing is answered before it does. */
  joined: boolean;
  peer: PeerConnection;
  /** `null` clears the last failure — every fresh attempt starts from clean. */
  onError: (code: string | null) => void;
}

export interface CallNegotiation {
  /** An offer is out and its answer has not come back yet. */
  negotiatingRef: React.RefObject<boolean>;
  /** Teacher only: throw away this attempt and dial a fresh generation. */
  startCall: () => Promise<void>;
  /** Teacher only: re-offer on the live connection after the tracks changed. */
  renegotiate: () => Promise<void>;
  /** Forget the in-flight bookkeeping — the room was closed under us. */
  reset: () => void;
}

/**
 * The signaling half of a lesson's call: who offers, who answers, and what to
 * do when either stops arriving.
 *
 * Split from `useCall`, which keeps the room itself — presence, the lobby, the
 * ring. The two halves meet only through `peer`, the shared
 * `RTCPeerConnection`, and through the negotiation flag the ring has to
 * respect.
 *
 * Roles are fixed: the teacher always offers, the student always answers. That
 * single rule removes SDP glare — the failure where both ends offer at once and
 * neither connection survives — without any of the perfect-negotiation
 * bookkeeping it would otherwise take.
 */
export function useCallNegotiation({
  callId,
  role,
  call,
  joined,
  peer,
  onError,
}: UseCallNegotiationInput): CallNegotiation {
  const {
    pcRef,
    sessionRef,
    remoteDescSetRef,
    create,
    teardown,
    adopt,
    repairIceServers,
    drainCandidates,
    reconcileRemoteMedia,
    setConnecting,
    setReconnecting,
  } = peer;

  const negotiatingRef = useRef(false);
  /** A track change arrived mid-negotiation and still needs an offer. */
  const pendingNegotiationRef = useRef(false);
  /**
   * Which dial is the current one. A dial that loses the race must not clear
   * the flags — or tear down the connection — that belong to its successor.
   */
  const dialTokenRef = useRef(0);
  const offerTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Breaks the cycle: applying an answer may need to fire the renegotiation
  // that was queued behind it, and that function is defined further down.
  const renegotiateRef = useRef<() => void>(() => {});

  const currentSession = call?.session ?? 0;

  const clearOfferTimeout = useCallback(() => {
    if (!offerTimeout.current) return;
    clearTimeout(offerTimeout.current);
    offerTimeout.current = null;
  }, []);

  const reset = useCallback(() => {
    clearOfferTimeout();
    negotiatingRef.current = false;
    pendingNegotiationRef.current = false;
  }, [clearOfferTimeout]);

  useEffect(() => clearOfferTimeout, [clearOfferTimeout]);

  // ── Dialling ───────────────────────────────────────────────────────────────

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
    const token = ++dialTokenRef.current;
    // Ahead of both what the document says and what this browser last used: a
    // re-dial after a reload must not reuse a generation whose candidates are
    // still in the collection. Read *before* the teardown below, which resets
    // the very number this is reading — so the second half of that guarantee
    // was quietly doing nothing.
    const session = Math.max(currentSession, sessionRef.current) + 1;
    if (pcRef.current) teardown();
    // Claimed for the whole dial rather than only once the connection exists.
    // Building one waits on the TURN credentials, and for those seconds this
    // browser used to look like it was on no generation at all — which is what
    // let a hang-up left over from the *previous* call tear the new one down.
    sessionRef.current = session;
    clearOfferTimeout();
    pendingNegotiationRef.current = false;
    onError(null);
    setConnecting(true);
    negotiatingRef.current = true;
    try {
      const pc = await create(session);
      if (!pc) {
        // Superseded by a newer dial, or torn down while this one waited on its
        // credentials. Only the newest attempt may clear the flags.
        if (dialTokenRef.current === token) {
          negotiatingRef.current = false;
          setConnecting(false);
        }
        return;
      }
      if (dialTokenRef.current !== token) return;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await publishOffer(callId, session, { type: 'offer', sdp: offer.sdp ?? '' });

      // An offer nobody answers leaves ICE at `new`: connectivity checks never
      // start, so `failed` never fires and every recovery path hanging off it
      // is unreachable. Without this the teacher waits on a black stage for as
      // long as they are willing to.
      offerTimeout.current = setTimeout(() => {
        offerTimeout.current = null;
        if (remoteDescSetRef.current || dialTokenRef.current !== token) return;
        console.warn('useCallNegotiation: no answer to this offer, giving up');
        onError('no-answer');
        teardown();
        negotiatingRef.current = false;
      }, OFFER_TIMEOUT_MS);
    } catch (err) {
      console.error('useCallNegotiation: offer failed', err);
      if (dialTokenRef.current !== token) return;
      onError('offer-failed');
      // Drop the half-built connection. Keeping it would leave this browser
      // looking busy — which is what the ring prompt reads — so a dial that
      // failed once could never be attempted again without a reload.
      teardown();
      negotiatingRef.current = false;
    }
  }, [
    callId,
    role,
    currentSession,
    create,
    teardown,
    clearOfferTimeout,
    onError,
    setConnecting,
    pcRef,
    sessionRef,
    remoteDescSetRef,
  ]);

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
    // The same arithmetic every other generation bump uses. Trusting the
    // document's number alone re-used a generation whose candidates were
    // already in the collection — and the student, which ignores an offer on
    // the generation it is already on, dropped the restart on the floor.
    const session = Math.max(currentSession, sessionRef.current) + 1;
    const pc = adopt(session);
    if (!pc) return;
    // Repairing the network outranks a pending track change, so this one does
    // not wait its turn — but it still claims the slot so nothing overlaps it.
    negotiatingRef.current = true;
    setReconnecting(true);
    try {
      // A connection built on the STUN-only fallback — a cold start that timed
      // out — gets the credentials it missed here, while it still has a use
      // for them.
      await repairIceServers();
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);
      await publishOffer(callId, session, { type: 'offer', sdp: offer.sdp ?? '' });
    } catch (err) {
      console.error('useCallNegotiation: ICE restart failed', err);
      onError('connection-failed');
      setReconnecting(false);
      negotiatingRef.current = false;
    }
  }, [
    callId,
    role,
    currentSession,
    adopt,
    repairIceServers,
    onError,
    setReconnecting,
    sessionRef,
  ]);

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
      console.error('useCallNegotiation: renegotiation failed', err);
      negotiatingRef.current = false;
      onError('offer-failed');
    }
  }, [callId, role, currentSession, adopt, onError, pcRef, sessionRef]);

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

  // ── Answering ──────────────────────────────────────────────────────────────

  // Student side: an offer on a generation we have not handled means the
  // teacher just started the lesson — or is repairing a dropped one.
  useEffect(() => {
    if (role !== 'student' || !callId || !joined) return;
    const offer = call?.offer;
    const session = call?.session ?? -1;
    if (!offer || session < 0 || session === sessionRef.current) return;

    let cancelled = false;
    (async () => {
      onError(null);
      setConnecting(true);
      try {
        // An ICE restart arrives as a fresh offer on a live connection. Keeping
        // that connection is the whole point of a restart — tearing it down
        // would drop the tracks and turn a two-second blip into a re-dial.
        //
        // But only a restart may be adopted. A re-dial is a brand-new
        // connection on the teacher's side, with a new DTLS fingerprint, and
        // adopting that onto ours leaves two halves that can never complete
        // their handshake — the exact stall that "Gọi lại" appeared to fix by
        // waiting until the old connection had rotted to `failed`. The
        // fingerprint is what tells the two apart.
        const live = pcRef.current;
        const offered = dtlsFingerprint(offer.sdp);
        const sameConnection =
          !!offered &&
          !!live &&
          live.connectionState !== 'failed' &&
          live.connectionState !== 'closed' &&
          !!live.currentRemoteDescription &&
          offered === dtlsFingerprint(live.currentRemoteDescription.sdp);
        let pc = sameConnection ? adopt(session) : null;
        if (pc) {
          // The restart is this side's chance to pick up TURN credentials a
          // cold start denied the original connection.
          await repairIceServers();
        } else {
          teardown();
          pc = await create(session);
        }
        if (!pc || cancelled || pcRef.current !== pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        remoteDescSetRef.current = true;
        await drainCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        // Both descriptions are in place, so the transceivers now say what the
        // teacher is really sending — including that a screen share has gone.
        reconcileRemoteMedia();
        await publishAnswer(callId, { type: 'answer', sdp: answer.sdp ?? '' });
      } catch (err) {
        console.error('useCallNegotiation: answering failed', err);
        if (!cancelled) {
          onError('answer-failed');
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
    joined,
    call?.offer,
    call?.session,
    adopt,
    create,
    teardown,
    repairIceServers,
    drainCandidates,
    reconcileRemoteMedia,
    onError,
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
        // The mirror of the student's check. An answer whose fingerprint is not
        // the one this connection already shook hands with comes from a student
        // who rebuilt theirs — after a reload, or after coming back from a lost
        // connection. It cannot be applied here; dial them again instead of
        // sitting on a handshake that will never finish.
        const previous = pc.currentRemoteDescription?.sdp;
        if (previous && dtlsFingerprint(previous) !== dtlsFingerprint(answer.sdp)) {
          void startCall();
          return;
        }

        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        remoteDescSetRef.current = true;
        clearOfferTimeout();
        await drainCandidates();
        reconcileRemoteMedia();
        negotiatingRef.current = false;
        // A share that was toggled while this offer was in flight gets its own
        // offer now, in order rather than on top.
        if (pendingNegotiationRef.current) {
          pendingNegotiationRef.current = false;
          renegotiateRef.current();
        }
      } catch (err) {
        console.error('useCallNegotiation: applying answer failed', err);
        onError('answer-failed');
        negotiatingRef.current = false;
      }
    })();
  }, [
    role,
    call?.answer,
    call?.session,
    clearOfferTimeout,
    drainCandidates,
    reconcileRemoteMedia,
    startCall,
    onError,
    pcRef,
    sessionRef,
    remoteDescSetRef,
  ]);

  return { negotiatingRef, startCall, renegotiate, reset };
}
