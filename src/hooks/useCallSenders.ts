import { useCallback, useEffect, useMemo, useRef } from 'react';

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

interface Senders {
  audio: RTCRtpSender | null;
  camera: RTCRtpSender | null;
  screen: RTCRtpSender | null;
}

const noSenders = (): Senders => ({ audio: null, camera: null, screen: null });

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
    console.error('useCallSenders: setParameters failed', err);
  }
}

interface UseCallSendersInput {
  pcRef: React.RefObject<RTCPeerConnection | null>;
  localStream: MediaStream | null;
  /** Additive screen share, teacher only. Null when not sharing. */
  screenStream?: MediaStream | null;
  /**
   * Called when adding or dropping the screen track has left the connection
   * needing a fresh offer. Only the side allowed to offer should act on it.
   */
  onNegotiationNeeded?: () => void;
}

export interface CallSenders {
  /** Put this browser's tracks on a freshly built connection. */
  attach: (pc: RTCPeerConnection) => void;
  /** Forget the senders of a connection that is gone. */
  clear: () => void;
}

/**
 * Everything this browser *sends*: which sender carries which track, and how
 * the two of them are kept in step with the camera the user picked and the
 * screen they are sharing.
 *
 * Senders are remembered explicitly rather than looked up by `track.kind`,
 * which breaks the moment a screen share gives the connection two video
 * senders — both would resolve to the camera, and the screen would silently
 * carry a picture of the teacher's face.
 */
export function useCallSenders({
  pcRef,
  localStream,
  screenStream = null,
  onNegotiationNeeded,
}: UseCallSendersInput): CallSenders {
  const sendersRef = useRef<Senders>(noSenders());
  // Mirrored into refs so `attach` — which runs from a callback, long after
  // this render — sees the current streams without being rebuilt every time a
  // track is swapped.
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    screenStreamRef.current = screenStream;
  }, [screenStream]);

  const clear = useCallback(() => {
    sendersRef.current = noSenders();
  }, []);

  const attach = useCallback((pc: RTCPeerConnection) => {
    const senders = noSenders();
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
    const swap = (sender: RTCRtpSender | null, next: MediaStreamTrack | undefined) => {
      if (!sender || !next || next === sender.track) return;
      sender.replaceTrack(next).catch((err) =>
        console.error('useCallSenders: replaceTrack failed', err)
      );
    };
    swap(sendersRef.current.audio, localStream.getAudioTracks()[0]);
    swap(sendersRef.current.camera, localStream.getVideoTracks()[0]);
  }, [trackSignature, localStream, pcRef]);

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
  }, [screenStream, onNegotiationNeeded, pcRef]);

  // Stable: `teardown` and `create` depend on this, and they in turn are the
  // dependency of half the effects in `useCall`. A fresh object every render
  // would rebuild that whole chain on every heartbeat.
  return useMemo(() => ({ attach, clear }), [attach, clear]);
}
