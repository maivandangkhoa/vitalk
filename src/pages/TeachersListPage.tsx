import { useTeachers } from '@/hooks/useTeachers';
import { usePublicReviews } from '@/hooks/useReviews';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AnimatedSection } from '@/components/shared/motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TeacherLanguages } from '@/components/teachers/TeacherLanguages';
import {
  Star,
  MapPin,
  GraduationCap,
  Calendar,
  Loader2,
} from 'lucide-react';
import type { Language } from '@/types';
import type { TeacherProfile } from '@/types/profile';

function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.pathname.startsWith('/embed/')) return url;
    if (u.hostname.includes('youtube.com') && u.searchParams.has('v')) {
      return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.pathname.startsWith('/shorts/')) {
      return `https://www.youtube.com/embed/${u.pathname.split('/shorts/')[1]}`;
    }
    return url;
  } catch {
    return null;
  }
}

function TeacherFullCard({ teacher, lang }: { teacher: TeacherProfile; lang: Language }) {
  const { t } = useTranslation('teachers');
  const { reviews } = usePublicReviews(teacher.id);
  const recentReviews = reviews.slice(0, 5);

  const bio = teacher.bio?.[lang] || teacher.bio?.en || '';
  const teachingStyle =
    teacher.teachingStyle?.[lang] || teacher.teachingStyle?.en || '';
  const initials = teacher.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <AnimatedSection>
      <div className="rounded-2xl border bg-white p-8 md:p-12">
        {/* Hero */}
        <div className="text-center">
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
            <h2 className="mt-6 text-3xl font-bold tracking-tight md:text-4xl">
              {teacher.name}
            </h2>
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
            <Button
              size="lg"
              className="mt-6 h-12 px-8 shadow-md hover:shadow-lg"
              render={<Link to={`/book?teacherId=${teacher.id}`} />}
            >
              {t('bookLesson')}
            </Button>
          </div>
        </div>

        {/* Languages */}
        {teacher.languages && (
          <div className="mx-auto mt-8 max-w-2xl">
            <TeacherLanguages languages={teacher.languages} />
          </div>
        )}

        {/* Video intro */}
        {teacher.videoIntroUrl && toEmbedUrl(teacher.videoIntroUrl) && (
          <div className="mx-auto mt-10 max-w-3xl">
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
          </div>
        )}

        {/* Bio */}
        {bio && (
          <div className="mx-auto mt-10 max-w-3xl">
            <Card className="rounded-xl">
              <CardContent className="p-8">
                <h3 className="mb-4 flex items-center gap-2 text-2xl font-bold">
                  <GraduationCap className="h-6 w-6 text-indigo-500" />
                  {t('aboutMe')}
                </h3>
                <div className="whitespace-pre-line leading-relaxed text-muted-foreground">
                  {bio}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Teaching style */}
        {teachingStyle && (
          <div className="mx-auto mt-6 max-w-3xl">
            <Card className="rounded-xl">
              <CardContent className="p-8">
                <h3 className="mb-4 flex items-center gap-2 text-2xl font-bold">
                  <Calendar className="h-6 w-6 text-indigo-500" />
                  {t('teachingStyle')}
                </h3>
                <div className="whitespace-pre-line leading-relaxed text-muted-foreground">
                  {teachingStyle}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Recent reviews */}
        {recentReviews.length > 0 && (
          <div className="mx-auto mt-10 max-w-3xl">
            <h3 className="mb-6 text-center text-2xl font-bold">
              {t('recentReviews')}
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {recentReviews.map((review) => (
                <Card key={review.id} className="rounded-xl border-0 bg-zinc-50">
                  <CardContent className="p-6">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {review.studentName}
                      </span>
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
          </div>
        )}

      </div>
    </AnimatedSection>
  );
}

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
          <div className="mx-auto mt-12 max-w-5xl space-y-12">
            {teachers.map((teacher) => (
              <TeacherFullCard key={teacher.id} teacher={teacher} lang={lang} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
