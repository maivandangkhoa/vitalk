import { useTeachers } from '@/hooks/useTeachers';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Loader2 } from 'lucide-react';
import type { Language } from '@/types';

export default function TeachersListPage() {
  const { t } = useTranslation('teachers');
  const { i18n } = useTranslation();
  const { teachers, loading } = useTeachers();
  const lang = i18n.language as Language;

  return (
    <div className="px-4 py-16 md:py-24">
      <div className="container mx-auto">
        <AnimatedSection className="mx-auto max-w-2xl text-center">
          <h1 className="text-4xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            {t('subtitle')}
          </p>
        </AnimatedSection>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : teachers.length === 0 ? (
          <AnimatedSection className="mx-auto mt-12 max-w-md text-center">
            <p className="text-lg text-muted-foreground">{t('empty')}</p>
          </AnimatedSection>
        ) : (
          <StaggerContainer className="mx-auto mt-12 grid max-w-5xl gap-8 md:grid-cols-2 lg:grid-cols-3">
            {teachers.map((teacher) => {
              const bioText = teacher.bio?.[lang] || teacher.bio?.en || '';
              const bioExcerpt =
                bioText.length > 100 ? `${bioText.slice(0, 100)}...` : bioText;
              const initials = teacher.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .toUpperCase();

              return (
                <StaggerItem key={teacher.id}>
                  <Card className="flex h-full flex-col">
                    <CardContent className="flex flex-1 flex-col p-8">
                      <div className="mb-4 flex flex-col items-center text-center">
                        {teacher.profileImageUrl ? (
                          <img
                            src={teacher.profileImageUrl}
                            alt={teacher.name}
                            className="h-20 w-20 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-600">
                            {initials}
                          </div>
                        )}
                        <h2 className="mt-4 text-xl font-bold">{teacher.name}</h2>
                        {teacher.location && (
                          <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3.5 w-3.5" />
                            <span>{teacher.location}</span>
                          </div>
                        )}
                      </div>

                      {teacher.languages && Object.keys(teacher.languages).length > 0 && (
                        <div className="mb-4 flex flex-wrap justify-center gap-1.5">
                          {Object.entries(teacher.languages).map(([code, level]) => (
                            <span
                              key={code}
                              className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-600"
                            >
                              {code.toUpperCase()} &middot; {level}
                            </span>
                          ))}
                        </div>
                      )}

                      {teacher.rating > 0 && (
                        <div className="mb-4 flex items-center justify-center gap-1.5">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                          <span className="text-sm font-medium">
                            {teacher.rating.toFixed(1)}
                          </span>
                          {teacher.totalReviews > 0 && (
                            <span className="text-sm text-muted-foreground">
                              ({teacher.totalReviews})
                            </span>
                          )}
                        </div>
                      )}

                      {bioExcerpt && (
                        <p className="mb-6 flex-1 text-center text-sm leading-relaxed text-muted-foreground">
                          {bioExcerpt}
                        </p>
                      )}

                      <Button
                        className="mt-auto h-12 w-full"
                        render={<Link to={`/teachers/${teacher.slug}`} />}
                      >
                        {t('viewProfile')}
                      </Button>
                    </CardContent>
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
