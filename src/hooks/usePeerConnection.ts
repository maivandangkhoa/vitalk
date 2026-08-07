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
  onFatalError: (code: string) => void;
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
  route: ConnectionRoute;
  negotiating: boolean;
  connecting: boolean;
  reconnecting: boolean;
  iceTrouble: IceTrouble;

  create: (session: number) => Promise<RTCPeerConnection | null>;
  teardown: () => void;
  /** Adopt the live connection for a new generation — an ICE restart. */
  adopt: (session: number) => RTCPeerConnection | null;
  acceptCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  drainCandidates: () => Promise<void>;
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
  onFatalError,
}: UsePeerConnectionInput): PeerConnection {
  const fetchIceServers = useIceServers(callId);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sessionRef = useRef(-1);
  const remoteDescSetRef = useRef(false);
  const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [route, setRoute] = useState<ConnectionRoute>('unknown');
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

  const teardown = useCallback(() => {
    // Close the connection only. The tracks belong to `useCallMedia` and still
    // feed the local preview — stopping them here would kill the camera the
    // moment a re-dial starts.
    pcRef.current?.close();
    pcRef.current = null;
    candidateQueueRef.current = [];
    remoteDescSetRef.current = false;
    sessionRef.current = -1;
    setRemoteStream(null);
    setRoute('unknown');
    setConnecting(false);
    setNegotiating(false);
    setIceTrouble(null);
    setReconnecting(false);
  }, []);

  const create = useCallback(
    async (session: number) => {
      if (!callId || !uid) return null;

      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      candidateQueueRef.current = [];
      remoteDescSetRef.current = false;
      sessionRef.current = session;
      setNegotiating(true);

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current as MediaStream);
      });

      pc.ontrack = (event) => {
        if (event.streams[0]) setRemoteStream(event.streams[0]);
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
        if (pc.connectionState === 'connected') {
          setConnecting(false);
          setReconnecting(false);
          markCallActive(callId).catch(() => undefined);
          getConnectionRoute(pc).then((next) => {
            setRoute(next);
            // Written down, not just displayed: the share of lessons that end
            // up relayed is what decides whether TURN bandwidth ever costs
            // anything, and it cannot be guessed from here.
            recordRoute(callId, next).catch(() => undefined);
          });
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
    for (const sender of pc.getSenders()) {
      const kind = sender.track?.kind;
      if (!kind) continue;
      const next = localStream.getTracks().find((t) => t.kind === kind);
      if (next && next !== sender.track) {
        sender.replaceTrack(next).catch((err) =>
          console.error('usePeerConnection: replaceTrack failed', err)
        );
      }
    }
  }, [trackSignature, localStream]);

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
    route,
    negotiating,
    connecting,
    reconnecting,
    iceTrouble,
    create,
    teardown,
    adopt,
    acceptCandidate,
    drainCandidates,
    setConnecting,
    setReconnecting,
  };
}
