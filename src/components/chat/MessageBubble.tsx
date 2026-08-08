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
  const time = formatMessageTime(message.createdAt, i18n.language);
  const hasImage = message.type === 'image' && !!message.imageUrl;

  return (
    <div className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
      {senderLabel && (
        <span className="mb-0.5 max-w-[78%] truncate px-1 text-[11px] font-medium text-muted-foreground">
          {senderLabel}
        </span>
      )}
      {/* The padding lives on the text half, not on the bubble: a photo inset
          on all four sides reads as a framed picture rather than as the message
          itself, and its own corner radius nested inside the bubble's never
          looks right. Here the bubble clips the photo to its own corners. */}
      <div
        className={`max-w-[78%] overflow-hidden rounded-2xl text-sm shadow-sm ${
          own
            ? 'rounded-br-sm bg-indigo-600 text-white'
            : 'rounded-bl-sm bg-white text-zinc-900 ring-1 ring-zinc-100'
        }`}
      >
        {hasImage && (
          <button
            type="button"
            onClick={() => onOpenImage(message.imageUrl as string)}
            className="relative block"
          >
            <img
              src={message.imageUrl}
              alt=""
              loading="lazy"
              className="block max-h-64 w-auto max-w-full object-cover"
            />
            {/* With no caption underneath there is nothing to put the time on
                but a bare strip of bubble, so it rides the photo instead. */}
            {!message.text && (
              <span className="absolute right-1.5 bottom-1.5 rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] text-white">
                {time}
              </span>
            )}
          </button>
        )}

        {(message.text || !hasImage) && (
          <div className="px-3 py-2">
            {/* Rendered as text, never as HTML — user-authored content. */}
            {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}
            <span
              className={`mt-0.5 block text-right text-[10px] ${
                own ? 'text-indigo-100' : 'text-muted-foreground'
              }`}
            >
              {time}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
