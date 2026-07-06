import { useState, useEffect, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { usePolicy, savePolicy } from '@/hooks/usePolicy';
import type { Language, MultiLangText } from '@/types';

const BlogEditor = lazy(() => import('@/components/admin/BlogEditor'));

const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'vi', label: 'Tiếng Việt' },
];

export default function AdminPolicy() {
  const { t } = useTranslation('admin');
  const { content: loaded, loading } = usePolicy();

  const [activeTab, setActiveTab] = useState('vi');
  const [content, setContent] = useState<MultiLangText>({ en: '', vi: '', ko: '', zh: '', ja: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading) setContent(loaded);
  }, [loading, loaded]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await savePolicy(content);
      toast.success(t('policy.saved'));
    } catch {
      toast.error(t('policy.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('policy.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('policy.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link to="/policy" target="_blank" />}>
            <ExternalLink className="mr-2 h-4 w-4" />
            {t('policy.viewPage')}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t('policy.save')}
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {LANGUAGES.map((lang) => (
            <TabsTrigger key={lang.code} value={lang.code}>
              {lang.label}
              {content[lang.code] && <span className="ml-1 text-xs text-emerald-500">*</span>}
            </TabsTrigger>
          ))}
        </TabsList>

        {LANGUAGES.map((lang) => (
          <TabsContent key={lang.code} value={lang.code} className="mt-4">
            <Suspense
              fallback={
                <div className="flex h-[200px] items-center justify-center rounded-lg border">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              }
            >
              <BlogEditor
                content={content[lang.code]}
                onChange={(html) => setContent((prev) => ({ ...prev, [lang.code]: html }))}
                placeholder={`${t('policy.contentLabel')} (${lang.label})`}
              />
            </Suspense>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
