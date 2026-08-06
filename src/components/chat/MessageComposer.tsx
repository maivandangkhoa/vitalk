import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Loader2, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { sendImageMessage, sendTextMessage } from '@/lib/chat';
import { MAX_MESSAGE_LENGTH } from '@/types/chat';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

interface Props {
  conversationId: string;
  senderId: string;
  /** Set while the sender is throttled — the rules would reject the write. */
  blocked?: boolean;
}

export function MessageComposer({ conversationId, senderId, blocked = false }: Props) {
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('chat.attachImage')}
          onClick={() => fileRef.current?.click()}
        >
          <ImagePlus className="h-5 w-5" />
        </Button>

        <textarea
          ref={textRef}
          rows={1}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={t('chat.placeholder')}
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
          className="max-h-36 flex-1 resize-none rounded-2xl border border-zinc-200 px-4 py-2 text-sm outline-none focus:border-indigo-400"
        />

        <Button
          type="button"
          size="icon"
          aria-label={t('chat.send')}
          disabled={sending || (!image && !text.trim())}
          onClick={send}
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
