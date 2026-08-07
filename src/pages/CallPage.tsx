import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Helmet } from 'react-helmet-async';
import { useAuthStore } from '@/stores/authStore';
import { useBooking } from '@/hooks/useBookings';
import { useCall } from '@/hooks/useCall';
import { useCallMedia } from '@/hooks/useCallMedia';
import { useCallChat } from '@/hooks/useCallChat';
import { roleOf } from '@/lib/webrtc';
import { cn } from '@/lib/utils';
import { callWindowState, formatCountdown, isCallableBooking, joinWindow } from '@/lib/callWindow';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { CallLobby } from '@/components/call/CallLobby';
import { CallChatPanel } from '@/components/call/CallChatPanel';
import { CallControls } from '@/components/call/CallControls';
import { IncomingCallDialog } from '@/components/call/IncomingCallDialog';
import { VideoStage } from '@/components/call/VideoStage';

/** A card for every reason the classroom cannot be entered. */
function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 text-center">
      <h1 className="text-base font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default function CallPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { t } = useTranslation('call');
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuthStore();
  const { booking, loading, notFound } = useBooking(bookingId);

  const role = booking && user ? roleOf(booking, user.uid) : null;
  const [now, setNow] = useState(() => new Date());
  const [joining, setJoining] = useState(false);
  // Shut by default: the video is what the lesson is for, and the unread badge
  // is enough to notice a message that does arrive.
  const [chatOpen, setChatOpen] = useState(false);

  // Fullscreen covers the whole classroom — video, chat and the control bar —
  // not just the video element, otherwise the buttons disappear with it.
  const roomRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  // iOS Safari has no element fullscreen; hide the control rather than offer a
  // button that throws.
  const canFullscreen =
    typeof document !== 'undefined' &&
    typeof document.documentElement.requestFullscreen === 'function';

  useEffect(() => {
    // Escape and the browser's own chrome exit fullscreen without telling us,
    // so the icon follows the document rather than our own click.
    const sync = () => setFullscreen(document.fullscreenElement === roomRef.current);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      roomRef.current
        ?.requestFullscreen()
        .catch(() => toast.error(t('errors.fullscreenFailed')));
    }
  };

  // Drives the countdown, and re-opens the page by itself when the lesson's
  // start time arrives — nobody should have to reload to get in.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const window = useMemo(
    () => (booking ? callWindowState(booking, now) : null),
    [booking, now]
  );
  const roomOpen = !!booking && !!role && isCallableBooking(booking) && window === 'open';

  // Camera and microphone are only acquired once the room is genuinely open, so
  // an early arrival does not light up a webcam for ten minutes.
  // Only the teacher shares additively. That is not a product preference: the
  // second video needs a renegotiation, and the rules let only the teacher
  // write `offer`. The student keeps the replacement share, which needs none.
  const media = useCallMedia(roomOpen, { additiveShare: role === 'teacher' });
  const session = useCall({
    booking,
    uid: user?.uid,
    role,
    localStream: media.stream,
    screenStream: media.screenStream,
  });
  const chat = useCallChat(booking, user);

  const peerName = role === 'teacher' ? booking?.studentName ?? '' : booking?.teacherName ?? '';

  const handleJoin = async () => {
    setJoining(true);
    try {
      await session.join();
    } catch (err) {
      console.error('CallPage: joining failed', err);
      toast.error(t('errors.joinFailed'));
    } finally {
      setJoining(false);
    }
  };

  const handleLeave = async () => {
    await session.leave();
    media.stop();
    navigate(role === 'teacher' ? '/admin/bookings' : '/my-bookings');
  };

  useEffect(() => {
    if (session.error) toast.error(t(`errors.${session.error}`, { defaultValue: t('errors.generic') }));
  }, [session.error, t]);

  if (authLoading || loading) return <LoadingSpinner />;

  if (!user) {
    return <Notice title={t('gate.signedOut.title')} body={t('gate.signedOut.body')} />;
  }
  // A booking that is not yours is indistinguishable from one that does not
  // exist — deliberately, so ids cannot be probed from this page.
  if (notFound || !booking || !role) {
    return <Notice title={t('gate.notFound.title')} body={t('gate.notFound.body')} />;
  }
  if (!isCallableBooking(booking)) {
    return <Notice title={t('gate.notCallable.title')} body={t('gate.notCallable.body')} />;
  }
  if (window === 'over') {
    return <Notice title={t('gate.over.title')} body={t('gate.over.body')} />;
  }
  if (window === 'early') {
    const { opensAt } = joinWindow(booking);
    return (
      <Notice
        title={t('gate.early.title')}
        body={t('gate.early.body', {
          countdown: formatCountdown(opensAt.getTime() - now.getTime()),
        })}
      />
    );
  }

  const inCall = !!session.remoteStream || session.status === 'active';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <Helmet>
        <title>{t('meta.title', { name: peerName })}</title>
      </Helmet>

      {inCall ? (
        <div
          ref={roomRef}
          className={cn(
            'flex flex-col gap-4',
            fullscreen && 'h-full bg-neutral-950 p-4'
          )}
        >
          {/* Chat sits beside the video from `lg` up and underneath it below
              that — a phone has no room for two columns. */}
          <div className={cn('flex flex-col gap-4 lg:flex-row', fullscreen && 'min-h-0 flex-1')}>
            <div
              className={cn(
                'min-w-0 flex-1',
                fullscreen ? 'min-h-0' : 'h-[60vh] min-h-80 md:h-[70vh]'
              )}
            >
              <VideoStage
                localStream={media.stream}
                remoteStream={session.remoteStream}
                // Whichever exists: the teacher sees the screen they are
                // sending, the student the one arriving.
                screenStream={media.screenStream ?? session.remoteScreenStream}
                screenLabel={
                  media.screenStream
                    ? t('stage.yourScreen')
                    : t('stage.peerScreen', { name: peerName })
                }
                peerName={peerName}
                micOn={media.micOn}
                camOn={media.camOn}
                placeholder={t('stage.connecting')}
                reconnectingLabel={session.reconnecting ? t('stage.reconnecting') : null}
                onToggleFullscreen={canFullscreen ? toggleFullscreen : undefined}
              />
            </div>

            {chatOpen && chat.conversationId && (
              <CallChatPanel
                conversationId={chat.conversationId}
                conversation={chat.conversation}
                viewerUid={user.uid}
                peerName={peerName}
                onEnsureConversation={chat.ensure}
                onClose={() => setChatOpen(false)}
                className={cn(
                  'shrink-0 lg:w-80 xl:w-96',
                  fullscreen ? 'h-[35vh] lg:h-auto' : 'h-[50vh] lg:h-[70vh]'
                )}
              />
            )}
          </div>
          <CallControls
            micOn={media.micOn}
            camOn={media.camOn}
            sharing={media.sharing}
            canShare={typeof navigator.mediaDevices?.getDisplayMedia === 'function'}
            route={session.route}
            chatOpen={chatOpen}
            chatUnread={chat.unread}
            fullscreen={fullscreen}
            onToggleFullscreen={canFullscreen ? toggleFullscreen : undefined}
            onToggleMic={media.toggleMic}
            onToggleCam={media.toggleCam}
            onToggleChat={() => setChatOpen((open) => !open)}
            onToggleShare={() =>
              media
                .toggleScreenShare()
                .catch(() => toast.error(t('errors.shareFailed')))
            }
            onLeave={handleLeave}
          />
        </div>
      ) : (
        <CallLobby
          media={media}
          peerName={peerName}
          peerPresent={session.peerPresent}
          joined={session.joined}
          joining={joining || session.connecting}
          onJoin={handleJoin}
        />
      )}

      <IncomingCallDialog
        open={session.incoming}
        studentName={peerName}
        onAccept={() => session.accept()}
        onDecline={() => session.decline()}
      />
    </div>
  );
}
