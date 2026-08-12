import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Heart, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ShareMenu } from '@/components/blog/ShareMenu';
import { usePostLikes } from '@/hooks/useBlogEngagement';
import { postUrl } from '@/lib/blogShare';
import { useAuthStore } from '@/stores/authStore';

interface PostEngagementBarProps {
  postId: string;
  slug: string;
  title: string;
  description: string;
  imageUrl: string;
  commentCount: number;
}

/** Hàng thích · số bình luận · chia sẻ, đặt ngay dưới nội dung bài. */
export function PostEngagementBar({
  postId,
  slug,
  title,
  description,
  imageUrl,
  commentCount,
}: PostEngagementBarProps) {
  const { t } = useTranslation('blog');
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { count, liked, loading, saving, toggleLike } = usePostLikes(postId);

  const handleLike = async () => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
      return;
    }
    try {
      await toggleLike();
    } catch {
      toast.error(t('likeFailed'));
    }
  };

  return (
    <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-y border-border py-4">
      <div className="flex items-center gap-2">
        <Button
          variant={liked ? 'default' : 'outline'}
          size="sm"
          className="gap-2"
          onClick={handleLike}
          disabled={saving}
          aria-pressed={liked}
        >
          <Heart className={`h-4 w-4 ${liked ? 'fill-current' : ''}`} />
          {liked ? t('liked') : t('like')}
          {!loading && count > 0 && <span className="tabular-nums">{count}</span>}
        </Button>

        <span className="flex items-center gap-1.5 px-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          <span className="tabular-nums">{commentCount}</span>
        </span>
      </div>

      <ShareMenu
        title={title}
        description={description}
        imageUrl={imageUrl}
        url={postUrl(slug)}
      />
    </div>
  );
}
