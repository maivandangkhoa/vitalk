import { useCallback, useEffect, useRef, useState } from 'react';

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
}

export interface CallMedia {
  stream: MediaStream | null;
  error: string | null;
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  cameras: MediaDeviceOption[];
  microphones: MediaDeviceOption[];
  toggleMic: () => void;
  toggleCam: () => void;
  switchCamera: (deviceId: string) => Promise<void>;
  switchMicrophone: (deviceId: string) => Promise<void>;
  /** Swap the outgoing video track for the screen, or back to the camera. */
  toggleScreenShare: () => Promise<void>;
  stop: () => void;
}

const CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: true, noiseSuppression: true },
  video: { width: { ideal: 1280 }, height: { ideal: 720 } },
};

/**
 * The local camera and microphone, plus the controls that act on them.
 *
 * The stream identity never changes: switching device or sharing a screen
 * replaces *tracks* inside the same MediaStream. That matters because the
 * `<video>` element and the peer connection both hold a reference to it —
 * handing out a new stream would blank the preview and force a renegotiation
 * for what the user experiences as flipping a switch.
 */
export function useCallMedia(enabled: boolean): CallMedia {
  const streamRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [cameras, setCameras] = useState<MediaDeviceOption[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceOption[]>([]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    cameraTrackRef.current?.stop();
    streamRef.current = null;
    cameraTrackRef.current = null;
    setStream(null);
    setSharing(false);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function acquire() {
      try {
        // Labels are empty until permission is granted, so enumerate after.
        const media = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = media;
        setStream(media);
        setError(null);

        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const label = (d: MediaDeviceInfo, i: number) =>
          d.label || `${d.kind === 'videoinput' ? 'Camera' : 'Microphone'} ${i + 1}`;
        setCameras(
          devices
            .filter((d) => d.kind === 'videoinput')
            .map((d, i) => ({ deviceId: d.deviceId, label: label(d, i) }))
        );
        setMicrophones(
          devices
            .filter((d) => d.kind === 'audioinput')
            .map((d, i) => ({ deviceId: d.deviceId, label: label(d, i) }))
        );
      } catch (err) {
        if (cancelled) return;
        const name = (err as DOMException)?.name;
        setError(
          name === 'NotAllowedError'
            ? 'permission-denied'
            : name === 'NotFoundError'
              ? 'no-device'
              : 'unavailable'
        );
      }
    }

    acquire();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // The camera light staying on after the user navigates away is the kind of
  // bug people remember, so release on unmount and on a hard page exit.
  useEffect(() => {
    const release = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      cameraTrackRef.current?.stop();
    };
    window.addEventListener('pagehide', release);
    return () => {
      window.removeEventListener('pagehide', release);
      release();
    };
  }, []);

  const toggleMic = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  const toggleCam = useCallback(() => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCamOn(track.enabled);
  }, []);

  /** Put `next` in the stream in place of the current track of its kind. */
  const replaceTrack = useCallback((next: MediaStreamTrack) => {
    const media = streamRef.current;
    if (!media) return;
    const previous = media.getTracks().find((t) => t.kind === next.kind);
    if (previous) {
      media.removeTrack(previous);
      previous.stop();
    }
    media.addTrack(next);
    // Same MediaStream object, different contents — nudge React so consumers
    // that key off the stream re-read it.
    setStream(media);
  }, []);

  const switchDevice = useCallback(
    async (kind: 'video' | 'audio', deviceId: string) => {
      const constraints: MediaStreamConstraints =
        kind === 'video'
          ? { video: { deviceId: { exact: deviceId } } }
          : { audio: { deviceId: { exact: deviceId } } };
      const media = await navigator.mediaDevices.getUserMedia(constraints);
      const next = media.getTracks()[0];
      if (kind === 'video') {
        next.enabled = camOn;
        cameraTrackRef.current = null;
      } else {
        next.enabled = micOn;
      }
      replaceTrack(next);
    },
    [camOn, micOn, replaceTrack]
  );

  const switchCamera = useCallback(
    (deviceId: string) => switchDevice('video', deviceId),
    [switchDevice]
  );
  const switchMicrophone = useCallback(
    (deviceId: string) => switchDevice('audio', deviceId),
    [switchDevice]
  );

  const toggleScreenShare = useCallback(async () => {
    const media = streamRef.current;
    if (!media) return;

    if (sharing) {
      const camera = cameraTrackRef.current;
      cameraTrackRef.current = null;
      if (camera && camera.readyState === 'live') {
        camera.enabled = camOn;
        replaceTrack(camera);
      } else {
        const fresh = await navigator.mediaDevices.getUserMedia({ video: CONSTRAINTS.video });
        replaceTrack(fresh.getVideoTracks()[0]);
      }
      setSharing(false);
      return;
    }

    const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = display.getVideoTracks()[0];

    // Park the camera track instead of stopping it: re-acquiring the camera
    // prompts again on some browsers and takes a visible moment.
    const camera = media.getVideoTracks()[0] ?? null;
    if (camera) media.removeTrack(camera);
    cameraTrackRef.current = camera;
    media.addTrack(screenTrack);
    setStream(media);
    setSharing(true);

    // "Stop sharing" from the browser's own bar bypasses our button entirely.
    screenTrack.addEventListener('ended', () => {
      const parked = cameraTrackRef.current;
      cameraTrackRef.current = null;
      const current = streamRef.current;
      if (!current) return;
      current.removeTrack(screenTrack);
      if (parked && parked.readyState === 'live') current.addTrack(parked);
      setStream(current);
      setSharing(false);
    });
  }, [sharing, camOn, replaceTrack]);

  return {
    stream,
    error,
    micOn,
    camOn,
    sharing,
    cameras,
    microphones,
    toggleMic,
    toggleCam,
    switchCamera,
    switchMicrophone,
    toggleScreenShare,
    stop,
  };
}
