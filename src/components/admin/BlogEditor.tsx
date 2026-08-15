import { useEditor, EditorContent } from '@tiptap/react';
import type { Editor, EditorEvents } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from '@/components/ui/button';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MAX_DIM, uploadPublicImage } from '@/lib/imageUpload';
import { toast } from 'sonner';
import {
  Bold,
  Italic,
  Strikethrough,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Minus,
  Link2,
  ImageIcon,
  Undo,
  Redo,
  Code,
  Upload,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';

const AiImageDialog = lazy(() => import('@/components/admin/AiImageDialog'));

/** Image files carried by a clipboard payload — empty for an ordinary paste. */
function imageFilesOf(data: DataTransfer | null): File[] {
  return Array.from(data?.files ?? []).filter((f) => f.type.startsWith('image/'));
}

interface BlogEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function BlogEditor({ content, onChange, placeholder }: BlogEditorProps) {
  const { t } = useTranslation('admin');
  const [showImageDialog, setShowImageDialog] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // handlePaste is captured once when the editor is created, so it cannot close
  // over the editor it belongs to. A ref hands it back the live instance.
  const editorRef = useRef<Editor | null>(null);

  /**
   * Uploads an image and drops it where the caret was when the upload started.
   *
   * The editor stays live meanwhile, so that position is mapped through every
   * transaction — otherwise anything typed during the upload would push the
   * image somewhere other than where it was pasted.
   *
   * This path used to hand back a storage.googleapis.com URL for an object with
   * no public ACL, which 403s. publishUpload is what makes it resolve.
   */
  const uploadAndInsert = async (file: File): Promise<boolean> => {
    const editor = editorRef.current;
    if (!editor) return false;

    let pos = editor.state.selection.from;
    const followEdits = ({ transaction }: EditorEvents['transaction']) => {
      pos = transaction.mapping.map(pos);
    };
    editor.on('transaction', followEdits);

    const toastId = toast.loading('Uploading image...');
    try {
      const url = await uploadPublicImage({
        dir: 'blog-images/inline',
        file,
        maxDim: MAX_DIM.article,
      });
      editor
        .chain()
        .focus()
        .insertContentAt(pos, { type: 'image', attrs: { src: url } })
        .run();
      toast.success('Image uploaded', { id: toastId });
      return true;
    } catch {
      toast.error('Failed to upload image', { id: toastId });
      return false;
    } finally {
      editor.off('transaction', followEdits);
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image,
      Placeholder.configure({ placeholder: placeholder || 'Start writing...' }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      // A pasted screenshot arrives as a file on the clipboard with no HTML
      // worth keeping, and ProseMirror would simply drop it. Upload it instead,
      // so the document holds a real URL rather than nothing.
      handlePaste: (_view, event) => {
        const files = imageFilesOf(event.clipboardData);
        if (!files.length) return false;
        event.preventDefault();
        // Each upload maps its own position past the images inserted before it,
        // so a multi-image paste keeps its order.
        files.forEach((file) => void uploadAndInsert(file));
        return true;
      },
    },
  });

  // `useEditor({ content })` chỉ đọc `content` lúc khởi tạo, nên mọi thứ ghi vào
  // ô nội dung từ bên ngoài — trợ lý viết bài, nút Tự động dịch — trước nay
  // không hiện ra nếu đang đứng ở chính tab đó (chuyển tab thì editor mount lại
  // nên trông như vẫn chạy). So sánh với `getHTML()` để effect nằm im lúc đang
  // gõ: `onUpdate` set state đúng bằng chuỗi đó, nên con trỏ không bị nhảy.
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  if (!editor) return null;

  const addLink = () => {
    const url = window.prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const insertImage = (url: string) => {
    editor.chain().focus().setImage({ src: url }).run();
    setShowImageDialog(false);
    setImageUrl('');
  };

  const handleImageUrl = () => {
    if (imageUrl.trim()) {
      insertImage(imageUrl.trim());
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    setUploading(true);
    try {
      if (await uploadAndInsert(file)) {
        setShowImageDialog(false);
        setImageUrl('');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="rounded-lg border">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-0.5 border-b p-1.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          icon={<Bold className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          icon={<Italic className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          icon={<Strikethrough className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleCode().run()}
          active={editor.isActive('code')}
          icon={<Code className="h-4 w-4" />}
        />

        <div className="mx-1 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          icon={<Heading1 className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          icon={<Heading2 className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          icon={<Heading3 className="h-4 w-4" />}
        />

        <div className="mx-1 w-px bg-border" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          icon={<List className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          icon={<ListOrdered className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          icon={<Quote className="h-4 w-4" />}
        />
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          icon={<Minus className="h-4 w-4" />}
        />

        <div className="mx-1 w-px bg-border" />

        <ToolbarButton onClick={addLink} active={editor.isActive('link')} icon={<Link2 className="h-4 w-4" />} />
        <ToolbarButton onClick={() => setShowImageDialog(true)} icon={<ImageIcon className="h-4 w-4" />} />

        <div className="mx-1 w-px bg-border" />

        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} icon={<Undo className="h-4 w-4" />} />
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} icon={<Redo className="h-4 w-4" />} />
      </div>

      {/* Image insert dialog */}
      {showImageDialog && (
        <div className="border-b bg-zinc-50 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Insert Image</span>
            <button onClick={() => { setShowImageDialog(false); setImageUrl(''); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="Paste image URL..."
              className="flex-1 rounded-lg border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              onKeyDown={(e) => e.key === 'Enter' && handleImageUrl()}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleImageUrl} disabled={!imageUrl.trim()}>
                <Link2 className="mr-1.5 h-3.5 w-3.5" />
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
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1.5 h-3.5 w-3.5" />}
                Upload
              </Button>
              <Button size="sm" variant="outline" onClick={() => setAiOpen(true)}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                {t('blog.ai.short')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={null}>
        <AiImageDialog
          open={aiOpen}
          onOpenChange={setAiOpen}
          dir="blog-images/inline"
          onPicked={insertImage}
        />
      </Suspense>

      {/* Editor */}
      <EditorContent
        editor={editor}
        className="prose prose-sm max-w-none p-4 dark:prose-invert [&_.tiptap]:min-h-[200px] [&_.tiptap]:outline-none [&_.tiptap_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none"
      />
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  icon,
}: {
  onClick: () => void;
  active?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={`h-8 w-8 p-0 ${active ? 'bg-muted' : ''}`}
      onClick={onClick}
    >
      {icon}
    </Button>
  );
}
