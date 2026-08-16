import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Loader2, Eye, ArrowLeft, Upload, Sparkles, RefreshCw, Languages } from 'lucide-react';
import { toast } from 'sonner';
import { MAX_DIM, uploadPublicImage } from '@/lib/imageUpload';
import { beginUpload, usePendingUploads } from '@/lib/pendingUploads';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { toAsciiSlug } from '@/lib/slug';
import { useAdminBlogPost, useSaveBlogPost } from '@/hooks/useBlog';
import type { TranslatedPost } from '@/lib/aiTranslate';
import type { AiDraft } from '@/lib/aiWriter';
import type { BlogPostSource } from '@/types/blog';
import type { Language, MultiLangText } from '@/types';

const BlogEditor = lazy(() => import('@/components/admin/BlogEditor'));
const AiWriterPanel = lazy(() => import('@/components/admin/AiWriterPanel'));
const TranslateDialog = lazy(() => import('@/components/admin/TranslateDialog'));

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'vi', label: 'Tiếng Việt' },
];

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
  const [uploading, setUploading] = useState(false);
  const [writerOpen, setWriterOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [source, setSource] = useState<BlogPostSource | undefined>();
  const [syncing, setSyncing] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const pendingUploads = usePendingUploads();

  const activeLang = activeTab as Language;

  /** Bản nháp của trợ lý chỉ ghi vào ĐÚNG tab ngôn ngữ nó vừa viết cho. */
  const applyDraft = (draft: AiDraft) => {
    setTitle((prev) => ({ ...prev, [activeLang]: draft.title }));
    setExcerpt((prev) => ({ ...prev, [activeLang]: draft.excerpt }));
    setContent((prev) => ({ ...prev, [activeLang]: draft.content }));
    if (draft.tags.length) setTags(draft.tags.join(', '));
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }
    setUploading(true);
    // Same race as an inline image: the URL only reaches state when the upload
    // lands, so a save before then keeps the old cover.
    const endUpload = beginUpload();
    try {
      const url = await uploadPublicImage({
        dir: 'blog-covers',
        file,
        maxDim: MAX_DIM.article,
      });
      setCoverImageUrl(url);
      toast.success(t('blog.coverUploaded'));
    } catch {
      toast.error(t('blog.coverUploadFailed'));
    } finally {
      endUpload();
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
      setSource(post.source);
    }
  }, [post]);

  /**
   * Pulls the Naver post again and drops the Korean version back in.
   *
   * Only `ko` and the cover are touched. The other languages are translations
   * of the *old* Korean text, and overwriting them with Korean would be worse
   * than leaving them stale — so it says so instead, and leaves the choice of
   * re-translating to whoever is looking at it.
   *
   * Nothing is written here: the new text lands in the editor and waits for
   * Save, like every other edit on this page.
   */
  const handleSyncFromNaver = async () => {
    // Posts imported before the source was recorded have no way back, so ask
    // once and keep the answer.
    const url = source
      ? `https://blog.naver.com/${source.blogId}/${source.logNo}`
      : window.prompt(t('blog.sync.askUrl')) || '';
    if (!url.trim()) return;

    setSyncing(true);
    try {
      const fn = httpsCallable<
        { url: string },
        {
          title: string;
          content: string;
          coverImageUrl: string;
          blogId?: string;
          logNo?: string;
          sourceHash?: string;
        }
      >(functions, 'scrapeNaverBlog');
      const { data } = await fn({ url: url.trim() });

      if (source && data.sourceHash && data.sourceHash === source.contentHash) {
        toast.info(t('blog.sync.upToDate'));
        return;
      }

      setTitle((prev) => ({ ...prev, ko: data.title || prev.ko }));
      setContent((prev) => ({ ...prev, ko: data.content }));
      if (data.coverImageUrl) setCoverImageUrl(data.coverImageUrl);
      if (data.blogId && data.logNo) {
        setSource({
          platform: 'naver',
          blogId: data.blogId,
          logNo: data.logNo,
          contentHash: data.sourceHash || '',
          syncedAt: new Date(),
        });
      }

      toast.success(t('blog.sync.updated'));
      const translated = LANGUAGES.filter((l) => l.code !== 'ko' && content[l.code].trim());
      if (translated.length) {
        toast.warning(t('blog.sync.translationsStale', { langs: translated.map((l) => l.label).join(', ') }));
      }
    } catch (err) {
      console.error('Naver sync error:', err);
      toast.error(t('blog.sync.failed'));
    } finally {
      setSyncing(false);
    }
  };

  // Auto-generate slug from first available title (en > ko > vi)
  useEffect(() => {
    if (isNew) {
      const titleSource = title.en || title.ko || title.vi;
      if (titleSource) setSlug(toAsciiSlug(titleSource) || `post-${Date.now()}`);
    }
  }, [isNew, title.en, title.ko, title.vi]);

  /** Shared gate for both save paths; says why when it refuses. */
  const canSave = (): boolean => {
    if (!LANGUAGES.some((l) => title[l.code].trim())) {
      toast.error(t('blog.titleRequired'));
      return false;
    }
    if (!slug.trim()) {
      toast.error(t('blog.slugRequired'));
      return false;
    }
    // The buttons are disabled while uploads run, so this is the backstop for
    // anything that reaches a save another way.
    if (pendingUploads > 0) {
      toast.error(t('blog.uploadingImages'));
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!canSave()) return;

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
        source,
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
    if (!canSave()) return;

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
        source,
      };

      await saveBlogPost(isNew ? null : id!, postData);
      navigate(`/blog/${slug}?preview=true`);
    } catch {
      toast.error(t('blog.saveFailed'));
    }
  };

  /**
   * Bản dịch chỉ ghi đè những thứ tiếng trợ lý thật sự trả về — hàm phía server
   * cố ý không trả khóa rỗng, nên tab không được chọn giữ nguyên bản cũ.
   */
  const applyTranslation = (result: TranslatedPost) => {
    setTitle((prev) => ({ ...prev, ...result.title }));
    setExcerpt((prev) => ({ ...prev, ...result.excerpt }));
    setContent((prev) => ({ ...prev, ...result.content }));
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
          <Button variant="outline" onClick={() => setWriterOpen(true)}>
            <Sparkles className="mr-2 h-4 w-4" />
            {t('blog.writer.open')}
          </Button>
          <Button
            variant="outline"
            onClick={() => setTranslateOpen(true)}
            disabled={!LANGUAGES.some((l) => content[l.code].trim())}
          >
            <Languages className="mr-2 h-4 w-4" />
            {t('blog.translate.button')}
          </Button>
          {!isNew && (
            <Button variant="outline" onClick={handleSyncFromNaver} disabled={syncing || saving}>
              {syncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {t('blog.sync.button')}
            </Button>
          )}
          {pendingUploads > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {t('blog.uploadingImages')}
            </span>
          )}
          <Button variant="outline" onClick={handleSave} disabled={saving || pendingUploads > 0}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Save className="mr-2 h-4 w-4" />
            {t('blog.saveDraft')}
          </Button>
          <Button onClick={handlePreviewPublish} disabled={saving || pendingUploads > 0}>
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
                  title={t('blog.coverImageUrl')}
                  onClick={() => coverInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>

          {coverImageUrl && (
            <img
              src={coverImageUrl}
              alt=""
              className="aspect-[16/9] w-full max-w-sm rounded-xl border border-border bg-muted object-cover"
            />
          )}
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

      <Suspense fallback={null}>
        <TranslateDialog
          open={translateOpen}
          onOpenChange={setTranslateOpen}
          languages={LANGUAGES}
          activeLang={activeLang}
          title={title}
          excerpt={excerpt}
          content={content}
          onTranslated={applyTranslation}
        />
      </Suspense>

      <Suspense fallback={null}>
        <AiWriterPanel
          open={writerOpen}
          onOpenChange={setWriterOpen}
          lang={activeLang}
          languages={LANGUAGES}
          ideas={content[activeLang]}
          title={title[activeLang]}
          tags={tags}
          onApply={applyDraft}
          onTranslated={applyTranslation}
          onCover={setCoverImageUrl}
        />
      </Suspense>
    </div>
  );
}
