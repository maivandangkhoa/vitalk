import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { useEffect, useRef, useState } from 'react';
import { MAX_DIM, uploadPublicImage } from '@/lib/imageUpload';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Upload,
  Loader2,
  X,
  Eye,
  Pencil,
} from 'lucide-react';
import { IMAGE_DISPLAY_CLASSES, isRichTextEmpty } from '@/lib/richText';
import { TeacherRichText } from '@/components/teachers/TeacherRichText';

/** Matches the ceiling in storage.rules, so an oversized file fails here first. */
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * Display width presets. Stored as `data-size` rather than a width attribute or
 * inline style: DOMPurify lets data-* through untouched, while `width` would be
 * URI-checked away by our custom ALLOWED_URI_REGEXP and `style` is not allowed
 * at all. The widths themselves live in CSS (see IMAGE_DISPLAY_CLASSES).
 */
const IMAGE_SIZES = [
  { key: 'sm', label: 'S' },
  { key: 'md', label: 'M' },
  { key: null, label: 'L' },
] as const;

/** Centred when unset, so `null` is the middle button rather than a fourth one. */
const IMAGE_ALIGNS = [
  { key: 'left', labelKey: 'alignLeft', Icon: AlignLeft },
  { key: null, labelKey: 'alignCenter', Icon: AlignCenter },
  { key: 'right', labelKey: 'alignRight', Icon: AlignRight },
] as const;

/** Image node that round-trips `data-size` / `data-align` through the document. */
const SizedImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      size: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-size'),
        renderHTML: (attributes) =>
          attributes.size ? { 'data-size': attributes.size } : {},
      },
      align: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-align'),
        renderHTML: (attributes) =>
          attributes.align ? { 'data-align': attributes.align } : {},
      },
    };
  },
});

interface RichTextFieldProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /**
   * What a visitor reading this language actually gets — the field's own HTML,
   * or the fallback language's when this one is empty. Drives the preview.
   */
  previewHtml?: string;
}

/**
 * Deliberately smaller than BlogEditor: bold, italic, lists and images only.
 * Teacher-authored text renders inside our own cards, so headings, colours,
 * alignment and links would fight the page design (and links would let a
 * teacher pull students off-platform). See sanitizeTeacherHtml for the
 * matching render-side allowlist.
 */
