import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Clock, Loader2 } from 'lucide-react';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';
import { useCurrencySettings } from '@/hooks/useCurrency';
import { useLessonTypes } from '@/hooks/useLessonTypes';
import type { Language } from '@/types';

const LEVEL_COLORS: Record<string, string> = {
  beginner: 'bg-emerald-50 text-emerald-600',
  intermediate: 'bg-sky-50 text-sky-600',
  conversation: 'bg-purple-50 text-purple-600',
};

export default function LessonsPage() {
  const { t, i18n } = useTranslation('lessons');
  const { t: tc } = useTranslation('common');
  const { formatLesson } = useCurrencySettings();
  const { lessonTypes, loading } = useLessonTypes();
  const lang = i18n.language as Language;

  return (
    <div className="px-4 py-16 md:py-24">
      <div className="container mx-auto">
        <AnimatedSection className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t('subtitle')}</p>
        </AnimatedSection>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <StaggerContainer className="mx-auto mt-12 grid max-w-5xl gap-8 md:grid-cols-3">
            {lessonTypes.map((lesson) => {
              const title = lesson.title[lang] || lesson.title.en;
              const description = lesson.description[lang] || lesson.description.en;
              const features = lesson.features ?? [];

              return (
                <StaggerItem key={lesson.id}>
                  <Card className="flex h-full flex-col">
                    <CardHeader className="px-8 pb-3 pt-8">
                      <Badge className={`mb-2 w-fit ${LEVEL_COLORS[lesson.level] ?? 'bg-zinc-50 text-zinc-600'}`}>
                        {lesson.level.charAt(0).toUpperCase() + lesson.level.slice(1)}
                      </Badge>
                      <h2 className="text-xl font-bold leading-snug">{title}</h2>
                      {description && (
                        <p className="mt-3 leading-relaxed text-sm text-muted-foreground">
                          {description}
                        </p>
                      )}
                    </CardHeader>
                    <CardContent className="flex-1 px-8 pt-3">
                      <div className="mb-6 flex items-center gap-5 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          {t('duration', { minutes: lesson.duration })}
                        </span>
                        <span className="font-mono">
                          {formatLesson({ price: lesson.price })} {tc('common.perLesson')}
                        </span>
                      </div>
                      {features.length > 0 && (
                        <ul className="space-y-3.5">
                          {features.map((feature, i) => {
                            const text = feature[lang] || feature.en;
                            if (!text) return null;
                            return (
                              <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
                                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                                  <Check className="h-3 w-3 text-emerald-500" />
                                </span>
                                <span>{text}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </CardContent>
                    <CardFooter className="px-8 pb-8">
                      <Button className="h-12 w-full" render={<Link to={`/book?lessonId=${lesson.id}`} />}>
                        {t('bookNow')}
                      </Button>
                    </CardFooter>
                  </Card>
                </StaggerItem>
              );
            })}
          </StaggerContainer>
        )}
      </div>
    </div>
  );
}
