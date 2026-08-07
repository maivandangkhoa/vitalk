import { useEffect, useRef, useState } from 'react';
import { MicOff, VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoTileProps {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  /**
   * A shared screen must never be cropped — the toolbar or the line being
   * pointed at is usually right at the edge.
   */
  contain?: boolean;
  /** Fired the first time this element actually has a picture to show. */
  onFirstFrame?: () => void;
  className?: string;
}

/**
 * `srcObject` is a property, not an attribute, so React cannot set it from JSX
 * — every video element in the app needs this effect.
 */
function VideoTile({
  stream,
  muted,
  mirrored,
  contain,
  onFirstFrame,
  className,
}: VideoTileProps) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    // `autoPlay` alone is a request the browser may refuse — a remote tile
    // carries sound, and autoplay with sound is blocked until the page has been
    // interacted with. Asking explicitly (and again on every stream change)
    // starts the picture that would otherwise sit black waiting for a click.
    el.play().catch(() => undefined);
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      onLoadedData={onFirstFrame}
      // Without `playsInline` iOS Safari hijacks the video into its fullscreen
      // player the moment it starts, which ends the lesson layout.
      playsInline
      muted={muted}
      className={cn(
        'h-full w-full',
        contain ? 'object-contain' : 'object-cover',
        mirrored && 'scale-x-[-1]',
        className
      )}
    />
  );
}

interface VideoStageProps {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  /**
   * A screen being shared as a second video — either the one this browser is
   * sending, or the one arriving from the other side.
   */
  screenStream?: MediaStream | null;
  /** Caption for the screen tile, e.g. "Nam's screen". */
  screenLabel?: string;
  peerName: string;
  micOn: boolean;
  camOn: boolean;
  /** Shown over the remote tile while the other side is not through yet. */
  placeholder: string;
  /** Banner text while the connection is being repaired; null when it is fine. */
  reconnectingLabel: string | null;
  /** Double-clicking the picture is what people try first for fullscreen. */
  onToggleFullscreen?: () => void;
}

export function VideoStage({
  localStream,
  remoteStream,
  screenStream = null,
  screenLabel,
  peerName,
  micOn,
  camOn,
  placeholder,
  reconnectingLabel,
  onToggleFullscreen,
}: VideoStageProps) {
  // Whoever is sharing, the screen takes the big tile: it is the thing being
  // read. The faces move to thumbnails, which is also why the camera is sent at
  // a fraction of its usual bitrate while this is on.
  const sharing = !!screenStream;

  // A remote track exists from the moment the descriptions are exchanged, but
  // no picture arrives until ICE and DTLS have finished — several seconds on a
  // phone network. Showing the tile straight away meant staring at a black
  // rectangle with a name on it, which reads as a call that has gone wrong.
  // Remembered as the stream's id rather than a boolean, so a peer who
  // reconnects is waited for again instead of inheriting the last one's frame.
  const [framedId, setFramedId] = useState<string | null>(null);
  const remoteId = remoteStream?.id ?? null;
  const remoteReady = !!remoteId && framedId === remoteId;

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-2xl bg-neutral-900"
      onDoubleClick={onToggleFullscreen}
    >
      {sharing ? (
        <VideoTile stream={screenStream} contain muted />
      ) : remoteStream ? (
        <VideoTile stream={remoteStream} onFirstFrame={() => setFramedId(remoteId)} />
      ) : null}

      {/* Kept over the tile rather than instead of it: the video element has to
          be mounted and playing for the first frame to ever arrive. */}
      {!sharing && !remoteReady && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="text-sm text-neutral-400">{placeholder}</p>
        </div>
      )}

      {((remoteStream && remoteReady) || sharing) && (
        <div className="absolute top-3 left-3 rounded-lg bg-black/50 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">
          {sharing ? screenLabel : peerName}
        </div>
      )}

      {/* The picture freezes on its own during a repair; saying so is what
          stops the other person from hanging up and starting over. */}
      {reconnectingLabel && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-lg bg-amber-500/90 px-3 py-1 text-xs font-medium text-white shadow">
          {reconnectingLabel}
        </div>
      )}

      <div className="absolute right-3 bottom-3 flex items-end gap-2">
        {/* While a screen is up the other person's face moves down here beside
            the self-view. This tile is deliberately not muted: the remote audio
            rides on this stream, and the big tile is only pixels. */}
        {sharing && remoteStream && (
          <div className="relative h-28 w-20 overflow-hidden rounded-xl border border-white/10 bg-neutral-800 shadow-lg sm:h-36 sm:w-52">
            <VideoTile stream={remoteStream} />
            <div className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {peerName}
            </div>
          </div>
        )}

        {/* Own preview, mirrored the way a mirror would show it — an unmirrored
            self-view reads as wrong to almost everyone. */}
        <div className="relative h-28 w-20 overflow-hidden rounded-xl border border-white/10 bg-neutral-800 shadow-lg sm:h-36 sm:w-52">
          {camOn && localStream ? (
            <VideoTile stream={localStream} muted mirrored />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <VideoOff className="size-5 text-neutral-500" />
            </div>
          )}
          {!micOn && (
            <div className="absolute top-1.5 left-1.5 rounded-md bg-black/60 p-1">
              <MicOff className="size-3 text-white" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
