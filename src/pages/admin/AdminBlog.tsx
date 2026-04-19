import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Plus,
  PenSquare,
  Loader2,
  Trash2,
  Eye,
  EyeOff,
  Edit,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';
import { useAdminBlogPosts, deleteBlogPost, togglePublish, useSaveBlogPost } from '@/hooks/useBlog';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';

export default function AdminBlog() {
  const { t } = useTranslation('admin');
  const navigate = useNavigate();
  const { posts, loading, refetch } = useAdminBlogPosts();
  const { saveBlogPost } = useSaveBlogPost();

  const [naverOpen, setNaverOpen] = useState(false);
  const [naverUrl, setNaverUrl] = useState('');
  const [importing, setImporting] = useState(false);

  const handleTogglePublish = async (id: string, isPublished: boolean) => {
    try {
      await togglePublish(id, !isPublished);
      toast.success(isPublished ? t('blog.unpublished') : t('blog.published'));
      refetch();
    } catch {
      toast.error(t('blog.updateFailed'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(t('blog.deleteConfirm'))) return;
    try {
      await deleteBlogPost(id);
      toast.success(t('blog.postDeleted'));
      refetch();
    } catch {
      toast.error(t('blog.deleteFailed'));
    }
  };

  const handleNaverImport = async () => {
    if (!naverUrl.trim()) {
      toast.error(t('blog.pasteNaverUrl'));
      return;
    }

    setImporting(true);
    try {
      const fn = httpsCallable<
        { url: string },
        { title: string; content: string; coverImageUrl: string }
      >(functions, 'scrapeNaverBlog');

      const result = await fn({ url: naverUrl.trim() });
      const { title, content, coverImageUrl } = result.data;

      // Create slug from title
      const slug = title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        .trim() || `naver-import-${Date.now()}`;

      // Save as draft with Korean content (from Naver)
      const savedId = await saveBlogPost(null, {
        slug,
        title: { en: '', vi: '', ko: title, ja: '' },
        excerpt: { en: '', vi: '', ko: '', ja: '' },
        content: { en: '', vi: '', ko: content, ja: '' },
        coverImageUrl: coverImageUrl || '',
        tags: [],
        isPublished: false,
        publishedAt: null,
      });

      toast.success(t('blog.importSuccess'));
      setNaverOpen(false);
      setNaverUrl('');
      navigate(`/admin/blog/${savedId}/edit`);
    } catch (err) {
      console.error('Naver import error:', err);
      toast.error(t('blog.importFailed'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <AnimatedSection className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('blog.title')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setNaverOpen(true)}>
            <Globe className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">{t('blog.importNaver')}</span>
            <span className="sm:hidden">Import</span>
          </Button>
          <Button size="sm" render={<Link to="/admin/blog/new/edit" />}>
            <Plus className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">{t('blog.newPost')}</span>
            <span className="sm:hidden">New</span>
          </Button>
        </div>
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
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold">
                        {post.title.ko || post.title.en || t('blog.untitled')}
                      </h3>
                      <Badge className={post.isPublished ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : ''} variant={post.isPublished ? 'default' : 'secondary'}>
                        {post.isPublished ? t('blog.publishedBadge') : t('blog.draftBadge')}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      /{post.slug}
                      {post.tags.length > 0 && ` · ${post.tags.join(', ')}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
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
            <p className="text-muted-foreground">{t('blog.noPosts')}</p>
          </CardContent>
        </Card>
      )}

      {/* Naver Blog Import Dialog */}
      <Dialog open={naverOpen} onOpenChange={setNaverOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('blog.importNaver')}</DialogTitle>
            <DialogDescription>{t('blog.importNaverDesc')}</DialogDescription>
          </DialogHeader>

          <div>
            <input
              value={naverUrl}
              onChange={(e) => setNaverUrl(e.target.value)}
              placeholder="https://blog.naver.com/..."
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !importing) handleNaverImport();
              }}
            />
          </div>

          <DialogFooter>
            <Button onClick={handleNaverImport} disabled={importing}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {importing ? t('blog.importing') : t('blog.importButton')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
