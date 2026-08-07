import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { MessageThread } from '@/components/chat/MessageThread';
import { MessageComposer } from '@/components/chat/MessageComposer';
import { useMessages } from '@/hooks/useMessages';
import { otherParticipant, unreadFor } from '@/lib/chat';
import { UNREAD_SEND_LIMIT } from '@/types/chat';
import { cn } from '@/lib/utils';
import type { Conversation } from '@/types';

interface Props {
  conversationId: string;
  /** Null until the pair have ever written to each other. */
  conversation: Conversation | null;
  viewerUid: string;
  peerName: string;
  /** Creates the thread on the first message — see `useCallChat`. */
  onEnsureConversation: () => Promise<void>;
  onClose: () => void;
  className?: string;
}

/**
 * The chat column beside the video. Deliberately the same thread, bubbles and
 * composer as `/messages`: someone who has used the inbox already knows this,
 * and a message sent here is not a different kind of message.
 */
export function CallChatPanel({
  conversationId,
  conversation,
  viewerUid,
  peerName,
  onEnsureConversation,
  onClose,
  className,
}: Props) {
  const { t } = useTranslation('call');
  const { messages, loading, hasMore, loadMore } = useMessages(conversation);

  // Same rule the server enforces: once this many of my messages sit unread,
  // the write is refused. Say so rather than letting the send fail.
  const throttled =
    !!conversation &&
    unreadFor(conversation, otherParticipant(conversation, viewerUid)) >= UNREAD_SEND_LIMIT;

  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card',
        className
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{t('chat.title')}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {t('chat.with', { name: peerName })}
          </p>
        </div>
        <button
          type="button"
          aria-label={t('chat.close')}
          onClick={onClose}
          className="rounded-full p-1 text-muted-foreground hover:bg-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-zinc-50/60">
        <MessageThread
          messages={messages}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          viewerUid={viewerUid}
        />
      </div>

      <MessageComposer
        conversationId={conversationId}
        senderId={viewerUid}
        blocked={throttled}
        onBeforeSend={onEnsureConversation}
        placeholder={t('chat.placeholder')}
      />
    </aside>
  );
}
