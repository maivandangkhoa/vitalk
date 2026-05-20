import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Star,
  MapPin,
  Quote,
  ArrowRight,
  Loader2,
  GraduationCap,
  Award,
  Globe,
  Clock,
  Users,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { AnimatedSection, AnimatePresence, motion, StaggerContainer, StaggerItem } from '@/components/shared/motion';
import { TeacherLanguages } from '@/components/teachers/TeacherLanguages';
import { useTeachers } from '@/hooks/useTeachers';
import { usePublicReviews } from '@/hooks/useReviews';
import type { Language } from '@/types';

const FALLBACK_REVIEWS_PREVIEW = [
  { name: 'Yuri', text: 'Always fun and time flies! Highly recommended!', rating: 5 },
  { name: 'Culter S.', text: 'One of the most delightful people...calm, friendly, focused, intelligent.', rating: 5 },
  { name: 'Stephen', text: 'Very polite, friendly, patient teacher. I improved a lot since starting lessons.', rating: 5 },
  { name: 'Sangkyu L.', text: 'Worked hard on pronunciation correction. Now able to create simple sentences!', rating: 5 },
];

const HIGHLIGHT_ICONS = [
  { key: 'native', icon: GraduationCap, color: 'bg-indigo-100 text-indigo-600' },
  { key: 'proven', icon: Award, color: 'bg-amber-100 text-amber-600' },
  { key: 'multilingual', icon: Globe, color: 'bg-emerald-100 text-emerald-600' },
  { key: 'flexible', icon: Clock, color: 'bg-purple-100 text-purple-600' },
] as const;

