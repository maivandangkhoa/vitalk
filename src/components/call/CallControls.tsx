import { useTranslation } from 'react-i18next';
import {
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ConnectionRoute } from '@/types/call';

interface CallControlsProps {
  micOn: boolean;
  camOn: boolean;
  sharing: boolean;
  canShare: boolean;
  route: ConnectionRoute;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleShare: () => void;
  onLeave: () => void;
}

function RouteBadge({ route }: { route: ConnectionRoute }) {
  const { t } = useTranslation('call');
  if (route === 'unknown') return null;
  // Relayed calls take a longer path and are the ones that feel laggy, so the
  // label is worth showing rather than hiding as an implementation detail.
  const relayed = route === 'relay';
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[0.7rem] font-medium',
        relayed ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'
      )}
    >
      {relayed ? t('route.relay') : t('route.direct')}
    </span>
  );
}

export function CallControls({
  micOn,
  camOn,
  sharing,
  canShare,
  route,
  onToggleMic,
  onToggleCam,
  onToggleShare,
  onLeave,
}: CallControlsProps) {
  const { t } = useTranslation('call');

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <Button
        size="icon-lg"
        variant={micOn ? 'secondary' : 'destructive'}
        onClick={onToggleMic}
        aria-label={micOn ? t('controls.muteMic') : t('controls.unmuteMic')}
        title={micOn ? t('controls.muteMic') : t('controls.unmuteMic')}
      >
        {micOn ? <Mic /> : <MicOff />}
      </Button>

      <Button
        size="icon-lg"
        variant={camOn ? 'secondary' : 'destructive'}
        onClick={onToggleCam}
        aria-label={camOn ? t('controls.stopVideo') : t('controls.startVideo')}
        title={camOn ? t('controls.stopVideo') : t('controls.startVideo')}
      >
        {camOn ? <Video /> : <VideoOff />}
      </Button>

      {canShare && (
        <Button
          size="icon-lg"
          variant={sharing ? 'default' : 'secondary'}
          onClick={onToggleShare}
          aria-label={sharing ? t('controls.stopShare') : t('controls.share')}
          title={sharing ? t('controls.stopShare') : t('controls.share')}
        >
          <MonitorUp />
        </Button>
      )}

      <Button size="lg" variant="destructive" onClick={onLeave}>
        <PhoneOff data-icon="inline-start" />
        {t('controls.leave')}
      </Button>

      <RouteBadge route={route} />
    </div>
  );
}
