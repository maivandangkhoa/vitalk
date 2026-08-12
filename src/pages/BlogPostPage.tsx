import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, Clock, Loader2, Eye, CheckCircle, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { useBlogPost, useBlogPostPreview, usePublishedPosts, togglePublish } from '@/hooks/useBlog';
import { useAuthStore } from '@/stores/authStore';
import { usePostComments } from '@/hooks/useBlogEngagement';
import { AnimatedSection } from '@/components/shared/motion';
import { BlogPostCard } from '@/components/blog/BlogPostCard';
import { PostEngagementBar } from '@/components/blog/PostEngagementBar';
import { CommentSection } from '@/components/blog/CommentSection';
import { sanitizeHtml } from '@/lib/sanitize';
import { estimateReadTime, formatDate, pickPostLang } from '@/lib/blog';
import type { BlogPost, Language } from '@/types';

/**
 * Ba bài gợi ý: ưu tiên bài trùng tag, thiếu thì lấp bằng bài mới nhất.
 * Trộn hai nguồn qua `Map` để một bài vừa trùng tag vừa mới không hiện hai lần.
 */
function relatedTo(current: BlogPost, all: BlogPost[]): BlogPost[] {
  const others = all.filter((p) => p.id !== current.id);
  const sameTag = others.filter((p) => p.tags.some((tag) => current.tags.includes(tag)));
  const picked = new Map<string, BlogPost>();
  for (const post of [...sameTag, ...others]) {
    if (picked.size >= 3) break;
    picked.set(post.id, post);
  }
  return [...picked.values()];
}

export default function BlogPostPage() {
  const { t, i18n } = useTranslation('common');
  const { t: tb } = useTranslation('blog');
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
  const { posts: allPosts } = usePublishedPosts();

  const [publishing, setPublishing] = useState(false);

  // Trang có hai lối ra sớm bên dưới, nên hook phải gọi ở đây. Bình luận do
  // trang giữ chứ không phải `CommentSection`: thanh tương tác cần đếm số, và
  // hai nơi cùng gọi hook thì thành hai lượt đọc cho cùng một danh sách.
  const { comments, loading: commentsLoading, addComment, removeComment } = usePostComments(post?.id);

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
        <h1 className="text-2xl font-bold">{t('blog.postNotFound')}</h1>
        <p className="mt-2 text-muted-foreground">{t('blog.postNotFoundDesc')}</p>
        <Button className="mt-4" render={<Link to="/blog" />}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('blog.backToBlog')}
        </Button>
      </div>
    );
  }

  const title = pickPostLang(post.title, lang);
  const excerpt = pickPostLang(post.excerpt, lang);
  const content = pickPostLang(post.content, lang);
  const publishedDate = formatDate(post.publishedAt, lang);
  const minutes = estimateReadTime(content);
  const related = relatedTo(post, allPosts);

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
          {t('blog.backToBlog')}
        </Button>

        {/* Tiêu đề đứng TRƯỚC ảnh bìa: mở trang ra là biết ngay đang đọc gì,
            thay vì phải cuộn qua một tấm ảnh cao mới thấy tên bài. */}
        <div className="mb-3 flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
        </div>

        <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">
          {title}
        </h1>

        {excerpt && (
          <p className="mt-4 text-lg leading-relaxed text-muted-foreground">{excerpt}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-4 border-b border-border pb-6 text-sm text-muted-foreground">
          {publishedDate && (
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {publishedDate}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4" />
            {tb('minuteRead', { minutes })}
          </span>
        </div>

        {post.coverImageUrl && (
          <img
            src={post.coverImageUrl}
            alt={title}
            className="mt-8 aspect-[16/9] w-full rounded-2xl bg-muted object-cover"
          />
        )}

        <div
          className="prose prose-lg mt-8 max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
        />

        {/* Bài chưa đăng thì không có gì để thích hay chia sẻ — link ra ngoài
            sẽ 404 với người đọc, và bình luận trên bản nháp là vô nghĩa. */}
        {post.isPublished && (
          <>
            <PostEngagementBar
              postId={post.id}
              slug={post.slug}
              title={title}
              description={excerpt}
              imageUrl={post.coverImageUrl || `${window.location.origin}/og_image.png`}
              commentCount={comments.length}
            />
            <CommentSection
              comments={comments}
              loading={commentsLoading}
              addComment={addComment}
              removeComment={removeComment}
            />
          </>
        )}
      </AnimatedSection>

      {related.length > 0 && (
        <AnimatedSection className="container mx-auto mt-16 max-w-7xl">
          <h2 className="text-xl font-bold tracking-tight md:text-2xl">{tb('relatedPosts')}</h2>
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((item) => (
              <BlogPostCard key={item.id} post={item} />
            ))}
          </div>
        </AnimatedSection>
      )}
    </div>
  );
}
