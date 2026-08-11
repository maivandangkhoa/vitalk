/**
 * Thẻ bài viết dùng chung cho lưới blog và mục "bài viết khác" ở cuối bài.
 *
 * Bố cục cố tình bám sát trang chuyên đề của FechTin: ảnh 16:9 → nhãn nhỏ in
 * hoa → tiêu đề → tóm tắt 3 dòng → dòng meta. Nhờ `flex-1` ở phần tóm tắt,
 * dòng meta luôn nằm sát đáy nên các thẻ trong một hàng thẳng chân nhau dù
 * tiêu đề dài ngắn khác nhau.
 */
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BookOpen } from 'lucide-react';
import { estimateReadTime, formatDate, pickPostLang } from '@/lib/blog';
import { cn } from '@/lib/utils';
import type { BlogPost, Language } from '@/types';

/**
 * Nền thay thế khi bài chưa có ảnh bìa. Chọn theo slug để một bài luôn ra cùng
 * một màu — đổi màu mỗi lần render thì lưới nhấp nháy mỗi lần lọc lại tag.
 */
const FALLBACK_TINTS = [
  'from-indigo-100 to-violet-200 text-indigo-500',
  'from-sky-100 to-cyan-200 text-sky-500',
  'from-amber-100 to-orange-200 text-amber-600',
  'from-emerald-100 to-teal-200 text-emerald-600',
  'from-rose-100 to-pink-200 text-rose-500',
];

function tintFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return FALLBACK_TINTS[hash % FALLBACK_TINTS.length];
}

export function BlogThumb({
  post,
  title,
  className,
}: {
  post: BlogPost;
  title: string;
  className?: string;
}) {
  if (post.coverImageUrl) {
    return (
      <img
        src={post.coverImageUrl}
        alt={title}
        loading="lazy"
        className={cn(
          'w-full bg-muted object-cover transition-transform duration-300 group-hover:scale-105',
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex w-full items-center justify-center bg-gradient-to-br',
        tintFor(post.slug),
        className
      )}
    >
      <BookOpen className="h-10 w-10 transition-transform duration-300 group-hover:scale-110" />
    </div>
  );
}

export function BlogPostCard({ post }: { post: BlogPost }) {
  const { t, i18n } = useTranslation('blog');
  const lang = i18n.language as Language;

  const title = pickPostLang(post.title, lang);
  const excerpt = pickPostLang(post.excerpt, lang);
  const minutes = estimateReadTime(pickPostLang(post.content, lang));
  const date = formatDate(post.publishedAt, lang);
  const kicker = post.tags[0];

  return (
    <Link
      to={`/blog/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
    >
      <BlogThumb post={post} title={title} className="aspect-[16/9]" />

      <div className="flex flex-1 flex-col p-4">
        {kicker && (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            {kicker}
          </p>
        )}
        <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
          {title}
        </h3>
        {excerpt && (
          <p className="mt-1.5 line-clamp-3 flex-1 text-xs leading-relaxed text-muted-foreground">
            {excerpt}
          </p>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">
          {date && <span>{date} · </span>}
          {t('minuteRead', { minutes })}
        </p>
      </div>
    </Link>
  );
}
