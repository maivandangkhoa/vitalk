import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, Loader2, Eye, CheckCircle, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useBlogPost, useBlogPostPreview, togglePublish } from '@/hooks/useBlog';
import { useAuthStore } from '@/stores/authStore';
import { AnimatedSection } from '@/components/shared/motion';
import type { Language } from '@/types';

export default function BlogPostPage() {
  const { t, i18n } = useTranslation('common');
  const { t: ta } = useTranslation('admin');
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuthStore();
  const lang = i18n.language as Language;

  const isPreview = searchParams.get('preview') === 'true' && isAdmin();

  // Use preview hook (no isPublished filter) for admin preview, normal hook otherwise
  const publicResult = useBlogPost(isPreview ? '' : (slug || ''));
  const previewResult = useBlogPostPreview(isPreview ? (slug || '') : '');
  const { post, loading } = isPreview ? previewResult : publicResult;

  const [publishing, setPublishing] = useState(false);

  const handleConfirmPublish = async () => {
    if (!post) return;
    setPublishing(true);
    try {
      await togglePublish(post.id, true);
      toast.success(ta('blog.published'));
      // Remove preview param
      setSearchParams({});
    } catch {
      toast.error(ta('blog.translateFailed'));
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
        <h1 className="text-2xl font-bold">Post not found</h1>
        <p className="mt-2 text-muted-foreground">This blog post doesn't exist or has been removed.</p>
        <Button className="mt-4" render={<Link to="/blog" />}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Blog
        </Button>
      </div>
    );
  }

  const title = post.title[lang] || post.title.ko || post.title.en;
  const content = post.content[lang] || post.content.ko || post.content.en;
  const publishedDate = post.publishedAt
    ? new Date(
        typeof post.publishedAt === 'object' && 'seconds' in post.publishedAt
          ? (post.publishedAt as { seconds: number }).seconds * 1000
          : post.publishedAt
      ).toLocaleDateString()
    : '';

  return (
    <div className="px-4 py-16">
      {/* Admin Preview Bar */}
      {isPreview && !post.isPublished && (
        <div className="fixed inset-x-0 top-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-3">
          <div className="container mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Badge className="bg-amber-100 text-amber-700">
                <Eye className="mr-1 h-3 w-3" />
                {t('blog.preview')}
              </Badge>
              <span className="text-sm text-amber-700">
                {t('blog.previewMode')}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/admin/blog/${post.id}/edit`)}
              >
                <Pencil className="mr-1 h-3.5 w-3.5" />
                {t('blog.backToEdit')}
              </Button>
              <Button
                size="sm"
                onClick={handleConfirmPublish}
                disabled={publishing}
              >
                {publishing ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="mr-1 h-3.5 w-3.5" />
                )}
                {t('blog.confirmPublish')}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AnimatedSection className={`container mx-auto max-w-3xl ${isPreview && !post.isPublished ? 'mt-12' : ''}`}>
        <Button variant="ghost" size="sm" className="mb-6" render={<Link to="/blog" />}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Blog
        </Button>

        {post.coverImageUrl && (
          <div className="mb-8 overflow-hidden rounded-2xl">
            <img
              src={post.coverImageUrl}
              alt={title}
              className="w-full object-cover"
            />
          </div>
        )}

        <div className="mb-4 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
        </div>

        <h1 className="text-3xl font-bold leading-tight md:text-4xl">
          {title}
        </h1>

        {publishedDate && (
          <div className="mt-3 flex items-center gap-1 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            {publishedDate}
          </div>
        )}

        <div className="mt-8 rounded-2xl bg-white p-8 shadow-sm">
          <div
            className="prose prose-lg max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>
      </AnimatedSection>
    </div>
  );
}
