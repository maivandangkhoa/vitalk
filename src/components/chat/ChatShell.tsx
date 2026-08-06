import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';
import { MessageComposer } from './MessageComposer';
import { useConversations } from '@/hooks/useConversations';
import { useMessages } from '@/hooks/useMessages';
import { counterpartOf, otherParticipant, unreadFor } from '@/lib/chat';
import { UNREAD_SEND_LIMIT } from '@/types/chat';
import { useAuthStore } from '@/stores/authStore';

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
 * which of the two is on screen.
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

  if (!user) return null;

  const other = active ? counterpartOf(active, user.uid) : null;
  const isParticipant = !!active && active.participants.includes(user.uid);
  // The rules refuse the write once this many of my messages sit unread, so
  // say why up front instead of letting the send fail.
  const throttled =
    !!active &&
    isParticipant &&
    unreadFor(active, otherParticipant(active, user.uid)) >= UNREAD_SEND_LIMIT;

  return (
    <div className="flex h-[calc(100vh-9rem)] overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
      <aside
        className={`w-full shrink-0 overflow-y-auto border-r border-zinc-100 md:w-80 ${
          active ? 'hidden md:block' : 'block'
        }`}
      >
        <div className="border-b border-zinc-100 px-4 py-3">
          <h1 className="text-sm font-semibold">
            {monitor ? t('chat.monitorTitle') : t('chat.title')}
          </h1>
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
              <Avatar className="h-9 w-9">
                <AvatarImage src={other?.photo} alt={other?.name} />
                <AvatarFallback>
                  {(other?.name || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {monitor ? `${active.studentName} · ${active.teacherName}` : other?.name}
                </p>
                {/* An admin who also teaches is a participant in their own
                    threads, so read-only follows participation, not role. */}
                {!isParticipant && (
                  <p className="text-[11px] text-muted-foreground">{t('chat.readOnly')}</p>
                )}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60">
              <MessageThread
                messages={messages}
                loading={loadingMessages}
                hasMore={hasMore}
                onLoadMore={loadMore}
                viewerUid={user.uid}
              />
            </div>

            {isParticipant ? (
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
