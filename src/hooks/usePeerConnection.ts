import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addCandidate,
  getConnectionRoute,
  markCallActive,
  recordRoute,
  type CallRole,
} from '@/lib/webrtc';
import { relayOnly, timeline } from '@/lib/callDebug';
import { useIceServers } from './useIceServers';
import { useCallSenders } from './useCallSenders';
import type { ConnectionRoute } from '@/types/call';

export type IceTrouble = 'disconnected' | 'failed' | null;

interface UsePeerConnectionInput {
  callId: string | undefined;
  uid: string | undefined;
  role: CallRole | null;
  localStream: MediaStream | null;
  /** Additive screen share, teacher only. Null when not sharing. */
  screenStream?: MediaStream | null;
  /**
   * Called when adding or dropping the screen track has left the connection
   * needing a fresh offer. Only the side allowed to offer should act on it.
   */
  onNegotiationNeeded?: () => void;
  onFatalError: (code: string) => void;
}

/** How long to keep asking the stats which route won, before giving up. */
const ROUTE_READ_ATTEMPTS = 10;
const ROUTE_READ_INTERVAL_MS = 1_000;

export interface PeerConnection {
  /** Live connection, or null between attempts. */
  pcRef: React.RefObject<RTCPeerConnection | null>;
  /** Generation currently being negotiated; -1 when there is none. */
  sessionRef: React.RefObject<number>;
  /** Whether a remote description has been applied to the current attempt. */
  remoteDescSetRef: React.RefObject<boolean>;
  candidateQueueRef: React.RefObject<RTCIceCandidateInit[]>;

  remoteStream: MediaStream | null;
  /** The other side's screen, when they are sharing it additively. */
  remoteScreenStream: MediaStream | null;
  route: ConnectionRoute;
  /** Media is actually flowing on this connection right now. */
  connected: boolean;
  negotiating: boolean;
  connecting: boolean;
  reconnecting: boolean;
  iceTrouble: IceTrouble;

  /** Fetch and cache the TURN credentials ahead of needing them. */
  warmIceServers: () => void;
  create: (session: number) => Promise<RTCPeerConnection | null>;
  teardown: () => void;
  /** Adopt the live connection for a new generation — an ICE restart. */
  adopt: (session: number) => RTCPeerConnection | null;
  /**
   * Give a connection that was built without TURN the credentials it missed.
   * Does nothing when it already has them.
   */
  repairIceServers: () => Promise<void>;
  acceptCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  drainCandidates: () => Promise<void>;
  /** Re-read what the peer is sending once a negotiation has settled. */
  reconcileRemoteMedia: () => void;
  setConnecting: (value: boolean) => void;
  setReconnecting: (value: boolean) => void;
}

/**
 * The `RTCPeerConnection` half of a call: creating it, wiring its events, and
 * the ICE-candidate queue.
 *
 * Split out from `useCall` so that the signaling logic — who offers, who is in
 * the lobby, when to ring — reads without the browser API interleaved through
 * it. The refs are handed back rather than hidden because the negotiation steps
 * genuinely need to reach the same connection.
 */
