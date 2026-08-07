import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addCandidate,
  getConnectionRoute,
  markCallActive,
  recordRoute,
  type CallRole,
} from '@/lib/webrtc';
import { useIceServers } from './useIceServers';
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

/**
 * How far the camera is scaled down while a screen is being shared. The screen
 * is what people are reading; the face becomes a thumbnail, the way it does in
 * every other conferencing tool. Without this the two videos compete for one
 * bandwidth estimate and the *screen* is what turns to mush.
 */
const SHARING_CAMERA_ENCODING = {
  scaleResolutionDownBy: 4,
  maxBitrate: 150_000,
  maxFramerate: 15,
} as const;

/** How long to keep asking the stats which route won, before giving up. */
const ROUTE_READ_ATTEMPTS = 10;
const ROUTE_READ_INTERVAL_MS = 1_000;

/**
 * Force every candidate through TURN, for verifying the relay works at all.
 *
 * Read per connection rather than once at module load, so it can be turned on
 * by editing the address bar and re-dialling.
 */
function relayOnly(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('ice') === 'relay';
}

async function setCameraEncoding(sender: RTCRtpSender, shrink: boolean) {
  try {
    const params = sender.getParameters();
    // A sender that has not negotiated yet has no encodings to configure.
    if (!params.encodings?.length) return;
    const encoding = params.encodings[0];
    if (shrink) {
      Object.assign(encoding, SHARING_CAMERA_ENCODING);
    } else {
      encoding.scaleResolutionDownBy = 1;
      delete encoding.maxBitrate;
      delete encoding.maxFramerate;
    }
    await sender.setParameters(params);
  } catch (err) {
    // Quality tuning is not worth failing a call over.
    console.error('usePeerConnection: setParameters failed', err);
  }
}

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
  // Which sender carries what. Looking senders up by `track.kind` breaks the
  // moment there are two video senders — both would resolve to the same track.
  const sendersRef = useRef<{
    audio: RTCRtpSender | null;
    camera: RTCRtpSender | null;
    screen: RTCRtpSender | null;
  }>({ audio: null, camera: null, screen: null });

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
    candidateQueueRef.current = [];
    remoteDescSetRef.current = false;
    sessionRef.current = -1;
    sendersRef.current = { audio: null, camera: null, screen: null };
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
  }, []);

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

      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({
        iceServers,
        // Most pairs connect straight to each other, so a TURN server that is
        // quietly broken looks perfectly healthy from the outside. `?ice=relay`
        // on both sides forbids every direct route, which is the only way to
        // prove the relay actually carries a lesson. Opt-in and per-tab: it
        // makes calls slower, so it must never be the default.
        ...(relayOnly() ? { iceTransportPolicy: 'relay' as const } : {}),
      });
      pcRef.current = pc;
      candidateQueueRef.current = [];
      remoteDescSetRef.current = false;
      sessionRef.current = session;
      primaryStreamIdRef.current = null;
      cameraMidRef.current = null;
      setConnected(false);
      setNegotiating(true);

      const senders = { audio: null, camera: null, screen: null } as {
        audio: RTCRtpSender | null;
        camera: RTCRtpSender | null;
        screen: RTCRtpSender | null;
      };
      const local = localStreamRef.current;
      if (local) {
        for (const track of local.getTracks()) {
          const sender = pc.addTrack(track, local);
          if (track.kind === 'audio') senders.audio = sender;
          else senders.camera = sender;
        }
      }
      // A re-dial while the screen is already up must carry it into the new
      // connection, or the share silently disappears on reconnect.
      const screen = screenStreamRef.current;
      const screenTrack = screen?.getVideoTracks()[0];
      if (screen && screenTrack) {
        senders.screen = pc.addTrack(screenTrack, screen);
        if (senders.camera) void setCameraEncoding(senders.camera, true);
      }
      sendersRef.current = senders;

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

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        setIceTrouble(state === 'disconnected' || state === 'failed' ? state : null);
        if (state === 'connected' || state === 'completed') setReconnecting(false);
      };

      pc.onconnectionstatechange = () => {
        // A connection that has already been replaced still fires its last
        // events; letting them through would report the dead attempt's state.
        if (pcRef.current !== pc) return;
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
    [callId, uid, role, fetchIceServers, onFatalError]
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

  // Keep the outgoing tracks in step with the local stream. Switching camera or
  // starting a screen share swaps a track inside the same stream, and
  // `replaceTrack` applies that to a live connection without renegotiating.
  const trackSignature = localStream
    ? localStream
        .getTracks()
        .map((t) => t.id)
        .join(',')
    : '';
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || !localStream) return;
    // Addressed through the remembered senders rather than by kind: with a
    // screen share running there are two video senders, and matching on kind
    // would hand both of them the camera track.
    const swap = (sender: RTCRtpSender | null, next: MediaStreamTrack | undefined) => {
      if (!sender || !next || next === sender.track) return;
      sender.replaceTrack(next).catch((err) =>
        console.error('usePeerConnection: replaceTrack failed', err)
      );
    };
    swap(sendersRef.current.audio, localStream.getAudioTracks()[0]);
    swap(sendersRef.current.camera, localStream.getVideoTracks()[0]);
  }, [trackSignature, localStream]);

  /**
   * Add or drop the screen as a second outgoing video. Both need a fresh offer,
   * which is why this is only ever wired up for the side allowed to offer.
   */
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc || pc.connectionState === 'closed') return;

    const senders = sendersRef.current;
    const screenTrack = screenStream?.getVideoTracks()[0];

    if (screenStream && screenTrack && !senders.screen) {
      senders.screen = pc.addTrack(screenTrack, screenStream);
      if (senders.camera) void setCameraEncoding(senders.camera, true);
      onNegotiationNeeded?.();
      return;
    }

    if (!screenStream && senders.screen) {
      pc.removeTrack(senders.screen);
      senders.screen = null;
      if (senders.camera) void setCameraEncoding(senders.camera, false);
      onNegotiationNeeded?.();
    }
  }, [screenStream, onNegotiationNeeded]);

  useEffect(() => {
    return () => {
      pcRef.current?.close();
      pcRef.current = null;
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
    acceptCandidate,
    drainCandidates,
    reconcileRemoteMedia,
    setConnecting,
    setReconnecting,
  };
}
