import { useTranslation } from 'react-i18next';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Calendar, Loader2 } from 'lucide-react';
import { useBlogPost } from '@/hooks/useBlog';
import { AnimatedSection } from '@/components/shared/motion';
import type { Language } from '@/types';

export default function BlogPostPage() {
  const { i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { post, loading } = useBlogPost(slug || '');
  const lang = i18n.language as Language;

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

  const title = post.title[lang] || post.title.en;
  const content = post.content[lang] || post.content.en;
  const publishedDate = post.publishedAt
    ? new Date(
        typeof post.publishedAt === 'object' && 'seconds' in post.publishedAt
          ? (post.publishedAt as { seconds: number }).seconds * 1000
          : post.publishedAt
      ).toLocaleDateString()
    : '';

  return (
    <div className="px-4 py-16">
      <AnimatedSection className="container mx-auto max-w-3xl">
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
