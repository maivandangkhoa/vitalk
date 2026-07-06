import { useTranslation } from 'react-i18next';
import { Loader2, ShieldCheck } from 'lucide-react';
import { usePolicy } from '@/hooks/usePolicy';
import { AnimatedSection } from '@/components/shared/motion';
import { sanitizeHtml } from '@/lib/sanitize';
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
    <div className="relative overflow-hidden px-4 py-16 md:py-24">
      {/* Soft background accent */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-indigo-50/70 to-transparent" />

      <AnimatedSection className="container mx-auto max-w-3xl">
        {/* Header */}
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-600 ring-1 ring-inset ring-indigo-100">
            <ShieldCheck className="h-4 w-4" />
            HaviTalk
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-zinc-900 md:text-5xl">
            {t('policy.title')}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            {t('policy.subtitle', {
              defaultValue:
                'Please read our terms on booking, payment, cancellations and rescheduling.',
            })}
          </p>
        </div>

        {/* Content card */}
        <div className="mt-12 rounded-3xl border border-zinc-100 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_12px_40px_-12px_rgba(79,70,229,0.15)] sm:p-10 md:p-12">
          {html ? (
            <div
              className="prose prose-zinc max-w-none
                prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-zinc-900
                prose-h2:mb-4 prose-h2:mt-12 prose-h2:border-b prose-h2:border-zinc-100 prose-h2:pb-3 prose-h2:text-2xl first:prose-h2:mt-0
                prose-h3:mb-3 prose-h3:mt-8 prose-h3:text-lg prose-h3:text-indigo-700
                prose-p:leading-relaxed prose-p:text-zinc-600
                prose-strong:text-zinc-900
                prose-a:font-medium prose-a:text-indigo-600 prose-a:no-underline hover:prose-a:underline
                prose-ul:my-4 prose-li:my-1.5 prose-li:text-zinc-600
                prose-li:marker:text-indigo-400
                prose-hr:my-10 prose-hr:border-zinc-100"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
            />
          ) : (
            <p className="text-center text-muted-foreground">{t('policy.empty')}</p>
          )}
        </div>
      </AnimatedSection>
    </div>
  );
}
