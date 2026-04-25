import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, Loader2, Calendar } from 'lucide-react';
import { usePublishedPosts } from '@/hooks/useBlog';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';
import type { BlogPost, Language } from '@/types';

function BlogCard({ post }: { post: BlogPost }) {
  const { i18n } = useTranslation();
  const lang = i18n.language as Language;
  const title = post.title[lang] || post.title.ko || post.title.en;
  const excerpt = post.excerpt[lang] || post.excerpt.ko || post.excerpt.en;

  const publishedDate = post.publishedAt
    ? new Date(
        typeof post.publishedAt === 'object' && 'seconds' in post.publishedAt
          ? (post.publishedAt as { seconds: number }).seconds * 1000
          : post.publishedAt
      ).toLocaleDateString()
    : '';

  return (
    <Link to={`/blog/${post.slug}`} className="group block">
      <Card className="gap-0 overflow-hidden pb-0">
        {post.coverImageUrl && (
          <img
            src={post.coverImageUrl}
            alt={title}
            className="aspect-video w-full bg-zinc-100 object-cover transition-transform duration-300 group-hover:scale-105"
          />
        )}
        <CardContent className="p-6">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
          <h2 className="text-lg font-semibold leading-snug transition-colors group-hover:text-indigo-500">
            {title}
          </h2>
          {excerpt && (
            <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {excerpt}
            </p>
          )}
          {publishedDate && (
            <div className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              {publishedDate}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function BlogListPage() {
  const { t } = useTranslation('blog');
  const { posts, loading } = usePublishedPosts();

  return (
    <div className="px-4 py-16 md:py-24">
      <div className="container mx-auto">
        <AnimatedSection className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t('subtitle')}</p>
        </AnimatedSection>

        <div className="mx-auto mt-12 max-w-4xl">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : posts.length > 0 ? (
            <StaggerContainer className="grid gap-6 md:grid-cols-2">
              {posts.map((post) => (
                <StaggerItem key={post.id}>
                  <BlogCard post={post} />
                </StaggerItem>
              ))}
            </StaggerContainer>
          ) : (
            <AnimatedSection>
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center py-16">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
                    <BookOpen className="h-8 w-8 text-indigo-400" />
                  </div>
                  <p className="text-muted-foreground">{t('noPostsYet')}</p>
                  <div className="mt-4 flex gap-2">
                    <Badge variant="secondary">Pronunciation</Badge>
                    <Badge variant="secondary">Grammar</Badge>
                    <Badge variant="secondary">Culture</Badge>
                  </div>
                </CardContent>
              </Card>
            </AnimatedSection>
          )}
        </div>
      </div>
    </div>
  );
}
