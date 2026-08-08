import { useTeachers } from '@/hooks/useTeachers';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AnimatedSection } from '@/components/shared/motion';
import { Button } from '@/components/ui/button';
import { TeacherLanguages } from '@/components/teachers/TeacherLanguages';
import { Star, MapPin, ArrowRight, Loader2 } from 'lucide-react';
import { pickLang } from '@/lib/multiLang';
import { richTextToPlain } from '@/lib/richText';
import type { Language } from '@/types';
import type { TeacherProfile } from '@/types/profile';

function TeacherCard({
  teacher,
  lang,
  priority,
}: {
  teacher: TeacherProfile;
  lang: Language;
  /** Above the fold: fetch the avatar eagerly instead of waiting for scroll. */
  priority: boolean;
}) {
  const { t } = useTranslation('teachers');
  // Flattened to text on purpose: the card clamps to 3 lines, which images
  // and block markup would break.
  const bio = richTextToPlain(pickLang(teacher.bio, lang));
  const initials = teacher.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <div className="group relative flex flex-col rounded-2xl border bg-white p-6 transition-shadow hover:shadow-md">
      {/* Whole card links to the profile; the CTA below sits above this overlay */}
      <Link
        to={`/teachers/${teacher.slug}`}
        aria-label={teacher.name}
        className="absolute inset-0 rounded-2xl focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:outline-none"
      />

      <div className="flex items-start gap-4">
        {teacher.profileImageUrl ? (
          <img
            src={teacher.profileImageUrl}
            alt={teacher.name}
            width={80}
            height={80}
            loading={priority ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            className="h-20 w-20 shrink-0 rounded-full object-cover shadow-sm"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xl font-bold text-indigo-600 shadow-sm">
            {initials}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-xl font-bold tracking-tight">{teacher.name}</h2>
          {teacher.location && (
            <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">{teacher.location}</span>
            </div>
          )}
          {teacher.rating > 0 && (
            <div className="mt-1.5 flex items-center gap-2">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              <span className="font-semibold">{teacher.rating.toFixed(1)}</span>
              {teacher.totalReviews > 0 && (
                <span className="text-sm text-muted-foreground">
                  ({teacher.totalReviews} {t('reviews')})
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {teacher.languages && (
        <div className="mt-5">
          <TeacherLanguages languages={teacher.languages} size="sm" />
        </div>
      )}

      {bio && (
        <p className="mt-4 line-clamp-3 leading-relaxed text-muted-foreground">{bio}</p>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3 pt-1">
        <Button
          className="relative h-10 px-5"
          render={<Link to={`/book?teacherId=${teacher.id}`} />}
        >
          {t('bookLesson')}
        </Button>
        <span className="ml-auto flex items-center gap-1 text-sm font-medium text-indigo-600 transition-transform group-hover:translate-x-0.5">
          {t('viewProfile')}
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </div>
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
          <AnimatedSection className="mx-auto mt-12 grid max-w-5xl gap-6 md:grid-cols-2">
            {teachers.map((teacher, i) => (
              <TeacherCard
                key={teacher.id}
                teacher={teacher}
                lang={lang}
                priority={i < 2}
              />
            ))}
          </AnimatedSection>
        )}
      </div>
    </div>
  );
}