export default function HomePage() {
  const { t } = useTranslation('home');
  const { i18n } = useTranslation();
  const { teachers, loading: teachersLoading } = useTeachers();
  const { reviews } = usePublicReviews();
  const lang = i18n.language as Language;

  const reviewsPreview = reviews.length > 0
    ? reviews.slice(0, 4).map((r) => ({ name: r.studentName, text: r.content, rating: r.rating }))
    : FALLBACK_REVIEWS_PREVIEW;

  // Carousel state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const teacherCount = teachers.length;

  const goTo = useCallback(
    (index: number, dir: number) => {
      setDirection(dir);
      setCurrentIndex(((index % teacherCount) + teacherCount) % teacherCount);
    },
    [teacherCount],
  );

  const goNext = useCallback(() => goTo(currentIndex + 1, 1), [currentIndex, goTo]);
  const goPrev = useCallback(() => goTo(currentIndex - 1, -1), [currentIndex, goTo]);

  // Auto-slide every 5s
  useEffect(() => {
    if (isPaused || teacherCount <= 1) return;
    const timer = setInterval(goNext, 5000);
    return () => clearInterval(timer);
  }, [isPaused, teacherCount, goNext]);

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -300 : 300, opacity: 0 }),
  };

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-purple-50/30 to-zinc-50 px-4 py-10 md:py-16">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-purple-200/20 blur-3xl" />
        <AnimatedSection className="container relative mx-auto text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-1.5 text-sm font-medium shadow-sm backdrop-blur">
            {t('hero.greeting')}
          </div>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl md:leading-tight">
            {t('hero.title')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {t('hero.subtitle')}
          </p>
          <div className="mt-10 flex justify-center">
            <Button size="lg" render={<Link to="/book" />} className="h-12 shadow-md hover:shadow-lg">
              {t('cta.button')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          {/* Stats */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-8 text-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100">
                <Users className="h-4 w-4 text-indigo-600" />
              </div>
              <span className="font-medium">{t('hero.stats.teachers', { count: teachers.length || 4 })}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100">
                <Star className="h-4 w-4 text-amber-600" />
              </div>
              <span className="font-medium">{t('hero.stats.reviews', { count: 362 })}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100">
                <Award className="h-4 w-4 text-emerald-600" />
              </div>
              <span className="font-medium">{t('hero.stats.rating', { rating: '5.0' })}</span>
            </div>
          </div>
        </AnimatedSection>
      </section>

      {/* Why Learn With Us */}
      <section className="px-4 py-8 md:py-12">
        <div className="container mx-auto">
          <AnimatedSection className="text-center">
            <h2 className="text-3xl font-bold md:text-4xl">
              {t('highlights.title')}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              {t('highlights.subtitle')}
            </p>
          </AnimatedSection>

          <StaggerContainer className="mx-auto mt-8 grid max-w-5xl gap-6 md:grid-cols-2">
            {HIGHLIGHT_ICONS.map(({ key, icon: Icon, color }) => (
              <StaggerItem key={key}>
                <Card className="h-full border-0 bg-white transition-shadow hover:shadow-md">
                  <CardContent className="flex gap-5 p-7">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">
                        {t(`highlights.${key}.title`)}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {t(`highlights.${key}.description`)}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* Meet Our Teachers — Carousel */}
      <section className="bg-zinc-50/50 px-4 py-8 md:py-12">
        <div className="container mx-auto">
          <AnimatedSection className="text-center">
            <h2 className="text-3xl font-bold md:text-4xl">
              {t('teachers.title')}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              {t('teachers.subtitle')}
            </p>
          </AnimatedSection>

          {teachersLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : teacherCount > 0 ? (
            <div
              className="relative mx-auto mt-8 max-w-5xl"
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
            >
              {/* Prev / Next buttons */}
              {teacherCount > 1 && (
                <>
                  <button
                    onClick={goPrev}
                    className="absolute -left-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md transition-colors hover:bg-indigo-50 md:-left-14"
                    aria-label="Previous teacher"
                  >
                    <ChevronLeft className="h-5 w-5 text-indigo-600" />
                  </button>
                  <button
                    onClick={goNext}
                    className="absolute -right-4 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-md transition-colors hover:bg-indigo-50 md:-right-14"
                    aria-label="Next teacher"
                  >
                    <ChevronRight className="h-5 w-5 text-indigo-600" />
                  </button>
                </>
              )}

              {/* Slide */}
              <div className="overflow-hidden">
                <AnimatePresence mode="wait" custom={direction}>
                  {(() => {
                    const teacher = teachers[currentIndex];
                    const bio = teacher.bio?.[lang] || teacher.bio?.en || '';
                    const initials = teacher.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .toUpperCase();

                    return (
                      <motion.div
                        key={teacher.id}
                        custom={direction}
                        variants={slideVariants}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.35, ease: 'easeInOut' }}
                      >
                        <Card className="border-0 bg-white shadow-sm">
                          <CardContent className="flex flex-col items-center p-8 text-center md:flex-row md:items-start md:gap-10 md:p-10 md:text-left">
                            {/* Avatar */}
                            <div className="shrink-0">
                              {teacher.profileImageUrl ? (
                                <img
                                  src={teacher.profileImageUrl}
                                  alt={teacher.name}
                                  className="h-32 w-32 rounded-full object-cover shadow-md"
                                />
                              ) : (
                                <div className="flex h-32 w-32 items-center justify-center rounded-full bg-indigo-100 text-3xl font-bold text-indigo-600 shadow-md">
                                  {initials}
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="mt-5 flex-1 md:mt-0">
                              <h3 className="text-2xl font-bold">{teacher.name}</h3>

                              {teacher.location && (
                                <div className="mt-2 flex items-center justify-center gap-1.5 text-muted-foreground md:justify-start">
                                  <MapPin className="h-4 w-4" />
                                  <span>{teacher.location}</span>
                                </div>
                              )}

                              {teacher.rating > 0 && (
                                <div className="mt-2 flex items-center justify-center gap-2 md:justify-start">
                                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                  <span className="font-semibold">{teacher.rating.toFixed(1)}</span>
                                  {teacher.totalReviews > 0 && (
                                    <span className="text-sm text-muted-foreground">
                                      ({teacher.totalReviews})
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Languages */}
                              {teacher.languages && (
                                <div className="mt-3">
                                  <TeacherLanguages languages={teacher.languages} size="sm" />
                                </div>
                              )}

                              {/* Bio */}
                              {bio && (
                                <p className="mt-4 line-clamp-3 leading-relaxed text-muted-foreground">
                                  {bio}
                                </p>
                              )}

                              <div className="mt-5 flex flex-wrap justify-center gap-3">
                                <Button
                                  variant="outline"
                                  render={<Link to={`/teachers/${teacher.slug}`} />}
                                >
                                  {t('teachers.viewProfile')}
                                  <ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                                <Button
                                  render={<Link to={`/book?teacherId=${teacher.id}`} />}
                                >
                                  {t('teachers.bookLesson')}
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })()}
                </AnimatePresence>
              </div>

              {/* Dot indicators */}
              {teacherCount > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2">
                  {teachers.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => goTo(idx, idx > currentIndex ? 1 : -1)}
                      className={`h-2.5 rounded-full transition-all ${
                        idx === currentIndex
                          ? 'w-7 bg-indigo-500'
                          : 'w-2.5 bg-indigo-200 hover:bg-indigo-300'
                      }`}
                      aria-label={`Go to teacher ${idx + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-8 text-center">
            <Button variant="outline" className="h-12" render={<Link to="/teachers" />}>
              {t('teachers.viewAll')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="px-4 py-8 md:py-12">
        <div className="container mx-auto">
          <AnimatedSection>
            <h2 className="text-center text-3xl font-bold md:text-4xl">
              {t('testimonials.title')}
            </h2>
          </AnimatedSection>
          <StaggerContainer className="mt-8 grid gap-8 md:grid-cols-2">
            {reviewsPreview.map((review) => (
              <StaggerItem key={review.name}>
                <Card className="h-full border-0 bg-white">
                  <CardContent className="p-8">
                    <Quote className="mb-4 h-5 w-5 text-indigo-200" />
                    <p className="mb-5 leading-relaxed text-muted-foreground italic">
                      &ldquo;{review.text}&rdquo;
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{review.name}</span>
                      <div className="flex">
                        {Array.from({ length: review.rating }).map((_, i) => (
                          <Star key={i} className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </StaggerContainer>
          <div className="mt-8 text-center">
            <Button variant="outline" className="h-12" render={<Link to="/reviews" />}>
              {t('testimonials.viewAll')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-4 py-8 md:py-12">
        <AnimatedSection className="container mx-auto">
          <div className="rounded-3xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-10 text-white shadow-lg md:py-14">
            <div className="text-center">
              <h2 className="text-3xl font-bold md:text-4xl">{t('cta.title')}</h2>
              <p className="mx-auto mt-5 max-w-xl leading-relaxed text-white/80">
                {t('cta.subtitle')}
              </p>
              <Button
                size="lg"
                variant="secondary"
                render={<Link to="/book" />}
                className="mt-8 h-12"
              >
                {t('cta.button')}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </AnimatedSection>
      </section>
    </div>
  );
}
