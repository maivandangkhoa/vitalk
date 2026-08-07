import { useTranslation } from 'react-i18next';
import { formatMessageTime } from '@/lib/chatFormat';
import type { ChatMessage } from '@/types';

interface Props {
  message: ChatMessage;
  own: boolean;
  /** Monitor view: who sent this. Only set on the first bubble of a run. */
  senderLabel?: string;
  onOpenImage: (url: string) => void;
}

export function MessageBubble({ message, own, senderLabel, onOpenImage }: Props) {
  const { i18n } = useTranslation();

  return (
    <div className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
      {senderLabel && (
        <span className="mb-0.5 max-w-[78%] truncate px-1 text-[11px] font-medium text-muted-foreground">
          {senderLabel}
        </span>
      )}
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
          own
            ? 'rounded-br-sm bg-indigo-600 text-white'
            : 'rounded-bl-sm bg-white text-zinc-900 ring-1 ring-zinc-100'
        }`}
      >
        {message.type === 'image' && message.imageUrl && (
          <button
            type="button"
            onClick={() => onOpenImage(message.imageUrl as string)}
            className="mb-1 block overflow-hidden rounded-lg"
          >
            <img
              src={message.imageUrl}
              alt=""
              loading="lazy"
              className="max-h-64 w-auto max-w-full object-cover"
            />
          </button>
        )}
        {/* Rendered as text, never as HTML — user-authored content. */}
        {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}
        <span
          className={`mt-0.5 block text-right text-[10px] ${
            own ? 'text-indigo-100' : 'text-muted-foreground'
          }`}
        >
          {formatMessageTime(message.createdAt, i18n.language)}
        </span>
      </div>
    </div>
  );
}
