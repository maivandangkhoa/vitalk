import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageCircle } from 'lucide-react';
import { useConversations } from '@/hooks/useConversations';
import { inboxPathFor } from '@/lib/chat';
import { useAuthStore } from '@/stores/authStore';

/**
 * Inbox shortcut with an unread badge. The badge counts the viewer's own
 * unread messages, so it has to link to the inbox those threads live in —
 * see `inboxPathFor`.
 */
export function MessagesLink() {
  const { t } = useTranslation();
  const { role } = useAuthStore();
  const { totalUnread } = useConversations();

  return (
    <Link
      to={inboxPathFor(role)}
      aria-label={t('chat.title')}
      className="relative flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-indigo-50 hover:text-indigo-600"
    >
      <MessageCircle className="h-5 w-5" />
      {totalUnread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
          {totalUnread > 9 ? '9+' : totalUnread}
        </span>
      )}
    </Link>
  );
}
