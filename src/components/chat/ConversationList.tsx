import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { counterpartOf, unreadFor } from '@/lib/chat';
import { formatChatTime } from '@/lib/chatFormat';
import type { Conversation } from '@/types';

interface Props {
  items: Conversation[];
  loading: boolean;
  selectedId?: string;
  viewerUid: string;
  /** Admin monitor: label rows by the pair, since the viewer is in neither side. */
  showBothSides?: boolean;
  onSelect: (conversation: Conversation) => void;
}

export function ConversationList({
  items,
  loading,
  selectedId,
  viewerUid,
  showBothSides = false,
  onSelect,
}: Props) {
  const { t, i18n } = useTranslation();

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        {t('chat.emptyInbox')}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100">
      {items.map((convo) => {
        const other = counterpartOf(convo, viewerUid);
        const unread = showBothSides ? 0 : unreadFor(convo, viewerUid);
        const title = showBothSides
          ? `${convo.studentName} · ${convo.teacherName}`
          : other.name;
        const preview = convo.lastMessage
          ? convo.lastMessage.type === 'image' && !convo.lastMessage.text
            ? t('chat.imageMessage')
            : convo.lastMessage.text
          : t('chat.noMessagesYet');

        return (
          <li key={convo.id}>
            <button
              type="button"
              onClick={() => onSelect(convo)}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 ${
                selectedId === convo.id ? 'bg-indigo-50/60' : ''
              }`}
            >
              <Avatar className="h-10 w-10 shrink-0">
                <AvatarImage src={other.photo} alt={other.name} />
                <AvatarFallback>{(title || '?').charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatChatTime(convo.lastMessage?.createdAt ?? convo.updatedAt, i18n.language)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`truncate text-xs ${
                      unread > 0 ? 'font-medium text-zinc-900' : 'text-muted-foreground'
                    }`}
                  >
                    {preview}
                  </span>
                  {unread > 0 && (
                    <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
