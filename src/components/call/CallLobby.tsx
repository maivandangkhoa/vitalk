import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CallMedia } from '@/hooks/useCallMedia';

interface CallLobbyProps {
  media: CallMedia;
  peerName: string;
  /** The other side is already waiting in the room. */
  peerPresent: boolean;
  joined: boolean;
  joining: boolean;
  onJoin: () => void;
}

/**
 * Camera check before the lesson: see yourself, pick the right devices, then
 * step in. Worth its own screen — a student discovering their microphone is the
 * wrong one *after* the teacher picks up wastes the first minutes of a paid
 * lesson.
 */
export function CallLobby({
  media,
  peerName,
  peerPresent,
  joined,
  joining,
  onJoin,
}: CallLobbyProps) {
  const { t } = useTranslation('call');
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (el && el.srcObject !== media.stream) el.srcObject = media.stream;
  }, [media.stream]);

  if (media.error) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
        <h2 className="text-base font-semibold">{t(`mediaError.${media.error}.title`)}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(`mediaError.${media.error}.body`)}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-6 md:grid-cols-[1.4fr_1fr]">
      <div className="relative aspect-video overflow-hidden rounded-2xl bg-neutral-900">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full scale-x-[-1] object-cover"
        />
        {!media.camOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-900">
            <VideoOff className="size-8 text-neutral-500" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t('lobby.title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {peerPresent
              ? t('lobby.peerWaiting', { name: peerName })
              : t('lobby.peerAbsent', { name: peerName })}
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            size="icon-lg"
            variant={media.micOn ? 'secondary' : 'destructive'}
            onClick={media.toggleMic}
            aria-label={media.micOn ? t('controls.muteMic') : t('controls.unmuteMic')}
          >
            {media.micOn ? <Mic /> : <MicOff />}
          </Button>
          <Button
            size="icon-lg"
            variant={media.camOn ? 'secondary' : 'destructive'}
            onClick={media.toggleCam}
            aria-label={media.camOn ? t('controls.stopVideo') : t('controls.startVideo')}
          >
            {media.camOn ? <Video /> : <VideoOff />}
          </Button>
        </div>

        {media.cameras.length > 1 && (
          <DevicePicker
            label={t('lobby.camera')}
            options={media.cameras}
            onChange={media.switchCamera}
          />
        )}
        {media.microphones.length > 1 && (
          <DevicePicker
            label={t('lobby.microphone')}
            options={media.microphones}
            onChange={media.switchMicrophone}
          />
        )}

        <Button
          size="lg"
          className="mt-auto"
          disabled={!media.stream || joined || joining}
          onClick={onJoin}
        >
          {joining && <Loader2 className="animate-spin" data-icon="inline-start" />}
          {joined ? t('lobby.waiting') : t('lobby.enter')}
        </Button>
      </div>
    </div>
  );
}

interface DevicePickerProps {
  label: string;
  options: { deviceId: string; label: string }[];
  onChange: (deviceId: string) => Promise<void>;
}

function DevicePicker({ label, options, onChange }: DevicePickerProps) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <Select
        defaultValue={options[0]?.deviceId}
        onValueChange={(value) => {
          onChange(String(value)).catch((err) =>
            console.error('CallLobby: switching device failed', err)
          );
        }}
      >
        <SelectTrigger className="w-full">
          {/* Base UI renders the raw value unless told otherwise — without this
              the trigger shows the deviceId hash instead of the device name. */}
          <SelectValue>
            {(value) => options.find((o) => o.deviceId === value)?.label ?? ''}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.deviceId} value={option.deviceId}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
