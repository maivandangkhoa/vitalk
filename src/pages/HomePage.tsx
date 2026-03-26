import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Star,
  Globe,
  Award,
  Languages,
  Monitor,
  MapPin,
  Quote,
  ArrowRight,
} from 'lucide-react';
import { AnimatedSection, StaggerContainer, StaggerItem } from '@/components/shared/motion';

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

const HIGHLIGHT_STYLES = [
  { key: 'native', icon: Globe, bg: 'bg-indigo-50', text: 'text-indigo-500' },
  { key: 'experience', icon: Award, bg: 'bg-purple-50', text: 'text-purple-500' },
  { key: 'multilingual', icon: Languages, bg: 'bg-emerald-50', text: 'text-emerald-500' },
  { key: 'flexible', icon: Monitor, bg: 'bg-amber-50', text: 'text-amber-500' },
];

export default function HomePage() {
  const { t } = useTranslation('home');

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
            <Button size="lg" render={<Link to="/book" />} className="shadow-md hover:shadow-lg">
              {t('hero.cta')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="outline" size="lg" render={<Link to="/lessons" />}>
              {t('cta.button')}
            </Button>
          </div>
          <div className="mt-10 flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                ))}
              </div>
              <span className="ml-1 font-mono font-medium">5.0</span>
            </div>
            <span>{t('hero.reviewCount')}</span>
            <span className="font-mono">{t('hero.pricePerLesson')}</span>
          </div>
        </AnimatedSection>
      </section>

      {/* Highlights */}
      <section className="px-4 py-16 md:py-24">
        <div className="container mx-auto">
          <AnimatedSection>
            <h2 className="text-center text-3xl font-bold md:text-4xl">
              {t('highlights.title')}
            </h2>
          </AnimatedSection>
          <StaggerContainer className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {HIGHLIGHT_STYLES.map(({ key, icon: Icon, bg, text }) => (
              <StaggerItem key={key}>
                <Card className="h-full border-0 bg-white">
                  <CardContent className="pt-6">
                    <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${bg}`}>
                      <Icon className={`h-6 w-6 ${text}`} />
                    </div>
                    <h3 className="mb-3 text-lg font-semibold">
                      {t(`highlights.${key}.title`)}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t(`highlights.${key}.description`)}
                    </p>
                  </CardContent>
                </Card>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      {/* About */}
      <section className="px-4 py-16 md:py-24">
        <AnimatedSection className="container mx-auto">
          <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow-sm md:p-12">
            <div className="text-center">
              <h2 className="text-3xl font-bold md:text-4xl">{t('about.title')}</h2>
              <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
                {t('about.description')}
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Badge variant="outline" className="gap-2 rounded-xl border-zinc-200 px-3 py-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {t('about.location')}
                </Badge>
                <Badge variant="outline" className="gap-2 rounded-xl border-zinc-200 px-3 py-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  {t('about.from')}
                </Badge>
                <Badge variant="outline" className="gap-2 rounded-xl border-zinc-200 px-3 py-1.5">
                  <Award className="h-3.5 w-3.5" />
                  {t('about.education')}
                </Badge>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </section>

      {/* Testimonials */}
      <section className="px-4 py-16 md:py-24">
        <div className="container mx-auto">
          <AnimatedSection>
            <h2 className="text-center text-3xl font-bold md:text-4xl">
              {t('testimonials.title')}
            </h2>
          </AnimatedSection>
          <StaggerContainer className="mt-12 grid gap-6 md:grid-cols-2">
            {REVIEWS_PREVIEW.map((review) => (
              <StaggerItem key={review.name}>
                <Card className="h-full border-0 bg-white">
                  <CardContent className="pt-6">
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
            <Button variant="outline" render={<Link to="/reviews" />}>
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
                render={<Link to="/book" />}
                className="mt-8"
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
