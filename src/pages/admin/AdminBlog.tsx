import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  PenSquare,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  Edit,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAdminBlogPosts, deleteBlogPost, togglePublish } from '@/hooks/useBlog';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';

export default function AdminBlog() {
  const { t } = useTranslation('admin');
  const { posts, loading, refetch } = useAdminBlogPosts();

  const handleTogglePublish = async (id: string, isPublished: boolean) => {
    try {
      await togglePublish(id, !isPublished);
      toast.success(isPublished ? 'Unpublished' : 'Published');
      refetch();
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this post? This cannot be undone.')) return;
    try {
      await deleteBlogPost(id);
      toast.success('Post deleted');
      refetch();
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div>
      <AnimatedSection className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('blog.title')}</h1>
        <Button render={<Link to="/admin/blog/new/edit" />}>
          <Plus className="mr-2 h-4 w-4" />
          {t('blog.newPost')}
        </Button>
      </AnimatedSection>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        </div>
      ) : posts.length > 0 ? (
        <StaggerContainer className="space-y-3">
          {posts.map((post) => (
            <StaggerItem key={post.id}>
            <Card>
              <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold">
                      {post.title.en || 'Untitled'}
                    </h3>
                    <Badge className={post.isPublished ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : ''} variant={post.isPublished ? 'default' : 'secondary'}>
                      {post.isPublished ? 'Published' : 'Draft'}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    /{post.slug}
                    {post.tags.length > 0 && ` · ${post.tags.join(', ')}`}
                  </p>
                </div>
                <div className="ml-4 flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTogglePublish(post.id, post.isPublished)}
                  >
                    {post.isPublished ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    render={<Link to={`/admin/blog/${post.id}/edit`} />}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(post.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50">
              <PenSquare className="h-8 w-8 text-indigo-300" />
            </div>
            <p className="text-muted-foreground">No blog posts yet. Create your first post!</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
