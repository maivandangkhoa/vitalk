import { useParams, Link } from 'react-router-dom';
import { useTeacherBySlug } from '@/hooks/useTeachers';
import { usePublicReviews } from '@/hooks/useReviews';
import { useTranslation } from 'react-i18next';
import { AnimatedSection } from '@/components/shared/motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, MapPin, Globe, GraduationCap, Calendar, Loader2 } from 'lucide-react';
import type { Language } from '@/types';

function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    // Already an embed URL
    if (u.pathname.startsWith('/embed/')) return url;
    // youtube.com/watch?v=ID
    if (u.hostname.includes('youtube.com') && u.searchParams.has('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
    // youtu.be/ID
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    // youtube.com/shorts/ID
    if (u.pathname.startsWith('/shorts/')) {
      return `https://www.youtube.com/embed/${u.pathname.split('/shorts/')[1]}`;
    }
    return url;
  } catch {
    return null;
  }
}

export default function TeacherProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation('teachers');
  const { i18n } = useTranslation();
  const { teacher, loading } = useTeacherBySlug(slug);
  const { reviews, loading: reviewsLoading } = usePublicReviews(teacher?.id);
  const lang = i18n.language as Language;

  if (loading) {
    return (
      <div className="flex items-center justify-center px-4 py-32">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!teacher) {
    return (
      <div className="px-4 py-16 md:py-24">
        <div className="container mx-auto text-center">
          <h1 className="text-3xl font-bold">{t('notFound')}</h1>
          <p className="mt-4 text-muted-foreground">{t('notFoundDescription')}</p>
          <Button className="mt-8 h-12" render={<Link to="/teachers" />}>
            {t('backToTeachers')}
          </Button>
        </div>
      </div>
    );
  }

  const bio = teacher.bio?.[lang] || teacher.bio?.en || '';
  const teachingStyle = teacher.teachingStyle?.[lang] || teacher.teachingStyle?.en || '';
  const initials = teacher.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();
  const recentReviews = reviews.slice(0, 5);

  return (
    <div className="px-4 py-16 md:py-24">
      <div className="container mx-auto max-w-4xl">
        {/* Hero section */}
        <AnimatedSection className="text-center">
          <div className="flex flex-col items-center">
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
            <h1 className="mt-6 text-4xl font-bold tracking-tight">{teacher.name}</h1>
            {teacher.location && (
              <div className="mt-3 flex items-center gap-1.5 text-lg text-muted-foreground">
                <MapPin className="h-5 w-5" />
                <span>{teacher.location}</span>
              </div>
            )}
            {teacher.rating > 0 && (
              <div className="mt-3 flex items-center gap-2">
                <Star className="h-5 w-5 fill-yellow-400 text-yellow-400" />
                <span className="font-mono text-lg font-semibold">
                  {teacher.rating.toFixed(1)}
                </span>
                {teacher.totalReviews > 0 && (
                  <span className="text-muted-foreground">
                    ({teacher.totalReviews} {t('reviews')})
                  </span>
                )}
              </div>
            )}
          </div>
        </AnimatedSection>

        {/* Languages */}
        {teacher.languages && Object.keys(teacher.languages).length > 0 && (
          <AnimatedSection className="mt-8 flex flex-wrap justify-center gap-2">
            {Object.entries(teacher.languages).map(([code, level]) => (
              <span
                key={code}
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-4 py-1.5 text-sm font-medium text-indigo-600"
              >
                <Globe className="h-3.5 w-3.5" />
                {code.toUpperCase()} &middot; {level}
              </span>
            ))}
          </AnimatedSection>
        )}

        {/* Video intro */}
        {teacher.videoIntroUrl && toEmbedUrl(teacher.videoIntroUrl) && (
          <AnimatedSection className="mt-12">
            <Card className="overflow-hidden rounded-xl">
              <div className="aspect-video">
                <iframe
                  src={toEmbedUrl(teacher.videoIntroUrl)!}
                  title={t('videoIntro')}
                  className="h-full w-full"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              </div>
            </Card>
          </AnimatedSection>
        )}

        {/* Bio section */}
        {bio && (
          <AnimatedSection className="mt-12">
            <Card className="rounded-xl">
              <CardContent className="p-8">
                <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
                  <GraduationCap className="h-6 w-6 text-indigo-500" />
                  {t('aboutMe')}
                </h2>
                <div className="whitespace-pre-line leading-relaxed text-muted-foreground">
                  {bio}
                </div>
              </CardContent>
            </Card>
          </AnimatedSection>
        )}

        {/* Teaching style section */}
        {teachingStyle && (
          <AnimatedSection className="mt-8">
            <Card className="rounded-xl">
              <CardContent className="p-8">
                <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
                  <Calendar className="h-6 w-6 text-indigo-500" />
                  {t('teachingStyle')}
                </h2>
                <div className="whitespace-pre-line leading-relaxed text-muted-foreground">
                  {teachingStyle}
                </div>
              </CardContent>
            </Card>
          </AnimatedSection>
        )}

        {/* Reviews section */}
        {recentReviews.length > 0 && (
          <AnimatedSection className="mt-12">
            <h2 className="mb-6 text-center text-2xl font-bold">{t('recentReviews')}</h2>
            <div className="grid gap-6 md:grid-cols-2">
              {recentReviews.map((review) => (
                <Card key={review.id} className="rounded-xl border-0 bg-white">
                  <CardContent className="p-6">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium">{review.studentName}</span>
                      <div className="flex">
                        {Array.from({ length: review.rating }).map((_, i) => (
                          <Star
                            key={i}
                            className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400"
                          />
                        ))}
                      </div>
                    </div>
                    <p className="leading-relaxed text-muted-foreground italic">
                      &ldquo;{review.content}&rdquo;
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </AnimatedSection>
        )}

        {reviewsLoading && recentReviews.length === 0 && (
          <div className="mt-12 flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
          </div>
        )}

        {/* CTA */}
        <AnimatedSection className="mt-12 text-center">
          <Button
            size="lg"
            className="h-12 px-8 shadow-md hover:shadow-lg"
            render={<Link to={`/book?teacherId=${teacher.id}`} />}
          >
            {t('bookLesson')}
          </Button>
        </AnimatedSection>
      </div>
    </div>
  );
}
