import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import { usePublishedPosts } from '@/hooks/useBlog';
import { BlogPostCard } from '@/components/blog/BlogPostCard';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';
import { estimateReadTime, formatDate, pickPostLang } from '@/lib/blog';
import { blogPostPath } from '@/lib/localeRoutes';
import { cn } from '@/lib/utils';
import type { BlogPost, Language } from '@/types';

/**
 * Bài mới nhất, dựng thành tấm bìa mở đầu trang.
 *
 * Ảnh nền là ảnh bìa của CHÍNH bài đó nên tiêu đề lớn phải là tiêu đề bài —
 * đặt chữ "Blog" đè lên ảnh của một bài cụ thể là nói một đằng minh hoạ một
 * nẻo. Bài chưa có ảnh thì rơi về nền gradient thương hiệu, vẫn ra tấm bìa.
 */
function FeaturedPost({ post }: { post: BlogPost }) {
  const { t, i18n } = useTranslation('blog');
  const lang = i18n.language as Language;

  const title = pickPostLang(post.title, lang);
  const excerpt = pickPostLang(post.excerpt, lang);
  const minutes = estimateReadTime(pickPostLang(post.content, lang));
  const date = formatDate(post.publishedAt, lang);

  return (
    <Link
      to={blogPostPath(post.slug, lang)}
      className="group relative isolate block overflow-hidden rounded-3xl"
    >
      {post.coverImageUrl ? (
        <img
          src={post.coverImageUrl}
          alt={title}
          className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600" />
      )}

      {/*
        Lớp phủ ĐỔI HƯỚNG theo breakpoint vì chữ đứng ở hai chỗ khác nhau:
        mobile chữ dồn xuống đáy → phủ dọc; desktop chữ nằm nửa trái → phủ ngang
        rồi tan hẳn từ 70% sang phải, chừa nguyên vùng sáng của ảnh bìa.
      */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-zinc-950/90 via-zinc-950/65 to-zinc-950/30 md:bg-gradient-to-r md:from-zinc-950/90 md:via-zinc-950/50 md:via-40% md:to-transparent md:to-70%"
      />

      <div className="flex min-h-[22rem] flex-col justify-end p-6 md:min-h-[26rem] md:p-12">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
          {t('featured')}
          {date && <span className="text-zinc-300"> · {date}</span>}
        </p>
        <h2 className="mt-2 max-w-2xl text-2xl font-bold leading-tight tracking-tight text-white md:text-4xl">
          {title}
        </h2>
        {excerpt && (
          <p className="mt-3 line-clamp-3 max-w-2xl text-sm leading-relaxed text-zinc-200 md:text-base">
            {excerpt}
          </p>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5 rounded-2xl bg-white px-5 py-2.5 text-sm font-semibold text-zinc-900 transition-colors group-hover:bg-zinc-100">
            {t('readPost')}
            <ArrowRight className="h-4 w-4" />
          </span>
          <span className="text-xs text-zinc-300">{t('minuteRead', { minutes })}</span>
        </div>
      </div>
    </Link>
  );
}

/** Khung xám lúc chờ dữ liệu — giữ đúng bố cục để trang không nhảy khi tải xong. */
function BlogSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-[22rem] rounded-3xl bg-muted md:h-[26rem]" />
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="aspect-[16/9] bg-muted" />
            <div className="space-y-2 p-4">
              <div className="h-2 w-16 rounded bg-muted" />
              <div className="h-3 w-full rounded bg-muted" />
              <div className="h-3 w-2/3 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BlogListPage() {
  const { t } = useTranslation('blog');
  const { posts, loading } = usePublishedPosts();
  const [activeTag, setActiveTag] = useState<string | null>(null);

  /** Tag hay dùng nhất lên trước; cắt còn 8 để hàng lọc không cuộn thành hai dòng. */
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const post of posts) {
      for (const tag of post.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag, count]) => ({ tag, count }));
  }, [posts]);

  const featured = posts[0];
  /**
   * Không lọc: bỏ bài đầu khỏi lưới vì nó đã là tấm bìa ngay phía trên.
   * Đang lọc: trả đủ bài khớp tag — người đọc đang duyệt theo chủ đề nên giấu
   * một bài khớp chỉ vì nó tình cờ mới nhất là sai.
   */
  const gridPosts = activeTag
    ? posts.filter((post) => post.tags.includes(activeTag))
    : posts.slice(1);

  return (
    <div className="px-4 py-12 md:py-16">
      <div className="container mx-auto max-w-7xl">
        <AnimatedSection className="max-w-3xl">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{t('title')}</h1>
          <p className="mt-3 text-balance text-base leading-relaxed text-muted-foreground">
            {t('subtitle')}
          </p>
        </AnimatedSection>

        {loading ? (
          <div className="mt-10">
            <BlogSkeleton />
          </div>
        ) : posts.length > 0 ? (
          <>
            <AnimatedSection className="mt-8" delay={0.05}>
              <FeaturedPost post={featured} />
            </AnimatedSection>

            {tags.length > 1 && (
              <AnimatedSection className="mt-10 flex flex-wrap gap-2" delay={0.1}>
                <TagChip
                  label={t('allPosts')}
                  count={posts.length}
                  active={activeTag === null}
                  onClick={() => setActiveTag(null)}
                />
                {tags.map(({ tag, count }) => (
                  <TagChip
                    key={tag}
                    label={tag}
                    count={count}
                    active={activeTag === tag}
                    onClick={() => setActiveTag(tag)}
                  />
                ))}
              </AnimatedSection>
            )}

            {gridPosts.length > 0 ? (
              <StaggerContainer
                /* key: đổi tag = danh sách mới, cần chạy lại hiệu ứng lần lượt. */
                key={activeTag ?? 'all'}
                className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              >
                {gridPosts.map((post) => (
                  <StaggerItem key={post.id} className="h-full">
                    <BlogPostCard post={post} />
                  </StaggerItem>
                ))}
              </StaggerContainer>
            ) : (
              <p className="mt-8 rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-muted-foreground">
                {t('onlyFeatured')}
              </p>
            )}

            <AnimatedSection className="mt-16">
              <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-violet-600 px-6 py-10 text-center md:px-12 md:py-14">
                <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                  {t('cta.title')}
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-indigo-100 md:text-base">
                  {t('cta.body')}
                </p>
                <Link
                  to="/teachers"
                  className="mt-7 inline-flex items-center gap-1.5 rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-50"
                >
                  {t('cta.label')}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </AnimatedSection>
          </>
        ) : (
          <AnimatedSection className="mt-10">
            <div className="flex flex-col items-center rounded-3xl border border-dashed border-border py-20">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
                <BookOpen className="h-8 w-8 text-indigo-400" />
              </div>
              <p className="text-muted-foreground">{t('noPostsYet')}</p>
            </div>
          </AnimatedSection>
        )}
      </div>
    </div>
  );
}

function TagChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
      )}
    >
      {label}
      <span className={cn('text-[10px]', active ? 'text-primary-foreground/70' : 'opacity-60')}>
        {count}
      </span>
    </button>
  );
}
