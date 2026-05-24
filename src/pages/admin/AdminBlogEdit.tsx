import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Loader2, Wand2, Eye, ArrowLeft, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { httpsCallable } from 'firebase/functions';
import { functions, storage } from '@/lib/firebase';
import { ref, uploadBytes } from 'firebase/storage';
import { useAdminBlogPost, useSaveBlogPost } from '@/hooks/useBlog';
import type { Language, MultiLangText } from '@/types';

const BlogEditor = lazy(() => import('@/components/admin/BlogEditor'));

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim() || `post-${Date.now()}`;
}

export default function AdminBlogEdit() {
  const { t } = useTranslation('admin');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const { post, loading: postLoading } = useAdminBlogPost(isNew ? undefined : id);
  const { saveBlogPost, loading: saving } = useSaveBlogPost();

  const [activeTab, setActiveTab] = useState('en');
  const [title, setTitle] = useState<MultiLangText>({ en: '', vi: '', ko: '', zh: '', ja: '' });
  const [excerpt, setExcerpt] = useState<MultiLangText>({ en: '', vi: '', ko: '', zh: '', ja: '' });
  const [content, setContent] = useState<MultiLangText>({ en: '', vi: '', ko: '', zh: '', ja: '' });
  const [slug, setSlug] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [tags, setTags] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `blog-covers/${Date.now()}.${ext}`;
      const storageRef = ref(storage, filePath);
      await uploadBytes(storageRef, file);
      const url = `https://storage.googleapis.com/havitalk/${filePath}`;
      setCoverImageUrl(url);
      toast.success(t('blog.coverUploaded'));
    } catch {
      toast.error(t('blog.coverUploadFailed'));
    } finally {
      setUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  };

  // Load existing post data
  useEffect(() => {
    if (post) {
      setTitle(post.title);
      setExcerpt(post.excerpt);
      setContent(post.content);
      setSlug(post.slug);
      setCoverImageUrl(post.coverImageUrl);
      setTags(post.tags.join(', '));
      setIsPublished(post.isPublished);
    }
  }, [post]);

  // Auto-generate slug from first available title (en > ko)
  useEffect(() => {
    if (isNew) {
      const source = title.en || title.ko;
      if (source) setSlug(slugify(source));
    }
  }, [isNew, title.en, title.ko]);

  const handleSave = async () => {
    const hasTitle = LANGUAGES.some((l) => title[l.code].trim());
    if (!hasTitle) {
      toast.error(t('blog.titleRequired'));
      return;
    }
    if (!slug.trim()) {
      toast.error(t('blog.slugRequired'));
      return;
    }

    try {
      const postData = {
        slug,
        title,
        excerpt,
        content,
        coverImageUrl,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        isPublished,
        publishedAt: isPublished ? (post?.publishedAt || null) : null,
      };

      const savedId = await saveBlogPost(isNew ? null : id!, postData);
      toast.success(t('blog.draftSaved'));
      if (isNew) {
        navigate(`/admin/blog/${savedId}/edit`, { replace: true });
      }
    } catch {
      toast.error(t('blog.saveFailed'));
    }
  };

  const handlePreviewPublish = async () => {
    const hasTitle = LANGUAGES.some((l) => title[l.code].trim());
    if (!hasTitle) {
      toast.error(t('blog.titleRequired'));
      return;
    }
    if (!slug.trim()) {
      toast.error(t('blog.slugRequired'));
      return;
    }

    try {
      const postData = {
        slug,
        title,
        excerpt,
        content,
        coverImageUrl,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        isPublished: false,
        publishedAt: null,
      };

      await saveBlogPost(isNew ? null : id!, postData);
      navigate(`/blog/${slug}?preview=true`);
    } catch {
      toast.error(t('blog.saveFailed'));
    }
  };

  const handleTranslate = async () => {
    // Find source language (first language with content)
    const sourceLang = LANGUAGES.find((l) => content[l.code].trim())?.code;
    if (!sourceLang) {
      toast.error(t('blog.writeContentFirst'));
      return;
    }

    setTranslating(true);
    try {
      const fn = httpsCallable<
        { title: string; excerpt: string; content: string; sourceLang: string },
        { title: MultiLangText; excerpt: MultiLangText; content: MultiLangText }
      >(functions, 'translateBlogPost');

      const result = await fn({
        title: title[sourceLang],
        excerpt: excerpt[sourceLang],
        content: content[sourceLang],
        sourceLang,
      });

      // Merge translations (keep source language, update others)
      setTitle((prev) => ({ ...prev, ...result.data.title, [sourceLang]: prev[sourceLang] }));
      setExcerpt((prev) => ({ ...prev, ...result.data.excerpt, [sourceLang]: prev[sourceLang] }));
      setContent((prev) => ({ ...prev, ...result.data.content, [sourceLang]: prev[sourceLang] }));

      toast.success(t('blog.translateSuccess'));
    } catch {
      toast.error(t('blog.translateFailed'));
    } finally {
      setTranslating(false);
    }
  };

  if (postLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/blog')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t('blog.back')}
          </Button>
          <h1 className="text-2xl font-bold">
            {isNew ? t('blog.newPost') : t('blog.editPost')}
          </h1>
          {!isNew && (
            <Badge variant={isPublished ? 'default' : 'secondary'}>
              {isPublished ? t('blog.publish') : t('blog.saveDraft')}
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleTranslate} disabled={translating}>
            {translating ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            {translating ? t('blog.translating') : t('blog.autoTranslate')}
          </Button>
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            {t('blog.saveDraft')}
          </Button>
          <Button onClick={handlePreviewPublish} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Eye className="mr-2 h-4 w-4" />
            {t('blog.previewPublish')}
          </Button>
        </div>
      </div>

      {/* Metadata */}
      <Card className="mb-6">
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('blog.slug')}</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="my-blog-post"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('blog.coverImageUrl')}</label>
              <div className="flex gap-2">
                <input
                  value={coverImageUrl}
                  onChange={(e) => setCoverImageUrl(e.target.value)}
                  className="flex-1 rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="https://..."
                />
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleCoverUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-stretch"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('blog.tags')}</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              placeholder="grammar, vocabulary, beginner"
            />
          </div>
        </CardContent>
      </Card>

      {/* Language tabs for content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {LANGUAGES.map((lang) => (
            <TabsTrigger key={lang.code} value={lang.code}>
              {lang.label}
              {lang.code !== 'en' && content[lang.code] && (
                <span className="ml-1 text-xs text-emerald-500">*</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {LANGUAGES.map((lang) => (
          <TabsContent key={lang.code} value={lang.code} className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">
                {t('blog.titleLabel')} ({lang.label})
              </label>
              <input
                value={title[lang.code]}
                onChange={(e) => setTitle((prev) => ({ ...prev, [lang.code]: e.target.value }))}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder={`Title in ${lang.label}`}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                {t('blog.excerptLabel')} ({lang.label})
              </label>
              <textarea
                value={excerpt[lang.code]}
                onChange={(e) => setExcerpt((prev) => ({ ...prev, [lang.code]: e.target.value }))}
                rows={2}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder={`Short excerpt in ${lang.label}`}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">
                {t('blog.contentLabel')} ({lang.label})
              </label>
              <Suspense fallback={<div className="flex h-[200px] items-center justify-center rounded-lg border"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
                <BlogEditor
                  content={content[lang.code]}
                  onChange={(html) => setContent((prev) => ({ ...prev, [lang.code]: html }))}
                  placeholder={`Write content in ${lang.label}...`}
                />
              </Suspense>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
