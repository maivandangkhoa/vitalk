import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { sendImageMessage, sendTextMessage } from '@/lib/chat';
import { MAX_MESSAGE_LENGTH } from '@/types/chat';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * The button in the right-hand slot is exactly as tall as the collapsed field
 * beside it (`min-h-11` there, 44px), so the row reads as one control rather
 * than a field with something smaller bolted on. 44px is also the smallest
 * comfortable tap target on a phone.
 */
const SLOT = 'size-11 rounded-2xl';

interface Props {
  conversationId: string;
  senderId: string;
  /** Set while the sender is throttled — the rules would reject the write. */
  blocked?: boolean;
  /**
   * Awaited before the first write. Lets a caller create the conversation only
   * once someone actually types, instead of on merely opening the panel.
   */
  onBeforeSend?: () => Promise<void>;
  placeholder?: string;
}

export function MessageComposer({
  conversationId,
  senderId,
  blocked = false,
  onBeforeSend,
  placeholder,
}: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const clearImage = () => {
    if (preview) URL.revokeObjectURL(preview);
    setImage(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('chat.imageOnly'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t('chat.imageTooLarge'));
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setImage(file);
    setPreview(URL.createObjectURL(file));
  };

  const send = async () => {
    if (sending || blocked) return;
    if (!image && !text.trim()) return;

    setSending(true);
    try {
      await onBeforeSend?.();
      if (image) {
        await sendImageMessage(conversationId, senderId, image, text);
        clearImage();
      } else {
        await sendTextMessage(conversationId, senderId, text);
      }
      setText('');
      if (textRef.current) textRef.current.style.height = 'auto';
    } catch (err) {
      console.error('send message error', err);
      // A rejected write here is almost always the unread throttle.
      toast.error(t('chat.sendFailed'));
    } finally {
      setSending(false);
    }
  };

  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  // What decides which button the right-hand slot shows. Deliberately "is there
  // anything to send" rather than "is the field focused": on a phone the field
  // stays focused for the whole conversation, so focus would park a disabled
  // send button there and leave no way to reach the image picker at all.
  const canSend = !!image || !!text.trim();

  if (blocked) {
    return (
      <div className="border-t border-zinc-100 bg-amber-50/60 px-4 py-3">
        <p className="text-xs text-amber-800">{t('chat.throttled')}</p>
      </div>
    );
  }

  return (
    <div className="border-t border-zinc-100 bg-white px-3 py-2">
      {preview && (
        <div className="relative mb-2 inline-block">
          <img src={preview} alt="" className="max-h-28 rounded-lg" />
          <button
            type="button"
            onClick={clearImage}
            aria-label={t('chat.removeImage')}
            className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900/80 text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => pickImage(e.target.files?.[0])}
        />

        <textarea
          ref={textRef}
          rows={1}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={placeholder ?? t('chat.placeholder')}
          onChange={(e) => {
            setText(e.target.value);
            autoGrow(e.target);
          }}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          // `leading-6` pins the line box: without it the 16px floor that stops
          // iOS zooming (see `index.css`) makes one line taller on a phone than
          // on a desktop, and the button would only match on one of them.
          className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-zinc-200 px-4 py-2 text-sm leading-6 outline-none focus:border-indigo-400"
        />

        {/* One slot, two jobs. Empty composer means the only thing you can do
            is attach, so that is the button you get; the moment there is
            something to send it becomes send. Nothing here is ever disabled,
            and the row is one button narrower than it used to be. */}
        {canSend ? (
          <Button
            type="button"
            size="icon"
            className={SLOT}
            aria-label={t('chat.send')}
            disabled={sending}
            // What closes the phone keyboard is focus leaving the field, and it
            // leaves at `mousedown` — before the click that actually sends. So
            // the send button cancels that default action and never takes focus
            // at all: the keyboard survives one message and the next, and only
            // a tap somewhere else on the page puts it away.
            onMouseDown={(e) => e.preventDefault()}
            onClick={send}
          >
            {/* `size-*` on purpose: the button's own `[&_svg]` rule only leaves
                an icon alone when the class name says `size-`. */}
            {sending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Send className="size-5" />
            )}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={SLOT}
            aria-label={t('chat.attachImage')}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="size-5" />
          </Button>
        )}
      </div>
    </div>
  );
}
