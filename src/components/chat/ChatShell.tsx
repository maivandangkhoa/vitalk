import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';
import { MessageComposer } from './MessageComposer';
import { useConversations } from '@/hooks/useConversations';
import { useMessages } from '@/hooks/useMessages';
import { useMobileFullscreen } from '@/hooks/useMobileFullscreen';
import { counterpartOf, otherParticipant, unreadFor } from '@/lib/chat';
import { UNREAD_SEND_LIMIT } from '@/types/chat';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

interface Props {
  /** Route prefix the list links into: `/messages` or `/admin/messages`. */
  basePath: string;
  /** Admin monitor: every conversation, no composer. */
  monitor?: boolean;
}

/**
 * The whole chat UI, one component for both shells. Students get it inside the
 * public layout at `/messages`; teachers and admins get the same thing inside
 * the admin layout. Two columns on desktop; on mobile the selected id decides
 * which of the two is on screen — and an open thread takes over the screen
 * entirely, the way every other messaging app on the phone behaves.
 */
export function ChatShell({ basePath, monitor = false }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const { user } = useAuthStore();

  const { items, loading, byId } = useConversations({ all: monitor });
  const active = byId(conversationId);
  const { messages, loading: loadingMessages, hasMore, loadMore } = useMessages(active);

  // A stale or foreign id in the URL should not leave the pane blank forever.
  useEffect(() => {
    if (!loading && conversationId && !active) navigate(basePath, { replace: true });
  }, [loading, conversationId, active, basePath, navigate]);

  // An open thread on the phone owns the whole viewport, keyboard included.
  const fullscreen = useMobileFullscreen(!!active);

  if (!user) return null;

  const other = active ? counterpartOf(active, user.uid) : null;
  const isParticipant = !!active && active.participants.includes(user.uid);
  // The monitor is a window onto other people's threads, so it never composes —
  // not even in the odd thread the admin is a party to. Their own conversations
  // live at `/messages`, where they are a student like anyone else.
  const canReply = !monitor && isParticipant;
  // The rules refuse the write once this many of my messages sit unread, so
  // say why up front instead of letting the send fail.
  const throttled =
    !!active &&
    canReply &&
    unreadFor(active, otherParticipant(active, user.uid)) >= UNREAD_SEND_LIMIT;

  return (
    <div
      className={cn(
        'flex overflow-hidden border-zinc-100 bg-white',
        // Sized to the *visual* viewport rather than the screen, so the
        // composer lands on top of the keyboard instead of under it. See
        // `useMobileFullscreen` — it also freezes the page behind, which is
        // what stops the site header and footer scrolling into the thread.
        // The viewport-tall frame is a *desktop* idea — there it holds the two
        // columns side by side. On a phone the inbox is just a list, so it
        // takes the height of its rows and the page scrolls; a fixed frame
        // there draws a screen-tall box around a single conversation.
        fullscreen
          ? 'fixed inset-x-0 top-0 z-[60] h-[var(--app-vh,100dvh)] translate-y-[var(--app-vv-top,0px)]'
          : 'rounded-2xl border shadow-sm md:h-[calc(100dvh-9rem)]'
      )}
    >
      <aside
        className={`w-full shrink-0 overflow-y-auto border-r border-zinc-100 md:w-80 ${
          active ? 'hidden md:block' : 'block'
        }`}
      >
        <div className="border-b border-zinc-100 px-4 py-3">
          <h1 className="text-sm font-semibold">
            {monitor ? t('chat.monitorTitle') : t('chat.title')}
          </h1>
          {/* Explains the arrow in every row once, instead of repeating the
              two role words on rows that are already tight. */}
          {monitor && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t('chat.roleStudent')} → {t('chat.roleTeacher')}
            </p>
          )}
        </div>
        <ConversationList
          items={items}
          loading={loading}
          selectedId={active?.id}
          viewerUid={user.uid}
          showBothSides={monitor}
          onSelect={(c) => navigate(`${basePath}/${c.id}`)}
        />
      </aside>

      <section className={`flex min-w-0 flex-1 flex-col ${active ? 'flex' : 'hidden md:flex'}`}>
        {!active ? (
          <p className="m-auto px-6 text-center text-sm text-muted-foreground">
            {t('chat.selectConversation')}
          </p>
        ) : (
          <>
            <header className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3">
              <button
                type="button"
                aria-label={t('chat.back')}
                onClick={() => navigate(basePath)}
                className="md:hidden"
              >
                <ArrowLeft className="h-5 w-5 text-muted-foreground" />
              </button>
              {monitor ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Party
                    name={active.studentName}
                    photo={active.studentPhoto}
                    role={t('chat.roleStudent')}
                  />
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <Party
                    name={active.teacherName}
                    photo={active.teacherPhoto}
                    role={t('chat.roleTeacher')}
                  />
                </div>
              ) : (
                <>
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={other?.photo} alt={other?.name} />
                    <AvatarFallback>
                      {(other?.name || '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{other?.name}</p>
                  </div>
                </>
              )}
              {/* Read-only for every thread in the monitor; elsewhere it
                  follows participation, so an admin who also teaches can
                  answer their own students. */}
              {!canReply && (
                <span className="ml-auto shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {t('chat.readOnly')}
                </span>
              )}
            </header>

            {/* `overscroll-contain`: reaching the end of the thread must not
                hand the gesture to the page behind it. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-zinc-50/60">
              <MessageThread
                messages={messages}
                loading={loadingMessages}
                hasMore={hasMore}
                onLoadMore={loadMore}
                // A monitor is neither party, so the teacher takes the right
                // side and every bubble carries a name.
                ownUid={monitor ? active.teacherId : user.uid}
                senderNames={
                  monitor
                    ? {
                        [active.studentId]: active.studentName,
                        [active.teacherId]: active.teacherName,
                      }
                    : undefined
                }
              />
            </div>

            {canReply ? (
              <MessageComposer
                conversationId={active.id}
                senderId={user.uid}
                blocked={throttled}
              />
            ) : (
              <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3">
                <p className="text-xs text-muted-foreground">{t('chat.readOnly')}</p>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

/** One side of a monitored conversation: face, name, and which role it is. */
function Party({ name, photo, role }: { name: string; photo?: string; role: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="h-9 w-9 shrink-0">
        <AvatarImage src={photo} alt={name} />
        <AvatarFallback>{(name || '?').charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{role}</p>
      </div>
    </div>
  );
}