export function usePeerConnection({
  callId,
  uid,
  role,
  localStream,
  screenStream = null,
  onNegotiationNeeded,
  onFatalError,
}: UsePeerConnectionInput): PeerConnection {
  const fetchIceServers = useIceServers(callId);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionRef = useRef(-1);
  /**
   * Which `create` is the current one.
   *
   * Building a connection has to wait on the TURN credentials, and for the
   * seconds that takes `pcRef` is still empty — so a second `create` starting
   * in that window saw nothing to replace and built its own. Both then finished,
   * one overwrote the other in `pcRef`, and the loser stayed open forever:
   * holding the camera, gathering candidates and publishing them under the same
   * generation as the winner, whose peer then rejected every one of them.
   */
  const createTokenRef = useRef(0);
  /** The current connection was built on the STUN-only fallback, not real credentials. */
  const degradedIceRef = useRef(false);
  const remoteDescSetRef = useRef(false);
  const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  /** Identity of the inbound camera/mic stream — used to notice it was replaced. */
  const primaryStreamIdRef = useRef<string | null>(null);
  /**
   * The m-line the other side's camera arrives on. That, not the stream's
   * identity, is what separates camera from screen: a peer who reloads and
   * dials again sends the same camera on the same m-line under a brand new
   * stream id, and identity alone read that as a second screen.
   */
  const cameraMidRef = useRef<string | null>(null);

  // Everything this browser sends lives next door: which sender carries which
  // track, and keeping the two in step with the camera and the shared screen.
  const senders = useCallSenders({
    pcRef,
    localStream,
    screenStream,
    onNegotiationNeeded,
  });

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
  const [route, setRoute] = useState<ConnectionRoute>('unknown');
  const [connected, setConnected] = useState(false);
  const [negotiating, setNegotiating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [iceTrouble, setIceTrouble] = useState<IceTrouble>(null);

  // Mirrored into a ref so `create` — which runs from an event, long after this
  // render — sees the current stream without being rebuilt every time a track
  // is swapped.
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);

  const teardown = useCallback(() => {
    // Close the connection only. The tracks belong to `useCallMedia` and still
    // feed the local preview — stopping them here would kill the camera the
    // moment a re-dial starts.
    pcRef.current?.close();
    pcRef.current = null;
    // Abandons any `create` still waiting on its credentials. Without this a
    // room that was torn down mid-dial got a live connection handed back to it
    // a second later, with nothing left that would ever close it.
    createTokenRef.current++;
    degradedIceRef.current = false;
    candidateQueueRef.current = [];
    remoteDescSetRef.current = false;
    sessionRef.current = -1;
    senders.clear();
    primaryStreamIdRef.current = null;
    cameraMidRef.current = null;
    setRemoteStream(null);
    setRemoteScreenStream(null);
    setRoute('unknown');
    setConnected(false);
    setConnecting(false);
    setNegotiating(false);
    setIceTrouble(null);
    setReconnecting(false);
  }, [senders]);

  /**
   * Ask for the TURN credentials before anyone dials.
   *
   * `getIceServers` is a Cloud Run function with no traffic between lessons, so
   * the first call of the day pays a cold start — and it sat directly in front
   * of building the connection, on both sides in turn. Fetching it while people
   * are still in the lobby takes it off the path entirely; `useIceServers`
   * caches for as long as the credentials last.
   */
  const warmIceServers = useCallback(() => {
    fetchIceServers().catch(() => undefined);
  }, [fetchIceServers]);

  const create = useCallback(
    async (session: number) => {
      if (!callId || !uid) return null;

      // Claimed before the first await, so a second call knows it has been
      // superseded even though `pcRef` is empty for the whole wait.
      const token = ++createTokenRef.current;
      pcRef.current?.close();
      pcRef.current = null;

      const mark = timeline();
      const { iceServers, degraded } = await fetchIceServers();
      mark('ice servers');
      // A newer attempt started while this one was waiting. Returning before
      // the connection exists is what keeps it from being leaked.
      if (createTokenRef.current !== token) return null;

      // Most pairs connect straight to each other, so a TURN server that is
      // quietly broken looks perfectly healthy from the outside. `?ice=relay`
      // on both sides forbids every direct route, which is the only way to
      // prove the relay actually carries a lesson. Opt-in and per-tab: it makes
      // calls slower, so it must never be the default.
      const forceRelay = relayOnly();
      if (forceRelay && degraded) {
        // Relay-only with no relay to reach gathers nothing whatsoever. Saying
        // so is the whole point: silently building this connection produces the
        // exact symptom the flag exists to diagnose, and would have had someone
        // debugging coturn again for a credential fetch that simply failed.
        console.error('usePeerConnection: ?ice=relay, but no TURN credentials');
        onFatalError('ice-unavailable');
        return null;
      }

      const pc = new RTCPeerConnection({
        iceServers,
        ...(forceRelay ? { iceTransportPolicy: 'relay' as const } : {}),
      });
      degradedIceRef.current = degraded;
      pcRef.current = pc;
      candidateQueueRef.current = [];
      remoteDescSetRef.current = false;
      sessionRef.current = session;
      primaryStreamIdRef.current = null;
      cameraMidRef.current = null;
      setConnected(false);
      setNegotiating(true);

      senders.attach(pc);

      // Two inbound videos are told apart by the m-line they arrive on: the
      // first video transceiver is the camera, any later one is a screen. The
      // m-line survives renegotiation and re-dialling, whereas the stream's id
      // does not — a peer who reconnects sends the same camera under a new
      // stream id, and treating that as a screen left their dead tile on
      // screen next to the live one.
      pc.ontrack = (event) => {
        const incoming = event.streams[0];
        if (!incoming) return;
        const mid = event.transceiver.mid ?? null;
        mark(`track ${event.track.kind} mid=${mid}`);

        if (event.track.kind === 'video') {
          if (cameraMidRef.current === null) cameraMidRef.current = mid;

          if (mid !== cameraMidRef.current) {
            // Drop the screen again when it ends, so the layout does not keep
            // showing a frozen frame.
            setRemoteScreenStream(incoming);
            event.track.addEventListener('ended', () =>
              setRemoteScreenStream((shown) => (shown?.id === incoming.id ? null : shown))
            );
            return;
          }
        }

        // Camera or microphone: the primary stream. A different id here means
        // the other side rebuilt their media, so whatever screen was showing
        // belonged to a connection that no longer exists.
        if (primaryStreamIdRef.current && primaryStreamIdRef.current !== incoming.id) {
          setRemoteScreenStream(null);
        }
        primaryStreamIdRef.current = incoming.id;
        setRemoteStream(incoming);
      };

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        // Read the generation from the ref, not this closure: an ICE restart
        // reuses this connection under a new generation, and candidates tagged
        // with the old one are filtered out by the other side.
        addCandidate(callId, uid, sessionRef.current, event.candidate.toJSON()).catch(
          (err) => console.error('usePeerConnection: publishing candidate failed', err)
        );
      };

      pc.onicegatheringstatechange = () => mark(`gathering ${pc.iceGatheringState}`);

      pc.oniceconnectionstatechange = () => {
        // Same guard the connection-state handler carries: a replaced attempt
        // reporting `connected` would clear the reconnecting banner that
        // belongs to the connection actually being repaired.
        if (pcRef.current !== pc) return;
        const state = pc.iceConnectionState;
        mark(`ice ${state}`);
        setIceTrouble(state === 'disconnected' || state === 'failed' ? state : null);
        if (state === 'connected' || state === 'completed') setReconnecting(false);
      };

      pc.onconnectionstatechange = () => {
        // A connection that has already been replaced still fires its last
        // events; letting them through would report the dead attempt's state.
        if (pcRef.current !== pc) return;
        mark(`connection ${pc.connectionState}`);
        setConnected(pc.connectionState === 'connected');
        if (pc.connectionState === 'connected') {
          setConnecting(false);
          setReconnecting(false);
          markCallActive(callId).catch(() => undefined);
          // Stats trail the connection: at the instant this fires, the pair
          // that won is often not marked yet, and reading once left one side of
          // a relayed call showing nothing while the other showed the relay.
          // Ask again until it answers, then stop.
          let attempts = 0;
          const readRoute = async () => {
            if (pcRef.current !== pc || pc.connectionState !== 'connected') return;
            const next = await getConnectionRoute(pc);
            if (next === 'unknown') {
              if (++attempts < ROUTE_READ_ATTEMPTS) {
                setTimeout(() => void readRoute(), ROUTE_READ_INTERVAL_MS);
              }
              return;
            }
            setRoute(next);
            // Written down, not just displayed: the share of lessons that end
            // up relayed is what decides whether TURN bandwidth ever costs
            // anything, and it cannot be guessed from here.
            recordRoute(callId, next).catch(() => undefined);
          };
          void readRoute();
        }
        if (pc.connectionState === 'failed') {
          setConnecting(false);
          // The teacher is about to attempt an ICE restart, so a failure is not
          // yet news on that side. The student has nothing to try and should be
          // told straight away.
          if (role !== 'teacher') onFatalError('connection-failed');
        }
      };

      return pc;
    },
    [callId, uid, role, fetchIceServers, onFatalError, senders]
  );

  /**
   * Re-read what the other side is actually sending, once a negotiation has
   * settled.
   *
   * Dropping a screen share is `removeTrack` plus a re-offer, and that leaves
   * the receiving track *muted*, not ended — so a screen that stopped kept its
   * last black frame on the student's stage forever. The transceiver's
   * `currentDirection` is the honest answer, and it is only trustworthy once
   * both descriptions are in place, which is why this is called rather than
   * wired to an event.
   */
  const reconcileRemoteMedia = useCallback(() => {
    const pc = pcRef.current;
    if (!pc) return;
    const stillSharing = pc.getTransceivers().some(
      (transceiver) =>
        transceiver.receiver.track?.kind === 'video' &&
        transceiver.mid !== cameraMidRef.current &&
        (transceiver.currentDirection === 'sendrecv' ||
          transceiver.currentDirection === 'recvonly')
    );
    if (!stillSharing) setRemoteScreenStream(null);
  }, []);

  const adopt = useCallback((session: number) => {
    const pc = pcRef.current;
    if (!pc || pc.connectionState === 'closed') return null;
    sessionRef.current = session;
    remoteDescSetRef.current = false;
    candidateQueueRef.current = [];
    return pc;
  }, []);

  /**
   * Hand a connection the TURN credentials it was built without.
   *
   * The credentials come from a Cloud Run function that is idle between
   * lessons, so the first dial of the day can time out and fall back to STUN
   * alone. That fallback used to be permanent: an ICE restart reuses the same
   * connection, and nothing ever revisited its configuration — so a pair that
   * needed a relay could never get one for the rest of the lesson, however
   * quickly the credentials arrived afterwards.
   *
   * Only ever upgrades. A second failure leaves the connection exactly as it
   * is rather than replacing working credentials with the fallback.
   */
  const repairIceServers = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !degradedIceRef.current) return;
    try {
      const { iceServers, degraded } = await fetchIceServers();
      if (degraded || pcRef.current !== pc) return;
      pc.setConfiguration({
        iceServers,
        // Must match what the connection was created with — changing the
        // policy on a live connection is rejected outright.
        ...(relayOnly() ? { iceTransportPolicy: 'relay' as const } : {}),
      });
      degradedIceRef.current = false;
    } catch (err) {
      console.error('usePeerConnection: repairing ICE servers failed', err);
    }
  }, [fetchIceServers]);

  /** Feed a remote candidate, or hold it until there is a description to attach it to. */
  const acceptCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc || !remoteDescSetRef.current) {
      candidateQueueRef.current.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('usePeerConnection: addIceCandidate failed', err);
    }
  }, []);

  const drainCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const queued = candidateQueueRef.current;
    candidateQueueRef.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error('usePeerConnection: draining candidate failed', err);
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      pcRef.current = null;
      // The same invalidation `teardown` does. Closing what exists is not
      // enough: a `create` still waiting on its credentials would resolve after
      // this and hand a live connection to a component that is gone, left
      // gathering candidates and writing them to Firestore with nothing able to
      // close it.
      //
      // The lint rule below guards against reading a *DOM* ref that React has
      // already detached. This one is a counter, and its value at cleanup time
      // is precisely what has to be invalidated.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      createTokenRef.current++;
    };
  }, []);

  return {
    pcRef,
    sessionRef,
    remoteDescSetRef,
    candidateQueueRef,
    remoteStream,
    remoteScreenStream,
    route,
    connected,
    negotiating,
    connecting,
    reconnecting,
    iceTrouble,
    warmIceServers,
    create,
    teardown,
    adopt,
    repairIceServers,
    acceptCandidate,
    drainCandidates,
    reconcileRemoteMedia,
    setConnecting,
    setReconnecting,
  };
}
