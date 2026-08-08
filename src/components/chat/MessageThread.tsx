import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';
import { MessageBubble } from './MessageBubble';
import { dayKey, formatDayLabel } from '@/lib/chatFormat';
import type { ChatMessage } from '@/types';

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  /** Whose messages sit on the right. The viewer, or in the admin monitor the
   *  teacher — an admin is in neither side, so alignment follows the roles. */
  ownUid: string;
  /** Monitor view: uid → display name, so every bubble says who is talking. */
  senderNames?: Record<string, string>;
}

export function MessageThread({
  messages,
  loading,
  hasMore,
  onLoadMore,
  ownUid,
  senderNames,
}: Props) {
  const { t, i18n } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // The keyboard opening halves the thread's height without moving its scroll
  // position, which buries the newest message — the one you are answering.
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const toBottom = () => bottomRef.current?.scrollIntoView({ block: 'end' });
    viewport.addEventListener('resize', toBottom);
    return () => viewport.removeEventListener('resize', toBottom);
  }, []);

  if (loading) return <LoadingSpinner />;

  if (messages.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">
        {t('chat.emptyThread')}
      </p>
    );
  }

  // Precomputed instead of tracked with a running variable during render, so
  // the JSX stays a pure map over the data.
  const dayKeys = messages.map((m) => dayKey(m.createdAt));
  const startsDay = dayKeys.map((key, i) => key !== '' && key !== dayKeys[i - 1]);

  return (
    <>
      <div className="flex flex-col gap-2 px-4 py-4">
        {hasMore && (
          <div className="flex justify-center pb-2">
            <Button variant="ghost" size="sm" onClick={onLoadMore}>
              {t('chat.loadOlder')}
            </Button>
          </div>
        )}

        {messages.map((message, i) => {
          return (
            <Fragment key={message.id}>
              {startsDay[i] && (
                <div className="my-2 text-center text-[11px] text-muted-foreground">
                  {formatDayLabel(message.createdAt, i18n.language)}
                </div>
              )}
              <MessageBubble
                message={message}
                own={message.senderId === ownUid}
                senderLabel={
                  senderNames && (startsDay[i] || messages[i - 1]?.senderId !== message.senderId)
                    ? senderNames[message.senderId]
                    : undefined
                }
                onOpenImage={setLightbox}
              />
            </Fragment>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {lightbox && (
        <button
          type="button"
          aria-label={t('chat.closeImage')}
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
        >
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg" />
        </button>
      )}
    </>
  );
}
