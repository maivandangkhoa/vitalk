import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Star,
  MapPin,
  Quote,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';
import { useTeachers } from '@/hooks/useTeachers';

const REVIEWS_PREVIEW = [
  {
    name: 'Yuri',
    text: 'Always fun and time flies! Highly recommended!',
    rating: 5,
  },
  {
    name: 'Culter S.',
    text: 'One of the most delightful people...calm, friendly, focused, intelligent.',
    rating: 5,
  },
  {
    name: 'Stephen',
    text: 'Very polite, friendly, patient teacher. I improved a lot since starting lessons.',
    rating: 5,
  },
  {
    name: 'Sangkyu L.',
    text: 'Worked hard on pronunciation correction. Now able to create simple sentences!',
    rating: 5,
  },
];

export default function HomePage() {
  const { t } = useTranslation('home');
  const { teachers, loading: teachersLoading } = useTeachers();

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-50 via-purple-50/30 to-zinc-50 px-4 py-20 md:py-32">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-purple-200/20 blur-3xl" />
        <AnimatedSection className="container relative mx-auto text-center">
          <Badge variant="secondary" className="mb-5 text-sm">
            {t('hero.greeting')}
          </Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl md:leading-tight">
            {t('hero.title')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            {t('hero.subtitle')}
          </p>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button size="lg" render={<Link to="/teachers" />} className="h-12 shadow-md hover:shadow-lg">
              {t('hero.cta')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" render={<Link to="/lessons" />} className="h-12">
              {t('cta.button')}
            </Button>
          </div>
          <div className="mt-10 flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <span>{t('hero.reviewCount')}</span>
          </div>
        </AnimatedSection>
      </section>

      {/* Teachers */}
      <section className="px-4 py-16 md:py-24">
        <div className="container mx-auto">
          <AnimatedSection>
            <h2 className="text-center text-3xl font-bold md:text-4xl">
              {t('highlights.title')}
            </h2>
          </AnimatedSection>

          {teachersLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            </div>
          ) : teachers.length > 0 ? (
            <StaggerContainer className="mx-auto mt-12 grid max-w-5xl gap-8 md:grid-cols-2 lg:grid-cols-3">
              {teachers.map((teacher) => {
                const initials = teacher.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase();

                return (
                  <StaggerItem key={teacher.id}>
                    <Link to={`/teachers/${teacher.slug}`} className="block h-full">
                      <Card className="h-full border-0 bg-white transition-shadow hover:shadow-md">
                        <CardContent className="flex flex-col items-center p-8 text-center">
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
                          <h3 className="mt-4 text-lg font-semibold">{teacher.name}</h3>
                          {teacher.location && (
                            <div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                              <MapPin className="h-3.5 w-3.5" />
                              <span>{teacher.location}</span>
                            </div>
                          )}
                          {teacher.rating > 0 && (
                            <div className="mt-2 flex items-center gap-1.5">
                              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                              <span className="text-sm font-medium">{teacher.rating.toFixed(1)}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  </StaggerItem>
                );
              })}
            </StaggerContainer>
          ) : null}

          <div className="mt-8 text-center">
            <Button variant="outline" className="h-12" render={<Link to="/teachers" />}>
              {t('cta.button')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="px-4 py-16 md:py-24">
        <div className="container mx-auto">
          <AnimatedSection>
            <h2 className="text-center text-3xl font-bold md:text-4xl">
              {t('testimonials.title')}
            </h2>
          </AnimatedSection>
          <StaggerContainer className="mt-12 grid gap-8 md:grid-cols-2">
            {REVIEWS_PREVIEW.map((review) => (
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
      <section className="px-4 py-16 md:py-24">
        <AnimatedSection className="container mx-auto">
          <div className="rounded-3xl bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-16 text-white shadow-lg md:py-24">
            <div className="text-center">
              <h2 className="text-3xl font-bold md:text-4xl">{t('cta.title')}</h2>
              <p className="mx-auto mt-5 max-w-xl leading-relaxed text-white/80">
                {t('cta.subtitle')}
              </p>
              <Button
                size="lg"
                variant="secondary"
                render={<Link to="/teachers" />}
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
