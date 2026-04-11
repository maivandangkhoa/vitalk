import { useState, useEffect, useCallback } from 'react';
import { useTeachers } from '@/hooks/useTeachers';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AnimatedSection } from '@/components/shared/motion';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Language } from '@/types';

const AUTO_SLIDE_MS = 5000;

export default function TeachersListPage() {
  const { t } = useTranslation('teachers');
  const { i18n } = useTranslation();
  const { teachers, loading } = useTeachers();
  const lang = i18n.language as Language;
  const [current, setCurrent] = useState(0);

  const count = teachers.length;
  const hasMultiple = count > 1;

  const next = useCallback(() => {
    setCurrent((prev) => (prev + 1) % count);
  }, [count]);

  const prev = useCallback(() => {
    setCurrent((prev) => (prev - 1 + count) % count);
  }, [count]);

  // Auto-slide
  useEffect(() => {
    if (!hasMultiple) return;
    const timer = setInterval(next, AUTO_SLIDE_MS);
    return () => clearInterval(timer);
  }, [hasMultiple, next]);

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
        ) : count === 0 ? (
          <AnimatedSection className="mx-auto mt-12 max-w-md text-center">
            <p className="text-lg text-muted-foreground">{t('empty')}</p>
          </AnimatedSection>
        ) : (
          <div className="relative mx-auto mt-12 max-w-5xl">
            {/* Navigation arrows */}
            {hasMultiple && (
              <>
                <button
                  onClick={prev}
                  className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow-lg backdrop-blur transition-all hover:bg-white hover:shadow-xl md:-left-4 md:p-3"
                >
                  <ChevronLeft className="h-5 w-5 text-zinc-700 md:h-6 md:w-6" />
                </button>
                <button
                  onClick={next}
                  className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow-lg backdrop-blur transition-all hover:bg-white hover:shadow-xl md:-right-4 md:p-3"
                >
                  <ChevronRight className="h-5 w-5 text-zinc-700 md:h-6 md:w-6" />
                </button>
              </>
            )}

            {/* Carousel */}
            <div className="overflow-hidden rounded-2xl">
              <div
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${current * 100}%)` }}
              >
                {teachers.map((teacher) => {
                  const bioText = teacher.bio?.[lang] || teacher.bio?.en || '';
                  const initials = teacher.name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .toUpperCase();

                  return (
                    <div
                      key={teacher.id}
                      className="w-full flex-shrink-0"
                    >
                      <div className="rounded-2xl border bg-white p-8 md:p-12">
                        <div className="flex flex-col items-center gap-8 md:flex-row md:items-start">
                          {/* Profile image */}
                          <div className="flex flex-col items-center gap-4">
                            {teacher.profileImageUrl ? (
                              <img
                                src={teacher.profileImageUrl}
                                alt={teacher.name}
                                className="h-32 w-32 rounded-full object-cover shadow-md md:h-40 md:w-40"
                              />
                            ) : (
                              <div className="flex h-32 w-32 items-center justify-center rounded-full bg-indigo-100 text-3xl font-bold text-indigo-600 shadow-md md:h-40 md:w-40">
                                {initials}
                              </div>
                            )}
                            {teacher.rating > 0 && (
                              <div className="flex items-center gap-1.5">
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
                          </div>

                          {/* Info */}
                          <div className="flex flex-1 flex-col items-center text-center md:items-start md:text-left">
                            <h2 className="text-2xl font-bold md:text-3xl">{teacher.name}</h2>
                            {teacher.location && (
                              <div className="mt-2 flex items-center gap-1.5 text-muted-foreground">
                                <MapPin className="h-4 w-4" />
                                <span>{teacher.location}</span>
                              </div>
                            )}

                            {teacher.languages && Object.keys(teacher.languages).length > 0 && (
                              <div className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
                                {Object.entries(teacher.languages).map(([code, level]) => (
                                  <span
                                    key={code}
                                    className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600"
                                  >
                                    {code.toUpperCase()} &middot; {level}
                                  </span>
                                ))}
                              </div>
                            )}

                            {bioText && (
                              <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
                                {bioText.length > 300 ? `${bioText.slice(0, 300)}...` : bioText}
                              </p>
                            )}

                            <Button
                              className="mt-6 h-12 px-8"
                              render={<Link to={`/teachers/${teacher.slug}`} />}
                            >
                              {t('viewProfile')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Dots indicator */}
            {hasMultiple && (
              <div className="mt-6 flex justify-center gap-2">
                {teachers.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={`h-2.5 rounded-full transition-all ${
                      i === current
                        ? 'w-8 bg-indigo-500'
                        : 'w-2.5 bg-zinc-300 hover:bg-zinc-400'
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
