import { useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Loader2, Wand2, Eye, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { useAdminBlogPost, useSaveBlogPost } from '@/hooks/useBlog';
import type { Language, MultiLangText } from '@/types';

const BlogEditor = lazy(() => import('@/components/admin/BlogEditor'));

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export default function AdminBlogEdit() {
  const { t } = useTranslation('admin');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';

  const { post, loading: postLoading } = useAdminBlogPost(isNew ? undefined : id);
  const { saveBlogPost, loading: saving } = useSaveBlogPost();

  const [activeTab, setActiveTab] = useState('en');
  const [title, setTitle] = useState<MultiLangText>({ en: '', vi: '', ko: '', ja: '' });
  const [excerpt, setExcerpt] = useState<MultiLangText>({ en: '', vi: '', ko: '', ja: '' });
  const [content, setContent] = useState<MultiLangText>({ en: '', vi: '', ko: '', ja: '' });
  const [slug, setSlug] = useState('');
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [tags, setTags] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [translating, setTranslating] = useState(false);

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

  const handleSave = async (publish: boolean) => {
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
        isPublished: publish,
        publishedAt: publish ? (post?.publishedAt || new Date()) : null,
      };

      const savedId = await saveBlogPost(isNew ? null : id!, postData);
      toast.success(publish ? 'Post published!' : 'Draft saved!');
      if (isNew) {
        navigate(`/admin/blog/${savedId}/edit`, { replace: true });
      }
    } catch {
      toast.error('Failed to save');
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
            Back
          </Button>
          <h1 className="text-2xl font-bold">
            {isNew ? t('blog.newPost') : t('blog.editPost')}
          </h1>
          {!isNew && (
            <Badge variant={isPublished ? 'default' : 'secondary'}>
              {isPublished ? 'Published' : 'Draft'}
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
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {t('blog.saveDraft')}
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Eye className="mr-2 h-4 w-4" />
            {t('blog.publish')}
          </Button>
        </div>
      </div>

      {/* Metadata */}
      <Card className="mb-6">
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Slug</label>
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="my-blog-post"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Cover Image URL</label>
              <input
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                placeholder="https://..."
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Tags (comma separated)</label>
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
                Title ({lang.label})
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
                Excerpt ({lang.label})
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
                Content ({lang.label})
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
