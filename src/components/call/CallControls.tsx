import { useTranslation } from 'react-i18next';
import {
  Maximize,
  Mic,
  MicOff,
  MessageSquare,
  Minimize,
  MonitorUp,
  PhoneOff,
  RefreshCw,
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
  chatOpen: boolean;
  /** Unread messages in the lesson thread; only meaningful while chat is shut. */
  chatUnread: number;
  fullscreen: boolean;
  /** Absent where the browser has no element fullscreen (iOS Safari). */
  onToggleFullscreen?: () => void;
  /** Teacher only, and only while the media is not through. */
  onRedial?: () => void;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToggleShare: () => void;
  onToggleChat: () => void;
  onLeave: () => void;
}

function RouteBadge({ route }: { route: ConnectionRoute }) {
  const { t } = useTranslation('call');
  if (route === 'unknown') return null;
  // Relayed calls take a longer path and are the ones that feel laggy — worth
  // signalling, but as a dot rather than a sentence: which way the packets go
  // is not something a student can act on, and the words read as an error to
  // people who do not know what a relay is. The wording stays in the tooltip
  // and the label, where anyone who wants the detail can find it.
  const relayed = route === 'relay';
  const label = relayed ? t('route.relay') : t('route.direct');
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'size-2.5 shrink-0 rounded-full',
        relayed
          ? 'bg-amber-500 ring-4 ring-amber-500/15'
          : 'bg-emerald-500 ring-4 ring-emerald-500/15'
      )}
    />
  );
}

export function CallControls({
  micOn,
  camOn,
  sharing,
  canShare,
  route,
  chatOpen,
  chatUnread,
  fullscreen,
  onToggleFullscreen,
  onRedial,
  onToggleMic,
  onToggleCam,
  onToggleShare,
  onToggleChat,
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

      <Button
        size="icon-lg"
        variant={chatOpen ? 'default' : 'secondary'}
        onClick={onToggleChat}
        aria-label={chatOpen ? t('chat.close') : t('chat.open')}
        title={chatOpen ? t('chat.close') : t('chat.open')}
        className="relative"
      >
        <MessageSquare />
        {!chatOpen && chatUnread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[0.65rem] font-semibold text-white">
            {chatUnread > 9 ? '9+' : chatUnread}
          </span>
        )}
      </Button>

      {onToggleFullscreen && (
        <Button
          size="icon-lg"
          variant="secondary"
          onClick={onToggleFullscreen}
          aria-label={fullscreen ? t('controls.exitFullscreen') : t('controls.fullscreen')}
          title={fullscreen ? t('controls.exitFullscreen') : t('controls.fullscreen')}
        >
          {fullscreen ? <Minimize /> : <Maximize />}
        </Button>
      )}

      {/* The way out of a handshake that never completed: a fresh generation
          costs one round trip and is the only repair the teacher can make
          without both sides reloading. */}
      {onRedial && (
        <Button size="lg" variant="secondary" onClick={onRedial}>
          <RefreshCw data-icon="inline-start" />
          {t('controls.redial')}
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
