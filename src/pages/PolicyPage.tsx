import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { usePolicy } from '@/hooks/usePolicy';
import { AnimatedSection } from '@/components/shared/motion';
import type { Language } from '@/types';

export default function PolicyPage() {
  const { t, i18n } = useTranslation('common');
  const lang = (i18n.language || 'en').split('-')[0] as Language;
  const { content, loading } = usePolicy();

  const html = content[lang] || content.vi || content.en;

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="px-4 py-16">
      <AnimatedSection className="container mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold leading-tight md:text-4xl">
          {t('policy.title')}
        </h1>

        <div className="mt-8 rounded-2xl bg-white p-8 shadow-sm">
          {html ? (
            <div
              className="prose prose-lg max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-muted-foreground">{t('policy.empty')}</p>
          )}
        </div>
      </AnimatedSection>
    </div>
  );
}