export default function RichTextField({
  content,
  onChange,
  placeholder,
  previewHtml,
}: RichTextFieldProps) {
  const { t } = useTranslation('admin');
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
        link: false,
      }),
      SizedImage.configure({ HTMLAttributes: { loading: 'lazy' } }),
      Placeholder.configure({ placeholder: placeholder || '' }),
    ],
    content,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    // Without this the toolbar only refreshes when the text changes, so the
    // size buttons would not appear on a plain click into an image.
    shouldRerenderOnTransaction: true,
  });

  // Content only changes from the outside on load / teacher switch; while
  // typing it already equals getHTML(), so this never fights the editor.
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  if (!editor) return null;

  const insertImage = (url: string) => {
    editor.chain().focus().setImage({ src: url }).run();
    setShowImageDialog(false);
    setImageUrl('');
  };

  const handleImageUrl = () => {
    const url = imageUrl.trim();
    if (!url) return;
    if (!/^https:\/\//i.test(url)) {
      toast.error(t('profile.imageUrlInsecure'));
      return;
    }
    insertImage(url);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('teachers.invalidImage'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t('profile.imageTooLarge'));
      return;
    }
    setUploading(true);
    try {
      insertImage(
        await uploadPublicImage({
          dir: 'teacher-profiles',
          file,
          maxDim: MAX_DIM.article,
          namePrefix: 'bio',
        })
      );
      toast.success(t('teachers.imageUploaded'));
    } catch {
      toast.error(t('teachers.imageUploadFailed'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-xl border">
      <div className="flex flex-wrap items-center gap-0.5 border-b p-1.5">
        {/* Kept in the layout while previewing so the toolbar doesn't jump. */}
        <div
          className={`flex flex-wrap items-center gap-0.5 ${preview ? 'invisible pointer-events-none' : ''}`}
          aria-hidden={preview}
        >
        <ToolbarButton
          label={t('profile.bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          icon={<Bold className="h-4 w-4" />}
        />
        <ToolbarButton
          label={t('profile.italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          icon={<Italic className="h-4 w-4" />}
        />
        <ToolbarButton
          label={t('profile.underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive('underline')}
          icon={<UnderlineIcon className="h-4 w-4" />}
        />

        <div className="mx-1 w-px bg-border" />

        <ToolbarButton
          label={t('profile.bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          icon={<List className="h-4 w-4" />}
        />
        <ToolbarButton
          label={t('profile.numberedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          icon={<ListOrdered className="h-4 w-4" />}
        />

        <div className="mx-1 w-px bg-border" />

        <ToolbarButton
          label={t('profile.insertImage')}
          onClick={() => setShowImageDialog((open) => !open)}
          active={showImageDialog}
          icon={<ImageIcon className="h-4 w-4" />}
        />

        {editor.isActive('image') && (
          <>
            <div className="mx-1 w-px bg-border" />
            {IMAGE_SIZES.map(({ key, label }) => (
              <ToolbarButton
                key={label}
                label={t(`profile.imageSize.${key ?? 'full'}`)}
                onClick={() => editor.chain().focus().updateAttributes('image', { size: key }).run()}
                active={(editor.getAttributes('image').size ?? null) === key}
                icon={<span className="text-xs font-semibold">{label}</span>}
              />
            ))}

            <div className="mx-1 w-px bg-border" />

            {IMAGE_ALIGNS.map(({ key, labelKey, Icon }) => (
              <ToolbarButton
                key={labelKey}
                label={t(`profile.${labelKey}`)}
                onClick={() => editor.chain().focus().updateAttributes('image', { align: key }).run()}
                active={(editor.getAttributes('image').align ?? null) === key}
                icon={<Icon className="h-4 w-4" />}
              />
            ))}
          </>
        )}
        </div>

        <Button
          type="button"
          variant={preview ? 'default' : 'ghost'}
          size="sm"
          className="ml-auto h-8 gap-1.5 px-2 text-xs"
          onClick={() => setPreview((on) => !on)}
        >
          {preview ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {preview ? t('profile.backToEdit') : t('profile.preview')}
        </Button>
      </div>

      {preview && (
        // Mirrors the public bio card: same max width, same padding, same
        // full-size `prose` — the editor pane is prose-sm, which is exactly why
        // an image looks smaller here than it does on the site.
        <div className="bg-muted/30 p-6">
          <div className="mx-auto max-w-3xl rounded-xl border bg-background p-8">
            {isRichTextEmpty(content) && previewHtml && !isRichTextEmpty(previewHtml) && (
              <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {t('profile.previewFallback')}
              </p>
            )}
            {previewHtml && !isRichTextEmpty(previewHtml) ? (
              <TeacherRichText html={previewHtml} />
            ) : (
              <p className="text-sm text-muted-foreground">{t('profile.previewEmpty')}</p>
            )}
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            {t('profile.previewCaption')}
          </p>
        </div>
      )}

      {showImageDialog && !preview && (
        <div className="border-b bg-zinc-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">{t('profile.insertImage')}</span>
            <button
              type="button"
              aria-label={t('profile.close')}
              onClick={() => {
                setShowImageDialog(false);
                setImageUrl('');
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder={t('profile.imageUrlPlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && handleImageUrl()}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={handleImageUrl} disabled={!imageUrl.trim()}>
                URL
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t('teachers.uploadImage')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Kept mounted while previewing so the cursor and undo history survive. */}
      <EditorContent
        editor={editor}
        className={`${preview ? 'hidden' : ''} prose max-w-none p-4 prose-img:rounded-xl ${IMAGE_DISPLAY_CLASSES} [&_.tiptap]:min-h-[240px] [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]`}
      />
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  icon,
  label,
}: {
  onClick: () => void;
  active?: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title={label}
      aria-label={label}
      className={`h-8 w-8 p-0 ${active ? 'bg-muted' : ''}`}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}
