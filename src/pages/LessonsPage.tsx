import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Clock } from 'lucide-react';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';
import { useCurrencySettings } from '@/hooks/useCurrency';

const LESSON_LEVELS = ['beginner', 'intermediate', 'conversation'] as const;

const LEVEL_COLORS: Record<string, string> = {
  beginner: 'bg-emerald-50 text-emerald-600',
  intermediate: 'bg-sky-50 text-sky-600',
  conversation: 'bg-purple-50 text-purple-600',
};

export default function LessonsPage() {
  const { t } = useTranslation('lessons');
  const { t: tc } = useTranslation('common');
  const { formatLesson } = useCurrencySettings();

  return (
    <div className="px-4 py-16 md:py-24">
      <div className="container mx-auto">
        <AnimatedSection className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">{t('subtitle')}</p>
        </AnimatedSection>

        <StaggerContainer className="mx-auto mt-12 grid max-w-5xl gap-8 md:grid-cols-3">
          {LESSON_LEVELS.map((level) => {
            const features: string[] = t(`${level}.features`, { returnObjects: true }) as string[];
            return (
              <StaggerItem key={level}>
                <Card className="flex h-full flex-col">
                  <CardHeader className="pb-2">
                    <Badge className={`mb-2 w-fit ${LEVEL_COLORS[level]}`}>
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Badge>
                    <h2 className="text-xl font-bold leading-snug">{t(`${level}.name`)}</h2>
                    <p className="mt-3 leading-relaxed text-sm text-muted-foreground">
                      {t(`${level}.description`)}
                    </p>
                  </CardHeader>
                  <CardContent className="flex-1 pt-2">
                    <div className="mb-6 flex items-center gap-5 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        {t('duration', { minutes: 50 })}
                      </span>
                      <span className="font-mono">
                        {formatLesson({ price: 14 })} {tc('common.perLesson')}
                      </span>
                    </div>
                    <ul className="space-y-3.5">
                      {Array.isArray(features) && features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                            <Check className="h-3 w-3 text-emerald-500" />
                          </span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    <Button className="w-full" render={<Link to="/book" />}>
                      {t('bookNow')}
                    </Button>
                  </CardFooter>
                </Card>
              </StaggerItem>
            );
          })}
        </StaggerContainer>
      </div>
    </div>
  );
}
